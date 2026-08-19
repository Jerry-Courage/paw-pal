"""
Personalised Learning Live Session Consumer
Proxies audio between the browser and Gemini 2.5 Flash Native Audio Live API,
pre-loading user chat history and study material contexts.
"""
import json
import asyncio
import logging
import os
import struct
import base64
import websockets
import requests as http_requests
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.db import models
from django.contrib.auth import get_user_model
from ai_assistant.models import ChatSession, ChatMessage
from library.models import Resource

logger = logging.getLogger('nitemind')

GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'
GEMINI_LIVE_WS_URL = (
    'wss://generativelanguage.googleapis.com/ws/'
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
)


@sync_to_async
def _get_personalized_context(user):
    try:
        # Get last 8 messages from global + voice_tutor sessions for conversation memory
        global_sessions = ChatSession.objects.filter(user=user, context_type__in=['global', 'voice_tutor'])
        recent_messages = ChatMessage.objects.filter(session__in=global_sessions).order_by('-created_at')[:8]
        recent_messages = list(recent_messages)[::-1]  # chronological order
        
        history = []
        for msg in recent_messages:
            role_label = "Student" if msg.role == 'user' else "AI"
            history.append(f"{role_label}: {msg.content[:80]}")
        history_str = "\n".join(history) if history else "No history."
        
        # Get resources with mastery data for strength/gap analysis
        from library.models import ResourceProgress
        progresses = ResourceProgress.objects.filter(user=user).select_related('resource').order_by('-created_at')[:10]
        materials_lines = []
        strong_areas = []
        weak_areas = []
        for p in progresses:
            title = p.resource.title if p.resource else 'Unknown'
            subject = p.resource.subject if p.resource else 'General'
            mastery = p.mastery
            materials_lines.append(f"- {title} ({subject}) — {mastery}% mastery")
            if mastery >= 70:
                strong_areas.append(title)
            elif mastery < 40 and mastery > 0:
                weak_areas.append(title)
        materials_str = "\n".join(materials_lines) if materials_lines else "No materials studied yet."
        
        # Also get resource titles for materials without progress
        all_resources = Resource.objects.filter(owner=user).exclude(
            id__in=progresses.values_list('resource_id', flat=True)
        ).order_by('-created_at').values('title', 'subject')[:5]
        for r in all_resources:
            materials_lines.append(f"- {r['title']} ({r['subject'] or 'General'}) — not started")
        
        performance_str = ""
        if strong_areas:
            performance_str += f"STRONG areas: {', '.join(strong_areas)}. "
        if weak_areas:
            performance_str += f"WEAK areas: {', '.join(weak_areas)}. "
        if not performance_str:
            performance_str = "No mastery data yet — student hasn't completed enough study sessions."
        
        # Get XP level
        xp = ResourceProgress.objects.filter(user=user).aggregate(total=models.Sum('xp_earned'))['total'] or 0
        xp += int((user.onboarding_status or {}).get('quiz_xp', 0))
        
        if xp < 500:
            level_name = "Beginner"
        elif xp < 1500:
            level_name = "Elementary"
        elif xp < 3500:
            level_name = "Intermediate"
        elif xp < 7000:
            level_name = "Advanced"
        else:
            level_name = "Expert"

        # Get study streak
        streak = getattr(user, 'study_streak', 0) or 0

        # Get education level
        education = getattr(user, 'education_level', 'tertiary') or 'tertiary'
            
        return {
            'username': user.first_name or user.username,
            'xp': xp,
            'level_name': level_name,
            'history_str': history_str,
            'materials_str': materials_str,
            'performance_str': performance_str,
            'streak': streak,
            'education': education,
        }
    except Exception as e:
        logger.error(f"Failed to fetch personalized context: {e}")
        return {
            'username': user.username,
            'xp': 0,
            'level_name': 'Beginner',
            'history_str': 'No history.',
            'materials_str': 'No materials.',
            'streak': 0,
            'education': 'tertiary',
        }


class PersonalisedConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer that proxies between the browser and Gemini Live API for Personalized Tutor.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.gemini_ws = None
        self.gemini_task = None
        self.session_active = False
        self.transcript_log = []   # [(role, text), ...]
        self.voice_override = None
        self.text_fallback_mode = False
        self.text_fallback_reason = ''
        self.ai_audio_b64_chunks = []  # buffer PCM chunks for STT on turn complete

    @sync_to_async
    def _save_transcript_sync(self, user):
        first_user_msg = next((text for role, text in self.transcript_log if role == 'user'), '')
        title = first_user_msg[:80] or 'Voice Tutor Session'
        session = ChatSession.objects.create(
            user=user,
            context_type='voice_tutor',
            title=title,
        )
        for role, text in self.transcript_log:
            ChatMessage.objects.create(
                session=session,
                role='assistant' if role == 'ai' else 'user',
                content=text,
            )
        logger.info(f'[PersonalisedVoice] Saved transcript: session={session.id}, msgs={len(self.transcript_log)}')

    async def _save_transcript(self, user):
        await self._save_transcript_sync(user)

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        await self.accept()
        logger.info(f'[PersonalisedVoice] Browser connected: user={user.id}')

    async def disconnect(self, close_code):
        self.session_active = False
        if hasattr(self, 'audio_send_task') and self.audio_send_task:
            self.audio_send_task.cancel()
            try:
                await self.audio_send_task
            except (asyncio.CancelledError, Exception):
                pass
        if self.gemini_task:
            self.gemini_task.cancel()
            try:
                await self.gemini_task
            except (asyncio.CancelledError, Exception):
                pass
        if self.gemini_ws:
            try:
                await self.gemini_ws.close()
            except Exception:
                pass
        logger.info(f'[PersonalisedVoice] Browser disconnected: code={close_code}')

    async def receive(self, text_data=None, bytes_data=None):
        # Handle binary frames (optimized audio path — 33% smaller than base64 JSON)
        if bytes_data:
            await self._handle_binary_audio(bytes_data)
            return

        if not text_data:
            return
        try:
            msg = json.loads(text_data)
        except Exception:
            return

        msg_type = msg.get('type')

        if msg_type == 'start':
            self.voice_override = msg.get('voice') or None
            logger.info(f'[PersonalisedVoice] Starting: voice={self.voice_override or "auto"}')
            await self._start_gemini_session()

        elif msg_type == 'audio':
            if self.gemini_ws and self.session_active:
                audio_b64 = msg.get('data', '')
                if audio_b64 and hasattr(self, 'audio_queue'):
                    await self.audio_queue.put(audio_b64)

        elif msg_type == 'text_message':
            text = msg.get('text', '').strip()
            if text and self.session_active:
                self.transcript_log.append(('user', text))
                await self._send({'type': 'transcript_user', 'text': text})

                if self.text_fallback_mode or not self.gemini_ws:
                    await self._reply_with_text_fallback(text)
                else:
                    try:
                        realtime_msg = {
                            'realtimeInput': {
                                'text': text
                            }
                        }
                        await self.gemini_ws.send(json.dumps(realtime_msg))
                    except Exception as e:
                        logger.warning(f'[PersonalisedVoice] Failed to send text: {e}')
                        await self._reply_with_text_fallback(text)

        elif msg_type == 'end_session':
            await self._end_session()

    async def _handle_binary_audio(self, data: bytes):
        """
        Handle binary WebSocket frames from the browser.
        Format: [0x01, 0x00, 0x00, 0x00] + raw PCM16 bytes
        The 0x01 header identifies this as an audio frame.
        """
        if len(data) < 4 or data[0] != 0x01:
            return  # Unknown binary frame type
        if not self.gemini_ws or not self.session_active:
            return

        pcm_bytes = data[4:]  # Skip 4-byte header
        if not pcm_bytes:
            return

        import base64 as b64
        audio_b64 = b64.b64encode(pcm_bytes).decode('ascii')
        if hasattr(self, 'audio_queue'):
            await self.audio_queue.put(audio_b64)

    async def _start_gemini_session(self):
        api_key = os.getenv('GOOGLE_STUDIO_API_KEY', '')
        if not api_key:
            await self._send({'type': 'error', 'message': 'Google API key not configured'})
            return

        ctx = await _get_personalized_context(self.scope['user'])
        system_prompt = (
            f"You are a personal tutor for {ctx['username']}, a {ctx['level_name']} student "
            f"({ctx['xp']} XP, {ctx['streak']}-day streak). Education: {ctx['education']}.\n"
            f"PERFORMANCE: {ctx['performance_str']}\n"
            f"Materials:\n{ctx['materials_str']}\nHistory: {ctx['history_str']}\n\n"
            "PERSONALITY:\n"
            "- Warm, encouraging, and patient like a favourite teacher.\n"
            "- Use the student's name naturally.\n"
            "- Adapt language to their level.\n\n"
            "HOW TO RESPOND:\n"
            "CRITICAL: Speak naturally and at length. When teaching, do NOT stop mid-explanation. Complete your full thought before pausing. "
            "Take natural breaths between sentences — brief pauses are fine, but don't cut yourself off.\n\n"
            "Casual chat (greetings, quick questions): Keep it short, 1-2 sentences.\n\n"
            "Teaching mode (when they say 'teach me X', 'explain X', 'what is X', or ask to study a topic):\n"
            "1. Start by acknowledging the topic and briefly say what you'll cover.\n"
            "2. Break it into clear sections or steps. Explain each one thoroughly with examples.\n"
            "3. Use analogies and real-world examples they can relate to.\n"
            "4. After explaining a key concept, ask a quick check-in question like 'Does that make sense?' or 'Want me to go deeper on that?'\n"
            "5. Connect the topic to their study materials when relevant.\n"
            "6. At the end, give a brief recap of what was covered.\n"
            "Speak at length when teaching — cover the full topic without stopping. Don't cut explanations short.\n\n"
            "Tutoring mode (homework help, practice questions, revision):\n"
            "- Guide them with questions rather than giving answers directly.\n"
            "- Give hints and let them think.\n"
            "- If they're stuck, explain step by step.\n\n"
            "Analysis mode (when they ask about strengths, weaknesses, gaps, progress, how they're doing):\n"
            "- Use the PERFORMANCE data above to give specific, honest feedback.\n"
            "- Name their strong topics and weak topics with mastery percentages.\n"
            "- Suggest what to focus on next based on their gaps.\n"
            "- Be encouraging but honest — don't sugarcoat weak areas.\n\n"
            "Always be encouraging. If they get something wrong, explain why positively."
        )

        ws_url = f'{GEMINI_LIVE_WS_URL}?key={api_key}'
        voice_name = self.voice_override or 'Aoede'

        # Try connecting up to 2 times before giving up
        last_error = None
        for attempt in range(2):
            try:
                logger.info(f'[PersonalisedVoice] Connecting to Gemini (attempt {attempt + 1})...')
                self.gemini_ws = await asyncio.wait_for(
                    websockets.connect(
                        ws_url,
                        ping_interval=20,
                        ping_timeout=10,
                        max_size=10 * 1024 * 1024,
                    ),
                    timeout=30,
                )
                break
            except Exception as e:
                last_error = e
                logger.warning(f'[PersonalisedVoice] Connection attempt {attempt + 1} failed: {e}')
                if attempt == 0:
                    await asyncio.sleep(2)
        else:
            logger.error(f'[PersonalisedVoice] All connection attempts failed: {last_error}')
            self.session_active = True
            self.text_fallback_mode = True
            self.text_fallback_reason = str(last_error)
            await self._send({'type': 'ready'})
            await self._send({'type': 'status', 'message': 'Voice server offline. Text coaching mode is active.'})
            await self._reply_with_text_fallback(f"Hi {ctx['username']}! Ready to study?")
            return

        try:
            config = {
                'setup': {
                    'model': f'models/{GEMINI_LIVE_MODEL}',
                    'generationConfig': {
                        'responseModalities': ['AUDIO'],
                        'speechConfig': {
                            'voiceConfig': {
                                'prebuiltVoiceConfig': {
                                    'voiceName': voice_name
                                }
                            },
                        },
                        'temperature': 0.7,
                        'maxOutputTokens': 8192,
                    },
                    'systemInstruction': {
                        'parts': [{'text': system_prompt}]
                    },
                    'realtimeInputConfig': {
                        'automaticActivityDetection': {
                            'disabled': False,
                        }
                    },
                }
            }
            await self.gemini_ws.send(json.dumps(config))

            initial_instruction = f"Hi {ctx['username']}! Ready to study?"

            # Wait for setupComplete — retry recv on timeout instead of giving up immediately
            setup_ready = False
            for i in range(5):
                try:
                    setup_resp = await asyncio.wait_for(self.gemini_ws.recv(), timeout=20)
                    setup_data = json.loads(setup_resp)
                    if 'setupComplete' in setup_data:
                        setup_ready = True
                        break
                    else:
                        logger.info(f'[PersonalisedVoice] Received non-setup msg: {list(setup_data.keys())}')
                except asyncio.TimeoutError:
                    logger.warning(f'[PersonalisedVoice] Setup recv timeout (attempt {i + 1}/5)')
                    if i < 4:
                        continue
                    break

            if not setup_ready:
                logger.error('[PersonalisedVoice] Gemini setup timed out after all attempts')
                try:
                    await self.gemini_ws.close()
                except Exception:
                    pass
                self.session_active = True
                self.text_fallback_mode = True
                self.text_fallback_reason = 'live voice setup timed out'
                await self._send({'type': 'ready'})
                await self._send({'type': 'status', 'message': 'Voice server offline. Text coaching mode is active.'})
                await self._reply_with_text_fallback(initial_instruction)
                return

            # Initialise the audio queue and start the drain task immediately
            # so audio chunks can be sent as fast as they arrive without blocking receive()
            self.audio_queue = asyncio.Queue()
            self.audio_send_task = asyncio.create_task(self._drain_audio_queue())

            self.session_active = True
            await self._send({'type': 'ready'})
            logger.info(f'[PersonalisedVoice] Gemini ready: voice={voice_name}')

            self.gemini_task = asyncio.create_task(self._receive_from_gemini())
            await self._send_text_to_gemini(initial_instruction)

        except Exception as e:
            logger.error(f'[PersonalisedVoice] Session setup failed: {e}', exc_info=True)
            # Graceful text fallback on initial connection failure
            self.session_active = True
            self.text_fallback_mode = True
            self.text_fallback_reason = str(e)
            await self._send({'type': 'ready'})
            await self._send({'type': 'status', 'message': 'Voice server offline. Text coaching mode is active.'})
            await self._reply_with_text_fallback(f"Hi {ctx['username']}! Ready to study?")

    async def _reply_with_text_fallback(self, text: str):
        try:
            from ai_assistant.services import AIService
            ai = AIService()
            prompt = (
                f"You are a friendly personal study coach. Keep your reply to 1-2 sentences. "
                f"The student said: {text}."
            )
            result = await asyncio.wait_for(ai.chat([{'role': 'user', 'content': prompt}]), timeout=20)
            reply = (result or '').strip()
            if not reply:
                reply = "I'm listening. Let know what you want to study today."
            self.transcript_log.append(('ai', reply))
            await self._send({'type': 'transcript_ai', 'text': reply})
        except Exception as e:
            logger.warning(f'[PersonalisedVoice] Text fallback failed: {e}')
            fallback = "I'm here. Let know what you want to study today."
            self.transcript_log.append(('ai', fallback))
            await self._send({'type': 'transcript_ai', 'text': fallback})

    async def _drain_audio_queue(self):
        """
        Dedicated coroutine that drains the audio queue and forwards chunks to Gemini.
        Running this separately from receive() means audio sends never block message handling,
        giving much lower perceived latency.
        """
        try:
            while self.session_active:
                try:
                    audio_b64 = await asyncio.wait_for(self.audio_queue.get(), timeout=1.0)
                    await self._send_audio_to_gemini(audio_b64)
                    self.audio_queue.task_done()
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f'[PersonalisedVoice] Audio drain task error: {e}')

    async def _send_audio_to_gemini(self, audio_b64: str):
        try:
            if not self.gemini_ws:
                return
            msg = {
                'realtimeInput': {
                    'mediaChunks': [
                        {
                            'data': audio_b64,
                            'mimeType': 'audio/pcm;rate=16000'
                        }
                    ]
                }
            }
            await self.gemini_ws.send(json.dumps(msg))
        except Exception as e:
            logger.warning(f'[PersonalisedVoice] Failed to send audio: {e}')

    async def _send_text_to_gemini(self, text: str):
        try:
            msg = {
                'clientContent': {
                    'turns': [
                        {
                            'role': 'user',
                            'parts': [{'text': text}]
                        }
                    ],
                    'turnComplete': True
                }
            }
            await self.gemini_ws.send(json.dumps(msg))
        except Exception as e:
            logger.warning(f'[PersonalisedVoice] Failed to send text: {e}')

    async def _receive_from_gemini(self):
        try:
            async for raw_msg in self.gemini_ws:
                if not self.session_active:
                    break
                try:
                    data = json.loads(raw_msg)
                    await self._handle_gemini_message(data)
                except Exception as e:
                    logger.warning(f'[PersonalisedVoice] Error handling message: {e}')
        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f'[PersonalisedVoice] Gemini connection closed: code={e.code}')
            if self.session_active:
                self.session_active = False
                await self._send({'type': 'error', 'message': 'AI connection dropped.'})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f'[PersonalisedVoice] Receive error: {e}')
            if self.session_active:
                self.session_active = False
                await self._send({'type': 'error', 'message': 'Connection to AI lost.'})

    async def _handle_gemini_message(self, data: dict):
        server_content = data.get('serverContent', {}) or {}
        interrupted = data.get('interrupted') or server_content.get('interrupted', False)
        if interrupted:
            await self._send({'type': 'interrupted'})

        if not server_content:
            return

        model_turn = server_content.get('modelTurn', {})
        for part in model_turn.get('parts', []):
            inline = part.get('inlineData', {})
            if inline.get('data'):
                await self._send({'type': 'audio', 'data': inline['data']})
                self.ai_audio_b64_chunks.append(inline['data'])
            if part.get('text'):
                self.transcript_log.append(('ai', part['text']))

        input_transcript = server_content.get('inputTranscription', {})
        if input_transcript.get('text'):
            text = input_transcript['text'].strip()
            if text:
                self.transcript_log.append(('user', text))
                await self._send({'type': 'transcript_user', 'text': text})

        if server_content.get('turnComplete'):
            if self.ai_audio_b64_chunks:
                chunks = self.ai_audio_b64_chunks
                self.ai_audio_b64_chunks = []
                asyncio.create_task(self._transcribe_ai_audio(chunks))

    async def _transcribe_ai_audio(self, b64_chunks: list):
        """Send buffered AI audio to Groq Whisper for subtitle transcription."""
        try:
            pcm_bytes = b''.join(base64.b64decode(c) for c in b64_chunks)
            if len(pcm_bytes) < 48000:
                return

            sample_rate = 24000
            num_channels = 1
            bits_per_sample = 16
            byte_rate = sample_rate * num_channels * bits_per_sample // 8
            block_align = num_channels * bits_per_sample // 8
            data_size = len(pcm_bytes)

            wav_header = struct.pack(
                '<4sI4s4sIHHIIHH4sI',
                b'RIFF', 36 + data_size, b'WAVE',
                b'fmt ', 16, 1, num_channels, sample_rate, byte_rate, block_align, bits_per_sample,
                b'data', data_size,
            )
            wav_bytes = wav_header + pcm_bytes

            groq_keys = [k for k in [
                os.getenv('GROQ_API_KEY', ''),
                os.getenv('GROQ_API_KEY_2', ''),
                os.getenv('GROQ_API_KEY_3', ''),
                os.getenv('GROQ_API_KEY_4', ''),
                os.getenv('GROQ_API_KEY_5', ''),
            ] if k]

            for key in groq_keys:
                try:
                    resp = await asyncio.wait_for(
                        asyncio.to_thread(
                            http_requests.post,
                            'https://api.groq.com/openai/v1/audio/transcriptions',
                            headers={'Authorization': f'Bearer {key}'},
                            files={'file': ('audio.wav', wav_bytes, 'audio/wav')},
                            data={'model': 'whisper-large-v3'},
                            timeout=10,
                        ),
                        timeout=12,
                    )
                    if resp.status_code == 200:
                        text = resp.json().get('text', '').strip()
                        if text:
                            self.transcript_log.append(('ai', text))
                            await self._send({'type': 'transcript_ai', 'text': text})
                            return
                except Exception:
                    continue
            logger.warning('[PersonalisedVoice] STT failed on all Groq keys')
        except Exception as e:
            logger.warning(f'[PersonalisedVoice] STT error: {e}')

    async def _end_session(self):
        self.session_active = False
        if hasattr(self, 'audio_send_task') and self.audio_send_task:
            self.audio_send_task.cancel()
            try:
                await self.audio_send_task
            except (asyncio.CancelledError, Exception):
                pass
        if self.gemini_task:
            self.gemini_task.cancel()
            try:
                await self.gemini_task
            except (asyncio.CancelledError, Exception):
                pass
        if self.gemini_ws:
            try:
                await self.gemini_ws.close()
            except Exception:
                pass

        # Persist the transcript so future sessions can recall it
        if self.transcript_log:
            try:
                user = self.scope.get('user')
                if user and user.is_authenticated:
                    await self._save_transcript(user)
            except Exception as e:
                logger.error(f'[PersonalisedVoice] Failed to save transcript: {e}')

        report = await self._generate_report()
        await self._send({'type': 'session_report', 'report': report})

    async def _generate_report(self) -> dict:
        if not self.transcript_log:
            return {
                'summary': 'No conversation recorded.',
                'strengths': [],
                'gaps': [],
                'score': 0,
                'recommendation': 'Speak to your voice coach to get study guidance.',
            }

        transcript_text = '\n'.join(
            f"{'Student' if role == 'user' else 'AI'}: {text}"
            for role, text in self.transcript_log
        )

        from ai_assistant.services import AIService
        ai = AIService()
        prompt = (
            f"Analyze this study coaching session.\n\n"
            f"TRANSCRIPT:\n{transcript_text[:6000]}\n\n"
            "Return ONLY a JSON object evaluating the student's focus and progress:\n"
            "{\n"
            '  "summary": "2-3 sentence summary of the study coaching session",\n'
            '  "strengths": ["topics they know well", "..."],\n'
            '  "gaps": ["areas they need to review", "..."],\n'
            '  "score": <0-100 integer representing session focus/depth>,\n'
            '  "recommendation": "actionable advice on next steps for study"\n'
            "}"
        )

        try:
            result = await ai.chat([{'role': 'user', 'content': prompt}])
            report = ai._parse_json(result, {})
            if isinstance(report, dict) and report.get('summary'):
                return report
        except Exception as e:
            logger.error(f'[PersonalisedVoice] Report generation failed: {e}')

        return {
            'summary': f'Session completed with {len(self.transcript_log)} exchanges.',
            'strengths': [],
            'gaps': [],
            'score': 70,
            'recommendation': 'Keep up the consistent effort and schedule another voice coaching session.',
        }

    async def _send(self, data: dict):
        try:
            await self.send(text_data=json.dumps(data))
        except Exception:
            pass
