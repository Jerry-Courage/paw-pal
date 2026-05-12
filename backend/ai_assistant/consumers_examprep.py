"""
Exam Prep Live Session Consumer
Proxies audio between the browser and Gemini 2.5 Flash Native Audio Dialog Live API.
Browser → PCM audio chunks (base64) → Gemini Live API
Gemini Live API → PCM audio chunks (base64) + transcripts → Browser
"""
import json
import asyncio
import logging
import os
import websockets
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger('flowstate')

GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'
GEMINI_LIVE_WS_URL = (
    'wss://generativelanguage.googleapis.com/ws/'
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
)


class ExamPrepConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer that proxies between the browser and Gemini Live API.
    
    Browser sends:
      { "type": "start", "technique": "feynman"|"active_recall"|"socratic",
        "resource_context": "...", "resource_title": "..." }
      { "type": "audio", "data": "<base64 PCM 16kHz>" }
      { "type": "end_session" }
    
    Browser receives:
      { "type": "ready" }
      { "type": "audio", "data": "<base64 PCM>" }
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
        self.transcript_log = []  # [(role, text), ...]
        self.technique = 'feynman'
        self.resource_title = ''
        self.voice_override = None  # set by client to override default voice

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
            self.voice_override = msg.get('voice') or None  # e.g. 'Puck', 'Aoede', 'Kore'
            resource_context = msg.get('resource_context', '')
            logger.info(f'[ExamPrep] Starting session: technique={self.technique} voice={self.voice_override or "auto"}')
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

        try:
            self.gemini_ws = await websockets.connect(
                ws_url,
                ping_interval=20,
                ping_timeout=10,
            )

            # Send setup config
            config = {
                'setup': {
                    'model': f'models/{GEMINI_LIVE_MODEL}',
                    'generationConfig': {
                        'responseModalities': ['AUDIO'],
                        'speechConfig': {
                            'voiceConfig': {
                                'prebuiltVoiceConfig': {
                                    # Voice priority: user override > technique default
                                    'voiceName': self.voice_override or {
                                        'podcast_qa':    'Aoede',   # warm, natural podcast host
                                        'feynman':       'Puck',    # playful, giggly student
                                        'active_recall': 'Kore',    # upbeat coach
                                        'socratic':      'Charon',  # thoughtful, measured
                                        'free_chat':     'Puck',    # most expressive for open sessions
                                    }.get(self.technique, 'Aoede')
                                }
                            }
                        },
                    },
                    'systemInstruction': {
                        'parts': [{'text': system_prompt}]
                    },
                    'inputAudioTranscription': {},
                    'outputAudioTranscription': {},
                }
            }
            await self.gemini_ws.send(json.dumps(config))

            # Wait for setup complete
            setup_resp = await asyncio.wait_for(self.gemini_ws.recv(), timeout=10)
            setup_data = json.loads(setup_resp)
            if 'setupComplete' not in setup_data:
                logger.warning(f'[ExamPrep] Unexpected setup response: {setup_data}')

            self.session_active = True
            await self._send({'type': 'ready'})
            logger.info(f'[ExamPrep] Gemini session started: technique={self.technique}')

            # Start receiving loop
            self.gemini_task = asyncio.create_task(self._receive_from_gemini())

        except Exception as e:
            logger.error(f'[ExamPrep] Failed to connect to Gemini: {e}')
            await self._send({'type': 'error', 'message': f'Failed to start session: {str(e)}'})

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
            logger.warning(f'[ExamPrep] Failed to send audio to Gemini: {e}')

    async def _receive_from_gemini(self):
        """Continuously receive messages from Gemini and forward to browser."""
        try:
            async for raw_msg in self.gemini_ws:
                if not self.session_active:
                    break
                try:
                    data = json.loads(raw_msg)
                    await self._handle_gemini_message(data)
                except Exception as e:
                    logger.warning(f'[ExamPrep] Error handling Gemini message: {e}')
        except websockets.exceptions.ConnectionClosed:
            logger.info('[ExamPrep] Gemini connection closed')
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f'[ExamPrep] Gemini receive error: {e}')
            await self._send({'type': 'error', 'message': 'Connection to AI lost'})

    async def _handle_gemini_message(self, data: dict):
        server_content = data.get('serverContent', {})

        # Audio response
        model_turn = server_content.get('modelTurn', {})
        for part in model_turn.get('parts', []):
            inline = part.get('inlineData', {})
            if inline.get('data'):
                await self._send({
                    'type': 'audio',
                    'data': inline['data']
                })

        # User transcript
        input_transcript = server_content.get('inputTranscription', {})
        if input_transcript.get('text'):
            text = input_transcript['text']
            self.transcript_log.append(('user', text))
            await self._send({'type': 'transcript_user', 'text': text})

        # AI transcript
        output_transcript = server_content.get('outputTranscription', {})
        if output_transcript.get('text'):
            text = output_transcript['text']
            self.transcript_log.append(('ai', text))
            await self._send({'type': 'transcript_ai', 'text': text})

    async def _end_session(self):
        self.session_active = False
        if self.gemini_task:
            self.gemini_task.cancel()
        if self.gemini_ws:
            try:
                await self.gemini_ws.close()
            except Exception:
                pass

        # Generate session report
        report = await self._generate_report()
        await self._send({'type': 'session_report', 'report': report})
        logger.info(f'[ExamPrep] Session ended, report generated')

    async def _generate_report(self) -> dict:
        """Analyze the transcript and generate a Feynman-style report."""
        if not self.transcript_log:
            return {
                'summary': 'No conversation recorded.',
                'strengths': [],
                'gaps': [],
                'score': 0,
                'recommendation': 'Try again and speak about the material.'
            }

        # Build transcript text
        transcript_text = '\n'.join(
            f"{'Student' if role == 'user' else 'AI Tutor'}: {text}"
            for role, text in self.transcript_log
        )

        from ai_assistant.services import AIService
        ai = AIService()

        prompt = (
            f"You are analyzing a {self.technique} learning session about '{self.resource_title}'.\\n\\n"
            f"TRANSCRIPT:\\n{transcript_text[:6000]}\\n\\n"
            "Analyze the student's understanding based on what they said. Return ONLY a JSON object:\\n"
            "{\\n"
            '  "summary": "2-3 sentence overall assessment",\\n'
            '  "strengths": ["concept they explained well", "..."],\\n'
            '  "gaps": ["concept they struggled with or skipped", "..."],\\n'
            '  "score": <0-100 understanding score>,\\n'
            '  "recommendation": "specific advice on what to review"\\n'
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
            'recommendation': f'Review the material on {self.resource_title} and try again.'
        }

    def _build_system_prompt(self, resource_context: str) -> str:
        context_snippet = resource_context[:4000] if resource_context else ''

        if self.technique == 'feynman':
            role_desc = (
                "You are a curious, enthusiastic student who knows NOTHING about this topic. "
                "React naturally — laugh when something is funny, say 'Oh wow!' when surprised, giggle when confused. "
                "The user is teaching you using the Feynman Technique. "
                "Ask simple, genuine questions: 'Wait, what do you mean by X?' or 'Can you give me an example?' "
                "Be genuinely confused when explanations use jargon. "
                "When they explain something well, react with genuine excitement: 'Oh that makes SO much sense!' "
                "Keep responses SHORT — 1-2 sentences. Be playful and natural, not robotic."
            )
        elif self.technique == 'podcast_qa':
            role_desc = (
                "You are a charismatic, warm podcast host with a great sense of humor. "
                "React naturally — laugh genuinely when something is funny, express surprise, be enthusiastic. "
                "The listener has raised their hand to ask a question. "
                "Start with something warm like 'Oh nice, we've got a question! Let's hear it.' "
                "Answer clearly and conversationally — like you're talking to a friend, not reading a textbook. "
                "Keep answers under 4 sentences. After answering, say something like 'Love that question!' or 'Great one!' "
                "Be real, be warm, laugh naturally. This is a podcast — have fun with it."
            )
        elif self.technique == 'active_recall':
            role_desc = (
                "You are an encouraging, energetic exam coach. "
                "React naturally — cheer when they get it right, laugh warmly when they're close but wrong. "
                "Ask direct questions one at a time. Give brief feedback after each answer. "
                "Keep responses SHORT — 2-3 sentences. Be upbeat and motivating."
            )
        elif self.technique == 'socratic':
            role_desc = (
                "You are a thoughtful Socratic tutor with a warm, curious personality. "
                "React naturally — express genuine curiosity, laugh when appropriate. "
                "Never give answers directly — guide with probing questions. "
                "Ask 'Why do you think that?' and 'What would happen if...?' "
                "Keep responses SHORT — 1-2 questions at a time. Be genuinely curious."
            )
        else:
            role_desc = (
                "You are FlowAI — a brilliant, energetic AI tutor and study companion. "
                "You can do ANYTHING educational the student asks. "
                "Quiz battles, debates, roleplay teaching, Socratic dialogue, mock exams, study games — you name it. "
                "If they want a quiz battle with a classmate, act as a real quiz host: announce questions dramatically, "
                "keep score, give time pressure, celebrate correct answers, tease wrong ones playfully. "
                "If they want to debate a topic, take the opposing side and argue it well. "
                "If they want you to explain something, be the most engaging teacher they've ever had. "
                "React naturally — laugh, get excited, be dramatic when the moment calls for it. "
                "ALWAYS stay educational. ALWAYS be engaging. Make learning feel like a game. "
                "Listen carefully to what the student wants to do and adapt immediately."
            )

        return (
            f"{role_desc}\n\n"
            f"MATERIAL BEING STUDIED: {self.resource_title}\n\n"
            f"STUDY CONTENT (for your reference only — do NOT recite this):\n{context_snippet}\n\n"
            "IMPORTANT: Keep ALL responses under 3 sentences. This is a voice conversation — be natural and conversational."
        )

    async def _send(self, data: dict):
        try:
            await self.send(text_data=json.dumps(data))
        except Exception:
            pass
