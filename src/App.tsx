import React, { useState, useEffect } from 'react';
import './dashboard.css';
import { CanvasGrid } from './CanvasGrid';
import { TimelineAgent } from './ai/timelineAgent';
import { Globe } from 'lucide-react';

function SearchOverlay() {
  const [status, setStatus] = useState('idle'); // idle, drawing_source, drawing_target, typing, running, finished
  const [sourceBox, setSourceBox] = useState<any>(null);
  const [targetBox, setTargetBox] = useState<any>(null);
  const [currentBox, setCurrentBox] = useState<any>(null);
  const [startPos, setStartPos] = useState<any>(null);
  
  const [actionType, setActionType] = useState('when'); // now, when, always
  const [command, setCommand] = useState('');
  const [animationKey, setAnimationKey] = useState(0);
  
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShown = () => {
      setAnimationKey(prev => prev + 1);
      setStatus('idle');
      setSourceBox(null);
      setTargetBox(null);
      setCurrentBox(null);
      setStartPos(null);
      setCommand('');
    };
    const handleHidden = () => {
      setStatus('idle');
      setSourceBox(null);
      setTargetBox(null);
      setCurrentBox(null);
      setStartPos(null);
      setCommand('');
    };
    window.addEventListener('electron-window-shown', handleShown);
    window.addEventListener('electron-window-hidden', handleHidden);
    return () => {
      window.removeEventListener('electron-window-shown', handleShown);
      window.removeEventListener('electron-window-hidden', handleHidden);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (status !== 'idle' && status !== 'drawing_target') return;
    setStartPos({ x: e.clientX, y: e.clientY });
    setStatus(status === 'idle' ? 'drawing_source' : 'drawing_target');
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!startPos) return;
    if (status === 'drawing_source' || status === 'drawing_target') {
      setCurrentBox({
        x: Math.min(startPos.x, e.clientX),
        y: Math.min(startPos.y, e.clientY),
        w: Math.abs(startPos.x - e.clientX),
        h: Math.abs(startPos.y - e.clientY)
      });
    }
  };

  const handleMouseUp = () => {
    if (!startPos || !currentBox) {
      setStartPos(null);
      return;
    }
    
    if (status === 'drawing_source') {
      setSourceBox(currentBox);
      setStatus('drawing_target');
    } else if (status === 'drawing_target') {
      setTargetBox(currentBox);
      setStatus('typing');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    
    setCurrentBox(null);
    setStartPos(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setStatus('running');
      if ((window as any).electronAPI) {
        (window as any).electronAPI.setClickThrough(true);
      }
      fetch('http://127.0.0.1:8000/api/watch-and-strike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_bbox: sourceBox,
          target_bbox: targetBox,
          condition: command,
          action_text: "",
          mode: actionType
        })
      }).then(() => {
        setStatus('finished');
        setTimeout(() => {
          window.dispatchEvent(new Event('electron-window-hidden'));
          if ((window as any).electronAPI) {
            (window as any).electronAPI.hideWindow();
            (window as any).electronAPI.setClickThrough(false);
          }
        }, 2000);
      }).catch((err) => {
        console.error(err);
        setStatus('finished');
        setTimeout(() => {
          setStatus('idle');
          if ((window as any).electronAPI) {
            (window as any).electronAPI.setClickThrough(false);
          }
        }, 2000);
      });
    } else if (e.key === 'Escape') {
      if (status === 'typing') {
        setStatus('drawing_target');
        setTargetBox(null);
      } else if (status === 'drawing_target') {
        setStatus('idle');
        setSourceBox(null);
      } else {
        window.dispatchEvent(new Event('electron-window-hidden'));
        if ((window as any).electronAPI) {
          (window as any).electronAPI.hideWindow();
        }
      }
    }
  };

  let arrowPath = '';
  if (status === 'typing' && sourceBox && targetBox) {
    const sx = sourceBox.x + sourceBox.w / 2;
    const sy = sourceBox.y + sourceBox.h / 2;
    const tx = targetBox.x + targetBox.w / 2;
    const ty = targetBox.y + targetBox.h / 2;
    
    // Draw a curved bezier line connecting them
    const isHorizontal = Math.abs(tx - sx) > Math.abs(ty - sy);
    let a=sx, o=sy, s=tx, c=ty, l=sx, d=sy, p=tx, m=ty;
    if (isHorizontal) {
      a = tx > sx ? sourceBox.x + sourceBox.w + 6 : sourceBox.x - 6;
      s = tx > sx ? targetBox.x - 6 : targetBox.x + targetBox.w + 6;
      const t = Math.abs(s - a) * 0.5;
      l = tx > sx ? a + t : a - t;
      p = tx > sx ? s - t : s + t;
    } else {
      o = ty > sy ? sourceBox.y + sourceBox.h + 6 : sourceBox.y - 6;
      c = ty > sy ? targetBox.y - 6 : targetBox.y + targetBox.h + 6;
      const t = Math.abs(c - o) * 0.5;
      d = ty > sy ? o + t : o - t;
      m = ty > sy ? c - t : c + t;
    }
    arrowPath = `M ${a},${o} C ${l},${d} ${p},${m} ${s},${c}`;
  }

  const toastStyle: React.CSSProperties = { position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '12px 24px', borderRadius: '30px', zIndex: 10, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', fontFamily: "'Outfit', sans-serif" };
  const boxStyle: React.CSSProperties = { position: 'absolute', border: '2px solid', background: 'rgba(255,255,255,0.1)', zIndex: 10, pointerEvents: 'none' };
  const modeStyle = (active: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent' });
  const pillStyle: React.CSSProperties = { position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '30px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'white', zIndex: 10, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', fontFamily: "'Outfit', sans-serif" };

  return (
    <div className={`watch-overlay active`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, overflow: 'hidden', cursor: status === 'idle' || status === 'drawing_target' ? 'crosshair' : 'default', background: 'transparent' }}>
      
      {status !== 'running' && (
        <svg key={animationKey} className="sweep-dim-bg" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 5, width: '100%', height: '100%' }}>
          <defs>
            <mask id="hole-mask">
              <rect width="100%" height="100%" fill="white" />
              {sourceBox && <rect x={sourceBox.x} y={sourceBox.y} width={sourceBox.w} height={sourceBox.h} fill="black" />}
              {targetBox && <rect x={targetBox.x} y={targetBox.y} width={targetBox.w} height={targetBox.h} fill="black" />}
              {currentBox && <rect x={currentBox.x} y={currentBox.y} width={currentBox.w} height={currentBox.h} fill="black" />}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.75)" mask="url(#hole-mask)" />
        </svg>
      )}

      {status === 'idle' && <div className="instruction-toast" style={toastStyle}>Draw a bounding box around the SOURCE trigger zone</div>}
      {status === 'drawing_target' && <div className="instruction-toast" style={toastStyle}>Draw a bounding box around the TARGET input field</div>}

      {sourceBox && status !== 'running' && <div className="drawn-box final" style={{ ...boxStyle, borderColor: '#f39c12', left: sourceBox.x, top: sourceBox.y, width: sourceBox.w, height: sourceBox.h }} />}
      {targetBox && status !== 'running' && <div className="drawn-box final target" style={{ ...boxStyle, borderColor: '#3498db', left: targetBox.x, top: targetBox.y, width: targetBox.w, height: targetBox.h }} />}
      {currentBox && status !== 'running' && status !== 'typing' && <div className="drawn-box drawing" style={{ ...boxStyle, borderColor: status === 'drawing_target' ? '#3498db' : '#f39c12', left: currentBox.x, top: currentBox.y, width: currentBox.w, height: currentBox.h }} />}

      {status !== 'running' && arrowPath && (
        <svg className="arrow-canvas" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 6, width: '100%', height: '100%' }}>
          <defs>
            <marker id="node-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(255, 255, 255, 0.8)" />
            </marker>
          </defs>
          <path d={arrowPath} fill="none" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#node-arrow)" opacity="0.9" />
        </svg>
      )}

      {status === 'typing' && targetBox && (
        <div className="command-floater" style={{ position: 'absolute', zIndex: 10, left: Math.max(200, Math.min(targetBox.x, window.innerWidth - 400)), top: Math.max(160, targetBox.y - 120), background: 'rgba(20, 20, 20, 0.95)', border: '1px solid rgba(255,255,255,0.1)', padding: '16px', borderRadius: '12px', width: '400px', backdropFilter: 'blur(10px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', fontFamily: "'Outfit', sans-serif" }}>
          <div className="mode-selector" style={{ display: 'flex', gap: '8px', marginBottom: '16px', fontSize: '14px' }}>
            <span onClick={() => setActionType('now')} style={modeStyle(actionType === 'now')}>⚡ Now</span>
            <span onClick={() => setActionType('when')} style={modeStyle(actionType === 'when')}>⏳ When</span>
            <span onClick={() => setActionType('always')} style={modeStyle(actionType === 'always')}>♾️ Always</span>
          </div>
          <input 
            ref={inputRef}
            type="text" 
            className="command-input" 
            placeholder={actionType === 'now' ? "e.g. Extract the Vendor Name and Amount" : "e.g. When this says 'Success', type 'Done' here"}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '12px', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>
      )}

      {status === 'running' && (
        <div style={pillStyle}>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          <div className="pill-spinner" style={{ width: '16px', height: '16px', border: '2px solid transparent', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 'bold' }}>{actionType === 'now' ? 'Extracting' : 'Watching'}</span>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>{command}</span>
          </div>
        </div>
      )}

      {status === 'finished' && (
        <div style={{ ...pillStyle, background: 'linear-gradient(135deg, rgba(46,204,113,0.9), rgba(39,174,96,0.9))' }}>
          <div style={{ fontSize: '18px' }}>✅</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 'bold' }}>Action Completed</span>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>Returning control...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route === '#/search') {
    return <SearchOverlay />;
  }

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [currentTab, setCurrentTab] = useState<'timeline' | 'chat'>('timeline');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'agent', text: string, sessionContext?: any, matchedUrl?: string, matchedFile?: string, actions?: any[] }[]>([
    { role: 'agent', text: 'Hello! I am your autonomous agent. I am silently capturing your workflow context. Ask me anything about what you were doing or what files you were editing!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [apiKey] = useState(localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');

    setIsAiTyping(true);

    try {
      if (!apiKey) {
        setChatHistory(prev => [...prev, { role: 'agent', text: "Please enter your Gemini API Key in the box below to activate my AI brain!" }]);
        setIsAiTyping(false);
        return;
      }

      const agent = new TimelineAgent(apiKey);
      const result = await agent.generateResponse(userMsg, sessions);

      let actions: any[] = [];
      let matchedUrl: string | undefined;
      let matchedFile: string | undefined;

      if (result.sessionContext) {
        matchedUrl = result.sessionContext.urls && result.sessionContext.urls.length > 0 ? result.sessionContext.urls[0] : undefined;
        matchedFile = result.sessionContext.files && result.sessionContext.files.length > 0 ? result.sessionContext.files[0] : undefined;

        actions.push({ 
          ...result.sessionContext, 
          label: `Restore Entire Environment`,
          icon: '⚡'
        });
        
        if (matchedUrl) {
          actions.push({
            ...result.sessionContext,
            files: [], windowTitles: [], urls: [matchedUrl],
            label: `Open Link Only`,
            icon: '↗️'
          });
        }
        
        if (matchedFile) {
          actions.push({
            ...result.sessionContext,
            urls: [], windowTitles: [], files: [matchedFile],
            label: `Open File Only`,
            icon: '📄'
          });
        }
      }

      setChatHistory(prev => [...prev, { 
        role: 'agent', 
        text: result.text, 
        sessionContext: result.sessionContext, 
        matchedUrl, 
        matchedFile, 
        actions 
      }]);
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'agent', text: `**System Error:** ${e.message}` }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  useEffect(() => {
    if ((window as any).electronAPI && (window as any).electronAPI.onWorkflowUpdate) {
      (window as any).electronAPI.onWorkflowUpdate((update: any) => {
        setSessions(prev => {
          const idx = prev.findIndex(s => s.id === update.id);
          if (idx >= 0) {
            const newSessions = [...prev];
            newSessions[idx] = update;
            return newSessions;
          }
          return [update, ...prev];
        });
        setActiveSession((prev: any) => (prev && prev.id === update.id) || !prev ? update : prev);
      });
    }

    const dummy = {
      id: 'dummy-101',
      name: 'Ambient Context Simulator (Test Session)',
      startTime: Date.now() - 3600000,
      duration: 3600000,
      dominantApps: ['Codex', 'Chrome', 'Terminal'],
      urls: ['https://github.com/iris', 'https://chatgpt.com'],
      files: ['c:\\Projects\\IRIS\\App.tsx'],
      contextSummary: 'Exploring IRIS Cinematic Overlays while cross-referencing GitHub.'
    };
    setSessions([dummy]);
    setActiveSession(dummy);
  }, []);

  const formatAppName = (app: string) => {
    if (!app) return '';
    const lower = app.toLowerCase().replace('.exe', '');
    if (lower.includes('chrome')) return 'Chrome';
    if (lower.includes('code') || lower.includes('visual studio')) return 'VS Code';
    if (lower.includes('snipping')) return 'Snipping Tool';
    if (lower.includes('discord')) return 'Discord';
    if (lower.includes('antigravity')) return 'Antigravity';
    if (lower.includes('terminal') || lower.includes('powershell') || lower.includes('cmd')) return 'Terminal';
    if (lower.includes('explorer')) return 'File Explorer';
    return app.replace('.exe', '').split(/(?=[A-Z])|[\s_-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  let trails: any[] = [];
  if (activeSession) {
    if (activeSession.urls) {
      const uniqueUrls = Array.from(new Set(activeSession.urls));
      const seenPaths = new Set();
      
      uniqueUrls.forEach((url: any) => {
        try {
          const u = new URL(url as string);
          const domain = u.hostname.replace('www.', '');
          
          // Deduplicate by domain + pathname to ignore hashes and query parameters for UI grouping
          const pathKey = domain + u.pathname;
          if (seenPaths.has(pathKey)) return;
          seenPaths.add(pathKey);

          let group = trails.find(t => t.type === 'domain_group' && t.domain === domain);
          if (!group) {
            group = { type: 'domain_group', domain, nodes: [] };
            trails.push(group);
          }
          group.nodes.push({
            title: u.pathname === '/' ? domain : u.pathname,
            value: url
          });
        } catch (e) {}
      });
    }

    // Determine primary IDE for grouping files
    const apps = activeSession.dominantApps ? Array.from(new Set(activeSession.dominantApps.map((a: string) => formatAppName(a)))) : [];
    const primaryIde = apps.find(a => a && ['VS Code', 'Cursor', 'Antigravity'].some(ide => (a as string).includes(ide)));

    if (activeSession.files && activeSession.files.length > 0) {
      const uniqueFiles = Array.from(new Set(activeSession.files));
      if (primaryIde) {
        trails.push({
          type: 'ide_group',
          ide: primaryIde,
          files: uniqueFiles.map((f: any) => ({
            title: (f as string).split(/[\\/]/).pop() || f,
            value: f
          }))
        });
      } else {
        uniqueFiles.forEach((f: any) => {
          const title = (f as string).split(/[\\/]/).pop() || f;
          trails.push({ type: 'file', title, summary: f, icon: '📄' });
        });
      }
    }
    
    if (activeSession.dominantApps) {
      apps.forEach((app: any) => {
        const lower = (app as string).toLowerCase();
        if (app && lower !== 'chrome' && lower !== 'browser' && app !== primaryIde) {
          trails.push({ type: 'app', title: app, summary: `Active workspace: ${app}`, icon: '💻' });
        }
      });
    }
  }

  return (
    <div className="iris-dashboard-scope">
      <CanvasGrid />
      <div className="global-layout">
        <aside className="global-sidebar">
          <div className="sidebar-top">
            <div className="sidebar-logo"><img src="/sidebar-logo.png" alt="IRIS" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
          </div>
          <div className="sidebar-nav">
            <div className={`nav-item ${currentTab === 'timeline' ? 'active' : ''}`} title="Timeline Dashboard" onClick={() => setCurrentTab('timeline')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className={`nav-item ${currentTab === 'chat' ? 'active' : ''}`} title="Agentic Context Query" onClick={() => setCurrentTab('chat')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
          </div>
          <div className="sidebar-bottom">
            <div className="status-badge" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'none', border: 'none', padding: 0 }} title="Ambient tracking active">
              <div className="pulse"></div>
            </div>
          </div>
        </aside>

        <div className="views-container">
          {currentTab === 'timeline' ? (
            <div id="view-timeline" className="app-view active">
              <header>
                <div className="brand-container">
                  <h1>Timeline</h1>
                </div>
              </header>
              <div id="app-workspace">
                <div id="sessions-list-container">
                  <div id="sessions-container">
                    {sessions.length === 0 ? (
                      <div className="empty-state">
                        <div className="loader"></div>
                        <p style={{ marginBottom: '8px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Synchronizing Cognitive State</p>
                        <p style={{ maxWidth: '300px', fontSize: '0.85rem' }}>IRIS is monitoring your ambient workflow. Switch to Chrome or VS Code to begin sessionization.</p>
                      </div>
                    ) : (
                      sessions.map(s => (
                        <div key={s.id} className={`session-card ${activeSession?.id === s.id ? 'active-card' : ''}`} onClick={() => setActiveSession(s)}>
                          <div className="session-header">
                            <div className="session-name">{s.name}</div>
                            <div className="session-time">{s.duration ? `${Math.floor(s.duration / 60000)}m` : 'Live'}</div>
                          </div>
                          <div className="session-summary">{s.contextSummary || 'Synthesizing local cognitive trail patterns...'}</div>
                          <div className="app-tags">
                            {s.dominantApps && Array.from(new Set(s.dominantApps.map((a: string) => formatAppName(a))) as Set<string>).map((app: string) => (
                              <span key={app} className="app-tag">{app}</span>
                            ))}
                          </div>
                          {activeSession?.id === s.id && (
                            <div className="live-pulse"></div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div id="session-detail-panel">
                  {activeSession ? (
                    <>
                      <div className="detail-header-row">
                        <div>
                          <div className="detail-main-title">{activeSession.name}</div>
                          <div className="detail-main-time">{new Date(activeSession.startTime).toLocaleString()}</div>
                        </div>
                        <button className="detail-restore-btn" onClick={async () => {
                          const payload = { ...activeSession };
                          const container = document.getElementById(`discovery-trail-${activeSession.id}`);
                          if (container) {
                            const checked = container.querySelectorAll('.url-checkbox:checked');
                            payload.urls = Array.from(checked).map((el: any) => (el as HTMLInputElement).value);
                          }
                          if (payload.urls.length === 0 && payload.files.length === 0 && (!payload.windowTitles || payload.windowTitles.length === 0) && (!payload.dominantApps || payload.dominantApps.length === 0)) {
                            alert(`Insufficient contextual anchors to resume "${payload.name}".`);
                            return;
                          }
                          if ((window as any).electronAPI && (window as any).electronAPI.resumeWorkflow) {
                            await (window as any).electronAPI.resumeWorkflow(payload);
                          }
                        }}>
                          <span>⚡</span> Restore Environment
                        </button>
                      </div>
                      <div className="explanation-box">
                        <strong>Cognitive Summary:</strong> {activeSession.contextSummary || 'Synthesizing local cognitive trail patterns...'}
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <div className="detail-section-title">Cognitive Discovery Trail</div>
                        <div className="discovery-trail-container" id={`discovery-trail-${activeSession.id}`}>
                          {trails.map((t, i) => {
                            if (t.type === 'domain_group') {
                              return (
                                <div key={i} className="domain-group">
                                  <div className="domain-group-header">
                                    <span style={{ marginRight: '8px', display: 'inline-flex', alignItems: 'center' }}><Globe size={14} color="var(--accent)" /></span>
                                    <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{t.domain} ({t.nodes.length} pages)</span>
                                  </div>
                                  <div className="domain-group-content">
                                    {t.nodes.map((n: any, j: number) => (
                                      <div key={j} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                        <input type="checkbox" defaultChecked={true} className="url-checkbox" value={n.value} style={{ marginRight: '8px', cursor: 'pointer' }} />
                                        <span style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--text-primary)' }} title={n.value}>{n.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            if (t.type === 'ide_group') {
                              return (
                                <div key={i} className="domain-group">
                                  <div className="domain-group-header">
                                    <span style={{ marginRight: '8px', fontSize: '0.8rem' }}>💻</span>
                                    <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{t.ide} ({t.files.length} files)</span>
                                  </div>
                                  <div className="domain-group-content">
                                    {t.files.map((f: any, j: number) => (
                                      <div key={j} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                        <span style={{ marginRight: '8px', fontSize: '0.8rem' }}>📄</span>
                                        <span style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--text-primary)' }} title={f.value}>{f.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div key={i} className="trail-node">
                                <div className="trail-node-dot"></div>
                                <span className="trail-node-icon">{t.icon}</span>
                                <div className="trail-node-content">
                                  <div className="trail-node-title">{t.title}</div>
                                  <div className="trail-node-summary" title={t.summary}>{t.summary}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="relationship-buckets">
                        {activeSession.urls && activeSession.urls.length > 0 && (
                          <div className="bucket-card">
                            <div className="bucket-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Research Anchors</span>
                              <button className="micro-restore-btn" onClick={async () => {
                                const payload = { ...activeSession, files: [], windowTitles: [], dominantApps: [] };
                                if ((window as any).electronAPI && (window as any).electronAPI.resumeWorkflow) {
                                  await (window as any).electronAPI.resumeWorkflow(payload);
                                }
                              }}>↗ Open Links</button>
                            </div>
                            {activeSession.urls.slice(0, 3).map((u: string, i: number) => {
                              let domain = u;
                              try { domain = new URL(u).hostname; } catch(e) {}
                              return (
                                <div key={i} className="bucket-item" title={u}>
                                  <span className="bucket-item-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={14} color="var(--accent)" /></span>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{domain}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {activeSession.files && activeSession.files.length > 0 && (
                          <div className="bucket-card">
                            <div className="bucket-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Modified Items</span>
                              <button className="micro-restore-btn" onClick={async () => {
                                const payload = { ...activeSession, urls: [], windowTitles: [], dominantApps: [] };
                                if ((window as any).electronAPI && (window as any).electronAPI.resumeWorkflow) {
                                  await (window as any).electronAPI.resumeWorkflow(payload);
                                }
                              }}>↗ Open Files</button>
                            </div>
                            {activeSession.files.slice(0, 3).map((f: string, i: number) => {
                              const name = f.split(/[\\/]/).pop();
                              return (
                                <div key={i} className="bucket-item" title={f}>
                                  <span className="bucket-item-icon">📄</span>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="detail-empty-state">
                      <div className="detail-empty-icon-svg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"></path>
                        </svg>
                      </div>
                      <div className="detail-empty-title">Cognitive Context Drawer</div>
                      <div className="detail-empty-subtitle">Select any ambient session card from the left column to view its dynamic Discovery Trail, associated research resources, and file relationships.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="app-view active chat-container">
              <div className="chat-header">
                <div className="chat-header-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                Agentic Context Query
              </div>
              <div className="chat-history">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-message ${msg.role}`}>
                    <div className="chat-text" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    
                    {msg.sessionContext && (
                      <div className="chat-context-card">
                         <div className="context-card-header">
                            <span className="context-card-badge">SESSION MATCH</span>
                            <span className="context-card-time">{new Date(msg.sessionContext.startTime).toLocaleTimeString()}</span>
                         </div>
                         <div className="context-card-title">{msg.sessionContext.name}</div>
                         {msg.matchedUrl && <div className="context-card-detail" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={12} color="var(--accent)" /> {msg.matchedUrl}</div>}
                         {msg.matchedFile && <div className="context-card-detail">📄 {msg.matchedFile.split(/[\\/]/).pop()}</div>}
                      </div>
                    )}

                    {msg.actions && msg.actions.length > 0 && (
                      <div className="chat-actions-container">
                        {msg.actions.map((act: any, j: number) => (
                          <button key={j} className="agentic-action-btn" onClick={() => {
                            if ((window as any).electronAPI && (window as any).electronAPI.resumeWorkflow) {
                              (window as any).electronAPI.resumeWorkflow(act);
                            }
                          }}>
                            {act.icon} {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="chat-input-container">
                <input 
                  type="text" 
                  className="chat-input" 
                  placeholder={isAiTyping ? "IRIS is thinking..." : "Ask IRIS about your workflow... (e.g. 'What file was I editing?')"} 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleChatSubmit(); }}
                />
                <button className="chat-send-btn" onClick={handleChatSubmit}>
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
