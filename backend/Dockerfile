# ─── BACKEND DOCKERFILE ──────────────────────────────────────────────────
# Using slim-buster for a balance of small size and included system libs
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PORT 8000

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    ffmpeg \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Ensure build.sh is executable
RUN chmod +x build.sh

# Expose port
EXPOSE 8000

# Start server using Daphne for ASGI support
# We run the build.sh first to handle migrations and static files at runtime
CMD ./build.sh && daphne -b 0.0.0.0 -p $PORT core.asgi:application
