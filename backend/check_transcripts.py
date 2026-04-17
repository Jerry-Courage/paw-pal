from youtube_transcript_api import YouTubeTranscriptApi

video_id = 'X3paOmcrTjQ'
try:
    api = YouTubeTranscriptApi()
    # Try '.list()' as seen in some 2026+ versions
    try:
        transcript_metadata = api.list(video_id)
    except:
        transcript_metadata = YouTubeTranscriptApi.list_transcripts(video_id)
        
    print("Available Transcripts:")
    for t in transcript_metadata:
        print(f" - {t.language_code}: {t.language} (Generated: {t.is_generated})")
except Exception as e:
    print(f"Error listing transcripts: {e}")
