#!/usr/bin/env bash
# exit on error
set -o errexit

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

python manage.py migrate --noinput
python manage.py seed_discovery || true
