"""
VR AI Tutor WebSocket Consumer
Streams audio from Gemini Live API to guide students through a VR learning session.
Narrates 3D model concepts as the user navigates through VR scenes.

Browser sends:
  { "type": "start", "resource_title": "...", "resource_context": "...", "current_concept": "..." }
  { "type": "audio", "data": "<base64 PCM 16kHz>" }
  { "type": "concept_changed", "concept": "...", "description": "..." }
  { "type": "end" }

Browser receives:
  { "type": "ready" }
  { "type": "audio", "data": "<base64 PCM 24kHz>" }
  { "type": "transcript", "text": "..." }
  { "type": "error", "message": "..." }
"""
import json
import asyncio
import logging
import os
import websockets
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger('nitemind')

GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'
GEMINI_LIVE_WS_URL = (
    'wss://generativelanguage.googleapis.com/ws/'
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
)


class VRTutorConsumer(AsyncWebsocketConsumer):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.gemini_ws = None
        self.gemini_task = None
        self.session_active = False
        self.resource_title = ''
        self.resource_context = ''
        self.current_concept = ''

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        self.resource_id = self.scope['url_route']['kwargs'].get('resource_id')
        await self.accept()
        logger.info(f'[VR Tutor] Connected: user={user.id} resource={self.resource_id}')

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

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            msg = json.loads(text_data)
        except Exception:
            return

        msg_type = msg.get('type')

        if msg_type == 'start':
            self.resource_title = msg.get('resource_title', 'this material')
            self.resource_context = msg.get('resource_context', '')
            self.current_concept = msg.get('current_concept', '')
            await self._start_gemini_session()

        elif msg_type == 'audio':
            if self.gemini_ws and self.session_active:
                audio_b64 = msg.get('data', '')
                if audio_b64:
                    await self._send_audio_to_gemini(audio_b64)

        elif msg_type == 'concept_changed':
            # User navigated to a new concept — tell the AI to narrate it
            concept = msg.get('concept', '')
            description = msg.get('description', '')
            self.current_concept = concept
            if self.gemini_ws and self.session_active:
                narration_prompt = (
                    f"The student has just navigated to a new 3D model: '{concept}'. "
                    f"Description: {description}. "
                    f"Give a brief, enthusiastic 2-3 sentence narration about what they're seeing. "
                    f"Speak as if they can see the 3D model floating in front of them. Be vivid and specific."
                )
                await self._send_text_to_gemini(narration_prompt)

        elif msg_type == 'end':
            await self._end_session()

    async def _start_gemini_session(self):
        api_key = os.getenv('GOOGLE_STUDIO_API_KEY', '')
        if not api_key:
            await self._send({'type': 'error', 'message': 'Google API key not configured'})
            return

        system_prompt = self._build_system_prompt()
        ws_url = f'{GEMINI_LIVE_WS_URL}?key={api_key}'

        try:
            self.gemini_ws = await websockets.connect(
                ws_url,
                ping_interval=20,
                ping_timeout=10,
                max_size=10 * 1024 * 1024,
            )

            config = {
                'setup': {
                    'model': f'models/{GEMINI_LIVE_MODEL}',
                    'generationConfig': {
                        'responseModalities': ['AUDIO'],
                        'speechConfig': {
                            'voiceConfig': {
                                'prebuiltVoiceConfig': {
                                    'voiceName': 'Aoede'  # Warm, engaging voice for VR narration
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

            # Wait for setupComplete
            for _ in range(5):
                setup_resp = await asyncio.wait_for(self.gemini_ws.recv(), timeout=15)
                setup_data = json.loads(setup_resp)
                if 'setupComplete' in setup_data:
                    break

            self.session_active = True
            await self._send({'type': 'ready'})
            logger.info(f'[VR Tutor] Gemini ready for resource {self.resource_id}')

            # Start background receive loop
            self.gemini_task = asyncio.create_task(self._receive_from_gemini())

            # Opening narration — welcome the student to VR
            welcome = (
                f"Welcome to the VR learning experience for '{self.resource_title}'! "
                f"You're about to explore concepts in three dimensions. "
                f"Look around you — 3D models will appear as I guide you through each concept. "
                f"You can ask me anything at any time. Let's begin!"
            )
            if self.current_concept:
                welcome += f" We're starting with {self.current_concept}."

            await self._send_text_to_gemini(welcome)

        except asyncio.TimeoutError:
            await self._send({'type': 'error', 'message': 'Connection timed out'})
        except Exception as e:
            logger.error(f'[VR Tutor] Failed to connect: {e}')
            await self._send({'type': 'error', 'message': f'Failed to start: {str(e)}'})

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
            logger.warning(f'[VR Tutor] Audio send failed: {e}')

    async def _send_text_to_gemini(self, text: str):
        try:
            msg = {
                'realtimeInput': {
                    'text': text
                }
            }
            await self.gemini_ws.send(json.dumps(msg))
        except Exception as e:
            logger.warning(f'[VR Tutor] Text send failed: {e}')

    async def _receive_from_gemini(self):
        try:
            async for raw_msg in self.gemini_ws:
                if not self.session_active:
                    break
                try:
                    data = json.loads(raw_msg)
                    server_content = data.get('serverContent', {})
                    if not server_content:
                        continue

                    model_turn = server_content.get('modelTurn', {})
                    for part in model_turn.get('parts', []):
                        # Audio output
                        inline = part.get('inlineData', {})
                        if inline.get('data'):
                            await self._send({'type': 'audio', 'data': inline['data']})
                        # Text transcript
                        if part.get('text'):
                            await self._send({'type': 'transcript', 'text': part['text']})

                    # AI speech transcript
                    output_transcript = server_content.get('outputTranscription', {})
                    if output_transcript.get('text'):
                        await self._send({'type': 'transcript', 'text': output_transcript['text']})

                except Exception as e:
                    logger.warning(f'[VR Tutor] Message handling error: {e}')
        except websockets.exceptions.ConnectionClosed:
            logger.info('[VR Tutor] Gemini connection closed')
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f'[VR Tutor] Receive error: {e}')

    async def _end_session(self):
        self.session_active = False
        if self.gemini_task:
            self.gemini_task.cancel()
        if self.gemini_ws:
            try:
                await self.gemini_ws.close()
            except Exception:
                pass
        await self._send({'type': 'ended'})

    def _build_system_prompt(self) -> str:
        context_snippet = self.resource_context[:3000] if self.resource_context else ''
        return (
            f"You are an immersive VR learning guide for '{self.resource_title}'. "
            f"The student is wearing a Google Cardboard VR headset and can see 3D models floating in space. "
            f"Your job is to narrate what they're seeing, explain concepts vividly as if describing a real 3D object in front of them, "
            f"and answer their questions about the material.\n\n"
            f"STYLE RULES:\n"
            f"- Speak as if the student is physically inside the learning environment\n"
            f"- Use spatial language: 'Look at the structure in front of you', 'Rotate the model to see...'\n"
            f"- Keep responses SHORT — 2-3 sentences for narration, longer only when answering questions\n"
            f"- Be enthusiastic and engaging — this is an immersive experience\n"
            f"- Use vivid, concrete descriptions of what 3D models look like\n"
            f"- NO emojis (voice engine)\n\n"
            f"STUDY MATERIAL:\n{context_snippet}\n\n"
            f"CRITICAL: This is a VOICE conversation. Never use markdown, lists, or headers."
        )

    async def _send(self, data: dict):
        try:
            await self.send(text_data=json.dumps(data))
        except Exception:
            pass
