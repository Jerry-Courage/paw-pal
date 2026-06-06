"""
OAuth social login endpoint.
Accepts a provider access token from the frontend (Google or GitHub),
verifies it with the provider, then returns Django JWT tokens.
Creates a new user account automatically on first login.
"""
import logging
import requests
from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger('nitemind')
User = get_user_model()


def _get_tokens(user) -> dict:
    """Generate JWT access + refresh tokens for a user."""
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


class GoogleOAuthView(APIView):
    """
    POST /api/auth/oauth/google/
    Body: { "access_token": "<Google OAuth access token>" }
    Returns: { "access": "...", "refresh": "..." }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        access_token = request.data.get('access_token', '').strip()
        if not access_token:
            return Response({'error': 'access_token is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Verify token with Google
        try:
            resp = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=8,
            )
            if resp.status_code != 200:
                return Response({'error': 'Invalid Google token'}, status=status.HTTP_401_UNAUTHORIZED)
            info = resp.json()
        except Exception as e:
            logger.error(f'[OAuth/Google] Verification failed: {e}')
            return Response({'error': 'Failed to verify Google token'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        email = info.get('email', '').lower().strip()
        if not email:
            return Response({'error': 'No email in Google token'}, status=status.HTTP_400_BAD_REQUEST)

        first_name = info.get('given_name', '')
        last_name  = info.get('family_name', '')
        picture    = info.get('picture', '')

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username':   _make_username(email),
                'first_name': first_name,
                'last_name':  last_name,
            }
        )

        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
            logger.info(f'[OAuth/Google] New user created: {email}')
        else:
            logger.info(f'[OAuth/Google] Existing user signed in: {email}')

        tokens = _get_tokens(user)
        return Response({**tokens, 'created': created})


class GitHubOAuthView(APIView):
    """
    POST /api/auth/oauth/github/
    Body: { "access_token": "<GitHub OAuth access token>" }
    Returns: { "access": "...", "refresh": "..." }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        access_token = request.data.get('access_token', '').strip()
        if not access_token:
            return Response({'error': 'access_token is required'}, status=status.HTTP_400_BAD_REQUEST)

        headers = {
            'Authorization': f'token {access_token}',
            'Accept': 'application/vnd.github+json',
        }

        # Get GitHub user profile
        try:
            resp = requests.get('https://api.github.com/user', headers=headers, timeout=8)
            if resp.status_code != 200:
                return Response({'error': 'Invalid GitHub token'}, status=status.HTTP_401_UNAUTHORIZED)
            gh_user = resp.json()
        except Exception as e:
            logger.error(f'[OAuth/GitHub] Profile fetch failed: {e}')
            return Response({'error': 'Failed to verify GitHub token'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # GitHub may not expose email in profile — fetch separately
        email = gh_user.get('email', '')
        if not email:
            try:
                emails_resp = requests.get('https://api.github.com/user/emails', headers=headers, timeout=8)
                if emails_resp.status_code == 200:
                    emails = emails_resp.json()
                    primary = next((e for e in emails if e.get('primary') and e.get('verified')), None)
                    if primary:
                        email = primary['email']
            except Exception:
                pass

        if not email:
            return Response(
                {'error': 'No verified email on your GitHub account. Please add one and try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = email.lower().strip()
        gh_name = gh_user.get('name', '') or ''
        parts = gh_name.split(' ', 1)
        first_name = parts[0] if parts else ''
        last_name  = parts[1] if len(parts) > 1 else ''
        gh_login   = gh_user.get('login', '')

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username':   gh_login or _make_username(email),
                'first_name': first_name,
                'last_name':  last_name,
            }
        )

        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
            logger.info(f'[OAuth/GitHub] New user created: {email}')
        else:
            logger.info(f'[OAuth/GitHub] Existing user signed in: {email}')

        tokens = _get_tokens(user)
        return Response({**tokens, 'created': created})


def _make_username(email: str) -> str:
    """Derive a unique username from an email address."""
    base = email.split('@')[0].replace('.', '_').replace('-', '_')[:28]
    username = base
    counter = 1
    while User.objects.filter(username=username).exists():
        username = f'{base}_{counter}'
        counter += 1
    return username
