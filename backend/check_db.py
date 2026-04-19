import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.db import connections

def check_db_integrity():
    print("--- Imperial Database Integrity Audit ---")
    conn = connections['default']
    
    try:
        print(f"Vendor: {conn.vendor}")
        print(f"Database Name: {conn.settings_dict['NAME']}")
        print(f"Host: {conn.settings_dict['HOST']}")
        
        with conn.cursor() as cursor:
            # Check for tables
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [row[0] for row in cursor.fetchall()]
            print(f"Total Tables found: {len(tables)}")
            
            if 'library_resource' in tables:
                cursor.execute("SELECT count(*) FROM library_resource")
                count = cursor.fetchone()[0]
                print(f"Resources in library_resource: {count}")
            else:
                print("[!] Table 'library_resource' NOT found!")
                
    except Exception as e:
        print(f"[ERROR] Connection failure: {e}")

if __name__ == "__main__":
    check_db_integrity()
