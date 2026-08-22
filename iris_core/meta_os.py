"""
IRIS Core: Meta-OS Intelligent Workspace Manager
Provides OS-level multi-window layout orchestration, split-screen snapping (2-way, 3-way, 4-way),
Zen Mode, Spotlight, Picture-in-Picture, and LLM-powered spatial workspace reasoning.
"""

import sys
import os
import time
import json
import re
import threading
import ctypes
from ctypes import wintypes
import win32gui
import win32con
import win32api
import win32process
import win32_engine

class SYSTEM_POWER_STATUS(ctypes.Structure):
    _fields_ = [
        ('ACLineStatus', wintypes.BYTE),
        ('BatteryFlag', wintypes.BYTE),
        ('BatteryLifePercent', wintypes.BYTE),
        ('SystemStatusFlag', wintypes.BYTE),
        ('BatteryLifeTime', wintypes.DWORD),
        ('BatteryFullLifeTime', wintypes.DWORD),
    ]

def get_battery_percentage():
    system_power_status = SYSTEM_POWER_STATUS()
    if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.pointer(system_power_status)):
        return system_power_status.BatteryLifePercent
    return 100

class MetaOS:
    def __init__(self):
        self.original_styles = {}
        self.taskbar_hidden = False

    def toggle_taskbar(self, hide: bool):
        win32_engine.ensure_interactive_desktop()
        hwnd = win32gui.FindWindow("Shell_TrayWnd", None)
        if hwnd:
            if hide:
                win32gui.ShowWindow(hwnd, win32con.SW_HIDE)
                self.taskbar_hidden = True
            else:
                win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
                self.taskbar_hidden = False
            return True
        return False

    def toggle_desktop_icons(self, hide: bool):
        """Hides or shows all Windows desktop icons via Progman / SHELLDLL_DefView."""
        progman = win32gui.FindWindow("Progman", None)
        sub = win32gui.FindWindowEx(progman, 0, "SHELLDLL_DefView", None)
        if not sub:
            workerw = 0
            def find_worker(h, _):
                nonlocal workerw
                if win32gui.FindWindowEx(h, 0, "SHELLDLL_DefView", None):
                    workerw = h
            win32gui.EnumWindows(find_worker, None)
            if workerw:
                sub = win32gui.FindWindowEx(workerw, 0, "SHELLDLL_DefView", None)
        
        if sub:
            win32gui.ShowWindow(sub, win32con.SW_HIDE if hide else win32con.SW_SHOW)
            return True
        return False

    def _get_visible_windows(self):
        """Returns all interactive top-level desktop windows sorted in Z-order."""
        win32_engine.ensure_interactive_desktop()
        windows = win32_engine.get_all_desktop_windows()
        return [w["hwnd"] for w in windows]

    def resolve_app_hwnd(self, app_keyword: str, auto_launch: bool = True) -> int:
        """
        Finds the HWND for a given app name (fuzzy matching title & process name).
        If not found and auto_launch=True, launches the application cleanly.
        """
        if not app_keyword:
            return 0

        win32_engine.ensure_interactive_desktop()
        hwnd = win32_engine.find_window_by_name(app_keyword, must_be_visible=True)
        if hwnd:
            return hwnd

        # Auto launch if requested
        if auto_launch:
            res = win32_engine.resolve_and_open_app(app_keyword)
            return res.get("hwnd", 0)

        return 0

    def _save_original_style(self, hwnd):
        if hwnd and hwnd not in self.original_styles:
            try:
                self.original_styles[hwnd] = {
                    'style': win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE),
                    'exstyle': win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE),
                    'rect': win32gui.GetWindowRect(hwnd)
                }
            except Exception:
                pass

    def apply_zen_mode(self, target_app: str = None):
        """Hides taskbar, desktop icons, and makes active window borderless fullscreen."""
        self.toggle_taskbar(hide=True)
        self.toggle_desktop_icons(hide=True)
        
        hwnd = self.resolve_app_hwnd(target_app, auto_launch=False) if target_app else None
        if not hwnd:
            hwnds = self._get_visible_windows()
            hwnd = hwnds[0] if hwnds else None

        if not hwnd:
            return False

        self._save_original_style(hwnd)

        style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
        style = style & ~win32con.WS_CAPTION & ~win32con.WS_THICKFRAME
        win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, style)

        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
        
        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
        
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOP, 0, 0, sw, sh, 
                              win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
        win32gui.RedrawWindow(hwnd, None, 0, win32con.RDW_FRAME | win32con.RDW_INVALIDATE | win32con.RDW_UPDATENOW | win32con.RDW_ALLCHILDREN)
        return True

    def pin_picture_in_picture(self, target_app: str = None):
        """Pins an app as a floating, always-on-top Picture-in-Picture mini window in the top-right corner."""
        hwnd = self.resolve_app_hwnd(target_app, auto_launch=False) if target_app else None
        if not hwnd:
            hwnds = self._get_visible_windows()
            hwnd = hwnds[0] if hwnds else None

        if not hwnd:
            return False

        self._save_original_style(hwnd)
        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        mini_w, mini_h = 440, 280
        x = sw - mini_w - 24
        y = 24
        
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, x, y, mini_w, mini_h, 
                              win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
        return True

    def spotlight_window(self, target_app: str = None):
        """Centers primary app in 78% spotlight and minimizes other distracting windows."""
        primary = self.resolve_app_hwnd(target_app, auto_launch=False) if target_app else None
        hwnds = self._get_visible_windows()
        if not primary and hwnds:
            primary = hwnds[0]

        if not primary:
            return False

        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
        spot_w, spot_h = int(sw * 0.78), int(sh * 0.88)
        x = (sw - spot_w) // 2
        y = (sh - spot_h) // 2

        # Minimize other background windows
        for h in hwnds:
            if h != primary:
                win32gui.ShowWindow(h, win32con.SW_MINIMIZE)

        self._save_original_style(primary)
        win32gui.ShowWindow(primary, win32con.SW_RESTORE)
        win32gui.SetWindowPos(primary, win32con.HWND_TOP, x, y, spot_w, spot_h, 
                              win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
        return True

    def split_2_windows(self, hwnd1: int, hwnd2: int, ratio: float = 0.5):
        """Snaps two windows side-by-side with a given left/right ratio (e.g. 0.5, 0.7, 0.6)."""
        if not hwnd1 or not hwnd2:
            return False

        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)

        w1 = int(sw * ratio)
        w2 = sw - w1

        for idx, (h, x, w) in enumerate([(hwnd1, 0, w1), (hwnd2, w1, w2)]):
            self._save_original_style(h)
            win32gui.ShowWindow(h, win32con.SW_RESTORE)
            win32gui.SetWindowPos(h, win32con.HWND_TOP, x, 0, w, sh, 
                                  win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
            win32gui.RedrawWindow(h, None, None, 
                                  win32con.RDW_INVALIDATE | win32con.RDW_ERASE | 
                                  win32con.RDW_ALLCHILDREN | win32con.RDW_UPDATENOW | 
                                  win32con.RDW_FRAME)
            win32_engine.bring_window_to_front(h)
        return True

    def split_3_windows(self, hwnd1: int, hwnd2: int, hwnd3: int, layout: str = "master_stack"):
        """
        Snaps 3 windows.
        layout="master_stack": App 1 takes left 55%, App 2 takes top-right, App 3 takes bottom-right.
        layout="columns": 3 equal vertical columns (33% each).
        """
        if not hwnd1 or not hwnd2 or not hwnd3:
            return False

        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)

        if layout == "columns":
            w = sw // 3
            placements = [
                (hwnd1, 0, 0, w, sh),
                (hwnd2, w, 0, w, sh),
                (hwnd3, w * 2, 0, sw - (w * 2), sh)
            ]
        else:
            # master_stack (Left master 55%, Right stack 45%)
            w_left = int(sw * 0.55)
            w_right = sw - w_left
            h_half = sh // 2
            placements = [
                (hwnd1, 0, 0, w_left, sh),
                (hwnd2, w_left, 0, w_right, h_half),
                (hwnd3, w_left, h_half, w_right, sh - h_half)
            ]

        for h, x, y, w, height in placements:
            self._save_original_style(h)
            win32gui.ShowWindow(h, win32con.SW_RESTORE)
            win32gui.SetWindowPos(h, win32con.HWND_TOP, x, y, w, height, 
                                  win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
            win32gui.RedrawWindow(h, None, None, 
                                  win32con.RDW_INVALIDATE | win32con.RDW_ERASE | 
                                  win32con.RDW_ALLCHILDREN | win32con.RDW_UPDATENOW | 
                                  win32con.RDW_FRAME)
            win32_engine.bring_window_to_front(h)
        return True

    def split_4_windows(self, hwnd1: int, hwnd2: int, hwnd3: int, hwnd4: int):
        """Snaps 4 windows into 2x2 quadrants."""
        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
        half_w = sw // 2
        half_h = sh // 2

        placements = [
            (hwnd1, 0, 0, half_w, half_h),
            (hwnd2, half_w, 0, sw - half_w, half_h),
            (hwnd3, 0, half_h, half_w, sh - half_h),
            (hwnd4, half_w, half_h, sw - half_w, sh - half_h)
        ]
        for h, x, y, w, height in placements:
            if h:
                self._save_original_style(h)
                win32gui.ShowWindow(h, win32con.SW_RESTORE)
                win32gui.SetWindowPos(h, win32con.HWND_TOP, x, y, w, height, 
                                      win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
        return True

    def tile_windows(self):
        """Tiles all visible open windows into an optimal grid layout."""
        hwnds = self._get_visible_windows()
        if not hwnds:
            return False

        num = len(hwnds)
        sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
        sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
        
        cols = 2 if num in [2, 4] else (3 if num >= 3 else 1)
        rows = (num + cols - 1) // cols
        
        win_w = sw // cols
        win_h = sh // rows
        
        for idx, hwnd in enumerate(hwnds):
            self._save_original_style(hwnd)
            r = idx // cols
            c = idx % cols
            x = c * win_w
            y = r * win_h
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetWindowPos(hwnd, win32con.HWND_TOP, x, y, win_w, win_h, 
                                  win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
        return True

    def restore_all(self):
        """Restores all windows to their original positions and unhides taskbar and desktop icons."""
        self.toggle_taskbar(hide=False)
        self.toggle_desktop_icons(hide=False)
        for hwnd, data in self.original_styles.items():
            try:
                if win32gui.IsWindow(hwnd):
                    win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, data['style'])
                    win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, data['exstyle'])
                    r = data['rect']
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                    win32gui.SetWindowPos(hwnd, win32con.HWND_TOP, r[0], r[1], r[2]-r[0], r[3]-r[1], 
                                          win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
                    win32gui.RedrawWindow(hwnd, None, 0, win32con.RDW_FRAME | win32con.RDW_INVALIDATE | win32con.RDW_UPDATENOW | win32con.RDW_ALLCHILDREN)
            except Exception as e:
                print(f"[MetaOS] Failed to restore hwnd {hwnd}: {e}")
        self.original_styles.clear()
        return True

    def smart_arrange_workspace(self, command: str) -> dict:
        """
        Core AI Workspace Orchestrator:
        Combines deterministic regex/keyword parsing with fast LLM spatial reasoning
        to understand arbitrary multi-app layout requests and execute pixel-perfect snapping.
        """
        cmd_lower = command.lower().strip()
        print(f"[MetaOS] Orchestrating workspace layout for command: '{command}'")

        # 1. Restore Desktop
        if any(k in cmd_lower for k in ["restore", "reset", "normal", "unhide", "exit layout"]):
            self.restore_all()
            return {"status": "success", "message": "Desktop & all windows restored to normal."}

        # 2. Zen Mode / Fullscreen Focus
        if any(k in cmd_lower for k in ["fullscreen", "zen", "focus mode", "hide taskbar", "immersive"]):
            target = cmd_lower.replace("fullscreen", "").replace("zen", "").replace("mode", "").replace("focus", "").replace("hide taskbar", "").replace("on", "").strip()
            self.apply_zen_mode(target if target else None)
            return {"status": "success", "message": f"Zen Fullscreen Mode activated for {target.title() if target else 'active application'}."}

        # 3. Picture-in-Picture Mini Floating Window
        if any(k in cmd_lower for k in ["picture in picture", "pip", "pin", "mini corner", "float"]):
            target = cmd_lower.replace("picture in picture", "").replace("pip", "").replace("pin", "").replace("mini corner", "").replace("float", "").replace("on top", "").strip()
            self.pin_picture_in_picture(target if target else None)
            return {"status": "success", "message": f"Pinned {target.title() if target else 'application'} to Picture-in-Picture mini corner."}

        # 4. Spotlight Focus
        if "spotlight" in cmd_lower or "center focus" in cmd_lower:
            target = cmd_lower.replace("spotlight", "").replace("center focus", "").replace("on", "").strip()
            self.spotlight_window(target if target else None)
            return {"status": "success", "message": f"Spotlight Focus Mode centered on {target.title() if target else 'active window'}."}

        # 5. Extract Apps and Ratios
        # Clean wake words from layout command
        clean_cmd = cmd_lower
        for wake in ["hey iris", "hi iris", "iris", "please", "can you", "could you"]:
            clean_cmd = re.sub(rf'\b{wake}\b', '', clean_cmd)
        clean_cmd = clean_cmd.strip()

        # 5. Extract Apps and Ratios
        known_apps = [
            "notepad", "chrome", "excel", "code", "vscode", "terminal", "cmd", 
            "powershell", "spotify", "slack", "discord", "calculator", "calc", 
            "word", "edge", "firefox", "antigravity"
        ]
        
        detected_apps = []
        for app in known_apps:
            if re.search(rf'\b{app}\b', clean_cmd) and app not in detected_apps:
                detected_apps.append(app)

        # Detect Ratios (e.g. 70/30, 60/40, 80/20, 50/50, 70% and 30%)
        ratio = 0.5
        pcts = re.findall(r'(\d{1,2})\s*%', cmd_lower)
        if len(pcts) >= 1:
            ratio = int(pcts[0]) / 100.0
        else:
            ratio_match = re.search(r'(\d{2})[/ \-](\d{2})', cmd_lower)
            if ratio_match:
                ratio = int(ratio_match.group(1)) / 100.0

        # Deterministic 2-App Split
        if len(detected_apps) == 2:
            h1 = self.resolve_app_hwnd(detected_apps[0], auto_launch=True)
            h2 = self.resolve_app_hwnd(detected_apps[1], auto_launch=True)
            if h1 and h2:
                self.split_2_windows(h1, h2, ratio=ratio)
                return {
                    "status": "success",
                    "layout": f"split_2 ({int(ratio*100)}/{int((1-ratio)*100)})",
                    "apps": detected_apps,
                    "message": f"Arranged {detected_apps[0].title()} and {detected_apps[1].title()} in {int(ratio*100)}/{int((1-ratio)*100)} split screen."
                }
            elif h1 and not h2:
                # If app2 failed to launch, pair with next visible desktop window
                visible = [h for h in self._get_visible_windows() if h != h1]
                if visible:
                    self.split_2_windows(h1, visible[0], ratio=ratio)
                    return {"status": "success", "message": f"Arranged {detected_apps[0].title()} with {win32gui.GetWindowText(visible[0])}."}
            elif h2 and not h1:
                visible = [h for h in self._get_visible_windows() if h != h2]
                if visible:
                    self.split_2_windows(visible[0], h2, ratio=ratio)
                    return {"status": "success", "message": f"Arranged {win32gui.GetWindowText(visible[0])} with {detected_apps[1].title()}."}

        # Deterministic 1-App Split (Pair with current visible foreground window)
        elif len(detected_apps) == 1 and any(k in cmd_lower for k in ["split", "side by side", "half", "left", "right"]):
            h1 = self.resolve_app_hwnd(detected_apps[0], auto_launch=True)
            visible = [h for h in self._get_visible_windows() if h != h1]
            if h1 and visible:
                self.split_2_windows(h1, visible[0], ratio=ratio)
                return {
                    "status": "success",
                    "layout": f"split_2 ({int(ratio*100)}/{int((1-ratio)*100)})",
                    "apps": [detected_apps[0], win32gui.GetWindowText(visible[0])],
                    "message": f"Arranged {detected_apps[0].title()} and {win32gui.GetWindowText(visible[0])} in split screen."
                }

        # Deterministic 3-App Split
        elif len(detected_apps) == 3:
            h1 = self.resolve_app_hwnd(detected_apps[0], auto_launch=True)
            h2 = self.resolve_app_hwnd(detected_apps[1], auto_launch=True)
            h3 = self.resolve_app_hwnd(detected_apps[2], auto_launch=True)
            if h1 and h2 and h3:
                layout_mode = "columns" if "column" in cmd_lower or "three columns" in cmd_lower else "master_stack"
                self.split_3_windows(h1, h2, h3, layout=layout_mode)
                return {
                    "status": "success",
                    "layout": f"split_3 ({layout_mode})",
                    "apps": detected_apps,
                    "message": f"Arranged {detected_apps[0].title()}, {detected_apps[1].title()}, and {detected_apps[2].title()} in 3-way {layout_mode} layout."
                }

        # 6. LLM Spatial Reasoning Fallback for Complex / Underspecified Commands
        try:
            import watcher
            visible_titles = [win32gui.GetWindowText(h) for h in self._get_visible_windows()[:6]]
            prompt = f"""
You are the IRIS Meta-OS Spatial Workspace Manager.
User Layout Command: "{command}"
Currently Visible Desktop Windows: {json.dumps(visible_titles)}

Analyze the user's intent and output a JSON object with:
{{
  "layout_type": "split_2" | "split_3_master" | "split_3_columns" | "split_4_grid" | "tile" | "zen" | "spotlight",
  "apps": ["app1_keyword", "app2_keyword", ...],
  "ratio": 0.5 or custom float like 0.7
}}
Output ONLY the JSON.
"""
            resp = watcher.call_llm_with_retry('llama-3.3-70b-versatile', [prompt], "meta_os_reasoner")
            m = re.search(r'\{.*\}', resp.text, re.DOTALL)
            if m:
                parsed = json.loads(m.group(0))
                ltype = parsed.get("layout_type", "tile")
                apps = parsed.get("apps", [])
                r = float(parsed.get("ratio", 0.5))

                hwnds = [self.resolve_app_hwnd(a) for a in apps if a]
                hwnds = [h for h in hwnds if h]

                if ltype == "split_2" and len(hwnds) >= 2:
                    self.split_2_windows(hwnds[0], hwnds[1], ratio=r)
                    return {"status": "success", "message": f"Split screen arranged for {apps[0]} & {apps[1]} via Spatial AI."}
                elif "split_3" in ltype and len(hwnds) >= 3:
                    mode = "columns" if "columns" in ltype else "master_stack"
                    self.split_3_windows(hwnds[0], hwnds[1], hwnds[2], layout=mode)
                    return {"status": "success", "message": f"3-Way {mode} layout arranged for {', '.join(apps[:3])} via Spatial AI."}
                elif ltype == "zen":
                    self.apply_zen_mode(apps[0] if apps else None)
                    return {"status": "success", "message": "Zen Mode applied via Spatial AI."}
                elif ltype == "spotlight":
                    self.spotlight_window(apps[0] if apps else None)
                    return {"status": "success", "message": "Spotlight Mode applied via Spatial AI."}
        except Exception as e:
            print(f"[MetaOS] LLM reasoning note: {e}")

        # Default fallback: Tile open windows
        self.tile_windows()
        return {"status": "success", "message": "Tiled all open desktop windows into grid."}

class RuleEngine:
    def __init__(self, meta_os_instance):
        self.rules = []
        self.running = False
        self.thread = None
        self.meta_os = meta_os_instance
        self.last_battery = get_battery_percentage()

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)

    def add_rule(self, rule):
        rule['id'] = len(self.rules) + 1
        self.rules.append(rule)
        return rule

    def remove_rule(self, rule_id):
        self.rules = [r for r in self.rules if r.get('id') != rule_id]

    def _loop(self):
        while self.running:
            battery = get_battery_percentage()
            for rule in self.rules:
                trigger = rule.get('trigger', {})
                if trigger.get('type') == 'battery':
                    val = int(trigger.get('value', 0))
                    op = trigger.get('operator', '<')
                    triggered = False
                    if op == '<' and battery < val and self.last_battery >= val:
                        triggered = True
                    elif op == '>' and battery > val and self.last_battery <= val:
                        triggered = True
                    if triggered:
                        print(f"[RuleEngine] Triggered: Battery is {battery}% {op} {val}")
                        self._execute_action(rule.get('action'))
            self.last_battery = battery
            time.sleep(5)

    def _execute_action(self, action):
        if action == 'zen_mode':
            self.meta_os.apply_zen_mode()
        elif action == 'tile_windows':
            self.meta_os.tile_windows()
        elif action == 'restore_windows':
            self.meta_os.restore_all()

meta_engine = MetaOS()
rule_engine = RuleEngine(meta_engine)
rule_engine.start()
