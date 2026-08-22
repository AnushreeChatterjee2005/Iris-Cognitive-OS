import tkinter as tk
import threading
import time
import queue

class FakeMouse(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.q = queue.Queue()
        self.root = None
        self.current_x = -100
        self.current_y = -100
        self.target_x = -100
        self.target_y = -100

    def run(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", "magenta")
        
        self.canvas = tk.Canvas(self.root, width=32, height=32, bg="magenta", highlightthickness=0)
        self.canvas.pack()
        
        # Draw a custom cursor (cyan colored to distinguish from real mouse)
        self.canvas.create_polygon(0, 0, 0, 20, 5, 15, 12, 25, 16, 23, 10, 13, 20, 13, fill="cyan", outline="white", width=2)
        
        self.root.geometry(f"32x32+-100+-100")
        
        def update_position():
            # Check for new targets
            try:
                while True:
                    target = self.q.get_nowait()
                    if target == "QUIT":
                        self.root.quit()
                        return
                    self.target_x, self.target_y = target
            except queue.Empty:
                pass
                
            # Smooth interpolation
            dx = self.target_x - self.current_x
            dy = self.target_y - self.current_y
            
            self.current_x += dx * 0.15
            self.current_y += dy * 0.15
            
            if abs(self.current_x - self.target_x) < 1 and abs(self.current_y - self.target_y) < 1:
                self.current_x = self.target_x
                self.current_y = self.target_y
                
            self.root.geometry(f"32x32+{int(self.current_x)}+{int(self.current_y)}")
            self.root.after(16, update_position)
            
        self.root.after(16, update_position)
        self.root.mainloop()

    def move_to(self, x, y):
        self.q.put((x, y))
        
    def stop(self):
        self.q.put("QUIT")

# Global instance
_mouse_instance = None

def get_mouse():
    global _mouse_instance
    if _mouse_instance is None:
        _mouse_instance = FakeMouse()
        _mouse_instance.start()
    return _mouse_instance
