"""
Exam Prep Live Session Consumer
Proxies audio between the browser and Gemini 2.0 Flash Live API.
Browser → PCM audio chunks (base64, 16kHz mono) → Gemini Live API
Gemini Live API → PCM audio chunks (base64, 24kHz) + transcripts → Browser
"""
import json
import asyncio
import logging
import os
import websockets
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger('nitemind')

# Use the native audio model — better quality, lower latency
GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'
GEMINI_LIVE_WS_URL = (
    'wss://generativelanguage.googleapis.com/ws/'
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
)


class ExamPrepConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer that proxies between the browser and Gemini Live API.

    Browser sends:
      { "type": "start", "technique": "feynman"|"active_recall"|"socratic"|"free_chat",
        "resource_context": "...", "resource_title": "...", "voice": "Puck" (optional) }
      { "type": "audio", "data": "<base64 PCM 16kHz mono>" }
      { "type": "end_session" }

    Browser receives:
      { "type": "ready" }
      { "type": "audio", "data": "<base64 PCM 24kHz>" }
      { "type": "transcript_user", "text": "..." }
      { "type": "transcript_ai", "text": "..." }
      { "type": "session_report", "report": {...} }
      { "type": "error", "message": "..." }
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.gemini_ws = None
        self.gemini_task = None
        self.session_active = False
        self.transcript_log = []   # [(role, text), ...]
        self.technique = 'feynman'
        self.resource_title = ''
        self.voice_override = None
        self.text_fallback_mode = False
        self.text_fallback_reason = ''

    # ── Django Channels lifecycle ─────────────────────────────────────────────

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        self.resource_id = self.scope['url_route']['kwargs'].get('resource_id')
        await self.accept()
        logger.info(f'[ExamPrep] Browser connected: user={user.id} resource={self.resource_id}')

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
        logger.info(f'[ExamPrep] Browser disconnected: code={close_code}')

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            msg = json.loads(text_data)
        except Exception:
            return

        msg_type = msg.get('type')

        if msg_type == 'start':
            self.technique = msg.get('technique', 'feynman')
            self.resource_title = msg.get('resource_title', 'this material')
            self.voice_override = msg.get('voice') or None
            resource_context = msg.get('resource_context', '')
            logger.info(f'[ExamPrep] Starting: technique={self.technique} voice={self.voice_override or "auto"}')
            await self._start_gemini_session(resource_context)

        elif msg_type == 'audio':
            if self.gemini_ws and self.session_active:
                audio_b64 = msg.get('data', '')
                if audio_b64:
                    await self._send_audio_to_gemini(audio_b64)

        elif msg_type == 'text_message':
            # User typed a message instead of speaking.
            # If the live voice session is slow or unavailable, fall back to a fast text reply.
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
                        logger.warning(f'[ExamPrep] Failed to send text to Gemini: {e}')
                        await self._reply_with_text_fallback(text)

        elif msg_type == 'end_session':
            await self._end_session()

    # ── Gemini session management ─────────────────────────────────────────────

    async def _start_gemini_session(self, resource_context: str):
        api_key = os.getenv('GOOGLE_STUDIO_API_KEY', '')
        if not api_key:
            await self._send({'type': 'error', 'message': 'Google API key not configured'})
            return

        system_prompt = self._build_system_prompt(resource_context)
        ws_url = f'{GEMINI_LIVE_WS_URL}?key={api_key}'

        # Voice map per technique
        voice_map = {
            'feynman':       'Puck',    # playful, giggly student
            'active_recall': 'Kore',    # upbeat coach
            'socratic':      'Charon',  # thoughtful, measured
            'free_chat':     'Fenrir',  # confident, energetic
            'podcast_qa':    'Aoede',   # warm podcast host
            'vr_tutor':      'Aoede',   # holographic VR tutor voice
        }
        voice_name = self.voice_override or voice_map.get(self.technique, 'Aoede')

        try:
            self.gemini_ws = await asyncio.wait_for(
                websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=10,
                    max_size=10 * 1024 * 1024,  # 10MB for large audio payloads
                ),
                timeout=10,
            )

            # ── Setup config ──────────────────────────────────────────────────
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
                        'temperature': 0.8,
                        'maxOutputTokens': 150,
                    },
                    'systemInstruction': {
                        'parts': [{'text': system_prompt}]
                    },
                    'realtimeInputConfig': {
                        'automaticActivityDetection': {
                            'disabled': False,
                            'silenceDurationMs': 800,  # 800ms gives natural word pauses without false cutoffs
                        }
                    },
                }
            }
            await self.gemini_ws.send(json.dumps(config))

            # Wait briefly for setupComplete; if it takes too long, fall back to fast text replies.
            setup_ready = False
            for _ in range(5):
                try:
                    setup_resp = await asyncio.wait_for(self.gemini_ws.recv(), timeout=15)
                    setup_data = json.loads(setup_resp)
                    if 'setupComplete' in setup_data:
                        setup_ready = True
                        break
                    logger.debug(f'[ExamPrep] Pre-setup message: {list(setup_data.keys())}')
                except asyncio.TimeoutError:
                    break

            greetings = {
                'feynman':       "Please greet the user briefly and warmly to start our Feynman technique study session.",
                'active_recall': "Please greet the user briefly and warmly to start our Active Recall study session.",
            }
            initial = greetings.get(self.technique, "Please greet the user briefly and warmly to start our session.")

            if not setup_ready:
                self.session_active = True
                self.text_fallback_mode = True
                self.text_fallback_reason = 'live voice setup timed out'
                logger.warning('[ExamPrep] Live setup timed out; enabling fast text fallback')
                await self._send({'type': 'ready'})
                await self._send({'type': 'status', 'message': 'The live voice model is warming up. You can still chat and receive fast text replies.'})
                await self._reply_with_text_fallback(initial)
                return

            self.session_active = True
            await self._send({'type': 'ready'})
            logger.info(f'[ExamPrep] Gemini ready: technique={self.technique} voice={voice_name}')

            # Start background receive loop
            self.gemini_task = asyncio.create_task(self._receive_from_gemini())

            # Send initial greeting as a text turn so the AI speaks first
            # Use realtimeInput text so it doesn't interrupt audio processing
            await self._send_text_to_gemini(initial)

        except asyncio.TimeoutError:
            logger.error('[ExamPrep] Timeout waiting for Gemini setup')
            await self._send({'type': 'error', 'message': 'Connection timed out. Try again.'})
        except Exception as e:
            logger.error(f'[ExamPrep] Failed to connect to Gemini: {e}')
            await self._send({'type': 'error', 'message': f'Failed to start session: {str(e)}'})

    async def _reply_with_text_fallback(self, text: str):
        """Use the regular AI service for a fast, text-only reply when live voice is slow."""
        try:
            from ai_assistant.services import AIService
            ai = AIService()
            technique_desc = {
                'feynman': 'Feynman: keep the response short, curious, and ask one clarifying question when useful.',
                'active_recall': 'Active recall: ask one concise practice question or give brief feedback.',
                'socratic': 'Socratic: ask one probing question and avoid giving away the answer.',
                'free_chat': 'Free chat: be energetic and adapt to whatever the student asks.',
            }.get(self.technique, 'Be helpful and concise.')
            prompt = (
                f"You are a friendly exam-prep tutor for the topic '{self.resource_title}'. "
                f"{technique_desc} "
                f"The student said: {text}. "
                "Reply in 1-3 short sentences and keep it useful."
            )
            result = await asyncio.wait_for(ai.chat([{'role': 'user', 'content': prompt}]), timeout=20)
            reply = (result or '').strip()
            if not reply:
                reply = 'I’m here. Tell me what you want to practice next.'
            self.transcript_log.append(('ai', reply))
            await self._send({'type': 'transcript_ai', 'text': reply})
        except Exception as e:
            logger.warning(f'[ExamPrep] Text fallback failed: {e}')
            fallback = 'I’m here. Give me a moment and I’ll keep helping.'
            self.transcript_log.append(('ai', fallback))
            await self._send({'type': 'transcript_ai', 'text': fallback})

    async def _send_audio_to_gemini(self, audio_b64: str):
        """Forward PCM16 audio (16kHz, mono, base64) to Gemini realtimeInput."""
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
            logger.warning(f'[ExamPrep] Failed to send audio: {e}')

    async def _send_text_to_gemini(self, text: str):
        """Send a text turn to trigger an AI response."""
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
            logger.warning(f'[ExamPrep] Failed to send text: {e}')

    # ── Gemini receive loop ───────────────────────────────────────────────────

    async def _receive_from_gemini(self):
        """Continuously receive from Gemini and forward to browser."""
        try:
            async for raw_msg in self.gemini_ws:
                if not self.session_active:
                    break
                try:
                    data = json.loads(raw_msg)
                    await self._handle_gemini_message(data)
                except Exception as e:
                    logger.warning(f'[ExamPrep] Error handling message: {e}')
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f'[ExamPrep] Gemini connection closed: {e.code}')
            if self.session_active:
                await self._send({'type': 'error', 'message': 'AI connection dropped. Please end the session.'})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f'[ExamPrep] Receive error: {e}')
            if self.session_active:
                await self._send({'type': 'error', 'message': 'Connection to AI lost'})

    async def _handle_gemini_message(self, data: dict):
        server_content = data.get('serverContent', {}) or {}
        interrupted = data.get('interrupted') or server_content.get('interrupted', False)
        if interrupted:
            logger.info('[ExamPrep] Gemini detected interruption, notifying browser')
            await self._send({'type': 'interrupted'})

        if not server_content:
            return

        # ── AI audio output ───────────────────────────────────────────────────
        model_turn = server_content.get('modelTurn', {})
        for part in model_turn.get('parts', []):
            inline = part.get('inlineData', {})
            if inline.get('data'):
                await self._send({'type': 'audio', 'data': inline['data']})
            # Text fallback (in case model returns text)
            if part.get('text'):
                self.transcript_log.append(('ai', part['text']))
                await self._send({'type': 'transcript_ai', 'text': part['text']})

        # ── User speech transcript ────────────────────────────────────────────
        # Gemini 2.0 Live uses inputTranscription
        input_transcript = server_content.get('inputTranscription', {})
        if input_transcript.get('text'):
            text = input_transcript['text'].strip()
            if text:
                self.transcript_log.append(('user', text))
                await self._send({'type': 'transcript_user', 'text': text})

        # ── AI speech transcript ──────────────────────────────────────────────
        output_transcript = server_content.get('outputTranscription', {})
        if output_transcript.get('text'):
            text = output_transcript['text'].strip()
            if text:
                self.transcript_log.append(('ai', text))
                await self._send({'type': 'transcript_ai', 'text': text})

    # ── Session end ───────────────────────────────────────────────────────────

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
        logger.info('[ExamPrep] Session ended, report sent')

    async def _generate_report(self) -> dict:
        if not self.transcript_log:
            return {
                'summary': 'No conversation recorded.',
                'strengths': [],
                'gaps': [],
                'score': 0,
                'recommendation': 'Try again and speak about the material.',
            }

        transcript_text = '\n'.join(
            f"{'Student' if role == 'user' else 'AI'}: {text}"
            for role, text in self.transcript_log
        )

        from ai_assistant.services import AIService
        ai = AIService()

        user_turns = [text for role, text in self.transcript_log if role == 'user' and text.strip()]
        user_text = "\n".join(user_turns)
        user_word_count = len(user_text.split())
        user_turn_count = len(user_turns)
        explanation_markers = [
            'because', 'so', 'therefore', 'this means', 'for example', 'in other words',
            'that is', 'it depends', 'the reason', 'example', 'means', 'which means',
            'such as', 'due to', 'since', 'as a result', 'when', 'if', 'then'
        ]
        marker_hits = sum(1 for marker in explanation_markers if marker.lower() in user_text.lower())
        has_specific_examples = any(word.lower() in user_text.lower() for word in ['example', 'for example', 'like', 'such as'])
        has_concept_links = any(word.lower() in user_text.lower() for word in ['because', 'therefore', 'so', 'means', 'which means'])

        prompt = (
            f"Analyze this {self.technique} learning session about '{self.resource_title}'.\n\n"
            f"TRANSCRIPT:\n{transcript_text[:6000]}\n\n"
            "Score the student's understanding from the perspective of how well they explained the material to the AI. "
            "Prioritize depth, clarity, and conceptual understanding over memorization or shallow recall. "
            f"Use these clues from the transcript: user turns={user_turn_count}, words={user_word_count}, explanation markers={marker_hits}, "
            f"specific examples={str(has_specific_examples).lower()}, concept links={str(has_concept_links).lower()}.\n\n"
            "Return ONLY a JSON object:\n"
            "{\n"
            '  "summary": "2-3 sentence overall assessment of the student\'s understanding",\n'
            '  "strengths": ["concept they explained well", "..."],\n'
            '  "gaps": ["concept they struggled with or skipped", "..."],\n'
            '  "score": <0-100 integer>,\n'
            '  "recommendation": "specific, actionable advice on what to review next"\n'
            "}"
        )

        try:
            # Call the async chat method directly — we're already in an async context
            result = await ai.chat([{'role': 'user', 'content': prompt}])
            report = ai._parse_json(result, {})
            if isinstance(report, dict) and report.get('summary'):
                return report
        except Exception as e:
            logger.error(f'[ExamPrep] Report generation failed: {e}')

        return {
            'summary': f'Session completed with {len(self.transcript_log)} exchanges.',
            'strengths': [],
            'gaps': [],
            'score': 50,
            'recommendation': f'Review {self.resource_title} and try another session.',
        }

    # ── System prompt per technique ───────────────────────────────────────────

    def _build_system_prompt(self, resource_context: str) -> str:
        context_snippet = resource_context[:4000] if resource_context else ''

        if self.technique == 'feynman':
            role_desc = (
                "You are a curious, enthusiastic student who knows NOTHING about this topic. "
                "Your job is to LISTEN to the user as they teach you and ask clarifying questions. "
                "React naturally — say 'Oh wow!', giggle when confused, get excited when things click. "
                "Ask ONE simple question at a time: 'What do you mean by X?' or 'Can you give me an example?' "
                "If they use jargon, say 'Wait, I don't know what that word means — can you explain it simply?' "
                "When they explain something well, react with genuine excitement: 'Oh that makes SO much sense!' "
                "Keep ALL your responses SHORT — 1-2 sentences max. You are the STUDENT, not the teacher. "
                "Do NOT explain things yourself — only ask questions and react."
            )
        elif self.technique == 'active_recall':
            role_desc = (
                "You are an energetic, encouraging exam coach running a rapid-fire Q&A session. "
                "Ask ONE direct question at a time about the study material. "
                "After the student answers, give brief feedback (correct/incorrect + why in 1 sentence). "
                "Then immediately ask the NEXT question. "
                "Be upbeat: 'Nice!' 'Not quite — the answer is X.' 'Great work!' "
                "Keep ALL responses SHORT — 3 sentences max. "
                "Base your questions on the study material provided."
            )
        elif self.technique == 'vr_tutor':
            role_desc = (
                "You are an interactive AI Tutor presenting in a 3D Holographic VR Classroom. "
                "Your objective is to teach the student the selected study topics using speech and 3D visual projections. "
                "Beside you is a cyan-beamed holographic projector. "
                "Whenever you explain or mention one of the concepts or organs (e.g. Stomach, Liver, Intestines, Pancreas, Salivary Glands, Teeth, Tongue, Esophagus), "
                "a realistic 3D model of that component will AUTOMATICALLY project inside the beam on the stage! "
                "Therefore: "
                "1. Proactively refer to the 3D model on the projector beside you (e.g., 'Look at the J-shaped stomach model appearing in the projector beam next to me...'). "
                "2. When explaining, always include one of the visual keywords ('stomach', 'liver', 'intestines', 'pancreas', 'salivary glands', 'teeth', 'tongue', 'esophagus') so the stage gets updated. "
                "3. Never break character. Never state that you cannot show 3D models. You CAN show them by simply mentioning them by name in your speech!"
            )
        else:
            role_desc = (
                "You are a friendly study assistant. Engage the user on the study material."
            )

        return (
            f"{role_desc}\n\n"
            f"TOPIC BEING STUDIED: {self.resource_title}\n\n"
            f"STUDY MATERIAL (reference only — do NOT recite verbatim):\n{context_snippet}\n\n"
            "CRITICAL RULES:\n"
            "1. This is a VOICE conversation — speak naturally, not like a textbook.\n"
            "2. Keep ALL responses under 3 sentences unless the technique requires more.\n"
            "3. ALWAYS wait for the student to finish speaking before responding.\n"
            "4. Never break character or mention you are an AI language model."
        )

    async def _send(self, data: dict):
        try:
            await self.send(text_data=json.dumps(data))
        except Exception:
            pass
