import psycopg2
import os

db_url = "postgresql://postgres.elbmkzcbxgpstcapdths:IamJerry%4019%24%24@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

def test_insert():
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        # Test inserting with session_type
        cur.execute("""
            INSERT INTO planner_studysession 
            (user_id, title, start_time, end_time, session_type, status, duration_minutes)
            VALUES (1, 'Test Insert', now(), now(), 'study', 'scheduled', 60)
            RETURNING id;
        """)
        new_id = cur.fetchone()[0]
        print(f"Direct PSQL Insert Success! ID: {new_id}")
        cur.execute("DELETE FROM planner_studysession WHERE id = %s", (new_id,))
        conn.commit()
    except Exception as e:
        print(f"Direct PSQL Insert FAILED: {e}")
    finally:
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    test_insert()
