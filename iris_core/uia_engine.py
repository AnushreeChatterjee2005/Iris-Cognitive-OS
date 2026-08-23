"""
IRIS Core: Windows UI Automation (UIA) Engine
Provides deep accessibility tree inspection, direct COM pattern invocation
(SetValue, Invoke, SelectionItem), and semantic control mapping without mouse hijacking.
"""

import time
import win32gui
import win32con
import win32_engine

try:
    import uiautomation as auto
except ImportError:
    auto = None

def get_foreground_window_control():
    """Returns the UIAutomation Control for the active foreground window."""
    if not auto:
        return None
    win32_engine.ensure_interactive_desktop()
    try:
        return auto.GetForegroundControl()
    except Exception:
        return None

def get_window_control_by_name(keyword: str, max_depth: int = 2):
    """Finds a top-level window Control matching keyword."""
    if not auto or not keyword:
        return None
    win32_engine.ensure_interactive_desktop()
    try:
        root = auto.GetRootControl()
        for child in root.GetChildren():
            name = child.Name or ""
            cls = child.ClassName or ""
            if keyword.lower() in name.lower() or keyword.lower() in cls.lower():
                if "iris" not in name.lower():
                    return child
    except Exception:
        pass
    return None

def dump_actionable_controls(window_control, max_elements: int = 200):
    """
    Fast walk over the UI tree returning actionable controls
    (Buttons, Edits, Hyperlinks, Tabs, Documents, Menus, ComboBoxes, CheckBoxes).
    """
    elements = []
    if not auto or not window_control:
        return elements

    try:
        target_types = {
            auto.ControlType.ButtonControl: "Button",
            auto.ControlType.EditControl: "Edit",
            auto.ControlType.HyperlinkControl: "Hyperlink",
            auto.ControlType.MenuItemControl: "MenuItem",
            auto.ControlType.TabItemControl: "TabItem",
            auto.ControlType.ComboBoxControl: "ComboBox",
            auto.ControlType.CheckBoxControl: "CheckBox",
            auto.ControlType.RadioButtonControl: "RadioButton",
            auto.ControlType.DocumentControl: "Document",
            auto.ControlType.DataItemControl: "DataItem",
            auto.ControlType.ListItemControl: "ListItem"
        }

        for c in auto.WalkTree(window_control, maxDepth=10):
            ctrl_type = c.ControlType
            if ctrl_type in target_types:
                name = c.Name or ""
                auto_id = getattr(c, 'AutomationId', '') or ""
                val = ""
                try:
                    vp = c.GetValuePattern()
                    if vp:
                        val = vp.Value or ""
                except Exception:
                    pass

                elements.append({
                    "id": str(len(elements)),
                    "type": target_types[ctrl_type],
                    "control_type_code": ctrl_type,
                    "name": name,
                    "automation_id": auto_id,
                    "value": val,
                    "control": c,
                    "rect": c.BoundingRectangle
                })

            if len(elements) >= max_elements:
                break
    except Exception as e:
        print(f"[UIA] dump_actionable_controls error: {e}")

    return elements

def find_control_by_intent(window_control, intent_keyword: str, control_type_hint: str = None):
    """
    Finds the best matching UIA control for a semantic intent
    (e.g., 'search', 'email', 'submit', 'tab', 'close').
    """
    if not auto or not window_control:
        return None

    elements = dump_actionable_controls(window_control)
    if not elements:
        return None

    intent_lower = intent_keyword.lower().strip()
    is_search_intent = any(k in intent_lower for k in ["search", "find", "query", "lookup"])

    # 1. Exact Name / AutomationId match
    for elem in elements:
        name_lower = elem["name"].lower()
        auto_id_lower = elem["automation_id"].lower()
        
        if control_type_hint and control_type_hint.lower() not in elem["type"].lower():
            continue

        if intent_lower == name_lower or intent_lower == auto_id_lower:
            return elem

    # 2. Search Intent Priority (Edit box with search in name/id or wide horizontal edit box)
    if is_search_intent:
        for elem in elements:
            if elem["type"] == "Edit":
                name_lower = elem["name"].lower()
                auto_id_lower = elem["automation_id"].lower()
                if "search" in name_lower or "search" in auto_id_lower or "query" in name_lower or "find" in name_lower:
                    return elem
        # Fallback to first major edit box
        for elem in elements:
            if elem["type"] == "Edit":
                rect = elem.get("rect")
                if rect and (rect.right - rect.left) > 100:
                    return elem

    # 3. Substring / Token Overlap Match
    best_elem = None
    best_score = 0.0
    intent_tokens = set(intent_lower.split())

    for elem in elements:
        name_lower = elem["name"].lower()
        auto_id_lower = elem["automation_id"].lower()

        score = 0.0
        if intent_lower in name_lower:
            score = 1.0 + (len(intent_lower) / max(1, len(name_lower)))
        elif name_lower and name_lower in intent_lower:
            score = 0.8
        elif intent_lower in auto_id_lower:
            score = 0.9

        tokens = set(name_lower.split() + auto_id_lower.split())
        overlap = tokens.intersection(intent_tokens)
        if overlap:
            score = max(score, len(overlap) / max(1, len(intent_tokens)))

        if score > best_score:
            best_score = score
            best_elem = elem

    if best_score >= 0.5:
        return best_elem

    # 4. Proximity / Adjacent Match for Form Fields (e.g. Label -> Edit)
    for i, elem in enumerate(elements):
        name_lower = elem["name"].lower()
        if intent_lower in name_lower and i + 1 < len(elements):
            next_elem = elements[i + 1]
            if next_elem["type"] == "Edit":
                return next_elem

    return None

