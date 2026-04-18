import cv2
import yt_dlp
import numpy as np
import logging
import os
import tempfile
from django.core.files.base import ContentFile
from io import BytesIO

logger = logging.getLogger('flowstate')

class VideoAnalyzer:
    """
    High-Fidelity Visual Analyzer for YouTube Videos.
    Extracts key frames (slides) using Adaptive Seeking and Motion Detection.
    """

    @staticmethod
    def get_stream_url(url):
        ydl_opts = {
            'format': 'best[height<=720]', # 720p is perfect for OCR and fast to stream
            'quiet': True,
            'no_warnings': True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info.get('url'), info.get('duration', 0)
        except Exception as e:
            logger.error(f"[Video Analyzer] Failed to get stream URL: {e}")
            return None, 0

    @classmethod
    def extract_visual_insights(cls, youtube_url, max_frames=15):
        """
        Main entry point. Returns a list of (image_bytes, timestamp_seconds).
        """
        stream_url, duration = cls.get_stream_url(youtube_url)
        if not stream_url or not duration:
            return []

        # Adaptive Sampling: 
        # For 5 min video: every 30s. 
        # For 30 min video: every 90s.
        base_interval = max(30, int(duration / max_frames)) if duration > 0 else 60
        
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            logger.error("[Video Analyzer] Could not open video stream.")
            return []

        insights = []
        last_frame_hash = None
        
        # We start at 10 seconds to skip intros
        current_sec = 10
        
        while current_sec < duration and len(insights) < max_frames:
            # Smart Seeking: Jump directly to the timestamp
            cap.set(cv2.CAP_PROP_POS_MSEC, current_sec * 1000)
            ret, frame = cap.read()
            
            if not ret:
                break

            # Process Frame: Resize for AI processing (saves bandwidth/tokens)
            # 1024 width is optimal for Gemini/GPT Vision OCR
            h, w = frame.shape[:2]
            target_w = 1024
            target_h = int(h * (target_w / w))
            resized = cv2.resize(frame, (target_w, target_h))

            # Simple Change Detection: 
            # We use a very downsampled gray version to see if content changed
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, (32, 32))
            
            if last_frame_hash is not None:
                diff = cv2.absdiff(small, last_frame_hash)
                change_score = np.mean(diff)
                
                # Threshold for a 'Slide Change' (empirically found ~5 is a good jump)
                if change_score < 4.0:
                    current_sec += base_interval
                    continue

            # It's a significant visual frame!
            last_frame_hash = small
            
            # Convert to RGB and encode to PNG
            rgb_frame = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            is_success, buffer = cv2.imencode(".png", cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR))
            
            if is_success:
                insights.append({
                    'data': buffer.tobytes(),
                    'timestamp': current_sec,
                    'label': f"Insight at {int(current_sec // 60)}:{int(current_sec % 60):02d}"
                })

            current_sec += base_interval

        cap.release()
        logger.info(f"[Video Analyzer] Extracted {len(insights)} visual insights for {youtube_url}")
        return insights
