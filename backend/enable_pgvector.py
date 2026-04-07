import psycopg2
import urllib.parse
from dotenv import load_dotenv
import os

load_dotenv()

db_url = os.getenv('DATABASE_URL')
# Ensure URL is correctly formatted for psycopg2
if not db_url:
    print("NO DATABASE_URL FOUND")
    exit(1)

try:
    print(f"Connecting to database to enable pgvector...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    print("SUCCESS: Vector extension established on Supabase!")
    conn.close()
except Exception as e:
    print(f"ERROR: {e}")
