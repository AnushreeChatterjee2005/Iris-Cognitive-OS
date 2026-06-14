<div align="center">
  <img src="assets/logo.png" alt="IRIS Logo" width="250">
  
  # IRIS: The Intelligence Layer Between You and Your OS
  
  **Universal OS Automation & Workflow Memory**  
  *No APIs. No Integrations. If a human can see it and click it, IRIS can work with it.*
</div>

---

## ⚠️ The Fragmentation of OS-Level Automation

- **The "State Loss" Problem:** Modern OS architectures are volatile state machines. They instantly drop contextual memory the second a user switches tasks, forcing humans to manually reconstruct complex workflows.
- **The API Barrier:** Existing tools (Zapier, Make) rely on rigid, vendor-provided APIs. They are mathematically incapable of automating proprietary apps, local legacy software, or offline systems.
- **Fragile Static RPA:** Traditional macro bots blindly click fixed coordinates. They lack "Visual Independence" and break instantly during UI updates or window resizing.
- **The "Passive" OS Vulnerability:** Current operating systems blindly render pixels. They lack an "Intelligence Layer"—they cannot analyze the intent of a cross-app workflow without human intervention.

## 🧠 What is IRIS?

IRIS is an **Active Intelligence Layer** that sits natively between you and your Operating System. 

It completely bypasses vendor APIs, allowing you to pipe data from any application on your screen to any other application using natural language and visual intent. 

- **Ambient State Sync:** IRIS is a continuous memory engine. It silently parses your screen to build a mathematically searchable, permanent timeline of your cross-app workflow.
- **Spatial Interaction Model:** IRIS operates on pure human-level vision. Trigger a global `Ctrl+K` overlay, draw a bounding box over your source data, draw an arrow to your destination input, and type your execution rule.
- **Event-Driven Automation:** IRIS is a proactive execution agent. It watches for user-defined visual triggers and fires synthetic background OS events the exact millisecond a condition is met.

## 🚀 The Three Execution Modes

### 1. NOW (Ad-Hoc Routing)
Point at data on one app. Point at a form on another. Type: *"Extract this invoice and populate it."* IRIS maps the data fields semantically and uses OS accessibility hooks to fill the target instantly—without taking over your mouse.

### 2. WHEN (Watch & Strike)
The core event loop. Draw a trigger zone, draw a target arrow, and type *"When this says 'Success', click that button."* IRIS spins up an isolated background thread, polls the screen zone, and fires the click event autonomously upon a state match. You walk away from the keyboard.

### 3. ALWAYS (Continuous Sync) & TIMELINE (State Restoration)
Keeps disconnected apps perfectly synced without network API calls. Simultaneously, IRIS logs your active environment into a local database. Use the query drawer to ask *"What file was I editing during my presentation review?"* to instantly restore an exact workspace.

---

## 🛠️ Tech Stack & Architecture

**The Three-Layer Hybrid Engine**

IRIS ensures zero-ambiguity text and UI extraction by utilizing a 3-layer hybrid fallback system:
1. **Layer 1 (The Web):** `Playwright` hooks directly into the browser DOM via CDP for perfect, zero-latency extraction.
2. **Layer 2 (Native OS):** `pywinauto` leverages native Windows UI Automation APIs to read app structures as queryable objects and fire invisible background clicks (no cursor hijacking).
3. **Layer 3 (Fallback Vision):** If an app blocks accessibility, IRIS gracefully falls back to `EasyOCR` for localized pixel extraction.

**Core Infrastructure:**
- **Frontend Overlay:** Electron, React, TypeScript.
- **Core Engine:** Python daemon running a FastAPI server.
- **Intent Engine:** Local LLMs (Llama 3 via Ollama) parse automation commands, while Gemini 2.5 Flash maps unstructured text fields.
- **State Memory:** `ChromaDB` stores vector embeddings of past UI interactions to instantly resolve future routing commands.

## ⚙️ Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/Hackathon_IRIS.git

# Install Frontend Dependencies
npm install

# Setup Python Virtual Environment
cd iris_core
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run the app
npm run dev
```
