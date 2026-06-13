import { useState, useEffect } from 'react';
import './dashboard.css';
import { CanvasGrid } from './CanvasGrid';

export default function App() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [currentTab, setCurrentTab] = useState<'timeline' | 'chat'>('timeline');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'agent', text: string, action?: any }[]>([
    { role: 'agent', text: 'Hello! I am your autonomous agent. I am silently capturing your workflow context. Ask me anything about what you were doing or what files you were editing!' }
  ]);
  const [chatInput, setChatInput] = useState('');

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');

    setTimeout(() => {
      const lowerQ = userMsg.toLowerCase();
      let responseText = "I checked your ambient timeline, but I couldn't find a direct match. Can you be more specific?";
      let action: any = null;

      if (lowerQ.includes('file') || lowerQ.includes('editing') || lowerQ.includes('code')) {
        const fileSession = sessions.find(s => s.files && s.files.length > 0);
        if (fileSession) {
          responseText = `You were editing \`${fileSession.files[0]}\` during your "${fileSession.name}" session. Shall I restore that environment for you right now?`;
          action = { 
            ...fileSession, 
            label: `Open ${fileSession.files[0]}` 
          };
        } else {
          responseText = "You haven't been editing any files recently that I have captured in my context window.";
        }
      } else if (lowerQ.includes('url') || lowerQ.includes('web') || lowerQ.includes('research')) {
        const urlSession = sessions.find(s => s.urls && s.urls.length > 0);
        if (urlSession) {
          responseText = `You were looking at \`${urlSession.urls[0]}\` during your "${urlSession.name}" session. I can reopen that web research for you.`;
          action = { 
            ...urlSession, 
            files: [],
            label: `Restore Web Research` 
          };
        }
      }

      setChatHistory(prev => [...prev, { role: 'agent', text: responseText, action }]);
    }, 1000);
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
        setActiveSession(prev => (prev && prev.id === update.id) || !prev ? update : prev);
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
      activeSession.urls.forEach((url: string) => {
        try {
          const u = new URL(url);
          const domain = u.hostname.replace('www.', '');
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
    if (activeSession.files) {
      activeSession.files.forEach((f: string) => {
        const title = f.split(/[\\/]/).pop() || f;
        trails.push({ type: 'file', title, summary: f, icon: '📄' });
      });
    }
    if (activeSession.dominantApps) {
      const uniqueApps = Array.from(new Set(activeSession.dominantApps.map((a: string) => formatAppName(a))));
      uniqueApps.forEach((app: string) => {
        const lower = app.toLowerCase();
        if (app && lower !== 'chrome' && lower !== 'browser') {
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
            <div className="sidebar-logo">I</div>
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
                            {s.dominantApps && Array.from(new Set(s.dominantApps.map((a: string) => formatAppName(a)))).map((app: string) => (
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
                          {trails.map((t, i) => (
                            t.type === 'domain_group' ? (
                              <div key={i} className="domain-group">
                                <div className="domain-group-header">
                                  <span style={{ marginRight: '8px', fontSize: '0.8rem' }}>🌐</span>
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
                            ) : (
                              <div key={i} className="trail-node">
                                <div className="trail-node-dot"></div>
                                <span className="trail-node-icon">{t.icon}</span>
                                <div className="trail-node-content">
                                  <div className="trail-node-title">{t.title}</div>
                                  <div className="trail-node-summary" title={t.summary}>{t.summary}</div>
                                </div>
                              </div>
                            )
                          ))}
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
                                  <span className="bucket-item-icon">🌐</span>
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
                    {msg.text}
                    {msg.action && (
                      <div style={{ marginTop: '12px' }}>
                        <button className="agentic-action-btn" onClick={() => {
                          if ((window as any).electronAPI && (window as any).electronAPI.resumeWorkflow) {
                            (window as any).electronAPI.resumeWorkflow(msg.action);
                          }
                        }}>
                          ⚡ {msg.action.label || 'Execute Action'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="chat-input-container">
                <input 
                  type="text" 
                  className="chat-input" 
                  placeholder="Ask IRIS about your workflow... (e.g. 'What file was I editing?')" 
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
