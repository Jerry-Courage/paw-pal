import os
import sys
import workspace

print("--- SOURCE OF TRUTH AUDIT ---")
print(f"Current Working Directory: {os.getcwd()}")
print(f"Python Executable: {sys.executable}")
print(f"Workspace Module Path: {workspace.__file__}")
print(f"Workspace Directory: {os.path.dirname(workspace.__file__)}")
print(f"PYTHONPATH: {sys.path}")
print("-----------------------------")
