"""
Hybrid Storage Service
Routes files to Cloudinary (≤10MB) or Cloudflare R2 (>10MB).
R2 credentials are optional — if not configured, all files go to Cloudinary
and files >10MB will be rejected.
"""
import os
import logging
import uuid
from django.conf import settings

logger = logging.getLogger('nitemind')

CLOUDINARY_LIMIT = 10 * 1024 * 1024  # 10MB


def _r2_configured():
    """Check if R2 env vars are set."""
    return bool(
        os.getenv('R2_ACCOUNT_ID')
        and os.getenv('R2_ACCESS_KEY_ID')
        and os.getenv('R2_SECRET_ACCESS_KEY')
        and os.getenv('R2_BUCKET_NAME')
    )


def _get_r2_client():
    """Create a boto3 S3 client for Cloudflare R2."""
    import boto3
    return boto3.client(
        's3',
        endpoint_url=f'https://{os.getenv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com',
        aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
        region_name='auto',
    )


def _get_r2_public_url(key):
    """Build the public URL for an R2 object."""
    account_id = os.getenv('R2_ACCOUNT_ID', '')
    bucket = os.getenv('R2_BUCKET_NAME', '')
    custom_domain = os.getenv('R2_CUSTOM_DOMAIN', '')
    if custom_domain:
        return f'https://{custom_domain}/{key}'
    return f'https://{bucket}.{account_id}.r2.dev/{key}'


def upload_file(file_obj, filename, content_type=None):
    """
    Upload a file to the appropriate storage backend.
    Returns (storage_backend, r2_key_or_none, cloudinary_file_or_none).
    
    - file_obj: Django UploadedFile or file-like object
    - filename: original filename
    - content_type: MIME type (optional)
    """
    file_size = file_obj.size if hasattr(file_obj, 'size') else 0

    # Route to R2 if file is large AND R2 is configured
    if file_size > CLOUDINARY_LIMIT and _r2_configured():
        return _upload_to_r2(file_obj, filename, content_type)

    # Default: let Django's FileField handle it (Cloudinary)
    return ('cloudinary', None, None)


def _upload_to_r2(file_obj, filename, content_type=None):
    """Upload file to Cloudflare R2."""
    ext = os.path.splitext(filename)[1].lower()
    key = f'resources/{uuid.uuid4().hex}{ext}'

    try:
        client = _get_r2_client()
        bucket = os.getenv('R2_BUCKET_NAME')

        # Reset file pointer
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)

        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type

        client.upload_fileobj(file_obj, bucket, key, ExtraArgs=extra_args)

        logger.info(f'[R2] Uploaded: {key} ({file_obj.size if hasattr(file_obj, "size") else "?"} bytes)')
        return ('r2', key, None)

    except Exception as e:
        logger.error(f'[R2] Upload failed: {e}')
        raise


def get_file_bytes(resource):
    """
    Download file bytes from the appropriate backend.
    Returns bytes or raises.
    """
    backend = getattr(resource, 'storage_backend', 'cloudinary')

    if backend == 'r2':
        return _get_file_bytes_r2(resource.r2_key)

    # Cloudinary — use existing signed URL logic
    return _get_file_bytes_cloudinary(resource)


def _get_file_bytes_r2(key):
    """Download file from R2."""
    import boto3
    from io import BytesIO

    client = _get_r2_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    buf = BytesIO()
    client.download_fileobj(bucket, key, buf)
    buf.seek(0)
    logger.info(f'[R2] Downloaded: {key} ({buf.getbuffer().nbytes} bytes)')
    return buf.read()


def _get_file_bytes_cloudinary(resource):
    """Download file from Cloudinary using signed URL."""
    import requests as _req
    import re as _re

    raw_name = resource.file.name or ''
    if not raw_name:
        raise Exception(f'Resource {resource.id} has no file name')

    try:
        import cloudinary
        import cloudinary.utils
        cfg = cloudinary.config()

        if cfg.api_key and cfg.api_secret and cfg.cloud_name:
            pub_id = _re.sub(r'\.[^.]+$', '', raw_name)
            file_ext = _re.search(r'\.([^.]+)$', raw_name)
            fmt = file_ext.group(1) if file_ext else 'pdf'

            signed_url = cloudinary.utils.private_download_url(
                pub_id, fmt, resource_type='image', type='upload',
            )
            resp = _req.get(signed_url, timeout=60)
            if resp.status_code == 200:
                logger.info(f'[Cloudinary] Downloaded via signed URL: {resource.id} ({len(resp.content)} bytes)')
                return resp.content
            logger.warning(f'[Cloudinary] Signed download {resp.status_code} for {resource.id}')
    except Exception as e:
        logger.warning(f'[Cloudinary] Signed download failed for {resource.id}: {e}')

    # Fallback: storage.open()
    try:
        resource.file.open('rb')
        data = resource.file.read()
        resource.file.close()
        logger.info(f'[Cloudinary] File read via storage.open() for {resource.id}')
        return data
    except Exception as e:
        raise Exception(f'Could not read file for resource {resource.id}: {e}')


def get_file_url(resource):
    """Get a accessible URL for the resource file."""
    backend = getattr(resource, 'storage_backend', 'cloudinary')

    if backend == 'r2':
        return _get_r2_public_url(resource.r2_key)

    # Cloudinary — return the file URL
    if resource.file:
        return resource.file.url

    return None


def delete_file(resource):
    """Delete file from the appropriate backend."""
    backend = getattr(resource, 'storage_backend', 'cloudinary')

    if backend == 'r2' and resource.r2_key:
        try:
            client = _get_r2_client()
            bucket = os.getenv('R2_BUCKET_NAME')
            client.delete_object(Bucket=bucket, Key=resource.r2_key)
            logger.info(f'[R2] Deleted: {resource.r2_key}')
        except Exception as e:
            logger.error(f'[R2] Delete failed: {e}')
    elif resource.file:
        try:
            resource.file.delete()
        except Exception as e:
            logger.error(f'[Cloudinary] Delete failed: {e}')


def get_storage_info():
    """Return current storage configuration for debugging."""
    return {
        'cloudinary': bool(getattr(settings, 'USE_CLOUDINARY', False)),
        'r2_configured': _r2_configured(),
        'r2_bucket': os.getenv('R2_BUCKET_NAME', ''),
        'cloudinary_limit_mb': CLOUDINARY_LIMIT // (1024 * 1024),
    }
