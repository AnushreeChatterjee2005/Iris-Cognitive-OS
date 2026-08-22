import win32api
import win32con
import win32process
import win32service
import time

try:
    print("Attempting to create hidden desktop...")
    hdesk = win32service.CreateDesktop("AgentRoom", 0, win32con.GENERIC_ALL, None)
    print("Desktop created successfully.")
    
    startup = win32process.STARTUPINFO()
    startup.lpDesktop = "AgentRoom"
    
    print("Launching notepad on hidden desktop...")
    process_info = win32process.CreateProcess(
        None, "notepad.exe", None, None, False, 0, None, None, startup
    )
    print("Launched Notepad on hidden desktop!")
    print("Virtual Sandbox Room architecture is entirely viable on Windows.")
    
except Exception as e:
    print(f"Failed: {e}")
