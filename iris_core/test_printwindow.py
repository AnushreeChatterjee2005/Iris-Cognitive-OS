import win32gui
import win32ui
import win32con
from ctypes import windll
import numpy as np
import cv2

def capture_window(hwnd):
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    width = right - left
    height = bottom - top

    hwndDC = win32gui.GetWindowDC(hwnd)
    mfcDC  = win32ui.CreateDCFromHandle(hwndDC)
    saveDC = mfcDC.CreateCompatibleDC()

    saveBitMap = win32ui.CreateBitmap()
    saveBitMap.CreateCompatibleBitmap(mfcDC, width, height)
    saveDC.SelectObject(saveBitMap)

    # PW_RENDERFULLCONTENT = 2 for Windows 8.1+
    result = windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 3)
    
    bmpinfo = saveBitMap.GetInfo()
    bmpstr = saveBitMap.GetBitmapBits(True)
    
    img = np.frombuffer(bmpstr, dtype='uint8')
    img.shape = (bmpinfo['bmHeight'], bmpinfo['bmWidth'], 4)
    
    win32gui.DeleteObject(saveBitMap.GetHandle())
    saveDC.DeleteDC()
    mfcDC.DeleteDC()
    win32gui.ReleaseDC(hwnd, hwndDC)

    if result == 1:
        return img
    else:
        return None

def main():
    def callback(hwnd, windows):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            if title:
                windows.append((hwnd, title))
        return True

    windows = []
    win32gui.EnumWindows(callback, windows)
    
    for hwnd, title in windows:
        if "IRIS" in title or "Chrome" in title or "Terminal" in title:
            print(f"Found window: {title} ({hwnd})")
            img = capture_window(hwnd)
            if img is not None:
                print(f"Successfully captured background window! Shape: {img.shape}")
                return
    print("Could not capture.")

if __name__ == '__main__':
    main()
