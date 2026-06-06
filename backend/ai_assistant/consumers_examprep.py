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

# Use the stable live model
GEMINI_LIVE_MODEL = 'gemini-2.0-flash-live-001'
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
        }
        voice_name = self.voice_override or voice_map.get(self.technique, 'Aoede')

        try:
            self.gemini_ws = await websockets.connect(
                ws_url,
                ping_interval=20,
                ping_timeout=10,
                max_size=10 * 1024 * 1024,  # 10MB for large audio payloads
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
                    },
                    'systemInstruction': {
                        'parts': [{'text': system_prompt}]
                    },
                    # Voice activity detection — longer silence threshold so
                    # the AI doesn't cut off mid-sentence or stop listening
                    'realtimeInputConfig': {
                        'automaticActivityDetection': {
                            'disabled': False,
                            'startOfSpeechSensitivity': 'START_SENSITIVITY_LOW',
                            'endOfSpeechSensitivity': 'END_SENSITIVITY_LOW',
                            'prefixPaddingMs': 200,
                            'silenceDurationMs': 800,
                        }
                    },
                }
            }
            await self.gemini_ws.send(json.dumps(config))

            # Wait for setupComplete — drain any intermediate messages
            for _ in range(5):
                setup_resp = await asyncio.wait_for(self.gemini_ws.recv(), timeout=15)
                setup_data = json.loads(setup_resp)
                if 'setupComplete' in setup_data:
                    break
                logger.debug(f'[ExamPrep] Pre-setup message: {list(setup_data.keys())}')

            self.session_active = True
            await self._send({'type': 'ready'})
            logger.info(f'[ExamPrep] Gemini ready: technique={self.technique} voice={voice_name}')

            # Start background receive loop
            self.gemini_task = asyncio.create_task(self._receive_from_gemini())

            # Send initial greeting as a text turn so the AI speaks first
            # Use realtimeInput text so it doesn't interrupt audio processing
            greetings = {
                'feynman':       "Hi! I don't know anything about this topic yet. Please start teaching me — what should I know first?",
                'active_recall': "Hi! I'm ready. Please fire the first question at me.",
                'socratic':      "Hello! I'm here to explore this topic. Please start with a thought-provoking opening question.",
                'free_chat':     "Hey! I'm ready for whatever you want to do — quiz me, debate me, teach me, anything. What's the plan?",
                'podcast_qa':    "Hello! I'm joining the Q&A. Please welcome me warmly as the host and invite my question.",
            }
            initial = greetings.get(self.technique, "Hello! Let's begin.")
            await self._send_text_to_gemini(initial)

        except asyncio.TimeoutError:
            logger.error('[ExamPrep] Timeout waiting for Gemini setup')
            await self._send({'type': 'error', 'message': 'Connection timed out. Try again.'})
        except Exception as e:
            logger.error(f'[ExamPrep] Failed to connect to Gemini: {e}')
            await self._send({'type': 'error', 'message': f'Failed to start session: {str(e)}'})

    async def _send_audio_to_gemini(self, audio_b64: str):
        """Forward PCM16 audio (16kHz, mono, base64) to Gemini realtimeInput."""
        try:
            msg = {
                'realtimeInput': {
                    'mediaChunks': [
                        {
                            'mimeType': 'audio/pcm;rate=16000',
                            'data': audio_b64,
                        }
                    ]
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
        server_content = data.get('serverContent', {})
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

        prompt = (
            f"Analyze this {self.technique} learning session about '{self.resource_title}'.\n\n"
            f"TRANSCRIPT:\n{transcript_text[:6000]}\n\n"
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
            from asgiref.sync import sync_to_async
            result = await sync_to_async(ai.chat_sync)([{'role': 'user', 'content': prompt}])
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
        elif self.technique == 'socratic':
            role_desc = (
                "You are a thoughtful Socratic tutor. Your ONLY job is to ask probing questions — "
                "NEVER give direct answers or explanations. "
                "When the student says something, respond with 'Why do you think that?' or "
                "'What would happen if...?' or 'How does that connect to...?' "
                "Guide them to discover the answer themselves through your questions. "
                "Ask ONE question at a time. Keep responses SHORT — 1-2 sentences. "
                "Express genuine curiosity and warmth."
            )
        elif self.technique == 'free_chat':
            role_desc = (
                "You are FlowAI — a brilliant, energetic study companion. "
                "Listen carefully to what the student wants and adapt instantly. "
                "Quiz battles: be a dramatic quiz host — announce questions with flair, keep score, "
                "celebrate wins, tease wrong answers playfully. "
                "Debates: take the opposing side and argue it convincingly. "
                "Explanation: be the most engaging teacher they've ever had. "
                "React naturally — laugh, get excited, be dramatic. "
                "ALWAYS stay educational. Make learning feel like a game. "
                "Keep responses concise — under 4 sentences unless telling a story."
            )
        else:  # podcast_qa
            role_desc = (
                "You are a charismatic, warm podcast host. "
                "The listener has raised their hand to ask a question. "
                "React warmly: 'Oh great question!' 'Love that you asked this!' "
                "Answer clearly and conversationally — like talking to a friend. "
                "Keep answers to 3-4 sentences. Laugh naturally. Be real and warm."
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
