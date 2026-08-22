import win32api, win32con, win32process, win32service, win32gui, win32ui
import ctypes
import threading
from PIL import Image

def capture_worker():
    try:
        hdesk = win32service.CreateDesktop('TEST_ROOM_6', 0, win32con.MAXIMUM_ALLOWED, None)
        hdesk.SetThreadDesktop()
        
        si = win32process.STARTUPINFO()
        si.lpDesktop = 'TEST_ROOM_6'
        p = win32process.CreateProcess(None, 'notepad.exe', None, None, False, 0, None, None, si)
        import time
        time.sleep(1)
        
        windows = []
        def enum_cb(hwnd, ctx):
            if win32gui.IsWindowVisible(hwnd):
                windows.append(hwnd)
            return True
            
        win32gui.EnumDesktopWindows(hdesk, enum_cb, None)
        
        # Create base image
        width = 1920
        height = 1080
        base_img = Image.new('RGB', (width, height), color='black')
        
        # Windows are yielded top-to-bottom in Z-order by EnumDesktopWindows. 
        # We need to paint bottom-to-top.
        for hwnd in reversed(windows):
            title = win32gui.GetWindowText(hwnd)
            if not title.strip(): continue
            
            rect = win32gui.GetWindowRect(hwnd)
            w = rect[2] - rect[0]
            h = rect[3] - rect[1]
            if w <= 0 or h <= 0: continue
            
            hwndDC = win32gui.GetWindowDC(hwnd)
            mfcDC = win32ui.CreateDCFromHandle(hwndDC)
            saveDC = mfcDC.CreateCompatibleDC()
            
            saveBitMap = win32ui.CreateBitmap()
            saveBitMap.CreateCompatibleBitmap(mfcDC, w, h)
            old_bmp = saveDC.SelectObject(saveBitMap)
            
            # PW_RENDERFULLCONTENT = 2
            res = ctypes.windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 2)
            if res:
                bmpinfo = saveBitMap.GetInfo()
                bmpstr = saveBitMap.GetBitmapBits(True)
                win_img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']), bmpstr, 'raw', 'BGRX', 0, 1)
                
                # Composite
                base_img.paste(win_img, (rect[0], rect[1]))
                
            saveDC.SelectObject(old_bmp)
            win32gui.DeleteObject(saveBitMap.GetHandle())
            saveDC.DeleteDC()
            mfcDC.DeleteDC()
            win32gui.ReleaseDC(hwnd, hwndDC)
            
        print("Success! Composited image with", len(windows), "windows.")
        win32process.TerminateProcess(p[0], 0)
        
    except Exception as e:
        print("Worker failed:", e)

t = threading.Thread(target=capture_worker)
t.start()
t.join()
