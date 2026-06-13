import tkinter as tk
from tkinter import ttk
import time
import threading
import random
from datetime import datetime

class ServerMonitorDemo:
    def __init__(self, root):
        self.root = root
        self.root.title("AWS CloudWatch - Infrastructure Monitor")
        self.root.geometry("900x500")
        self.root.configure(bg="#1e1e1e")
        
        # Style configuration
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TFrame", background="#1e1e1e")
        style.configure("TLabel", background="#1e1e1e", foreground="#ffffff", font=("Consolas", 12))
        style.configure("Header.TLabel", font=("Segoe UI", 16, "bold"), foreground="#4A90E2")
        
        # Main Layout
        main_frame = ttk.Frame(root, padding=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Split into left (Live Logs) and right (Incident Form)
        left_frame = ttk.Frame(main_frame)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        right_frame = ttk.Frame(main_frame)
        right_frame.pack(side=tk.RIGHT, fill=tk.Y, expand=False)
        
        # --- LEFT SIDE: LIVE LOG FEED ---
        ttk.Label(left_frame, text="Live Server Logs (us-east-1)", style="Header.TLabel").pack(anchor=tk.W, pady=(0, 10))
        
        self.log_text = tk.Text(left_frame, bg="#0d1117", fg="#c9d1d9", font=("Consolas", 11), 
                                wrap=tk.WORD, state=tk.DISABLED, insertbackground="white")
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # --- RIGHT SIDE: INCIDENT FORM ---
        ttk.Label(right_frame, text="Automated Incident Response", style="Header.TLabel").pack(anchor=tk.W, pady=(0, 10))
        
        form_frame = tk.Frame(right_frame, bg="#2d2d2d", padx=20, pady=20, relief=tk.RAISED, borderwidth=1)
        form_frame.pack(fill=tk.X)
        
        ttk.Label(form_frame, text="Critical Error Details:", background="#2d2d2d").pack(anchor=tk.W, pady=(0, 5))
        
        self.incident_entry = tk.Entry(form_frame, font=("Consolas", 12), width=35, bg="#1e1e1e", fg="#ff4444", insertbackground="white")
        self.incident_entry.pack(fill=tk.X, pady=(0, 15), ipady=5)
        
        ttk.Label(form_frame, text="* AI Agent should automatically populate\nthis field when a CRITICAL severity log\nappears on the left feed.", 
                  background="#2d2d2d", foreground="#888888", font=("Segoe UI", 10, "italic")).pack(anchor=tk.W)
        
        # Start Log Simulation
        self.running = True
        self.log_thread = threading.Thread(target=self.simulate_logs, daemon=True)
        self.log_thread.start()

    def add_log(self, message, is_critical=False):
        self.log_text.config(state=tk.NORMAL)
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        color = "#ff4444" if is_critical else "#c9d1d9"
        
        tag_name = "critical" if is_critical else "normal"
        self.log_text.tag_config(tag_name, foreground=color)
        
        self.log_text.insert(tk.END, f"[{timestamp}] {message}\n", tag_name)
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)

    def simulate_logs(self):
        servers = ["API-Gateway-01", "DB-Cluster-Master", "Auth-Service-A", "Worker-Node-44"]
        
        # Normal operations for the first 10-15 seconds
        for i in range(7):
            if not self.running: return
            time.sleep(random.uniform(1.5, 2.5))
            server = random.choice(servers)
            msg = f"INFO: {server} - Health check OK. CPU: {random.randint(10, 45)}% RAM: {random.randint(30, 60)}%"
            self.root.after(0, self.add_log, msg)
            
        # Boom! Critical error happens
        if not self.running: return
        time.sleep(2)
        critical_msg = "CRITICAL: Auth-Service-A - Connection Refused (Database timeout code: ERR-5099). Service halted."
        self.root.after(0, self.add_log, critical_msg, True)
        
        # Return to normal
        for i in range(100):
            if not self.running: return
            time.sleep(random.uniform(1.5, 3.0))
            server = random.choice([s for s in servers if s != "Auth-Service-A"])
            msg = f"INFO: {server} - Health check OK. Traffic nominal."
            self.root.after(0, self.add_log, msg)

    def on_closing(self):
        self.running = False
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = ServerMonitorDemo(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()
