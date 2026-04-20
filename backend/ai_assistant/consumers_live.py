import json
import asyncio
import logging
import base64
import traceback
from channels.generic.websocket import AsyncWebsocketConsumer
from google import genai
from django.conf import settings

logger = logging.getLogger('flowstate')

class GeminiLiveConsumer(AsyncWebsocketConsumer):
    """
    Multimodal Live API Consumer.
    Provides a low-latency bidirectional bridge between the browser
    and Google's Gemini 2.x/3.x Live signaling servers.
    """
    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or self.user.is_anonymous:
            await self.close()
            return

        await self.accept()
        
        # Initialize the GenAI Client
        api_key = getattr(settings, 'GOOGLE_STUDIO_API_KEY', None)
        if not api_key:
            logger.error("[LiveAgent] GOOGLE_STUDIO_API_KEY not found.")
            await self.send(text_data=json.dumps({"error": "AI Infrastructure misconfigured. Key missing."}))
            await self.close()
            return

        self.client = genai.Client(api_key=api_key, http_options={'api_version': 'v1alpha'})
        
        # Start the background task to handle Gemini Live Session
        self.live_task = asyncio.create_task(self.run_live_session())

    async def disconnect(self, close_code):
        if hasattr(self, 'live_task'):
            self.live_task.cancel()
        logger.info(f"[LiveAgent] Connection closed for user {self.user.id}")

    async def run_live_session(self):
        """
        Main loop to bridge the client and Google's Live signaling.
        """
        # Exact Technical ID for Gemini 3 Flash Live as verified in model scan
        model_id = "models/gemini-3.1-flash-live-preview"
        
        try:
            # Re-introducing personality now that signal is stable
            config = {
                'system_instruction': "You are FlowAI, a witty and expert study partner. Speak naturally and keep responses concise for real-time conversation. You have zero lag, so be fast and engaging.",
                'generation_config': {
                    'response_modalities': ['AUDIO'],
                    'candidate_count': 1
                }
            }
            
            async with self.client.aio.live.connect(model=model_id, config=config) as session:
                self.gemini_session = session
                logger.info(f"[LiveAgent] Session established with {model_id}")

                async for message in session.receive():
                    response = {}
                    if message.text:
                        response["text"] = message.text
                    
                    if message.server_content and message.server_content.model_turn:
                        parts = message.server_content.model_turn.parts
                        for part in parts:
                            if part.inline_data:
                                # High-fidelity 24kHz audio from Gemini
                                audio_data = base64.b64encode(part.inline_data.data).decode('utf-8')
                                response["audio"] = audio_data

                    if response:
                        await self.send(text_data=json.dumps(response))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"[LiveAgent] Session Error: {e}\n{error_trace}")
            await self.close()

    async def receive(self, text_data=None, bytes_data=None):
        """
        Receives data from the client and forwards it to Gemini.
        """
        if not hasattr(self, 'gemini_session'):
            return

        try:
            if text_data:
                data = json.loads(text_data)
                # Client sending text
                if "text" in data:
                    await self.gemini_session.send(input=data["text"], end_of_turn=True)

            if bytes_data:
                # Pipe raw PCM 16kHz audio directly to the live session
                await self.gemini_session.send(input={
                    "data": bytes_data, 
                    "mime_type": "audio/pcm;rate=16000"
                })
        except Exception as e:
            logger.error(f"[LiveAgent] Send Error: {e}")
