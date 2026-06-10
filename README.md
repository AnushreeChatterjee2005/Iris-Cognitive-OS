<div align="center">
  <img src="IRIS_COMBINATION%20MARK.png" alt="IRIS Logo" width="400"/>
  <br/>
  <h1>The Ambient Cognitive Layer</h1>
  <p><i>Your computer should remember what you were doing, so your brain doesn't have to.</i></p>

  <p>
    <a href="#-the-architecture"><img src="https://img.shields.io/badge/Architecture-Hybrid%20Split-38bdf8?style=for-the-badge" alt="Architecture"></a>
    <a href="#-privacy-first"><img src="https://img.shields.io/badge/Privacy-100%25%20Local-black?style=for-the-badge" alt="Privacy First"></a>
    <a href="#%EF%B8%8F-tech-stack"><img src="https://img.shields.io/badge/Python-FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="FastAPI"></a>
    <a href="#%EF%B8%8F-tech-stack"><img src="https://img.shields.io/badge/Electron-React-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron"></a>
  </p>
</div>

---

**IRIS** is a powerful, local-first ambient AI that reconstructs user intent from desktop activity. It transforms raw interactions into a searchable, associative memory system, allowing you to instantly resume unfinished thought processes and deep-work sessions.

## 🌌 The Hybrid Architecture

IRIS is built on a split-stack architecture designed to mirror human cognition. The **Frontend (Electron/React)** acts as the sensory and orchestration layer, while the **Backend (Python/FastAPI)** serves as the cognitive engine.

### 📡 Layer 1: Sensory Capture (Sensory Nervous System)
A robust event pipeline that seamlessly ingests raw desktop signals—window focus, browser navigation, and IDE file interactions—through an OS-level collector and an Activity Gateway.

### 🧩 Layer 2: Workflow Sessionization (Cognitive Engine)
The **Sessionizer Engine** runs securely within a local FastAPI server. Using probabilistic boundaries (time gaps, app affinity, and semantic drift), it naturally groups fragmented events into coherent **Workflow Sessions**, inferring your probable objectives in real-time.

### 🧠 Layer 3: Semantic Memory (Recall Engine)
Powered by **sentence-transformers** (`all-MiniLM-L6-v2`) and **ChromaDB**, IRIS generates high-dimensional embeddings for every session. This enables natural language "Associative Memory" without any data ever leaving your device.

### 🚀 Layer 4: Resume Intent™ (Orchestration)
The cinematic layer. IRIS physically reconstructs your mental state by reopening prioritized browser tabs, launching VS Code workspaces, and preparing terminal contexts with a single click.

---

## 🎨 Visual Philosophy: Zen Obsidian

The IRIS interface is crafted to be **ambient and non-intrusive**:
- **Cinematic Awakening**: A matte black ripple "splashes" across the desktop when summoned, darkening the environment for deep focus.
- **Obsidian Glass**: A sleek, pill-shaped minimalist interface that floats seamlessly in the center of your workflow.
- **Glassmorphism**: High-intensity blur (40px) and micro-animations ensure IRIS feels like a native, premium extension of the OS.

---

## 🛠️ Tech Stack

### Ambient Frontend (Sensory Core)
- **Framework**: Electron + React + TypeScript
- **Orchestration**: OS-native shell execution for Resume Intent™
- **Styling**: Vanilla CSS with GPU-accelerated glassmorphism animations

### Cognitive Backend (Brain)
- **Server**: Python + FastAPI
- **Machine Learning**: `sentence-transformers` (Local-first NLP embeddings)
- **Database**: ChromaDB (Local vector storage for rapid semantic retrieval)

---

## 🚀 Getting Started

### 1. Setup the Cognitive Backend (Python)
Navigate to the backend directory and install the machine learning dependencies. *(Note: This is a one-time setup; the models run entirely locally).*
```bash
cd backend
pip install -r requirements.txt
```

### 2. Setup the Ambient Frontend (Electron)
Install the frontend dependencies and build the sensory engine.
```bash
npm install
npm run build
```

---

## 💻 Usage

To awaken IRIS, you need both hemispheres of the architecture running concurrently.

**1. Start the Cognitive Brain:**
```bash
cd backend
uvicorn app.main:app --reload
```

**2. Start the UI Layer:**
```bash
npm run dev
```

### Interactions
- **Summon IRIS**: Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>Cmd</kbd> + <kbd>K</kbd> on macOS).
- **Search Memory**: Type naturally (e.g., *"What was I trying to accomplish before lunch?"*).
- **Resume Flow**: Click the "Resume" button on any mental state card to instantly reconstruct your workspace.

---

## 🛡️ Privacy First
IRIS is **100% local.** All activity capture, semantic indexing, and model inference happen exclusively on your machine. Your cognitive history is yours alone.

---

## 🗺️ Roadmap
- [ ] Deep Terminal state restoration.
- [ ] Proactive Suggestion Engine (Layer 5).
- [ ] Cross-device cognitive sync.

---

<div align="center">
  <i>Built with ❤️ for the future of human-computer interaction.</i>
</div>
