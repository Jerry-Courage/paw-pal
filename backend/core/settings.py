import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-flowstate-dev-key-change-in-production')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    # Unfold must come before django.contrib.admin
    'daphne',
    'unfold',
    'unfold.contrib.filters',
    'unfold.contrib.forms',
    # Django
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    # Local
    'users',
    'library',
    'ai_assistant',
    'groups',
    'planner',
    'community',
    'assignments',
    'workspace',
    'storages',
    'django_q',
    'pgvector',
    'channels',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.gzip.GZipMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'flowstate-cache',
    }
}

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

# Channel Layers - Using InMemory for Dev, should swap to Redis for production
_redis_url = os.getenv('REDIS_URL')
if _redis_url:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [_redis_url],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }

import dj_database_url as _dj_db_url

_db_url = os.getenv('DATABASE_URL')
if _db_url:
    DATABASES = {'default': _dj_db_url.config(default=_db_url, conn_max_age=0, ssl_require=False)}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ─── STORAGE CONFIGURATION (S3 / Cloudflare R2) ──────────────────────────────
USE_S3 = os.getenv('USE_S3', 'False') == 'True'

if USE_S3:
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME')
    
    # Required for Cloudflare R2 or DigitalOcean Spaces
    if os.getenv('AWS_S3_ENDPOINT_URL'):
        AWS_S3_ENDPOINT_URL = os.getenv('AWS_S3_ENDPOINT_URL')
    
    # Defines the base URL for files. E.g. cdn.yourdomain.com
    if os.getenv('AWS_S3_CUSTOM_DOMAIN'):
        AWS_S3_CUSTOM_DOMAIN = os.getenv('AWS_S3_CUSTOM_DOMAIN')
        
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    
    # Use presigned URLs so Cloudflare buckets can remain Private but serve short-lived links
    AWS_QUERYSTRING_AUTH = True
    AWS_QUERYSTRING_EXPIRE = 3600 # 1 hour

    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
else:
    # ── Local Storage Fallback (Development Only) ──
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
    MEDIA_URL = '/media/'
    MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── REST Framework ───────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/hour',
        'user': '2000/hour',
        'ai': '300/hour',       # Increased limit for AI endpoints
        'upload': '200/hour',   # Increased limit for file uploads to fix 429s
    },
}

# ─── JWT ──────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'SIGNING_KEY': SECRET_KEY,
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
import re as _re

_cors_env = os.getenv('CORS_ALLOWED_ORIGINS', '')
if _cors_env:
    CORS_ALLOWED_ORIGINS = _cors_env.split(',')
else:
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5000',
        'http://localhost:5002',
        'http://127.0.0.1:5002',
    ]
    CORS_ALLOW_ALL_ORIGINS = DEBUG
    CORS_URLS_REGEX = r'^/api/.*$|/media/.*$'

# Allow all *.replit.dev and *.repl.co origins for Replit preview environment
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https://.*\.replit\.dev$',
    r'^https://.*\.repl\.co$',
    r'^https://.*\.worf\.replit\.dev$',
]
CORS_ALLOW_CREDENTIALS = True

_csrf_env = os.getenv('CSRF_TRUSTED_ORIGINS', '')
if _csrf_env:
    CSRF_TRUSTED_ORIGINS = _csrf_env.split(',')
else:
    CSRF_TRUSTED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5000',
        'http://localhost:5002',
        'http://127.0.0.1:5002',
    ]

# ─── Production Security ──────────────────────────────────────────────────────
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = 31536000 # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# ─── File Upload Security ─────────────────────────────────────────────────────
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.pptx', '.txt', '.py', '.js', '.ts', '.jpg', '.jpeg', '.png', '.mp4']
API_URL = os.getenv('API_URL', 'http://localhost:8000')

# ─── OpenRouter ───────────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
OPENROUTER_MODEL = os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3.5-sonnet')
GOOGLE_STUDIO_API_KEY = os.getenv('GOOGLE_STUDIO_API_KEY', '')

