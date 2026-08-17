"""
Live Vision Camera Consumer
Proxies camera frames + audio between the browser and Gemini Live API.
Browser → camera frames (base64 JPEG) + audio (PCM16) + text → Gemini Live API
Gemini Live API → AI audio (PCM16) + AI text transcripts → Browser
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

logger = logging.getLogger('nitemind')

GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'
GEMINI_LIVE_WS_URL = (
    'wss://generativelanguage.googleapis.com/ws/'
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
)

VOICE_MAP = {
    'default': 'Aoede',
    'warm': 'Aoede',
    'energetic': 'Puck',
    'calm': 'Kore',
    'confident': 'Fenrir',
    'teacher': 'Charon',
}


class LiveVisionConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for Live Camera AI Vision Mode.

    Browser sends:
      { "type": "start", "voice": "default", "system_prompt": "..." }
      { "type": "camera_frame", "data": "data:image/jpeg;base64,..." }
      { "type": "audio", "data": "<base64 PCM 16kHz>" }
      { "type": "text_query", "text": "What am I holding?" }
      { "type": "end" }

    Browser receives:
      { "type": "ready" }
      { "type": "ai_audio", "data": "<base64 PCM 24kHz>" }
      { "type": "ai_text", "text": "..." }
      { "type": "user_transcript", "text": "..." }
      { "type": "status", "state": "listening"|"analyzing"|"speaking" }
      { "type": "error", "message": "..." }
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.gemini_ws = None
        self.gemini_task = None
        self.audio_queue = None
        self.audio_send_task = None
        self.session_active = False
        self.ai_audio_buffer = []
        self.voice_name = 'Aoede'
        self._last_frame_time = 0

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        await self.accept()
        logger.info(f'[LiveVision] Browser connected: user={user.id}')

    async def disconnect(self, close_code):
        self.session_active = False
        if self.audio_send_task:
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
        logger.info(f'[LiveVision] Browser disconnected: code={close_code}')

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            msg = json.loads(text_data)
        except Exception:
            return

        msg_type = msg.get('type')

        if msg_type == 'start':
            self.voice_name = VOICE_MAP.get(msg.get('voice', 'default'), 'Aoede')
            system_prompt = msg.get('system_prompt', '')
            logger.info(f'[LiveVision] Starting session: voice={self.voice_name}')
            await self._start_gemini_session(system_prompt)

        elif msg_type == 'camera_frame':
            if self.gemini_ws and self.session_active:
                await self._send_frame_to_gemini(msg.get('data', ''))

        elif msg_type == 'audio':
            if self.gemini_ws and self.session_active:
                audio_b64 = msg.get('data', '')
                if audio_b64:
                    try:
                        self.audio_queue.put_nowait(audio_b64)
                    except asyncio.QueueFull:
                        pass

        elif msg_type == 'text_query':
            text = msg.get('text', '').strip()
            if not text:
                return
            if self.session_active and self.gemini_ws:
                await self._send({'type': 'user_transcript', 'text': text})
                await self._send_text_to_gemini(text)
            else:
                await self._text_fallback_reply(text)

        elif msg_type == 'end':
            await self._end_session()

    # ── Gemini session ────────────────────────────────────────────────────

    async def _start_gemini_session(self, custom_prompt: str = ''):
        api_key = os.getenv('GOOGLE_STUDIO_API_KEY', '')
        if not api_key:
            await self._send({'type': 'error', 'message': 'Google API key not configured'})
            return

        system_prompt = custom_prompt or self._default_system_prompt()
        ws_url = f'{GEMINI_LIVE_WS_URL}?key={api_key}'

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
                                    'voiceName': self.voice_name
                                }
                            },
                        },
                        'temperature': 0.7,
                        'maxOutputTokens': 4096,
                    },
                    'systemInstruction': {
                        'parts': [{'text': system_prompt}]
                    },
                    'realtimeInputConfig': {
                        'automaticActivityDetection': {
                            'disabled': False,
                            'startOfSpeechSensitivity': 'START_SENSITIVITY_HIGH',
                            'endOfSpeechSensitivity': 'END_SENSITIVITY_HIGH',
                            'silenceDurationMs': 300,
                        }
                    },
                }
            }
            await self.gemini_ws.send(json.dumps(config))

            self.audio_queue = asyncio.Queue(maxsize=50)
            self.audio_send_task = asyncio.create_task(self._drain_audio_queue())

            setup_ready = False
            for _ in range(5):
                try:
                    setup_resp = await asyncio.wait_for(self.gemini_ws.recv(), timeout=15)
                    setup_data = json.loads(setup_resp)
                    if 'setupComplete' in setup_data:
                        setup_ready = True
                        break
                except asyncio.TimeoutError:
                    break

            if not setup_ready:
                self.session_active = True
                await self._send({'type': 'ready'})
                await self._send({'type': 'status', 'state': 'listening'})
                logger.warning('[LiveVision] Gemini setup timed out, using text fallback')
                return

            self.session_active = True
            await self._send({'type': 'ready'})
            await self._send({'type': 'status', 'state': 'listening'})
            logger.info(f'[LiveVision] Gemini ready: voice={self.voice_name}')

            self.gemini_task = asyncio.create_task(self._receive_from_gemini())

        except asyncio.TimeoutError:
            logger.error('[LiveVision] Timeout connecting to Gemini')
            await self._send({'type': 'error', 'message': 'Connection timed out. Try again.'})
        except Exception as e:
            logger.error(f'[LiveVision] Failed to connect: {e}')
            await self._send({'type': 'error', 'message': f'Failed to start session: {str(e)}'})

    def _default_system_prompt(self) -> str:
        return (
            "You are Flow AI, a brilliant and friendly AI study partner with live camera vision. "
            "The user is pointing their camera at objects, notes, textbooks, screens, or anything else. "
            "You can SEE what they show you in real-time through camera frames. "
            "When the user shows you something or asks a question about what they see:\n"
            "1. ANALYZE the camera frames carefully — identify objects, read text, recognize diagrams, explain concepts.\n"
            "2. RESPOND naturally and conversationally — like a brilliant friend looking over their shoulder.\n"
            "3. Be SPECIFIC — reference what you actually see in the frame (e.g., 'I can see page 47 of your textbook...').\n"
            "4. Keep responses concise but insightful — 2-4 sentences unless they ask for more depth.\n"
            "5. If you see math problems, walk through the solution step by step.\n"
            "6. If you see code, review it and suggest improvements.\n"
            "7. Be warm, encouraging, and genuinely helpful.\n\n"
            "CRITICAL RULES:\n"
            "- This is a LIVE voice conversation — speak naturally, not like a textbook.\n"
            "- NEVER say you cannot see. You CAN see through the camera frames.\n"
            "- NEVER break character or mention you are an AI language model.\n"
            "- NEVER output reasoning or planning. Speak only your final reply.\n"
            "- Keep responses under 4 sentences unless asked for more detail."
        )

    # ── Camera frame → Gemini ─────────────────────────────────────────────

    async def _send_frame_to_gemini(self, data_url: str):
        """Send a camera frame (base64 data URL) to Gemini as video input."""
        if not data_url:
            return
        try:
            import time
            now = time.time()
            if now - self._last_frame_time < 1.0:
                return
            self._last_frame_time = now

            if ';base64,' in data_url:
                mime, b64_data = data_url.split(';base64,', 1)
                mime_type = mime.replace('data:', '')
            else:
                b64_data = data_url
                mime_type = 'image/jpeg'

            msg = {
                'realtimeInput': {
                    'video': {
                        'data': b64_data,
                        'mimeType': mime_type,
                    }
                }
            }
            await self.gemini_ws.send(json.dumps(msg))
            await self._send({'type': 'status', 'state': 'analyzing'})
        except Exception as e:
            logger.warning(f'[LiveVision] Failed to send frame: {e}')

    # ── Audio → Gemini ────────────────────────────────────────────────────

    async def _drain_audio_queue(self):
        try:
            while self.session_active:
                try:
                    audio_b64 = await asyncio.wait_for(self.audio_queue.get(), timeout=1.0)
                    msg = {
                        'realtimeInput': {
                            'audio': {
                                'data': audio_b64,
                                'mimeType': 'audio/pcm;rate=16000'
                            }
                        }
                    }
                    await self.gemini_ws.send(json.dumps(msg))
                    self.audio_queue.task_done()
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f'[LiveVision] Audio drain error: {e}')

    async def _send_text_to_gemini(self, text: str):
        try:
            msg = {
                'clientContent': {
                    'turns': [{'role': 'user', 'parts': [{'text': text}]}],
                    'turnComplete': True
                }
            }
            await self.gemini_ws.send(json.dumps(msg))
            await self._send({'type': 'status', 'state': 'analyzing'})
        except Exception as e:
            logger.warning(f'[LiveVision] Failed to send text: {e}')

    # ── Text fallback ─────────────────────────────────────────────────────

    async def _text_fallback_reply(self, text: str):
        try:
            from ai_assistant.services import AIService
            ai = AIService()
            prompt = (
                "You are Flow AI, a brilliant AI study partner with live camera vision. "
                f"The user said: {text}\n"
                "Reply in 1-3 sentences. Be warm and helpful."
            )
            result = await asyncio.wait_for(
                ai.chat([{'role': 'user', 'content': prompt}]),
                timeout=20
            )
            reply = (result or '').strip() or 'I can see you! What would you like me to help with?'
            await self._send({'type': 'ai_text', 'text': reply})
            await self._send({'type': 'status', 'state': 'listening'})
        except Exception as e:
            logger.warning(f'[LiveVision] Text fallback failed: {e}')
            await self._send({'type': 'ai_text', 'text': "I'm here! What would you like me to help with?"})

    # ── Gemini receive loop ───────────────────────────────────────────────

    async def _receive_from_gemini(self):
        try:
            async for raw_msg in self.gemini_ws:
                if not self.session_active:
                    break
                try:
                    data = json.loads(raw_msg)
                    await self._handle_gemini_message(data)
                except Exception as e:
                    logger.warning(f'[LiveVision] Error handling message: {e}')
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f'[LiveVision] Gemini connection closed: {e.code}')
            if self.session_active:
                await self._send({'type': 'error', 'message': 'AI connection dropped.'})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f'[LiveVision] Receive error: {e}')

    async def _handle_gemini_message(self, data: dict):
        server_content = data.get('serverContent', {}) or {}
        interrupted = data.get('interrupted') or server_content.get('interrupted', False)
        if interrupted:
            await self._send({'type': 'status', 'state': 'listening'})

        if not server_content:
            return

        model_turn = server_content.get('modelTurn', {})
        for part in model_turn.get('parts', []):
            inline = part.get('inlineData', {})
            if inline.get('data'):
                await self._send({'type': 'ai_audio', 'data': inline['data']})
                self.ai_audio_buffer.append(inline['data'])
            if part.get('text'):
                txt = part['text'].strip()
                if txt:
                    await self._send({'type': 'ai_text', 'text': txt})
                    await self._send({'type': 'status', 'state': 'speaking'})

        input_transcript = server_content.get('inputTranscription', {})
        if input_transcript.get('text'):
            text = input_transcript['text'].strip()
            if text:
                await self._send({'type': 'user_transcript', 'text': text})

        if server_content.get('turnComplete'):
            self.ai_audio_buffer = []
            await self._send({'type': 'status', 'state': 'listening'})

    # ── Session end ───────────────────────────────────────────────────────

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
        await self._send({'type': 'ended'})
        logger.info('[LiveVision] Session ended')

    async def _send(self, data: dict):
        try:
            await self.send(text_data=json.dumps(data))
        except Exception:
            pass
