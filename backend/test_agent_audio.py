import requests
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.getcwd(), 'backend', '.env'))

def test_agent_audio():
    url = "http://localhost:8000/api/ai/agent/audio/"
    # Simply check if URL exists in the project's urlconf.
    # We can also use 'manage.py show_urls' if the app is installed.
    pass

if __name__ == "__main__":
    test_agent_audio()
