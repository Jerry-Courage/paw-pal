import os
import sys
import json
import asyncio
import websockets
from dotenv import load_dotenv

load_dotenv()

async def main():
    api_key = os.getenv('GOOGLE_STUDIO_API_KEY')
    if not api_key:
        print("Error: GOOGLE_STUDIO_API_KEY not found in environment.")
        return

    ctx = {
        'username': 'Smith',
        'level_name': 'Freshman',
        'xp': 120,
        'study_streak': 3,
        'university': 'State University',
        'materials_str': '- Automata Theory (Computer Science)\n- Cloud Computing (System Design)',
        'history_str': 'Student: Hi\nAI Coach: Hello! How can I help you study today?'
    }
    
    print(f"Simulating context for user: {ctx['username']}")
    
    system_prompt = (
        "You are a highly supportive, intelligent personal tutor who knows the student intimately. "
        "Your goal is to run an open, conversational study session, helping them master their current subjects, answering questions, proposing study techniques, and giving them personalized coaching. "
        "Guide the conversation based on their past chats, their level, and the materials in their library.\n\n"
        f"STUDENT PROFILE:\n"
        f"- Name: {ctx['username']}\n"
        f"- Level: {ctx['level_name']} ({ctx['xp']} XP)\n"
        f"- Study Streak: {ctx['study_streak']} days\n"
        f"- University: {ctx['university']}\n\n"
        f"CURRENT STUDY MATERIALS IN LIBRARY:\n{ctx['materials_str']}\n\n"
        f"RECENT CONVERSATION HISTORY WITH STUDENT (use for context and continuity):\n{ctx['history_str']}\n\n"
        "CRITICAL RULES:\n"
        "1. This is a VOICE conversation — speak naturally, not like a textbook.\n"
        "2. Keep ALL responses short — under 3 sentences.\n"
        "3. Be encouraging, warm, and adaptive. Proactively refer to their past questions or materials they have in their library.\n"
        "4. ALWAYS wait for the student to finish speaking before responding.\n"
        "5. Never break character or mention you are an AI language model."
    )

    GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'
    GEMINI_LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
    
    ws_url = f'{GEMINI_LIVE_WS_URL}?key={api_key}'
    print(f"Connecting to: {ws_url}")
    
    try:
        async with websockets.connect(ws_url) as ws:
            print("Connected! Sending setup config...")
            config = {
                'setup': {
                    'model': f'models/{GEMINI_LIVE_MODEL}',
                    'generationConfig': {
                        'responseModalities': ['AUDIO'],
                        'speechConfig': {
                            'voiceConfig': {
                                'prebuiltVoiceConfig': {
                                    'voiceName': 'Aoede'
                                }
                            }
                        },
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
            await ws.send(json.dumps(config))
            print("Setup config sent. Waiting for messages...")

            # Wait for setupComplete or other messages
            for i in range(10):
                try:
                    resp = await asyncio.wait_for(ws.recv(), timeout=10)
                    data = json.loads(resp)
                    print(f"\nMessage {i+1} keys: {list(data.keys())}")
                    print(json.dumps(data, indent=2)[:500])
                    if 'setupComplete' in data:
                        print(">>> setupComplete received successfully! <<<")
                        break
                except asyncio.TimeoutError:
                    print(f"Timeout on message {i+1}")
                    break
    except Exception as e:
        print(f"Exception occurred: {e}")

if __name__ == '__main__':
    asyncio.run(main())
