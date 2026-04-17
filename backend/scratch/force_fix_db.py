import psycopg2
import os
from urllib.parse import urlparse

db_url = "postgresql://postgres.elbmkzcbxgpstcapdths:IamJerry%4019%24%24@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

def check():
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'planner_studysession';")
    cols = [r[0] for r in cur.fetchall()]
    print("Actual Database Columns:", cols)
    
    if 'session_type' not in cols:
        print("FIXING: Adding session_type column...")
        cur.execute("ALTER TABLE planner_studysession ADD COLUMN session_type VARCHAR(20) DEFAULT 'study';")
    
    if 'recurrence_id' not in cols:
        print("FIXING: Adding recurrence_id column...")
        cur.execute("ALTER TABLE planner_studysession ADD COLUMN recurrence_id UUID;")
        
    conn.commit()
    cur.close()
    conn.close()
    print("Verification/Fix Complete.")

if __name__ == "__main__":
    check()
