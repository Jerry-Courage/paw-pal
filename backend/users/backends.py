from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model

User = get_user_model()


class EmailBackend(ModelBackend):
    """Authenticate using email instead of username."""

    def authenticate(self, request, username=None, password=None, email=None, **kwargs):
        # Accept either 'email' kwarg or 'username' kwarg (simplejwt passes email as username)
        login_email = email or username
        if not login_email or not password:
            return None
        try:
            user = User.objects.get(email__iexact=login_email.strip())
        except User.DoesNotExist:
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
