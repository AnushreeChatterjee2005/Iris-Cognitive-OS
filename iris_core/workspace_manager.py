"""
IRIS Core: Desktop App Arrangement & Workspace Manager
Handles SQLite workspace persistence, running/installed application discovery,
current desktop layout capture, pixel-perfect multi-monitor window positioning,
and deterministic natural-language workspace agent orchestration.
"""

import os
import sys
import time
import json
import uuid
import re
import glob
import subprocess
import sqlite3
import ctypes
from ctypes import wintypes
from typing import List, Dict, Any, Optional

import win32gui
import win32con
import win32api
import win32process
import psutil

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

import win32_engine

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "iris_timeline.sqlite")

# Built-in Default Workspaces Templates
DEFAULT_WORKSPACES = [
    {
        "id": "ws-coding-default",
        "name": "Coding",
        "description": "Full-stack development environment with VS Code, Google Chrome, and Windows Terminal.",
        "icon": "Code",
        "color": "#00E5FF",
        "startupEnabled": 0,
        "layoutPreset": "split_3_master",
        "splitRatio": 0.60,
        "applications": [
            {
                "id": "app-code-1",
                "name": "Visual Studio Code",
                "appIdentifier": "vscode",
                "executablePath": "code",
                "windowIdentifier": "visual studio code",
                "monitor": 0,
                "x": 0.0,
                "y": 0.0,
                "width": 0.60,
                "height": 1.0,
                "state": "normal",
                "order": 1,
                "color": "#007ACC"
            },
            {
                "id": "app-chrome-1",
                "name": "Google Chrome",
                "appIdentifier": "chrome",
                "executablePath": "chrome",
                "windowIdentifier": "chrome",
                "monitor": 0,
                "x": 0.60,
                "y": 0.0,
                "width": 0.40,
                "height": 0.50,
                "state": "normal",
                "order": 2,
                "color": "#4285F4"
            },
            {
                "id": "app-terminal-1",
                "name": "Windows Terminal",
                "appIdentifier": "terminal",
                "executablePath": "wt",
                "windowIdentifier": "terminal",
                "monitor": 0,
                "x": 0.60,
                "y": 0.50,
                "width": 0.40,
                "height": 0.50,
                "state": "normal",
                "order": 3,
                "color": "#107C41"
            }
        ]
    },
    {
        "id": "ws-college-default",
        "name": "College / Study",
        "description": "Side-by-side study workspace with Browser research and Notepad for lecture notes.",
        "icon": "BookOpen",
        "color": "#A855F7",
        "startupEnabled": 0,
        "layoutPreset": "split_2",
        "splitRatio": 0.50,
        "applications": [
            {
                "id": "app-study-browser",
                "name": "Google Chrome",
                "appIdentifier": "chrome",
                "executablePath": "chrome",
                "windowIdentifier": "chrome",
                "monitor": 0,
                "x": 0.0,
                "y": 0.0,
                "width": 0.50,
                "height": 1.0,
                "state": "normal",
                "order": 1,
                "color": "#4285F4"
            },
            {
                "id": "app-study-notes",
                "name": "Notepad",
                "appIdentifier": "notepad",
                "executablePath": "notepad.exe",
                "windowIdentifier": "notepad",
                "monitor": 0,
                "x": 0.50,
                "y": 0.0,
                "width": 0.50,
                "height": 1.0,
                "state": "normal",
                "order": 2,
                "color": "#06B6D4"
            }
        ]
    },
    {
        "id": "ws-work-default",
        "name": "Work & Communication",
        "description": "Triple-column workspace for Slack/Discord team comms, Browser dashboard, and VS Code.",
        "icon": "Briefcase",
        "color": "#10B981",
        "startupEnabled": 0,
        "layoutPreset": "split_3_columns",
        "splitRatio": 0.33,
        "applications": [
            {
                "id": "app-work-slack",
                "name": "Discord / Slack",
                "appIdentifier": "discord",
                "executablePath": "discord",
                "windowIdentifier": "discord",
                "monitor": 0,
                "x": 0.0,
                "y": 0.0,
                "width": 0.30,
                "height": 1.0,
                "state": "normal",
                "order": 1,
                "color": "#5865F2"
            },
            {
                "id": "app-work-browser",
                "name": "Google Chrome",
                "appIdentifier": "chrome",
                "executablePath": "chrome",
                "windowIdentifier": "chrome",
                "monitor": 0,
                "x": 0.30,
                "y": 0.0,
                "width": 0.40,
                "height": 1.0,
                "state": "normal",
                "order": 2,
                "color": "#4285F4"
            },
            {
                "id": "app-work-code",
                "name": "Visual Studio Code",
                "appIdentifier": "vscode",
                "executablePath": "code",
                "windowIdentifier": "visual studio code",
                "monitor": 0,
                "x": 0.70,
                "y": 0.0,
                "width": 0.30,
                "height": 1.0,
                "state": "normal",
                "order": 3,
                "color": "#007ACC"
            }
        ]
    },
    {
        "id": "ws-research-default",
        "name": "Deep Research",
        "description": "Wide 65/35 split screen for intensive documentation reading and live note taking.",
        "icon": "Search",
        "color": "#F59E0B",
        "startupEnabled": 0,
        "layoutPreset": "split_2",
        "splitRatio": 0.65,
        "applications": [
            {
                "id": "app-res-chrome",
                "name": "Google Chrome",
                "appIdentifier": "chrome",
                "executablePath": "chrome",
                "windowIdentifier": "chrome",
                "monitor": 0,
                "x": 0.0,
                "y": 0.0,
                "width": 0.65,
                "height": 1.0,
                "state": "normal",
                "order": 1,
                "color": "#4285F4"
            },
            {
                "id": "app-res-notes",
                "name": "Notepad / Notes",
                "appIdentifier": "notepad",
                "executablePath": "notepad.exe",
                "windowIdentifier": "notepad",
                "monitor": 0,
                "x": 0.65,
                "y": 0.0,
                "width": 0.35,
                "height": 1.0,
                "state": "normal",
                "order": 2,
                "color": "#06B6D4"
            }
        ]
    }
]

