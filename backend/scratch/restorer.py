import os

path = r'c:\Users\DONEX\Downloads\Compressed\paw-pal\paw-pal\backend\ai_assistant\services.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Markers
start_marker = '    async def chat_stream(self, messages: list):'
end_marker = '    def perform_global_search(self, query: str, user, limit: int = 7) -> str:'

# Because there are two "async def chat_stream" headers now, we find the FIRST one
# and the LAST one's corresponding end point.
# Actually, the simplest way is to find the first and the end_marker.

start_idx = -1
for i, line in enumerate(lines):
    if start_marker in line:
        start_idx = i
        break

end_idx = -1
for i, line in enumerate(lines):
    if end_marker in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    print(f"Found chat_stream at line {start_idx} and next method at line {end_idx}")
    
    # The perfect replacement code
    new_method = [
        '    async def chat_stream(self, messages: list):\n',
        '        """Hyper-Resilient 3-Stage Stream: Google (Studio) -> Groq -> OpenRouter."""\n',
        '        if not self.api_key:\n',
        '            yield "⚠️ AI Configuration incomplete."\n',
        '            return\n',
        '            \n',
        '        messages = self._sanitize_messages(messages)\n',
        '        \n',
        '        try:\n',
        '            # --- STAGE 0: DIRECT GOOGLE GENAI SDK (2026 Verified Models) ---\n',
        '            if self.google_client:\n',
        '                # We use the names exactly as verified in models.list()\n',
        '                for g_model in [\'gemini-2.5-flash\', \'gemini-2.5-flash-lite\']:\n',
        '                    try:\n',
        '                        contents, sys_instr = self._to_gemini_format(messages)\n',
        '                        response = self.google_client.models.generate_content_stream(\n',
        '                            model=g_model,\n',
        '                            contents=contents,\n',
        '                            config={\'system_instruction\': sys_instr, \'max_output_tokens\': 4096}\n',
        '                        )\n',
        '                        for chunk in response:\n',
        '                            if chunk.text:\n',
        '                                yield chunk.text\n',
        '                        return # SUCCESS\n',
        '                    except Exception as e:\n',
        '                        logger.warning(f"[Google SDK Fallback] {g_model} failed: {e}")\n',
        '                        if "429" in str(e):\n',
        '                            await asyncio.sleep(1)\n',
        '\n',
        '            # --- STAGE 1: HYPER-FAST GROQ STREAMING ---\n',
        '            groq_key = os.getenv(\'GROQ_API_KEY\')\n',
        '            if groq_key:\n',
        '                try:\n',
        '                    async with httpx.AsyncClient() as client:\n',
        '                        async with client.stream(\n',
        '                            "POST",\n',
        '                            "https://api.groq.com/openai/v1/chat/completions",\n',
        '                            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},\n',
        '                            json={\'model\': \'llama-3.3-70b-versatile\', \'messages\': messages, \'stream\': True, \'max_tokens\': 4096},\n',
        '                            timeout=httpx.Timeout(45.0, connect=5.0)\n',
        '                        ) as response:\n',
        '                            if response.status_code == 200:\n',
        '                                async for line in response.aiter_lines():\n',
        '                                    if line.startswith(\'data: \'):\n',
        '                                        data = line[6:].strip()\n',
        '                                        if data == \'[DONE]\': return\n',
        '                                        try:\n',
        '                                            chunk = json.loads(data)\n',
        '                                            text = chunk[\'choices\'][0][\'delta\'].get(\'content\', \'\')\n',
        '                                            if text: yield text\n',
        '                                        except: continue\n',
        '                                return\n',
        '                            else:\n',
        '                                logger.warning(f"[Groq Stream] Status {response.status_code}. Falling back to OpenRouter...")\n',
        '                                if response.status_code == 429:\n',
        '                                    await asyncio.sleep(1)\n',
        '                except Exception as e:\n',
        '                    logger.error(f"[Groq Stream Error] {e}")\n',
        '\n',
        '            # --- STAGE 2: OPENROUTER DEEP FALLBACK CHAIN ---\n',
        '            models_to_try = [self.model] + [m for m in FALLBACK_MODELS if m != self.model]\n',
        '\n',
        '            async with httpx.AsyncClient() as client:\n',
        '                for model in models_to_try:\n',
        '                    try:\n',
        '                        async with client.stream(\n',
        '                            "POST",\n',
        '                            f\'{self.base_url}/chat/completions\',\n',
        '                            headers=self.headers,\n',
        '                            json={\'model\': model, \'messages\': messages, \'stream\': True, \'max_tokens\': 4096},\n',
        '                            timeout=httpx.Timeout(60.0, connect=5.0)\n',
        '                        ) as response:\n',
        '                            if response.status_code in (400, 401, 429, 402, 404):\n',
        '                                logger.info(f"[Fallback] Skipping {model} (Status {response.status_code})")\n',
        '                                if response.status_code == 429:\n',
        '                                    await asyncio.sleep(1.5)\n',
        '                                continue\n',
        '                            \n',
        '                            response.raise_for_status()\n',
        '                            async for line in response.aiter_lines():\n',
        '                                if line.startswith(\'data: \'):\n',
        '                                    data = line[6:].strip()\n',
        '                                    if data == \'[DONE]\': return\n',
        '                                    try:\n',
        '                                        chunk = json.loads(data)\n',
        '                                        delta = chunk[\'choices\'][0][\'delta\']\n',
        '                                        text = delta.get(\'content\') or delta.get(\'reasoning\') or \'\'\n',
        '                                        if text: yield text\n',
        '                                    except: continue\n',
        '                            return\n',
        '                    except: continue\n',
        '\n',
        '        except asyncio.CancelledError:\n',
        '            logger.info("[AI Stream] Cancelled by client.")\n',
        '            raise\n',
        '        except Exception as e:\n',
        '            logger.error(f"[AI Stream Error] {e}")\n',
        '            yield "Intelligence Signal Interrupted. Every engine failed. Please check your internet or API limits."\n',
        '\n'
    ]
    
    # Replace the chunk
    lines[start_idx:end_idx] = new_method
    
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("RESTORED SUCCESS")
else:
    print(f"FAILED: start_idx={start_idx}, end_idx={end_idx}")
