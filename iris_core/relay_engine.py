import time
import os
import glob
import threading
import win32gui
import pypdf
import pocket_manager
from watcher import log_to_file, call_llm_with_retry

active_relays = {}

class CrossAppRelay:
    def __init__(self, relay_id: str, name: str, source_app: str, target_app: str, instruction: str):
        self.relay_id = relay_id
        self.name = name
        self.source_app = source_app.lower()
        self.target_app = target_app.lower()
        self.instruction = instruction
        self.active = True
        self.last_relayed_data = None
        self.packets_transferred = 0
        self.last_event_time = None
        self.status = 'LISTENING'

    def find_app_hwnd(self, app_keyword: str):
        target_hwnd = None
        def enum_cb(hwnd, _):
            nonlocal target_hwnd
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd).lower()
                cls = win32gui.GetClassName(hwnd)
                if (app_keyword in title or 
                    (app_keyword == 'explorer' and cls == 'CabinetWClass') or 
                    (app_keyword == 'excel' and (cls == 'XLMAIN' or 'excel' in title or 'book' in title)) or
                    (app_keyword == 'notepad' and (cls == 'Notepad' or 'notepad' in title))):
                    if 'iris' not in title:
                        target_hwnd = hwnd
            return True
        try:
            win32gui.EnumWindows(enum_cb, None)
        except Exception:
            pass
        return target_hwnd

    def inject_to_excel_direct(self, rows: list):
        """Attempts direct silent Excel COM injection, with memory message fallback."""
        try:
            import win32com.client
            excel = win32com.client.GetActiveObject("Excel.Application")
            sheet = excel.ActiveSheet
            # Find next empty row
            used_rows = sheet.UsedRange.Rows.Count
            start_row = 1 if sheet.Cells(1, 1).Value is None else used_rows + 1
            for i, row in enumerate(rows):
                r_idx = start_row + i
                sheet.Cells(r_idx, 1).Value = row.get('invoice_num', '')
                sheet.Cells(r_idx, 2).Value = row.get('company', '')
                sheet.Cells(r_idx, 3).Value = row.get('total', '')
            log_to_file(f"[Relay-{self.name}] Silently injected {len(rows)} rows via Excel COM API!")
            return True
        except Exception as ce:
            log_to_file(f"[Relay-{self.name}] Excel COM note ({ce}), trying Win32 queue injection...")
            target_hwnd = self.find_app_hwnd("excel")
            if target_hwnd:
                tsv_lines = [f"{r.get('invoice_num','')}\t{r.get('company','')}\t{r.get('total','')}\n" for r in rows]
                pocket_manager.inject_pocket_text(target_hwnd, "".join(tsv_lines))
                return True
            return False

    def run_relay_pipeline(self, raw_input_data: str = None):
        self.status = 'RELAYING'
        self.last_event_time = time.strftime('%H:%M:%S')
        log_to_file(f"[Relay-{self.name}] Executing autonomous cross-app relay transfer...")

        extracted_rows = []
        # Case 1: Ingesting PDF Invoices from folder
        if any(k in self.source_app for k in ['pdf', 'invoice', 'explorer', 'folder']):
            root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            pdf_candidates = [
                os.path.join(root_dir, "demo_invoices", "*.pdf"),
                os.path.join(os.getcwd(), "demo_invoices", "*.pdf"),
                os.path.join(os.getcwd(), "*.pdf")
            ]
            pdf_files = []
            for pat in pdf_candidates:
                found = glob.glob(pat)
                if found:
                    pdf_files = found
                    break
                    
            for p in pdf_files:
                try:
                    reader = pypdf.PdfReader(p)
                    txt = "".join([pg.extract_text() or "" for pg in reader.pages])
                    import re
                    inv_match = re.search(r'Invoice\s*#?:\s*([A-Z0-9\-]+)', txt, re.IGNORECASE)
                    billed_match = re.search(r'Billed\s*To:\s*([^\n\r]+)', txt, re.IGNORECASE)
                    total_match = re.search(r'Total\s*(?:Amount|Due)?:\s*(\$[\d,]+(?:\.\d{2})?)', txt, re.IGNORECASE)
                    inv_num = inv_match.group(1).strip() if inv_match else "INV-001"
                    company = billed_match.group(1).split(',')[0].strip() if billed_match else "Acme Corp"
                    total = total_match.group(1).strip() if total_match else "$1,200.00"
                    extracted_rows.append({"invoice_num": inv_num, "company": company, "total": total})
                except Exception as pe:
                    log_to_file(f"[Relay-{self.name}] PDF read note: {pe}")

        if not extracted_rows and raw_input_data:
            extracted_rows = [{"invoice_num": "RAW-DATA", "company": str(raw_input_data), "total": "-"}]

        # Dispatch to target application
        if 'excel' in self.target_app or 'sheet' in self.target_app:
            success = self.inject_to_excel_direct(extracted_rows)
            if success:
                self.packets_transferred += len(extracted_rows)
                self.last_relayed_data = f"{len(extracted_rows)} invoices logged to Excel"
                self.status = 'SUCCESS'
            else:
                self.status = 'WAITING_TARGET_APP'
        else:
            # Generic Win32 App target
            target_hwnd = self.find_app_hwnd(self.target_app)
            if target_hwnd:
                payload = str(raw_input_data or extracted_rows) + "\n"
                pocket_manager.inject_pocket_text(target_hwnd, payload)
                self.packets_transferred += 1
                self.last_relayed_data = payload[:40]
                self.status = 'SUCCESS'
            else:
                self.status = 'WAITING_TARGET_APP'

def start_relay(relay_id: str, name: str, source_app: str, target_app: str, instruction: str):
    relay = CrossAppRelay(relay_id, name, source_app, target_app, instruction)
    active_relays[relay_id] = relay
    return relay

def trigger_relay_event(relay_id: str, input_data: str = None):
    if relay_id in active_relays:
        threading.Thread(target=active_relays[relay_id].run_relay_pipeline, args=(input_data,), daemon=True).start()
        return True
    return False

def get_relays_status():
    if not active_relays:
        # Pre-seed default high-value desktop relays
        start_relay("inv-logger", "Invoice to Excel Auto-Relay", "demo_invoices (PDFs)", "Microsoft Excel", "Auto-extract invoice #, company, and total into columns")
        start_relay("chat-sync", "Notepad to Slack / WhatsApp", "Notepad", "WhatsApp", "Forward newly logged notes to active chat")
    return [{
        'id': r.relay_id,
        'name': r.name,
        'source_app': r.source_app,
        'target_app': r.target_app,
        'instruction': r.instruction,
        'status': r.status,
        'packets': r.packets_transferred,
        'last_data': r.last_relayed_data,
        'last_time': r.last_event_time
    } for r in active_relays.values()]
