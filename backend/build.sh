#!/usr/bin/env bash
# exit on error
set -o errexit

# Install LibreOffice for PPTX→PDF conversion (gives slides same quality as PDF uploads)
# Suppressed output to keep build logs clean — fails silently if unavailable
apt-get install -y --no-install-recommends libreoffice 2>/dev/null || echo "LibreOffice not available, PPTX will use fallback extraction"

pip install -r requirements.txt

python manage.py collectstatic --noinput

# Ensure the pgvector extension is enabled in the database
# We handle this with a try-except to avoid build failures if DB is not reachable during build
python -c "
import os
import psycopg2
try:
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute('CREATE EXTENSION IF NOT EXISTS vector;')
    cur.close()
    conn.close()
    print('pgvector extension enabled')
except Exception as e:
    print(f'Skipping pgvector enable: {e}')
"

# NOTE: migrate intentionally runs at startup (in render.yaml startCommand),
# not here — Render's internal DB DNS is not available during the build phase.
python -c "
import os, subprocess
try:
    import psycopg2
    psycopg2.connect(os.getenv('DATABASE_URL')).close()
    subprocess.run(['python', 'manage.py', 'clear_dead_tasks'], check=False)
    subprocess.run(['python', 'manage.py', 'seed_discovery'], check=False)
except Exception as e:
    print(f'Skipping post-migrate steps (DB not reachable at build time): {e}')
"