# ─── Logging ──────────────────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {'format': '{levelname} {asctime} {module} {message}', 'style': '{'},
        'simple': {'format': '{levelname} {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'simple'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'flowstate': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
    },
}

# ─── Unfold Admin ─────────────────────────────────────────────────────────────
UNFOLD = {
    'SITE_TITLE': 'FlowState Admin',
    'SITE_HEADER': 'FlowState',
    'SITE_SUBHEADER': 'AI Study Platform',
    'SITE_URL': 'http://localhost:3000',
    'SITE_ICON': None,
    'SITE_SYMBOL': 'bolt',
    'SHOW_HISTORY': True,
    'SHOW_VIEW_ON_SITE': False,
    'COLORS': {
        'primary': {
            '50': '240 249 255',
            '100': '224 242 254',
            '200': '186 230 253',
            '300': '125 211 252',
            '400': '56 189 248',
            '500': '14 165 233',
            '600': '2 132 199',
            '700': '3 105 161',
            '800': '7 89 133',
            '900': '12 74 110',
            '950': '8 47 73',
        },
    },
    'SIDEBAR': {
        'show_search': True,
        'show_all_applications': False,
        'navigation': [
            {
                'title': 'Overview',
                'separator': False,
                'items': [
                    {'title': 'Dashboard', 'icon': 'dashboard', 'link': '/admin/'},
                ],
            },
            {
                'title': 'Users',
                'separator': True,
                'items': [
                    {'title': 'All Users', 'icon': 'people', 'link': '/admin/users/user/'},
                    {'title': 'Push Subscriptions', 'icon': 'notifications', 'link': '/admin/users/pushsubscription/'},
                ],
            },
            {
                'title': 'System Settings',
                'separator': True,
                'items': [
                    {'title': 'Global Configuration', 'icon': 'settings', 'link': '/admin/users/globalconfig/'},
                ],
            },
            {
                'title': 'Content',
                'separator': True,
                'items': [
                    {'title': 'Resources', 'icon': 'library_books', 'link': '/admin/library/resource/'},
                    {'title': 'Flashcards', 'icon': 'style', 'link': '/admin/library/flashcard/'},
                    {'title': 'Quizzes', 'icon': 'quiz', 'link': '/admin/library/quiz/'},
                ],
            },
            {
                'title': 'Community',
                'separator': True,
                'items': [
                    {'title': 'Study Groups', 'icon': 'groups', 'link': '/admin/groups/studygroup/'},
                    {'title': 'Group Sessions', 'icon': 'event', 'link': '/admin/groups/groupsession/'},
                    {'title': 'Posts', 'icon': 'forum', 'link': '/admin/community/post/'},
                    {'title': 'Events', 'icon': 'celebration', 'link': '/admin/community/studyevent/'},
                ],
            },
            {
                'title': 'Planning',
                'separator': True,
                'items': [
                    {'title': 'Study Sessions', 'icon': 'schedule', 'link': '/admin/planner/studysession/'},
                    {'title': 'Deadlines', 'icon': 'alarm', 'link': '/admin/planner/deadline/'},
                ],
            },
            {
                'title': 'AI',
                'separator': True,
                'items': [
                    {'title': 'Chat Sessions', 'icon': 'smart_toy', 'link': '/admin/ai_assistant/chatsession/'},
                ],
            },
        ],
    },
}

# ─── DJANGO Q BACKGROUND WORKER ─────────────────────────────────────────────
Q_CLUSTER = {
    'name': 'flowstate_worker',
    'orm': 'default',   # Use DB instead of Redis for easier local testing
    'timeout': 600,     # Max time for a RAG vectorization task (Extended for large PDFs)
    'retry': 700,
    'workers': 1,       # Optimized for Windows stability (prevents reincarnated worker loops)
    'recycle': 500,
    'save_limit': 250,
    'label': 'Django Q',
}
# Signal: Forced Reload 2026-04-07
