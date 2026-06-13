import tkinter as tk
from tkinter import ttk
import time
import threading

class HealthMonitorDemo:
    def __init__(self, root):
        self.root = root
        self.root.title("RPG Auto-Healer Demo")
        self.root.geometry("700x400")
        self.root.configure(bg="#2b2d42")
        
        style = ttk.Style()
        style.theme_use('clam')
        
        main_frame = tk.Frame(root, bg="#2b2d42")
        main_frame.pack(fill=tk.BOTH, expand=True, padx=40, pady=40)
        
        # --- LEFT SIDE: GAME HEALTH ---
        left_frame = tk.Frame(main_frame, bg="#8d99ae", bd=4, relief=tk.RAISED)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 20))
        
        tk.Label(left_frame, text="Player Status", bg="#8d99ae", fg="#2b2d42", font=("Helvetica", 14, "bold")).pack(pady=(20, 10))
        
        self.health = 100
        self.health_label = tk.Label(left_frame, text=f"HP: {self.health}%", bg="#8d99ae", fg="#d90429", font=("Courier", 36, "bold"))
        self.health_label.pack(expand=True)
        
        # --- RIGHT SIDE: CONTROLS ---
        right_frame = tk.Frame(main_frame, bg="#edf2f4", bd=4, relief=tk.SUNKEN)
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        
        tk.Label(right_frame, text="Action Panel", bg="#edf2f4", fg="#2b2d42", font=("Helvetica", 14, "bold")).pack(pady=(20, 20))
        
        # The target button
        self.heal_btn = tk.Button(right_frame, text="💊 HEAL PLAYER", bg="#ef233c", fg="white", 
                                  font=("Helvetica", 16, "bold"), padx=20, pady=15,
                                  command=self.heal_player, cursor="hand2")
        self.heal_btn.pack(expand=True)
        
        self.log_label = tk.Label(right_frame, text="", bg="#edf2f4", fg="#2b2d42", font=("Helvetica", 10, "italic"))
        self.log_label.pack(pady=10)
        
        # Start game loop
        self.running = True
        self.damage_thread = threading.Thread(target=self.take_damage, daemon=True)
        self.damage_thread.start()

    def heal_player(self):
        self.health = 100
        self.health_label.config(text=f"HP: {self.health}%")
        self.log_label.config(text="Player Healed!", fg="#2a9d8f")
        self.root.after(1500, lambda: self.log_label.config(text=""))

    def take_damage(self):
        while self.running:
            time.sleep(2)
            if self.health > 10:
                self.health -= 10
                self.root.after(0, lambda: self.health_label.config(text=f"HP: {self.health}%"))
                
    def on_closing(self):
        self.running = False
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = HealthMonitorDemo(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()