class WorkspaceManager:
    def __init__(self, db_path: str = DB_FILE):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initializes SQLite schema and seeds default workspaces if empty."""
        conn = self._get_connection()
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                color TEXT,
                startupEnabled INTEGER DEFAULT 0,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL,
                lastUsed INTEGER,
                layoutPreset TEXT,
                splitRatio REAL,
                applications TEXT NOT NULL
            )
        """)
        conn.commit()

        # Check if table is empty, seed defaults
        c.execute("SELECT COUNT(*) FROM workspaces")
        count = c.fetchone()[0]
        if count == 0:
            now = int(time.time() * 1000)
            for idx, ws in enumerate(DEFAULT_WORKSPACES):
                c.execute("""
                    INSERT INTO workspaces (id, name, description, icon, color, startupEnabled, createdAt, updatedAt, lastUsed, layoutPreset, splitRatio, applications)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ws["id"],
                    ws["name"],
                    ws.get("description", ""),
                    ws.get("icon", "LayoutGrid"),
                    ws.get("color", "#00E5FF"),
                    ws.get("startupEnabled", 0),
                    now - (1000 * 60 * 60 * (idx + 1)),
                    now,
                    now - (1000 * 60 * 30 * (idx + 1)),
                    ws.get("layoutPreset", "custom"),
                    ws.get("splitRatio", 0.5),
                    json.dumps(ws.get("applications", []))
                ))
            conn.commit()
            print(f"[WorkspaceManager] Seeded {len(DEFAULT_WORKSPACES)} default workspaces.")

        conn.close()

    # --- CRUD PERSISTENCE METHODS ---

    def list_workspaces(self) -> List[Dict[str, Any]]:
        """Returns all workspaces ordered by updatedAt / lastUsed."""
        conn = self._get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM workspaces ORDER BY updatedAt DESC")
        rows = c.fetchall()
        conn.close()

        workspaces = []
        for r in rows:
            workspaces.append({
                "id": r["id"],
                "name": r["name"],
                "description": r["description"] or "",
                "icon": r["icon"] or "LayoutGrid",
                "color": r["color"] or "#00E5FF",
                "startupEnabled": bool(r["startupEnabled"]),
                "createdAt": r["createdAt"],
                "updatedAt": r["updatedAt"],
                "lastUsed": r["lastUsed"],
                "layoutPreset": r["layoutPreset"] or "custom",
                "splitRatio": r["splitRatio"] or 0.5,
                "applications": json.loads(r["applications"]) if r["applications"] else []
            })
        return workspaces

    def get_workspace(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        """Gets a single workspace by ID or fuzzy name match."""
        conn = self._get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
        r = c.fetchone()
        if not r:
            # Try fuzzy match on name
            c.execute("SELECT * FROM workspaces WHERE LOWER(name) LIKE ? LIMIT 1", (f"%{workspace_id.lower().strip()}%",))
            r = c.fetchone()
        conn.close()

        if not r:
            return None

        return {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"] or "",
            "icon": r["icon"] or "LayoutGrid",
            "color": r["color"] or "#00E5FF",
            "startupEnabled": bool(r["startupEnabled"]),
            "createdAt": r["createdAt"],
            "updatedAt": r["updatedAt"],
            "lastUsed": r["lastUsed"],
            "layoutPreset": r["layoutPreset"] or "custom",
            "splitRatio": r["splitRatio"] or 0.5,
            "applications": json.loads(r["applications"]) if r["applications"] else []
        }

    def create_workspace(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Creates a new workspace."""
        ws_id = data.get("id") or f"ws-{uuid.uuid4().hex[:8]}"
        now = int(time.time() * 1000)
        name = data.get("name") or "New Workspace"
        description = data.get("description", "")
        icon = data.get("icon", "LayoutGrid")
        color = data.get("color", "#00E5FF")
        startup_enabled = 1 if data.get("startupEnabled") else 0
        layout_preset = data.get("layoutPreset", "custom")
        split_ratio = float(data.get("splitRatio", 0.5))
        apps = data.get("applications", [])

        # If startup is enabled, disable startup on all other workspaces
        conn = self._get_connection()
        c = conn.cursor()
        if startup_enabled:
            c.execute("UPDATE workspaces SET startupEnabled = 0")

        c.execute("""
            INSERT OR REPLACE INTO workspaces (id, name, description, icon, color, startupEnabled, createdAt, updatedAt, lastUsed, layoutPreset, splitRatio, applications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ws_id,
            name,
            description,
            icon,
            color,
            startup_enabled,
            data.get("createdAt", now),
            now,
            data.get("lastUsed", now),
            layout_preset,
            split_ratio,
            json.dumps(apps)
        ))
        conn.commit()
        conn.close()

        return self.get_workspace(ws_id)

    def update_workspace(self, workspace_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Updates an existing workspace."""
        existing = self.get_workspace(workspace_id)
        if not existing:
            return None

        now = int(time.time() * 1000)
        name = data.get("name", existing["name"])
        description = data.get("description", existing["description"])
        icon = data.get("icon", existing["icon"])
        color = data.get("color", existing["color"])
        startup_enabled = 1 if data.get("startupEnabled", existing["startupEnabled"]) else 0
        layout_preset = data.get("layoutPreset", existing["layoutPreset"])
        split_ratio = float(data.get("splitRatio", existing["splitRatio"]))
        apps = data.get("applications", existing["applications"])

        conn = self._get_connection()
        c = conn.cursor()
        if startup_enabled and not existing["startupEnabled"]:
            c.execute("UPDATE workspaces SET startupEnabled = 0 WHERE id != ?", (existing["id"],))

        c.execute("""
            UPDATE workspaces
            SET name = ?, description = ?, icon = ?, color = ?, startupEnabled = ?, updatedAt = ?, layoutPreset = ?, splitRatio = ?, applications = ?
            WHERE id = ?
        """, (
            name,
            description,
            icon,
            color,
            startup_enabled,
            now,
            layout_preset,
            split_ratio,
            json.dumps(apps),
            existing["id"]
        ))
        conn.commit()
        conn.close()

        return self.get_workspace(existing["id"])

    def delete_workspace(self, workspace_id: str) -> bool:
        """Deletes a workspace."""
        conn = self._get_connection()
        c = conn.cursor()
        c.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
        deleted = c.rowcount > 0
        conn.commit()
        conn.close()
        return deleted

    def duplicate_workspace(self, workspace_id: str, new_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Duplicates an existing workspace."""
        source = self.get_workspace(workspace_id)
        if not source:
            return None

        dup_name = new_name or f"{source['name']} (Copy)"
        dup_data = dict(source)
        dup_data["id"] = f"ws-{uuid.uuid4().hex[:8]}"
        dup_data["name"] = dup_name
        dup_data["startupEnabled"] = False
        dup_data["createdAt"] = int(time.time() * 1000)
        dup_data["updatedAt"] = int(time.time() * 1000)

        # Deep copy app IDs so they are unique
        apps_copy = []
        for app in source.get("applications", []):
            ac = dict(app)
            ac["id"] = f"app-{uuid.uuid4().hex[:6]}"
            apps_copy.append(ac)
        dup_data["applications"] = apps_copy

        return self.create_workspace(dup_data)

    def set_startup_workspace(self, workspace_id: str, enabled: bool) -> bool:
        """Designates or removes a workspace as the system startup workspace."""
        conn = self._get_connection()
        c = conn.cursor()
        if enabled:
            # Disable all other startup workspaces first
            c.execute("UPDATE workspaces SET startupEnabled = 0")
            c.execute("UPDATE workspaces SET startupEnabled = 1 WHERE id = ?", (workspace_id,))
        else:
            c.execute("UPDATE workspaces SET startupEnabled = 0 WHERE id = ?", (workspace_id,))
        conn.commit()
        conn.close()
        return True

    def get_startup_workspace(self) -> Optional[Dict[str, Any]]:
        """Returns the designated startup workspace if any."""
        conn = self._get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM workspaces WHERE startupEnabled = 1 LIMIT 1")
        r = c.fetchone()
        conn.close()
        if not r:
            return None
        return self.get_workspace(r["id"])

    # --- APPLICATION DISCOVERY LAYER ---

    def get_available_applications(self) -> Dict[str, Any]:
        """
        Discovers all currently running desktop applications and installed system applications.
        Returns detailed list with appIdentifier, names, icons, executable paths, and running state.
        """
        win32_engine.ensure_interactive_desktop()

        desktop_windows = win32_engine.get_all_desktop_windows()
        running_apps = []
        running_names_set = set()

        for win in desktop_windows:
            title = win["title"]
            cls = win["class"]
            pname = win["pname"]
            exe_path = win["exe"]
            rect = win["rect"]
            hwnd = win["hwnd"]

            # Filter out desktop background wallpaper and internal IRIS Electron window
            if cls in ['Progman', 'WorkerW', 'Shell_TrayWnd'] or title in ['Program Manager', '']:
                continue
            if pname in ['electron.exe', 'iris.exe'] and ('hackathon-iris' in title.lower() or 'iris' in title.lower()):
                continue

            friendly_name = self._resolve_friendly_name(title, cls, pname)
            running_names_set.add(friendly_name.lower())
            p_base = pname.replace(".exe", "").lower()
            if p_base:
                running_names_set.add(p_base)

            # Assign accurate app identifier for instant matching
            p_clean = pname.lower().replace(".exe", "")
            app_id = p_clean
            if "chrome" in p_clean:
                app_id = "chrome"
            elif "code" in p_clean or "antigravity" in p_clean:
                app_id = "code"
            elif "notepad" in p_clean:
                app_id = "notepad"
            elif "terminal" in p_clean or "wt" in p_clean:
                app_id = "terminal"

            running_apps.append({
                "hwnd": hwnd,
                "appIdentifier": app_id,
                "name": friendly_name,
                "windowTitle": title,
                "windowClass": cls,
                "processName": pname,
                "executablePath": exe_path or pname,
                "isRunning": True,
                "rect": {"x": rect[0], "y": rect[1], "width": rect[2], "height": rect[3]}
            })

        # Deduplicate running apps by friendly name
        unique_running = []
        seen_running = set()
        for app in running_apps:
            key = app["name"].lower()
            if key not in seen_running:
                seen_running.add(key)
                unique_running.append(app)

        # Discover Installed Applications from Start Menu & Registry & APP_REGISTRY
        installed_apps = []
        seen_installed = set()

        # 1. From win32_engine APP_REGISTRY
        for key, reg_data in win32_engine.APP_REGISTRY.items():
            disp_name = key.title()
            if key == "vscode":
                disp_name = "Visual Studio Code"
            elif key == "chrome":
                disp_name = "Google Chrome"
            elif key == "terminal":
                disp_name = "Windows Terminal"

            installed_apps.append({
                "appIdentifier": key,
                "name": disp_name,
                "executablePath": reg_data.get("exec_commands", [key])[0].replace("start ", ""),
                "isRunning": disp_name.lower() in running_names_set or key in running_names_set,
                "category": "Productivity"
            })
            seen_installed.add(disp_name.lower())

        # 2. From Start Menu .lnk shortcuts
        start_dirs = [
            os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
            os.path.join(os.environ.get("PROGRAMDATA", ""), r"Microsoft\Windows\Start Menu\Programs")
        ]
        for sdir in start_dirs:
            if os.path.exists(sdir):
                for root, _, files in os.walk(sdir):
                    for f in files:
                        if f.lower().endswith(".lnk"):
                            shortcut_name = os.path.splitext(f)[0].strip()
                            # Filter out uninstallers and utilities
                            s_lower = shortcut_name.lower()
                            if any(k in s_lower for k in ["uninstall", "help", "readme", "documentation", "settings", "installer"]):
                                continue
                            if s_lower not in seen_installed and len(shortcut_name) > 2:
                                seen_installed.add(s_lower)
                                installed_apps.append({
                                    "appIdentifier": s_lower.replace(" ", "_"),
                                    "name": shortcut_name,
                                    "executablePath": os.path.join(root, f),
                                    "isRunning": s_lower in running_names_set,
                                    "category": "Installed"
                                })

        return {
            "running": unique_running,
            "installed": installed_apps,
            "monitors": self.get_monitors()
        }

    def _resolve_friendly_name(self, title: str, cls: str, pname: str) -> str:
        """Produces a clean, human-recognizable name for windows without misidentifying Electron apps."""
        p_clean = pname.lower().replace(".exe", "").strip()
        t_lower = title.lower().strip()
        cls_lower = cls.lower().strip()

        # 1. Process name explicit matching
        if p_clean in ["chrome", "google chrome"]:
            return "Google Chrome"
        if p_clean in ["code", "vscode"] or "visual studio code" in t_lower:
            return "Visual Studio Code"
        if p_clean in ["antigravity", "antigravity ide"]:
            return "Visual Studio Code"
        if p_clean in ["cursor"]:
            return "Cursor"
        if p_clean in ["wispr flow", "wisprflow"]:
            return "Wispr Flow"
        if p_clean in ["notepad"]:
            return "Notepad"
        if p_clean in ["windowsterminal", "wt", "powershell", "pwsh", "cmd"]:
            return "Windows Terminal"
        if p_clean in ["discord"]:
            return "Discord"
        if p_clean in ["slack"]:
            return "Slack"
        if p_clean in ["spotify"]:
            return "Spotify"
        if p_clean in ["excel"]:
            return "Microsoft Excel"
        if p_clean in ["winword"]:
            return "Microsoft Word"
        if p_clean in ["powerpnt"]:
            return "Microsoft PowerPoint"
        if p_clean in ["onenote", "onenotem"]:
            return "Microsoft OneNote"
        if p_clean in ["obsidian"]:
            return "Obsidian"
        if p_clean in ["notion"]:
            return "Notion"
        if p_clean in ["figma"]:
            return "Figma"
        if p_clean in ["msedge", "edge"]:
            return "Microsoft Edge"
        if p_clean in ["brave"]:
            return "Brave Browser"
        if p_clean in ["firefox"]:
            return "Mozilla Firefox"
        if p_clean in ["explorer"]:
            return "File Explorer"
        if p_clean in ["applicationframehost"]:
            if "settings" in t_lower:
                return "Windows Settings"
            if "calculator" in t_lower or "calc" in t_lower:
                return "Calculator"
            return title.strip() or "Windows App"
        if "cmdpal" in p_clean:
            return "Command Palette"

        # 2. Window Class matching (only specific non-generic classes)
        if "xlmain" in cls_lower:
            return "Microsoft Excel"
        if "cabinetwclass" in cls_lower:
            return "File Explorer"
        if "notepad" in cls_lower:
            return "Notepad"
        if "cascadia_hosting_window_class" in cls_lower or "consolewindowclass" in cls_lower:
            return "Windows Terminal"

        # 3. Window title matching
        if "google chrome" in t_lower:
            return "Google Chrome"
        if "visual studio code" in t_lower or "antigravity ide" in t_lower:
            return "Visual Studio Code"
        if "discord" in t_lower:
            return "Discord"
        if "slack" in t_lower:
            return "Slack"
        if "spotify" in t_lower:
            return "Spotify"
        if "notion" in t_lower:
            return "Notion"
        if "obsidian" in t_lower:
            return "Obsidian"
        if "figma" in t_lower:
            return "Figma"

        # 4. Fallback to clean trimmed window title or process name
        clean_title = title.split(" - ")[-1].split(" – ")[-1].strip()
        if len(clean_title) > 2 and not clean_title.isdigit():
            return clean_title[:30]
        return p_clean.replace("_", " ").title() if p_clean else (title[:30] or "Application")

    # --- MULTI-MONITOR DETECTION ---

    def get_monitors(self) -> List[Dict[str, Any]]:
        """Returns all connected display monitors with accurate WorkArea metrics."""
        win32_engine.ensure_interactive_desktop()
        monitors = []
        try:
            enum_monitors = win32api.EnumDisplayMonitors()
            for idx, m in enumerate(enum_monitors):
                info = win32api.GetMonitorInfo(m[0])
                mon_rect = info.get("Monitor", (0, 0, 1920, 1080))
                work_rect = info.get("Work", mon_rect)
                is_primary = bool(info.get("Flags", 0) & win32con.MONITORINFOF_PRIMARY)
                
                monitors.append({
                    "index": idx,
                    "isPrimary": is_primary,
                    "device": info.get("Device", f"Display {idx+1}"),
                    "bounds": {
                        "x": mon_rect[0],
                        "y": mon_rect[1],
                        "width": mon_rect[2] - mon_rect[0],
                        "height": mon_rect[3] - mon_rect[1]
                    },
                    "workArea": {
                        "x": work_rect[0],
                        "y": work_rect[1],
                        "width": work_rect[2] - work_rect[0],
                        "height": work_rect[3] - work_rect[1]
                    }
                })
        except Exception as e:
            print(f"[WorkspaceManager] EnumDisplayMonitors error: {e}")
            # Fallback primary monitor
            sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
            sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
            monitors.append({
                "index": 0,
                "isPrimary": True,
                "device": "Display 1",
                "bounds": {"x": 0, "y": 0, "width": sw, "height": sh},
                "workArea": {"x": 0, "y": 0, "width": sw, "height": sh - 48}
            })
        return monitors

    # --- CAPTURE CURRENT DESKTOP LAYOUT ---

    def capture_current_layout(self, workspace_name: str = "Captured Desktop Layout") -> Dict[str, Any]:
        """
        Scans all active, visible, non-minimized desktop application windows,
        calculates normalized percentage positions relative to their assigned monitor work area,
        and constructs a ready-to-save Workspace object.
        """
        win32_engine.ensure_interactive_desktop()
        monitors = self.get_monitors()
        primary_mon = monitors[0] if monitors else {"workArea": {"x": 0, "y": 0, "width": 1920, "height": 1040}}

        desktop_windows = win32_engine.get_all_desktop_windows()
        captured_apps = []
        order = 1

        for win in desktop_windows:
            if win.get("is_min"):
                continue

            hwnd = win["hwnd"]
            title = win["title"]
            cls = win["class"]
            pname = win["pname"]
            exe_path = win["exe"]
            wx, wy, ww, wh = win["rect"]

            # Filter out desktop background wallpaper and internal IRIS Electron window
            if cls in ['Progman', 'WorkerW', 'Shell_TrayWnd'] or title in ['Program Manager', '']:
                continue
            if pname in ['electron.exe', 'iris.exe'] and ('hackathon-iris' in title.lower() or 'iris' in title.lower()):
                continue

            # Match window to monitor
            assigned_mon_idx = 0
            mon_work = primary_mon["workArea"]
            for m in monitors:
                m_area = m["bounds"]
                cx = wx + (ww // 2)
                cy = wy + (wh // 2)
                if (m_area["x"] <= cx <= m_area["x"] + m_area["width"] and
                    m_area["y"] <= cy <= m_area["y"] + m_area["height"]):
                    assigned_mon_idx = m["index"]
                    mon_work = m["workArea"]
                    break

            # Normalize coordinates (0.0 to 1.0)
            norm_x = max(0.0, min(1.0, (wx - mon_work["x"]) / max(1, mon_work["width"])))
            norm_y = max(0.0, min(1.0, (wy - mon_work["y"]) / max(1, mon_work["height"])))
            norm_w = max(0.1, min(1.0, ww / max(1, mon_work["width"])))
            norm_h = max(0.1, min(1.0, wh / max(1, mon_work["height"])))

            # Check if maximized
            is_max = win.get("is_max") or (norm_w >= 0.95 and norm_h >= 0.95)
            state = "maximized" if is_max else "normal"

            friendly_name = self._resolve_friendly_name(title, cls, pname)
            app_ident = pname.replace(".exe", "") or friendly_name.lower().replace(" ", "_")

            captured_apps.append({
                "id": f"app-{uuid.uuid4().hex[:6]}",
                "name": friendly_name,
                "appIdentifier": app_ident,
                "executablePath": exe_path or pname,
                "windowIdentifier": title,
                "windowClass": cls,
                "monitor": assigned_mon_idx,
                "x": round(norm_x, 3),
                "y": round(norm_y, 3),
                "width": round(norm_w, 3),
                "height": round(norm_h, 3),
                "state": state,
                "order": order,
                "color": self._get_app_color(friendly_name)
            })
            order += 1

        now = int(time.time() * 1000)
        return {
            "id": f"ws-captured-{uuid.uuid4().hex[:8]}",
            "name": workspace_name,
            "description": f"Captured snapshot of {len(captured_apps)} running windows.",
            "icon": "Camera",
            "color": "#10B981",
            "startupEnabled": False,
            "createdAt": now,
            "updatedAt": now,
            "lastUsed": now,
            "layoutPreset": "custom",
            "splitRatio": 0.5,
            "applications": captured_apps
        }

    def _get_app_color(self, name: str) -> str:
        name_lower = name.lower()
        if "code" in name_lower or "vs" in name_lower:
            return "#007ACC"
        if "chrome" in name_lower:
            return "#4285F4"
        if "terminal" in name_lower or "powershell" in name_lower:
            return "#107C41"
        if "discord" in name_lower:
            return "#5865F2"
        if "slack" in name_lower:
            return "#4A154B"
        if "spotify" in name_lower:
            return "#1DB954"
        if "notepad" in name_lower:
            return "#06B6D4"
        if "excel" in name_lower:
            return "#107C41"
        return "#8B5CF6"

    # --- WINDOW ORCHESTRATION & LAYOUT RESTORATION ---

    def open_workspace(self, workspace_id_or_name: str, thought_callback=None) -> Dict[str, Any]:
        """
        Orchestrates full physical desktop workspace restoration:
        1. Resolves workspace definition.
        2. Discovers monitors (falls back to primary if saved monitor is missing).
        3. Identifies required applications; launches missing ones without duplicate instances.
        4. Waits for application windows to be ready.
        5. Restores windows from minimized/maximized state via SW_RESTORE.
        6. Positions and resizes windows precisely to saved normalized coordinates.
        7. Brings windows to foreground in proper Z-order.
        8. Updates lastUsed timestamp.
        """
        ws = self.get_workspace(workspace_id_or_name)
        if not ws:
            return {
                "success": False,
                "message": f"Workspace '{workspace_id_or_name}' not found."
            }

        win32_engine.ensure_interactive_desktop()
        monitors = self.get_monitors()
        primary_mon = monitors[0] if monitors else {"workArea": {"x": 0, "y": 0, "width": 1920, "height": 1040}}

        apps = ws.get("applications", [])
        if not apps:
            return {
                "success": True,
                "message": f"Workspace '{ws['name']}' has no configured applications.",
                "appsRestored": 0
            }

        if thought_callback:
            thought_callback(f"Opening '{ws['name']}' workspace ({len(apps)} apps)...")

        restored_results = []
        user32 = ctypes.windll.user32

        # Sort applications by order
        sorted_apps = sorted(apps, key=lambda a: a.get("order", 1))

        for app_spec in sorted_apps:
            app_name = app_spec.get("name", "Application")
            mon_idx = int(app_spec.get("monitor", 0))
            app_state = app_spec.get("state", "normal")

            # Select monitor or fallback
            target_mon = next((m for m in monitors if m["index"] == mon_idx), primary_mon)
            work_area = target_mon["workArea"]

            # Compute pixel targets from normalized coords
            nx = float(app_spec.get("x", 0.0))
            ny = float(app_spec.get("y", 0.0))
            nw = float(app_spec.get("width", 0.5))
            nh = float(app_spec.get("height", 1.0))

            target_px_x = int(work_area["x"] + round(nx * work_area["width"]))
            target_px_y = int(work_area["y"] + round(ny * work_area["height"]))
            target_px_w = max(200, int(round(nw * work_area["width"])))
            target_px_h = max(150, int(round(nh * work_area["height"])))

            # Prevent bottom border from ever slipping behind or below the Windows Taskbar / Start Menu
            max_avail_y = work_area["y"] + work_area["height"]
            if target_px_y + target_px_h >= max_avail_y - 8:
                target_px_h = max(150, max_avail_y - target_px_y - 8)

            # Find or launch application window HWND
            hwnd = self._find_or_launch_app_window(app_spec, thought_callback)

            if hwnd and win32gui.IsWindow(hwnd):
                try:
                    # Determine target window state
                    is_full_max = app_state == "maximized" or (nw >= 0.98 and nh >= 0.98)
                    target_state = "maximized" if is_full_max else "normal"

                    # Apply robust multi-pass position & size engine
                    positioned = win32_engine.position_and_size_window(
                        hwnd,
                        target_px_x,
                        target_px_y,
                        target_px_w,
                        target_px_h,
                        state=target_state
                    )

                    if positioned:
                        # Bring to front in proper Z-order
                        win32_engine.bring_window_to_front(hwnd)
                        restored_results.append({
                            "name": app_name,
                            "status": "positioned",
                            "hwnd": hwnd,
                            "bounds": {"x": target_px_x, "y": target_px_y, "width": target_px_w, "height": target_px_h}
                        })
                    else:
                        restored_results.append({"name": app_name, "status": "failed_position", "error": "position_and_size_window failed"})
                except Exception as e:
                    print(f"[WorkspaceManager] Error positioning {app_name} (HWND: {hwnd}): {e}")
                    restored_results.append({"name": app_name, "status": "failed_position", "error": str(e)})
            else:
                restored_results.append({"name": app_name, "status": "window_not_found"})

        # Update lastUsed in database
        now = int(time.time() * 1000)
        conn = self._get_connection()
        c = conn.cursor()
        c.execute("UPDATE workspaces SET lastUsed = ? WHERE id = ?", (now, ws["id"]))
        conn.commit()
        conn.close()

        success_count = sum(1 for r in restored_results if r.get("status") == "positioned")
        return {
            "success": success_count > 0,
            "workspaceId": ws["id"],
            "workspaceName": ws["name"],
            "appsTotal": len(apps),
            "appsRestored": success_count,
            "details": restored_results,
            "message": f"Opened '{ws['name']}' workspace ({success_count}/{len(apps)} apps arranged)." if success_count > 0 else f"No running application windows found for '{ws['name']}'."
        }

    def _find_or_launch_app_window(self, app_spec: Dict[str, Any], thought_callback=None) -> int:
        """Locates an existing window matching the app or launches it cleanly and waits for its HWND."""
        name = app_spec.get("name", "")
        ident = app_spec.get("appIdentifier", "")
        exe = app_spec.get("executablePath", "")
        win_ident = app_spec.get("windowIdentifier", "")

        # Pass 1: Check if already open
        search_terms = [t for t in [ident, name, win_ident, exe] if t]
        for term in search_terms:
            hwnd = win32_engine.find_window_by_name(term, must_be_visible=True)
            if hwnd:
                return hwnd

        # Pass 2: Launch the application cleanly
        if thought_callback:
            thought_callback(f"Launching {name}...")

        launched = False

        # Try executable path first if valid local file
        if exe and os.path.exists(exe):
            try:
                os.startfile(exe)
                launched = True
            except Exception:
                try:
                    subprocess.Popen([exe], shell=True)
                    launched = True
                except Exception:
                    pass

        # Check known common paths for standard desktop apps
        if not launched:
            ident_clean = (ident or name).lower()
            known_locations = []
            if "chrome" in ident_clean:
                known_locations = [
                    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
                ]
            elif "edge" in ident_clean:
                known_locations = [
                    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
                ]

            for loc in known_locations:
                if os.path.exists(loc):
                    try:
                        subprocess.Popen([loc])
                        launched = True
                        break
                    except Exception:
                        pass

        # Try resolver via win32_engine
        if not launched:
            res = win32_engine.resolve_and_open_app(ident or name, thought_callback=thought_callback)
            if res.get("hwnd"):
                return res["hwnd"]

        # Wait up to 3.5 seconds for window to spawn and register
        for _ in range(15):
            time.sleep(0.2)
            for term in search_terms:
                hwnd = win32_engine.find_window_by_name(term, must_be_visible=True)
                if hwnd:
                    return hwnd

        return 0

    def open_workspace_in_parallel(self, workspace_id_or_name: str) -> Dict[str, Any]:
        """
        Launches all applications of a workspace specifically inside the IRIS Parallel Desktop.
        """
        ws = self.get_workspace(workspace_id_or_name)
        if not ws:
            return {
                "success": False,
                "message": f"Workspace '{workspace_id_or_name}' not found."
            }

        try:
            from parallel_desktop_engine import parallel_engine
            apps = ws.get("applications", [])
            for app in apps:
                ident = app.get("appIdentifier") or app.get("name", "chrome")
                parallel_engine.launch_process_in_desktop(ident)

            return {
                "success": True,
                "message": f"Workspace '{ws['name']}' opened inside Parallel Desktop.",
                "appsRestored": len(apps),
                "workspace": ws
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error launching parallel workspace: {e}"
            }

    # --- NATURAL LANGUAGE AGENT INTEGRATION ---

    def execute_nl_command(self, command: str) -> Dict[str, Any]:
        """
        Parses natural language workspace intents:
        - "Open my Coding workspace"
        - "Launch my college setup"
        - "Switch to Work workspace"
        - "What workspaces do I have?" / "List my workspaces"
        - "Create a workspace called Gaming with Discord, Chrome and Spotify"
        - "Add Terminal to my Coding workspace"
        - "Remove Chrome from my Research workspace"
        - "Make my Coding workspace open automatically when I start my laptop"
        - "Save current layout as [Name]"
        - "Duplicate Coding workspace"
        - "Delete my Gaming workspace"
        """
        cmd_lower = command.lower().strip()
        print(f"[WorkspaceManager] Parsing NL workspace command: '{command}'")

        # 1. List / Query Workspaces
        if any(k in cmd_lower for k in ["what workspaces", "list workspaces", "show workspaces", "my workspaces", "list my setups", "show all workspaces"]):
            workspaces = self.list_workspaces()
            if not workspaces:
                return {
                    "status": "success",
                    "action": "list_workspaces",
                    "message": "You don't have any workspaces saved yet. Say 'Save current layout as Coding' or use the Workspaces tab to create one!",
                    "workspaces": []
                }
            names = [f"**{ws['name']}** ({len(ws['applications'])} apps)" for ws in workspaces]
            return {
                "status": "success",
                "action": "list_workspaces",
                "message": f"You have {len(workspaces)} saved workspaces: {', '.join(names)}.",
                "workspaces": workspaces
            }

        # 2. Save / Capture Current Layout
        if any(k in cmd_lower for k in ["save current layout", "capture current layout", "save layout as", "capture desktop as", "save desktop as"]):
            # Extract name
            name_match = re.search(r'(?:as|called|named)\s+([a-zA-Z0-9_\- ]+)', command, re.IGNORECASE)
            name = name_match.group(1).strip() if name_match else "Captured Workspace"
            captured = self.capture_current_layout(workspace_name=name)
            saved = self.create_workspace(captured)
            return {
                "status": "success",
                "action": "save_current_layout",
                "workspace": saved,
                "message": f"Captured current desktop layout and saved as **{saved['name']}** with {len(saved['applications'])} apps."
            }

        # 3. Startup Workspace Toggle
        if any(k in cmd_lower for k in ["open automatically", "start automatically", "startup workspace", "when i start my laptop", "on startup", "on boot"]):
            workspaces = self.list_workspaces()
            target_ws = None
            for ws in workspaces:
                if ws["name"].lower() in cmd_lower:
                    target_ws = ws
                    break
            if not target_ws and workspaces:
                target_ws = workspaces[0]

            if target_ws:
                self.set_startup_workspace(target_ws["id"], enabled=True)
                return {
                    "status": "success",
                    "action": "set_workspace_startup",
                    "workspace": target_ws,
                    "message": f"**{target_ws['name']}** is now set to open automatically when you start your laptop."
                }

        # 4. Create Workspace (e.g. "Create a workspace called Gaming with Discord, Chrome and Spotify")
        if any(k in cmd_lower for k in ["create workspace", "create a workspace", "new workspace", "make a workspace", "build workspace"]):
            name_match = re.search(r'(?:called|named)\s+([a-zA-Z0-9_\-]+)', command, re.IGNORECASE)
            ws_name = name_match.group(1).title() if name_match else "Custom Workspace"

            # Detect apps in string
            known_apps = ["chrome", "vscode", "code", "terminal", "notepad", "discord", "slack", "spotify", "excel", "word", "obsidian", "notion", "figma"]
            apps_detected = []
            for a in known_apps:
                if a in cmd_lower:
                    apps_detected.append(a)

            if not apps_detected:
                apps_detected = ["chrome", "notepad"]

            apps_list = []
            num = len(apps_detected)
            split_w = 1.0 / max(1, num)
            for idx, a in enumerate(apps_detected):
                apps_list.append({
                    "id": f"app-{uuid.uuid4().hex[:6]}",
                    "name": a.title() if a != "vscode" else "Visual Studio Code",
                    "appIdentifier": a,
                    "executablePath": a,
                    "windowIdentifier": a,
                    "monitor": 0,
                    "x": round(idx * split_w, 2),
                    "y": 0.0,
                    "width": round(split_w, 2),
                    "height": 1.0,
                    "state": "normal",
                    "order": idx + 1,
                    "color": self._get_app_color(a)
                })

            new_ws = self.create_workspace({
                "name": ws_name,
                "description": f"Custom workspace with {', '.join(a.title() for a in apps_detected)}.",
                "layoutPreset": "split_2" if num == 2 else "split_3_columns" if num == 3 else "custom",
                "applications": apps_list
            })
            return {
                "status": "success",
                "action": "create_workspace",
                "workspace": new_ws,
                "message": f"Created workspace **{ws_name}** with {', '.join(a.title() for a in apps_detected)}."
            }

        # 5. Delete Workspace
        if any(k in cmd_lower for k in ["delete workspace", "remove workspace", "delete my workspace"]):
            workspaces = self.list_workspaces()
            for ws in workspaces:
                if ws["name"].lower() in cmd_lower:
                    self.delete_workspace(ws["id"])
                    return {
                        "status": "success",
                        "action": "delete_workspace",
                        "message": f"Deleted workspace **{ws['name']}**."
                    }

        # 6. Open / Launch / Switch Workspace (e.g. "Open my Coding workspace", "Launch college setup", "Switch to Work in background")
        is_parallel = any(k in cmd_lower for k in ["parallel", "background", "in the background", "without interrupting"])
        workspaces = self.list_workspaces()
        for ws in workspaces:
            name_clean = ws["name"].lower().replace("/", " ").replace("-", " ")
            keywords = [ws["name"].lower()] + [w for w in name_clean.split() if len(w) > 3]
            if any(k in cmd_lower for k in keywords):
                if is_parallel:
                    res = self.open_workspace_in_parallel(ws["id"])
                    return {
                        "status": "success",
                        "action": "open_parallel_workspace",
                        "workspace": ws,
                        "message": f"Opening **{ws['name']}** workspace inside the Parallel Desktop."
                    }
                res = self.open_workspace(ws["id"])
                return {
                    "status": "success",
                    "action": "open_workspace",
                    "workspace": ws,
                    "message": f"Opening **{ws['name']}** workspace... Restored {res.get('appsRestored', 0)} application window(s)."
                }

        # Fuzzy match on "open workspace [name]"
        match = re.search(r'(?:open|launch|switch to|restore)\s+(?:my\s+)?([a-zA-Z0-9_\- ]+?)(?:\s+workspace|\s+setup|\s+layout|$)', command, re.IGNORECASE)
        if match:
            target_name = match.group(1).strip().lower()
            for ws in workspaces:
                if target_name in ws["name"].lower() or ws["name"].lower() in target_name:
                    if is_parallel:
                        res = self.open_workspace_in_parallel(ws["id"])
                        return {
                            "status": "success",
                            "action": "open_parallel_workspace",
                            "workspace": ws,
                            "message": f"Opening **{ws['name']}** workspace inside the Parallel Desktop."
                        }
                    res = self.open_workspace(ws["id"])
                    return {
                        "status": "success",
                        "action": "open_workspace",
                        "workspace": ws,
                        "message": f"Opening **{ws['name']}** workspace... Restored {res.get('appsRestored', 0)} application window(s)."
                    }

        return {
            "status": "unknown",
            "message": "I didn't recognize that workspace command. Try saying 'Open my Coding workspace' or 'List my workspaces'."
        }

workspace_engine = WorkspaceManager()
