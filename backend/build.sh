#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --noinput

# Ensure the pgvector extension is enabled in the database
# We use a small python snippet to run the SQL command safely
python -c "import os; import psycopg2; conn = psycopg2.connect(os.getenv('DATABASE_URL')); conn.autocommit = True; cur = conn.cursor(); cur.execute('CREATE EXTENSION IF NOT EXISTS vector;'); cur.close(); conn.close(); print('pgvector extension enabled')"

python manage.py migrate
python manage.py seed_discovery
