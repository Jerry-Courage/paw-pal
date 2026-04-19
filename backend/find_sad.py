import sqlite3
import os

def probe_sqlite():
    db_path = 'db.sqlite3'
    if not os.path.exists(db_path):
        print(f"[!] {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='library_resource'")
    if not cursor.fetchone():
        print("[!] table 'library_resource' not found in SQLite.")
        return

    print("--- SQLite Deep Probe ---")
    query = "SELECT id, title, status FROM library_resource WHERE title LIKE ? OR title LIKE ?"
    cursor.execute(query, ('%SAD%', '%System%'))
    rows = cursor.fetchall()
    
    if not rows:
        print("[*] No matches found for 'SAD' or 'System' in local SQLite.")
        # Try listing all just in case
        print("[*] Listing all IDs in local SQLite:")
        cursor.execute("SELECT id, title FROM library_resource ORDER BY id DESC LIMIT 5")
        for r in cursor.fetchall():
            print(f"ID: {r[0]} | Title: {r[1]}")
    else:
        for r in rows:
            print(f"[+] FOUND: ID {r[0]} | Title: {r[1]} | Status: {r[2]}")
            
    conn.close()

if __name__ == "__main__":
    probe_sqlite()
