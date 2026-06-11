import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { IntentParser } from './ai/intentParser';
import './index.css';

// Pre-warm the model in the browser background
IntentParser.init();

// ----------------------------------------------------
// 1. The Overlay Command Bar (Ctrl+Shift+Space window)
// ----------------------------------------------------
function SearchBar() {
  const [intent, setIntent] = useState('');
  const [status, setStatus] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShown = () => {
      setIsVisible(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleHidden = () => {
      setIsVisible(false);
      setIntent('');
      setStatus('');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVisible(false);
        setTimeout(() => {
          (window as any).electronAPI?.hideWindow();
        }, 50);
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

  const handleExecute = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && intent.trim()) {
      setStatus('SYNTHESIZING ACTION...');
      try {
        const result = await IntentParser.parseIntent(intent);
        setStatus(`ROUTED TO: ${result.module} [${(result.confidence * 100).toFixed(1)}%]`);
        setTimeout(() => setStatus(''), 4000);
      } catch (err) {
        setStatus('NEURAL LINK FAILED');
      }
      setIntent('');
    }
  };

  return (
    <div className={`search-overlay ${isVisible ? 'active' : ''}`}>
      {/* Top-Right to Bottom-Left Dot Splash Background */}
      {isVisible && (
        <div className="splash-bg"></div>
      )}

      {isVisible && (
        <div className="overlay-content">
          <div className="search-container">
            <div className="input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="search-input"
                placeholder="Command IRIS..."
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={handleExecute}
                autoFocus
              />
            </div>

            {status && (
              <div className="results-area">
                <div className="result-item">
                  <span className="status-blink"></span>
                  <span>{status}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Feature Grid */}
          {!intent && !status && (
            <div className="feature-grid">
              <div className="feature-box" onClick={() => setIntent('find a file or search for a document')}>
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
                <div className="feature-info">
                  <span className="feature-title">Semantic Search</span>
                  <span className="feature-desc">Find files intelligently</span>
                </div>
              </div>
              <div className="feature-box" onClick={() => setIntent('manage windows or split screen layout')}>
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                </div>
                <div className="feature-info">
                  <span className="feature-title">Window Manager</span>
                  <span className="feature-desc">Organize workspaces</span>
                </div>
              </div>
              <div className="feature-box" onClick={() => setIntent('automate a task or extract text')}>
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div className="feature-info">
                  <span className="feature-title">Automations</span>
                  <span className="feature-desc">Run smart workflows</span>
                </div>
              </div>
              <div className="feature-box" onClick={() => setIntent('configure settings or system shell')}>
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
                </div>
                <div className="feature-info">
                  <span className="feature-title">System Shell</span>
                  <span className="feature-desc">Execute OS commands</span>
                </div>
              </div>
            </div>
          )}
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