def set_control_value(ctrl, value: str) -> bool:
    """
    Sets text into a control via ValuePattern (0ms instant injection)
    or fallback to SendKeys / SetFocus.
    """
    if not ctrl:
        return False
    try:
        if hasattr(ctrl, 'GetValuePattern'):
            vp = ctrl.GetValuePattern()
            if vp:
                vp.SetValue(value)
                return True
    except Exception:
        pass

    try:
        ctrl.SetFocus()
        time.sleep(0.05)
        ctrl.SendKeys(value)
        return True
    except Exception:
        pass

    try:
        rect = ctrl.BoundingRectangle
        if rect:
            import pyautogui
            import pyperclip
            cx = int((rect.left + rect.right) / 2)
            cy = int((rect.top + rect.bottom) / 2)
            pyautogui.click(cx, cy)
            time.sleep(0.05)
            pyperclip.copy(value)
            pyautogui.hotkey('ctrl', 'v')
            return True
    except Exception as e:
        print(f"[UIA] set_control_value fallback error: {e}")

    return False

def invoke_control(ctrl) -> bool:
    """
    Invokes or clicks a button / link / menu control directly via COM InvokePattern
    without moving the physical mouse.
    """
    if not ctrl:
        return False

    try:
        if hasattr(ctrl, 'GetInvokePattern'):
            ip = ctrl.GetInvokePattern()
            if ip:
                ip.Invoke()
                return True
    except Exception:
        pass

    try:
        if hasattr(ctrl, 'GetTogglePattern'):
            tp = ctrl.GetTogglePattern()
            if tp:
                tp.Toggle()
                return True
    except Exception:
        pass

    try:
        if hasattr(ctrl, 'GetSelectionItemPattern'):
            sp = ctrl.GetSelectionItemPattern()
            if sp:
                sp.Select()
                return True
    except Exception:
        pass

    try:
        ctrl.Click(simulateMove=False, waitTime=0)
        return True
    except Exception as e:
        print(f"[UIA] invoke_control fallback error: {e}")

    return False

def autofill_form_controls(window_control, field_dict: dict) -> int:
    """
    Maps key-value pairs (e.g. {'Name': 'Alice', 'Email': 'alice@test.com', 'Message': 'Hi'})
    directly into matching form input controls in the window.
    Returns number of successfully populated fields.
    """
    if not window_control or not field_dict:
        return 0

    elements = dump_actionable_controls(window_control)
    edit_elements = [e for e in elements if e["type"] in ["Edit", "Document", "ComboBox"]]
    filled_count = 0

    for key, val in field_dict.items():
        matched_elem = None
        key_lower = str(key).lower().strip()

        # Try to find an edit control matching the key name or id
        for e in edit_elements:
            if key_lower in e["name"].lower() or key_lower in e["automation_id"].lower():
                matched_elem = e
                break

        # If not directly matched, find adjacent edit control
        if not matched_elem:
            for idx, e in enumerate(elements):
                if key_lower in e["name"].lower():
                    # Check next controls
                    for nxt in elements[idx+1:idx+4]:
                        if nxt["type"] in ["Edit", "Document", "ComboBox"]:
                            matched_elem = nxt
                            break
                    if matched_elem:
                        break

        if matched_elem:
            success = set_control_value(matched_elem["control"], str(val))
            if success:
                filled_count += 1
                time.sleep(0.05)

    return filled_count

def switch_browser_tab(tab_keyword: str) -> bool:
    """
    Fast browser tab switcher for Chrome / Edge / Firefox via UIAutomation tree.
    """
    if not auto:
        return False
    win32_engine.ensure_interactive_desktop()
    try:
        root = auto.GetRootControl()
        for win in root.GetChildren():
            cls = win.ClassName or ""
            if "Chrome_WidgetWin" in cls or "MozillaWindowClass" in cls or "Edge" in cls:
                for elem in dump_actionable_controls(win, max_elements=80):
                    if elem["type"] == "TabItem" or "tab" in str(elem.get("control_type_code", "")).lower() or elem["name"]:
                        if tab_keyword.lower() in elem["name"].lower():
                            rect = elem.get("rect")
                            if rect:
                                cx = int((rect.left + rect.right) / 2)
                                cy = int((rect.top + rect.bottom) / 2)
                                import pyautogui
                                win32gui.SetForegroundWindow(win.NativeWindowHandle)
                                pyautogui.click(cx, cy)
                                return True
    except Exception as e:
        print(f"[UIA] switch_browser_tab error: {e}")
    return False
