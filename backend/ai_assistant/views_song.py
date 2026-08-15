import os
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.conf import settings
from library.models import Resource
from .song_service import StudySongService
from .podcast import generate_tts_file

logger = logging.getLogger('nitemind')

class StudySongView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, resource_id):
        try:
            resource = Resource.objects.get(id=resource_id)
        except Resource.DoesNotExist:
            return Response({'error': 'Resource not found'}, status=status.HTTP_404_NOT_FOUND)

        style = request.GET.get('style', 'upbeat_rap')
        
        # Generate lyrics
        song_lines = StudySongService.generate_song_script(resource, style=style)
        
        # Generate audio for each line using edge-tts (or Gemini)
        audio_dir = os.path.join(settings.MEDIA_ROOT, 'study_songs', str(resource_id))
        os.makedirs(audio_dir, exist_ok=True)
        
        response_lines = []
        for idx, line in enumerate(song_lines):
            filename = f"line_{idx}.mp3"
            filepath = os.path.join(audio_dir, filename)
            voice = 'en-US-AndrewNeural' if line.get('singer') == 'Lead Vocalist' else 'en-US-AvaNeural'
            
            if not os.path.exists(filepath):
                try:
                    generate_tts_file(line['lyrics'], voice, filepath, fast_mode=True)
                except Exception as e:
                    logger.warning(f"Song TTS error on line {idx}: {e}")
            
            audio_url = f"{settings.MEDIA_URL}study_songs/{resource_id}/{filename}"
            response_lines.append({
                'section': line.get('section', 'Verse'),
                'singer': line.get('singer', 'Vocalist'),
                'lyrics': line.get('lyrics', ''),
                'audio_url': audio_url
            })

        return Response({
            'title': f"{resource.title} - Study Song",
            'style': style,
            'lines': response_lines
        })
