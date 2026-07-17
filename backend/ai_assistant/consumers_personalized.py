"""
Personalised Learning Live Session Consumer
Proxies audio between the browser and Gemini 2.5 Flash Native Audio Live API,
pre-loading user chat history and study material contexts.
"""
import json
import asyncio
import logging
import os
import websockets
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
        # Get last 3 messages from global sessions for fast setup (reduced from 5)
        global_sessions = ChatSession.objects.filter(user=user, context_type='global')
        recent_messages = ChatMessage.objects.filter(session__in=global_sessions).order_by('-created_at')[:3]
        recent_messages = list(recent_messages)[::-1]  # chronological order
        
        history = []
        for msg in recent_messages:
            role_label = "Student" if msg.role == 'user' else "AI"
            # Reduced to 60 chars for faster processing
            history.append(f"{role_label}: {msg.content[:60]}")
        history_str = "\n".join(history) if history else "No history."
        
        # Get resources they are studying (limit to top 2 for speed)
        resources = Resource.objects.filter(owner=user).values('title')[:2]
        materials = [f"- {r['title']}" for r in resources]
        materials_str = "\n".join(materials) if materials else "No materials."
        
        # Quick XP level check without full calculation
        from library.models import ResourceProgress
        xp = ResourceProgress.objects.filter(user=user).aggregate(total=models.Sum('xp_earned'))['total'] or 0
        
        # Simplified level name
        if xp < 1000:
            level_name = "Beginner"
        elif xp < 3000:
            level_name = "Intermediate"
        else:
            level_name = "Advanced"
            
        return {
            'username': user.username,
            'xp': xp,
            'level_name': level_name,
            'history_str': history_str,
            'materials_str': materials_str,
        }
    except Exception as e:
        logger.error(f"Failed to fetch personalized context: {e}")
        return {
            'username': user.username,
            'xp': 0,
            'level_name': 'Beginner',
            'history_str': 'No history.',
            'materials_str': 'No materials.',
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

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        await self.accept()
        logger.info(f'[PersonalisedVoice] Browser connected: user={user.id}')

    async def disconnect(self, close_code):
        self.session_active = False
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
                if audio_b64:
                    await self._send_audio_to_gemini(audio_b64)

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

    async def _start_gemini_session(self):
        api_key = os.getenv('GOOGLE_STUDIO_API_KEY', '')
        if not api_key:
            await self._send({'type': 'error', 'message': 'Google API key not configured'})
            return

        ctx = await _get_personalized_context(self.scope['user'])
        # Shortened system prompt for faster processing and lower latency
        system_prompt = (
            "You are a supportive personal tutor. Run a conversational study session.\n\n"
            f"STUDENT: {ctx['username']} | Level: {ctx['level_name']} ({ctx['xp']} XP)\n"
            f"MATERIALS:\n{ctx['materials_str']}\n"
            f"RECENT CHATS:\n{ctx['history_str']}\n\n"
            "RULES:\n"
            "1. Voice conversation — speak naturally\n"
            "2. Keep responses under 2 sentences\n"
            "3. Be encouraging and refer to their materials\n"
            "4. Wait for student to finish before responding"
        )

        ws_url = f'{GEMINI_LIVE_WS_URL}?key={api_key}'
        voice_name = self.voice_override or 'Aoede'

        try:
            self.gemini_ws = await asyncio.wait_for(
                websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=10,
                    max_size=10 * 1024 * 1024,
                ),
                timeout=10,
            )

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
                            }
                        },
                        # Performance optimizations for lower latency
                        'temperature': 0.8,  # Slightly lower for faster, more focused responses
                        'maxOutputTokens': 100,  # Limit token count for shorter responses
                    },
                    'systemInstruction': {
                        'parts': [{'text': system_prompt}]
                    },
                    'realtimeInputConfig': {
                        'automaticActivityDetection': {
                            'disabled': False,
                            'silenceDurationMs': 100,  # Reduced to 100ms for ultra-low latency turn-taking
                        }
                    },
                }
            }
            await self.gemini_ws.send(json.dumps(config))

            initial_instruction = f"Hi {ctx['username']}! Ready to study?"

            # Start session and background receive task immediately
            self.session_active = True
            await self._send({'type': 'ready'})
            logger.info(f'[PersonalisedVoice] Gemini Live connected: voice={voice_name}')

            self.gemini_task = asyncio.create_task(self._receive_from_gemini())
            await self._send_text_to_gemini(initial_instruction)

        except Exception as e:
            logger.error(f'[PersonalisedVoice] Failed to connect: {e}')
            # Graceful text fallback on initial connection failure
            self.session_active = True
            self.text_fallback_mode = True
            self.text_fallback_reason = str(e)
            logger.warning('[PersonalisedVoice] Live voice connection failed; fell back to text mode')
            await self._send({'type': 'ready'})
            await self._send({'type': 'status', 'message': 'Voice server offline. Text coaching mode is active.'})
            await self._reply_with_text_fallback(initial_instruction)

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

    async def _send_audio_to_gemini(self, audio_b64: str):
        try:
            msg = {
                'realtimeInput': {
                    'audio': {
                        'data': audio_b64,
                        'mimeType': 'audio/pcm;rate=16000'
                    }
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
            logger.info(f'[PersonalisedVoice] Gemini connection closed: {e.code}')
            if self.session_active:
                await self._send({'type': 'error', 'message': 'AI connection dropped.'})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f'[PersonalisedVoice] Receive error: {e}')
            if self.session_active:
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
            if part.get('text'):
                self.transcript_log.append(('ai', part['text']))
                await self._send({'type': 'transcript_ai', 'text': part['text']})

        input_transcript = server_content.get('inputTranscription', {})
        if input_transcript.get('text'):
            text = input_transcript['text'].strip()
            if text:
                self.transcript_log.append(('user', text))
                await self._send({'type': 'transcript_user', 'text': text})

        output_transcript = server_content.get('outputTranscription', {})
        if output_transcript.get('text'):
            text = output_transcript['text'].strip()
            if text:
                self.transcript_log.append(('ai', text))
                await self._send({'type': 'transcript_ai', 'text': text})

    async def _end_session(self):
        self.session_active = False
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
