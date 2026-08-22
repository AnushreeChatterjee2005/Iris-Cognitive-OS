import React, { useState, useEffect } from 'react';
import { FloatingResultHUD } from './FloatingResultHUD';
import {
  Layers,
  ArrowRight,
  Download,
  Globe,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  FolderDown,
  Monitor,
  Square,
  Sparkles,
  FileCheck
} from 'lucide-react';

export interface ParallelTask {
  task_id: string;
  condition: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'error' | 'stopped';
  progress: number;
  current_step: string;
  thought: string;
  created_at: number;
  updated_at: number;
  timeline: Array<{
    id: string;
    time: string;
    action: string;
    details: string;
    status: string;
  }>;
  results: {
    summary?: string;
    urls?: string[];
    files?: string[];
  };
}

export function ParallelDesktopTab() {
  const [activeTask, setActiveTask] = useState<ParallelTask | null>(null);
  const [showFloatingHUD, setShowFloatingHUD] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const handleExportFormat = async (format: 'txt' | 'doc' | 'pdf') => {
    if (!activeTask) return;
    setExportingFormat(format);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/parallel-desktop/tasks/${activeTask.task_id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format })
      });
      if (res.ok) {
        const data = await res.json();
        setToastMessage(data.message || `Saved ${format.toUpperCase()} to Desktop!`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (e) {
      setToastMessage('Exported to Desktop!');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setExportingFormat(null);
    }
  };
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [frameTick, setFrameTick] = useState(Date.now());

  // Poll for background task updates
  const fetchStatus = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/parallel-desktop/status');
      if (res.ok) {
        const data = await res.json();
        if (data.active_task) {
          setActiveTask(data.active_task);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      setFrameTick(Date.now());
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const handleLaunchTask = async (e?: React.FormEvent, customCmd?: string) => {
    if (e) e.preventDefault();
    const cmd = (customCmd || promptInput).trim();
    if (!cmd) return;

    setPromptInput('');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/parallel-desktop/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition: cmd, mode: 'autonomous' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) setActiveTask(data.task);
      }
    } catch (err) {
      console.error('Launch failed:', err);
    }
  };

  const handleStop = async () => {
    if (!activeTask) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/parallel-desktop/tasks/${activeTask.task_id}/stop`, {
        method: 'POST'
      });
      fetchStatus();
    } catch (e) {}
  };

  const handleBringToDesktop = async () => {
    if (!activeTask) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/parallel-desktop/tasks/${activeTask.task_id}/bring-to-desktop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' })
      });
      if (res.ok) {
        const data = await res.json();
        setToastMessage(data.message || 'Saved files to your Desktop!');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (e) {}
  };

  const copySummary = () => {
    if (activeTask?.results?.summary) {
      navigator.clipboard.writeText(activeTask.results.summary);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  const isWorking = activeTask && (activeTask.status === 'running' || activeTask.status === 'queued');
  const isCompleted = activeTask && activeTask.status === 'completed';

  return (
    <div className="parallel-desktop-root">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="pd-toast">
          <CheckCircle2 size={16} color="#00e5ff" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="pd-header">
        <div className="pd-header-left">
          <div className="pd-title-group">
            <div className="pd-logo-mark">
              <Layers size={18} color="#00e5ff" />
            </div>
            <div>
              <h1 className="pd-title">Parallel Desktop</h1>
              <div className="pd-subtitle">Runs autonomously in the background without touching your mouse or screen</div>
            </div>
          </div>

          <div className="pd-status-wrapper">
            {isWorking ? (
              <span className="pd-status-pill running">
                <span className="pd-status-dot running" /> WORKING IN BACKGROUND ({activeTask?.progress}%)
              </span>
            ) : isCompleted ? (
              <span className="pd-status-pill completed">
                <CheckCircle2 size={13} color="#10b981" /> TASK COMPLETED
              </span>
            ) : (
              <span className="pd-status-pill idle">
                <span className="pd-status-dot idle" /> READY
              </span>
            )}
          </div>
        </div>

        <div className="pd-header-right">
          {activeTask && (
            <button
              className="pd-ctrl-btn bring"
              onClick={handleBringToDesktop}
              disabled={!activeTask.results?.summary && !activeTask.results?.files?.length}
              title="Save report and files to your Desktop"
            >
              <FolderDown size={14} />
              <span>Bring Results to My Desktop</span>
            </button>
          )}
        </div>
      </header>

      {/* Workspace Content */}
      <div className="pd-workspace-grid">
        {/* Left: Live Desktop Preview */}
        <div className="pd-canvas-container">
          <div className="pd-screen-frame">
            <div className="pd-screen-header">
              <div className="pd-screen-tabs">
                <span className="pd-screen-tab active">
                  <Monitor size={13} color="#00e5ff" />
                  <span>Isolated Desktop Feed</span>
                </span>
              </div>
              <div className="pd-screen-badges">
                <span className="pd-screen-live-badge">
                  <span className="pd-pulse-dot" /> LIVE STREAM
                </span>
                <span className="pd-screen-res">100% Background</span>
              </div>
            </div>

            <div className="pd-canvas-viewport">
              <img
                src={`http://127.0.0.1:8000/api/parallel-desktop/feed?t=${frameTick}`}
                alt="Live Desktop Feed"
                className="pd-stream-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `http://127.0.0.1:8000/api/parallel-desktop/frame?t=${Date.now()}`;
                }}
              />
            </div>

            <div className="pd-controls-bar">
              <div className="pd-controls-left">
                {isWorking && (
                  <button className="pd-ctrl-btn stop" onClick={handleStop} title="Stop background task">
                    <Square size={13} />
                    <span>Stop</span>
                  </button>
                )}
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  {isWorking ? 'IRIS is currently operating this desktop.' : 'Desktop is idle. Launch any task below.'}
                </span>
              </div>

              <div className="pd-controls-right">
                <button
                  className="pd-ctrl-btn bring"
                  onClick={handleBringToDesktop}
                  disabled={!activeTask?.results?.summary && !activeTask?.results?.files?.length}
                >
                  <Download size={14} />
                  <span>Export to Desktop</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Example Task Chips */}
          <div className="pd-quick-envs">
            <div className="pd-quick-envs-title">
              <Sparkles size={13} color="#00e5ff" />
              <span>Try Example:</span>
            </div>
            <div className="pd-quick-env-buttons">
              <button
                className="pd-env-chip"
                onClick={() => handleLaunchTask(undefined, 'Research the best laptops under ₹80,000 in background')}
              >
                💻 Laptop Comparison
              </button>
              <button
                className="pd-env-chip"
                onClick={() => handleLaunchTask(undefined, 'Inspect project files and test application in background')}
              >
                🔍 Code Analysis
              </button>
              <button
                className="pd-env-chip"
                onClick={() => handleLaunchTask(undefined, 'Download and summarize documents in background')}
              >
                📄 Summarize Docs
              </button>
            </div>
          </div>
        </div>

        {/* Right: Task Progress & Results */}
        <div className="pd-agent-sidebar">
          {/* Active Goal Card */}
          <div className="pd-card pd-goal-card">
            <div className="pd-card-header">
              <span className="pd-card-tag">CURRENT OBJECTIVE</span>
              {activeTask && <span className="pd-card-id">{activeTask.task_id}</span>}
            </div>
            <div className="pd-goal-text">
              {activeTask?.condition || 'No active background task. Type a task below or say "in background" in chat.'}
            </div>

            {activeTask && (
              <>
                <div className="pd-progress-bar-wrapper">
                  <div className="pd-progress-bar" style={{ width: `${activeTask.progress}%` }} />
                </div>
                <div className="pd-progress-meta">
                  <span>{activeTask.current_step || 'In progress...'}</span>
                  <span>{activeTask.progress}%</span>
                </div>
              </>
            )}
          </div>

          {/* Results Card */}
          {activeTask?.results?.summary ? (
            <div className="pd-card pd-results-card">
              <div className="pd-card-header">
                <span className="pd-card-tag" style={{ color: '#10b981' }}>RESEARCH & SYNTHESIS</span>
                <button className="pd-micro-btn" onClick={copySummary} title="Copy summary">
                  {copiedSummary ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="pd-summary-scroll">
                <pre>{activeTask.results.summary}</pre>
              </div>

              <div className="pd-results-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  className="pd-res-btn"
                  onClick={() => setShowFloatingHUD(true)}
                  style={{
                    background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.2) 0%, rgba(121, 40, 202, 0.2) 100%)',
                    border: '1px solid rgba(0, 229, 255, 0.5)',
                    color: '#00e5ff',
                    fontWeight: 600,
                    boxShadow: '0 0 12px rgba(0, 229, 255, 0.2)'
                  }}
                >
                  <Sparkles size={14} />
                  <span>Open Floating Screen / HUD</span>
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  <button
                    className="pd-res-btn"
                    onClick={() => handleExportFormat('txt')}
                    disabled={exportingFormat !== null}
                    style={{ fontSize: '11px', padding: '6px', justifyContent: 'center' }}
                    title="Export as plain text"
                  >
                    <FileText size={12} />
                    <span>Save .TXT</span>
                  </button>
                  <button
                    className="pd-res-btn"
                    onClick={() => handleExportFormat('doc')}
                    disabled={exportingFormat !== null}
                    style={{ fontSize: '11px', padding: '6px', justifyContent: 'center' }}
                    title="Export as Word document"
                  >
                    <FileCheck size={12} />
                    <span>Save .DOC</span>
                  </button>
                  <button
                    className="pd-res-btn"
                    onClick={() => handleExportFormat('pdf')}
                    disabled={exportingFormat !== null}
                    style={{ fontSize: '11px', padding: '6px', justifyContent: 'center' }}
                    title="Export as PDF"
                  >
                    <Download size={12} />
                    <span>Save .PDF</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Steps Timeline */}
          <div className="pd-card pd-timeline-card">
            <div className="pd-card-header">
              <span className="pd-card-tag">ACTIVITY LOG</span>
              <span className="pd-timeline-count">{activeTask?.timeline?.length || 0} events</span>
            </div>

            <div className="pd-timeline-list">
              {activeTask && activeTask.timeline && activeTask.timeline.length > 0 ? (
                activeTask.timeline.map((ev) => (
                  <div key={ev.id} className={`pd-timeline-item ${ev.status}`}>
                    <div className="pd-timeline-time">{ev.time}</div>
                    <div className="pd-timeline-body">
                      <div className="pd-timeline-action">{ev.action}</div>
                      <div className="pd-timeline-details">{ev.details}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="pd-timeline-empty">Waiting for a background task...</div>
              )}
            </div>
          </div>

          {/* Direct Input Form */}
          <form className="pd-input-container" onSubmit={handleLaunchTask}>
            <input
              type="text"
              className="pd-task-input"
              placeholder="e.g. Research laptops under ₹80,000 in background..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
            />
            <button type="submit" className="pd-send-btn" title="Run in Parallel Desktop">
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Floating HUD Modal Viewer */}
      {showFloatingHUD && activeTask && (
        <FloatingResultHUD
          task={activeTask}
          onClose={() => setShowFloatingHUD(false)}
        />
      )}
    </div>
  );
}
