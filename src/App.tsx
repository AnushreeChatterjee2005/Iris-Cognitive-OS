import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { IntentParser } from './ai/intentParser';
import { env } from '@xenova/transformers';
import './index.css';

// Fix WASM deadlocks in Chromium by forcing single-threaded mode for UI embedding
env.backends.onnx.wasm.numThreads = 1;

// Fix WASM deadlocks in Chromium by forcing single-threaded mode for UI embedding
env.backends.onnx.wasm.numThreads = 1;

// Pre-warm the model in the browser background
IntentParser.init();

// ----------------------------------------------------
// 1. The Overlay Command Bar (Ctrl+Shift+Space window)
// ----------------------------------------------------
type Point = { x: number, y: number };
type Box = { x: number, y: number, w: number, h: number };

function SearchBar() {
  const [isVisible, setIsVisible] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'drawing_source' | 'drawing_target' | 'typing' | 'running'>('idle');
  
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  
  const [sourceBox, setSourceBox] = useState<Box | null>(null);
  const [targetBox, setTargetBox] = useState<Box | null>(null);
  const [command, setCommand] = useState('');
  const [mode, setMode] = useState<'now' | 'when' | 'always'>('when');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShown = () => {
      setIsVisible(true);
      setPhase('idle');
      setSourceBox(null);
      setTargetBox(null);
      setCommand('');
      setMode('when');
      if ((window as any).electronAPI && (window as any).electronAPI.setClickThrough) {
        (window as any).electronAPI.setClickThrough(false);
      }
    };

    const handleHidden = () => {
      setIsVisible(false);
      setPhase('idle');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVisible(false);
        setTimeout(() => { (window as any).electronAPI?.hideWindow(); }, 50);
      }
    };
    
    window.addEventListener('electron-window-shown', handleShown as EventListener);
    window.addEventListener('electron-window-hidden', handleHidden as EventListener);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('electron-window-shown', handleShown as EventListener);
      window.removeEventListener('electron-window-hidden', handleHidden as EventListener);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (phase === 'idle') {
      setStartPoint({ x: e.clientX, y: e.clientY });
      setCurrentPoint({ x: e.clientX, y: e.clientY });
      setPhase('drawing_source');
    } else if (phase === 'drawing_target') {
      setStartPoint({ x: e.clientX, y: e.clientY });
      setCurrentPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (phase === 'drawing_source' || phase === 'drawing_target') {
      setCurrentPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    if (!startPoint || !currentPoint) return;
    
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const w = Math.abs(startPoint.x - currentPoint.x);
    const h = Math.abs(startPoint.y - currentPoint.y);
    
    if (phase === 'drawing_source') {
      if (w > 10 && h > 10) {
        setSourceBox({ x, y, w, h });
        setPhase('drawing_target');
      } else {
        setPhase('idle');
      }
    } else if (phase === 'drawing_target') {
      if (w > 10 && h > 10) {
        setTargetBox({ x, y, w, h });
        setPhase('typing');
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        setPhase('drawing_target');
      }
    }
    setStartPoint(null);
    setCurrentPoint(null);
  };

  const executeWatchAndStrike = async () => {
    const finalCommand = command.trim() || (mode === 'now' ? 'extract' : '');
    if (!sourceBox || !targetBox || !finalCommand) return;
    
    // Switch to running phase to show the widget
    setPhase('running');
    
    // Make the transparent overlay click-through so user can interact with the app below
    if ((window as any).electronAPI && (window as any).electronAPI.setClickThrough) {
      (window as any).electronAPI.setClickThrough(true);
    }
    
    // Robust Regex Parsing
    const conditionPart = finalCommand.split('then')[0] || finalCommand;
    const conditionStr = conditionPart
      .replace(/when (this|it) (says|changes to) /i, '')
      .replace(/['"]/g, '')
      .trim();
    
    const actionPart = finalCommand.split(/type /i)[1] || finalCommand;
    const actionStr = actionPart
      .replace(/here/i, '')
      .replace(/['"]/g, '')
      .trim();

    try {
      const dpr = window.devicePixelRatio || 1;
      await fetch('http://127.0.0.1:8000/api/watch-and-strike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_bbox: {
            x: Math.round(sourceBox.x * dpr),
            y: Math.round(sourceBox.y * dpr),
            w: Math.round(sourceBox.w * dpr),
            h: Math.round(sourceBox.h * dpr)
          },
          target_bbox: { 
            x: Math.round(targetBox.x * dpr), 
            y: Math.round(targetBox.y * dpr),
            w: Math.round(targetBox.w * dpr),
            h: Math.round(targetBox.h * dpr)
          },
          condition: conditionStr.toLowerCase(),
          action_text: actionStr,
          mode: mode
        })
      });

      // Close instantly when Python script finishes pasting
      setIsVisible(false);
      setPhase('idle');
      if ((window as any).electronAPI && (window as any).electronAPI.setClickThrough) {
        (window as any).electronAPI.setClickThrough(false);
      }
      setTimeout(() => { (window as any).electronAPI?.hideWindow(); }, 50);

    } catch (e) {
      console.error(e);
      // Fallback close on error
      setIsVisible(false);
      setPhase('idle');
      if ((window as any).electronAPI && (window as any).electronAPI.setClickThrough) {
        (window as any).electronAPI.setClickThrough(false);
      }
      setTimeout(() => { (window as any).electronAPI?.hideWindow(); }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeWatchAndStrike();
    }
  };

  // Rendering helpers
  let activeBox = null;
  if ((phase === 'drawing_source' || phase === 'drawing_target') && startPoint && currentPoint) {
    activeBox = {
      x: Math.min(startPoint.x, currentPoint.x),
      y: Math.min(startPoint.y, currentPoint.y),
      w: Math.abs(startPoint.x - currentPoint.x),
      h: Math.abs(startPoint.y - currentPoint.y),
    };
  }

  let activeArrow = null;
  if (phase === 'typing' && sourceBox && targetBox) {
    activeArrow = { 
      x1: sourceBox.x + sourceBox.w / 2, 
      y1: sourceBox.y + sourceBox.h / 2, 
      x2: targetBox.x + targetBox.w / 2, 
      y2: targetBox.y + targetBox.h / 2 
    };
  }

  return (
    <div 
      className={`watch-overlay ${isVisible ? 'active' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {isVisible && phase !== 'running' && phase !== 'typing' && <div className="sweep-dim-bg"></div>}
      
      {/* 1. Instructions */}
      {isVisible && phase === 'idle' && (
        <div className="instruction-toast">Draw a bounding box around the SOURCE trigger zone</div>
      )}
      {phase === 'drawing_target' && (
        <div className="instruction-toast">Draw a bounding box around the TARGET input field</div>
      )}

      {/* 2. Bounding Boxes */}
      {sourceBox && phase !== 'running' && phase !== 'typing' && (
        <div className="drawn-box final" style={{ left: sourceBox.x, top: sourceBox.y, width: sourceBox.w, height: sourceBox.h }} />
      )}
      {targetBox && phase !== 'running' && phase !== 'typing' && (
        <div className="drawn-box final target" style={{ left: targetBox.x, top: targetBox.y, width: targetBox.w, height: targetBox.h, borderColor: '#3498db', boxShadow: '0 0 15px rgba(52, 152, 219, 0.3)', background: 'rgba(52, 152, 219, 0.1)' }} />
      )}
      {activeBox && phase !== 'running' && phase !== 'typing' && (
        <div className={`drawn-box drawing ${phase === 'drawing_target' ? 'target-drawing' : ''}`} style={{ left: activeBox.x, top: activeBox.y, width: activeBox.w, height: activeBox.h, borderColor: phase === 'drawing_target' ? '#3498db' : '#f39c12' }} />
      )}

      {/* 3. Connection Arrow */}
      {phase !== 'running' && phase !== 'typing' && (
        <svg className="arrow-canvas">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#3498db" />
            </marker>
          </defs>
          {activeArrow && (
            <line 
              x1={activeArrow.x1} y1={activeArrow.y1} 
              x2={activeArrow.x2} y2={activeArrow.y2} 
              stroke="#3498db" strokeWidth="3" strokeDasharray="5,5"
              markerEnd="url(#arrowhead)"            
            />
          )}
        </svg>
      )}

      {/* 4. Command Input */}
      {phase === 'typing' && targetBox && (
        <div className="command-floater" style={{ 
          left: Math.max(200, Math.min(targetBox.x, window.innerWidth - 200)), 
          top: Math.max(160, targetBox.y - 20) 
        }}>
          <div className="mode-selector">
            <span className={`mode-btn ${mode === 'now' ? 'active' : ''}`} onClick={() => setMode('now')}>⚡ Now</span>
            <span className={`mode-btn ${mode === 'when' ? 'active' : ''}`} onClick={() => setMode('when')}>⏳ When</span>
            <span className={`mode-btn ${mode === 'always' ? 'active' : ''}`} onClick={() => setMode('always')}>♾️ Always</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder={mode === 'now' ? "e.g. Extract the Vendor Name and Amount" : "e.g. When this says 'Success', type 'Done' here"}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {/* 5. The Floating Progress Widget */}
      {phase === 'running' && (
        <div className="status-widget">
          <div className="widget-header">
            <div className="widget-spinner"></div>
            <span className="widget-title">{mode === 'now' ? 'Extracting via Gemini...' : 'Watching Condition...'}</span>
          </div>
          <div className="widget-subtitle">{command}</div>
          <div className="widget-progress-container">
            <div className="widget-progress-bar"></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 2. The Main Dashboard (The Electron App)
// ----------------------------------------------------
function Dashboard() {
  return (
    <div className="dashboard-container">
      {/* Decorative Blueprint Lines */}
      <div className="blueprint-grid"></div>

      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <div className="logo-ring"></div>
            <div className="logo-dot"></div>
          </div>
          <h2>IRIS_OS</h2>
        </div>
        
        <div className="nav-section">
          <span className="nav-label">SYSTEM_NODES</span>
          <ul className="nav-links">
            <li className="active"><span className="bracket">[</span> Memory Matrix <span className="bracket">]</span></li>
            <li><span className="bracket">[</span> File Indexer <span className="bracket">]</span></li>
            <li><span className="bracket">[</span> Automations <span className="bracket">]</span></li>
            <li><span className="bracket">[</span> Config <span className="bracket">]</span></li>
          </ul>
        </div>

        <div className="system-status">
          <div className="status-indicator online"></div>
          <span>NEURAL LINK: ONLINE</span>
        </div>
      </nav>

      <main className="dashboard-content">
        <header className="dash-header">
          <div className="header-meta">UPTIME: 04:12:00 | LATENCY: 12ms</div>
          <h1>COGNITIVE HUB</h1>
        </header>
        
        <div className="exceptional-grid">
          {/* Main Visualizer */}
          <div className="visualizer-card panel-glass">
            <div className="panel-header">REAL-TIME WORKFLOW TOPOLOGY</div>
            <div className="topology-container">
              {/* Fake CSS-based Node Graph */}
              <div className="node center-node">
                <div className="node-pulse"></div>
              </div>
              <div className="node sub-node node-1"></div>
              <div className="node sub-node node-2"></div>
              <div className="node sub-node node-3"></div>
              <svg className="node-lines" viewBox="0 0 100 100">
                <line x1="50" y1="50" x2="20" y2="20" />
                <line x1="50" y1="50" x2="80" y2="30" />
                <line x1="50" y1="50" x2="50" y2="80" />
              </svg>
            </div>
          </div>

          {/* Activity Stream */}
          <div className="activity-card panel-glass">
            <div className="panel-header">INTENT STREAM</div>
            <div className="terminal-log">
              <p><span className="time">[10:42:01]</span> <span className="log-action">PARSING:</span> "Split terminal and browser"</p>
              <p><span className="time">[10:42:02]</span> <span className="log-success">ROUTED:</span> Window Manager Active</p>
              <p><span className="time">[10:45:11]</span> <span className="log-action">INDEXING:</span> c:/projects/hackathon</p>
              <p className="typing-cursor">_</p>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-card panel-glass">
            <div className="panel-header">SYSTEM INTELLIGENCE</div>
            <div className="stat-row">
              <span className="stat-label">ACTIONS LEARNED</span>
              <span className="stat-val">1,024</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">FILES MAPPED</span>
              <span className="stat-val">14.2k</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">CONFIDENCE AVG</span>
              <span className="stat-val highlight">98.4%</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------
// App Router
// ----------------------------------------------------
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<SearchBar />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
