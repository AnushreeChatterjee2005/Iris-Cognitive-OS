import React, { useState, useEffect } from 'react';
import './dashboard.css';
import { CanvasGrid } from './CanvasGrid';
import { TimelineAgent } from './ai/timelineAgent';
import { WorkspacesTab } from './WorkspacesTab';
import { ParallelDesktopTab } from './ParallelDesktopTab';
import { FloatingResultHUD } from './FloatingResultHUD';
import { Globe, Mic, Brain, Zap, CheckCircle2, Square, MessageSquare, Send, X, LayoutGrid, Layers } from 'lucide-react';

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
    // allow idle (start source) or typing_source (start target)
    if (status !== 'idle' && status !== 'typing_source') return;
    
    // Ignore clicks inside the command floater so we don't accidentally start drawing
    if ((e.target as HTMLElement).closest('.command-floater')) return;

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
      setStatus('typing_source');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else if (status === 'drawing_target') {
      setTargetBox(currentBox);
      setStatus('typing_target');
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
          target_bbox: targetBox, // can be null for single-box tasks
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
        }, 400);
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
      setStatus('idle');
      setSourceBox(null);
      setTargetBox(null);
      setCurrentBox(null);
      window.dispatchEvent(new Event('electron-window-hidden'));
      if ((window as any).electronAPI) {
        (window as any).electronAPI.hideWindow();
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
      c = ty > sy ? targetBox.y - 6 : targetBox.y + targetBox.w + 6;
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
      {currentBox && status !== 'running' && status !== 'typing_source' && status !== 'typing_target' && <div className="drawn-box drawing" style={{ ...boxStyle, borderColor: status === 'drawing_target' ? '#3498db' : '#f39c12', left: currentBox.x, top: currentBox.y, width: currentBox.w, height: currentBox.h }} />}

      {status !== 'running' && status === 'typing_target' && arrowPath && (
        <svg className="arrow-canvas" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 6, width: '100%', height: '100%' }}>
          <defs>
            <marker id="node-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(255, 255, 255, 0.8)" />
            </marker>
          </defs>
          <path d={arrowPath} fill="none" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#node-arrow)" opacity="0.9" />
        </svg>
      )}

      {(status === 'typing_source' || status === 'typing_target') && (sourceBox || targetBox) && (
        <div className="command-floater" style={{ 
          position: 'absolute', 
          zIndex: 10, 
          left: status === 'typing_target' && targetBox ? Math.max(200, Math.min(targetBox.x, window.innerWidth - 400)) : Math.max(200, Math.min(sourceBox.x, window.innerWidth - 400)), 
          top: status === 'typing_target' && targetBox ? Math.max(160, targetBox.y - 120) : Math.max(160, sourceBox.y - 120), 
          background: 'rgba(20, 20, 20, 0.95)', border: '1px solid rgba(255,255,255,0.1)', padding: '16px', borderRadius: '12px', width: '400px', backdropFilter: 'blur(10px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', fontFamily: "'Outfit', sans-serif" }}>
          <input 
            ref={inputRef}
            type="text" 
            className="command-input" 
            placeholder={"e.g. Extract the value and save it"}
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

function playPopSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch(e) {}
}

function BlobOverlay() {
  const BLOB_RADIUS = 20; // Smaller size
  const [pos, setPos] = useState({ x: window.innerWidth - BLOB_RADIUS, y: window.innerHeight / 2 });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [activePipelines, setActivePipelines] = useState<any[]>([]);
  const dragStart = React.useRef({ x: 0, y: 0 });
  const initialPos = React.useRef({ x: 0, y: 0 });
  const hasMoved = React.useRef(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const isMicOnRef = React.useRef(false);
  const [uiState, setUiState] = useState<'Idle' | 'Listening' | 'Thinking' | 'Working' | 'Done'>('Idle');
  const [recognition, setRecognition] = useState<any>(null);
  const [agentMessage, setAgentMessage] = useState('');
  const [ghostMousePos, setGhostMousePos] = useState<{x: number, y: number} | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [latestThought, setLatestThought] = useState('');
  const [activeFeedTask, setActiveFeedTask] = useState<string | null>(null);
  const [frameTick, setFrameTick] = useState(Date.now());
  const [pocketState, setPocketState] = useState<'idle' | 'collapsing' | 'pocketed' | 'expanding' | 'expanded'>('idle');
  const [pocketTask, setPocketTask] = useState<any>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const chatInputRef = React.useRef<HTMLInputElement | null>(null);

  // Floating Result HUD (Auto popup on task completion)
  const [floatingDossier, setFloatingDossier] = useState<any>(null);
  const seenDossierIdsRef = React.useRef<Set<string>>(new Set());
  const initialLoadRef = React.useRef(true);

  // Auto-detect completed parallel/research tasks and display immediately on user's screen
  useEffect(() => {
    const checkParallelCompletion = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/parallel-desktop/status');
        if (resp.ok) {
          const data = await resp.json();
          const task = data.active_task;
          if (task && task.status === 'completed' && task.results?.summary) {
            // On initial app mount, mark already completed past task as seen so it doesn't pop up old historical tasks
            if (initialLoadRef.current) {
              initialLoadRef.current = false;
              seenDossierIdsRef.current.add(task.task_id);
              return;
            }

            if (!seenDossierIdsRef.current.has(task.task_id)) {
              seenDossierIdsRef.current.add(task.task_id);
              setFloatingDossier(task);
              playPopSound();
              if ((window as any).electronAPI) {
                (window as any).electronAPI.enableBlobFocus?.();
                (window as any).electronAPI.setClickThrough?.(false);
              }
            }
          } else {
            initialLoadRef.current = false;
          }
        }
      } catch (e) {}
    };

    checkParallelCompletion();
    const interval = setInterval(checkParallelCompletion, 1200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (floatingDossier) {
      setIsChatOpen(false);
      if ((window as any).electronAPI) {
        (window as any).electronAPI.enableBlobFocus?.();
        (window as any).electronAPI.setClickThrough?.(false);
      }
    }
  }, [floatingDossier]);

  const handleCloseDossier = () => {
    setFloatingDossier(null);
    if ((window as any).electronAPI) {
      (window as any).electronAPI.disableBlobFocus?.();
      (window as any).electronAPI.setClickThrough?.(true);
    }
  };

  const toggleChatBox = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsChatOpen(prev => {
      const next = !prev;
      if (next) {
        if ((window as any).electronAPI?.enableBlobFocus) {
          (window as any).electronAPI.enableBlobFocus();
        }
        setTimeout(() => chatInputRef.current?.focus(), 50);
      } else {
        if ((window as any).electronAPI?.disableBlobFocus) {
          (window as any).electronAPI.disableBlobFocus();
        }
      }
      return next;
    });
  };

  const closeChat = () => {
    setIsChatOpen(false);
    if ((window as any).electronAPI?.disableBlobFocus) {
      (window as any).electronAPI.disableBlobFocus();
    }
  };

  const isMetaOS = (cmd: string) => {
    const c = cmd.toLowerCase();
    const metaKeywords = [
      'split', 'side by side', 'zen', 'focus mode', 'fullscreen', 'hide taskbar',
      'tile', 'restore', 'normal', 'spotlight', 'pip', 'pin', '70/30', '60/40', '50/50',
      'dev layout', 'three columns', '3 columns', 'center window', 'maximize'
    ];
    return metaKeywords.some(kw => c.includes(kw));
  };

  const isConversational = (cmd: string) => {
    const c = cmd.toLowerCase().trim();
    let stripped = c;
    for (const p of [
      'can you please ', 'could you please ', 'can you ', 'could you ', 'please ', 'iris, ', 'iris ',
      'i want you to ', 'help me ', 'would you mind ', 'go ahead and ', 'tell me ', 'give me '
    ]) {
      if (stripped.startsWith(p)) {
        stripped = stripped.slice(p.length).trim();
      }
    }
    const clean = stripped.replace(/[^\w\s]/gi, '').trim();

    // 1. Pure Greetings & Casual Pleasantries
    const greetings = [
      'hi', 'hello', 'hey', 'good morning', 'good evening', 'good afternoon', 'good night',
      'how are you', 'who are you', 'what are you', 'whats up', 'sup', 'yo', 'howdy',
      'thank you', 'thanks', 'thx', 'bye', 'goodbye', 'help', 'what can you do', 'what are you doing'
    ];
    if (greetings.includes(clean) || greetings.includes(c) || c.startsWith('hi ') || c.startsWith('hello ') || c.startsWith('hey ') || c.startsWith('good morning')) {
      return true;
    }

    // 2. Screen Perception & Workspace queries
    const perceptionTriggers = [
      'can you see my screen', 'can you see me', 'can you read my screen', 
      'are you watching my screen', 'what do you see on my screen', 'what is on my screen',
      'do you see my screen', 'what app is open', 'what is open', 'workspace status',
      'how is my workspace', "how's my workspace", 'what am i doing', 'what am i working on',
      'how is my setup', "how's my setup", 'state of my workspace'
    ];
    if (perceptionTriggers.some(p => c.includes(p) || stripped.includes(p))) {
      return true;
    }

    // 3. Informational questions & inquiries (starts with question words or asks to explain/summarize knowledge)
    const questionStarters = [
      'what is', 'what are', 'what was', 'what does', 'why is', 'why do', 'why does', 'who is',
      'where is', 'where are', 'how does', 'how do', 'how is', 'how can', 'explain', 'tell me about',
      'describe', 'define', 'summarize', 'is there', 'are there', 'do you know', 'which is', 'meaning of'
    ];
    if (questionStarters.some(q => stripped.startsWith(q) || c.startsWith(q))) {
      return true;
    }

    // 4. Action Verbs check for imperative OS execution commands (must be at the beginning of the command)
    const actionVerbs = [
      'open', 'launch', 'start', 'play', 'extract', 'write', 'type', 'copy', 'paste',
      'download', 'delete', 'run', 'send', 'calculate', 'scrape', 'convert', 'fill',
      'inject', 'close', 'exit', 'quit', 'kill', 'click', 'press', 'select',
      'tap', 'hit', 'switch to', 'focus', 'create', 'make', 'arrange', 'tile',
      'split', 'maximize', 'minimize', 'restore', 'restart', 'sandbox', 'quarantine'
    ];
    const startsWithAction = actionVerbs.some(v => stripped.startsWith(v));
    if (startsWithAction) {
      return false;
    }

    // If it ends with question mark or is conversational inquiry
    if (cmd.trim().endsWith('?')) {
      return true;
    }

    return false;
  };

  const processUnifiedCommand = async (commandText: string, isVoice: boolean = false) => {
    const text = commandText.trim();
    if (!text) return;

    // 1. Meta-OS Workspace Commands
    if (isMetaOS(text)) {
      setUiState('Working');
      playPopSound();
      setAgentMessage(`Arranging workspace...`);
      try {
        const metaResp = await fetch('http://127.0.0.1:8000/api/meta-os', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: text })
        });
        if (metaResp.ok) {
          const data = await metaResp.json();
          setUiState('Done');
          const msg = data.message || "Workspace arranged.";
          setAgentMessage(msg);
          if (isVoice) speak(msg);
          setTimeout(() => {
            setAgentMessage('');
            setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
          }, 3000);
        }
      } catch (err) {
        setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
        setAgentMessage("Could not arrange workspace.");
        setTimeout(() => setAgentMessage(''), 3000);
      }
      return;
    }

    // 2. Parallel Desktop Background Mode
    const isBackground = [
      "in background", "in the background", "background", "in parallel",
      "parallel desktop", "virtual desktop", "while i work", "while i continue coding", "without interrupting",
      "google scholar", "arxiv", "research", "find papers", "list of", "make a list of",
      "compare", "benchmark", "scrape", "literature review", "top laptops", "best laptops", "papers on"
    ].some(k => text.toLowerCase().includes(k));

    if (isBackground) {
      setUiState('Working');
      playPopSound();
      setAgentMessage(`Working in Parallel Desktop...`);
      if (isVoice) speak("Working on that in background.");
      try {
        const pResp = await fetch('http://127.0.0.1:8000/api/parallel-desktop/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ condition: text, mode: 'autonomous' })
        });
        if (pResp.ok) {
          const pData = await pResp.json();
          if (pData.task?.task_id) setActiveTaskId(pData.task.task_id);
          setUiState('Working');
          setAgentMessage("Running in Parallel Desktop!");
          setTimeout(() => {
            setAgentMessage('');
            setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
          }, 3000);
          return;
        }
      } catch (err) {}
    }

    // 3. Conversational Mode (Greetings, Questions, Pleasantries, Screen Perception, Workspace Q&A)
    if (isConversational(text)) {
      setUiState('Thinking');
      playPopSound();
      setAgentMessage("Thinking...");
      try {
        const chatResp = await fetch('http://127.0.0.1:8000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text })
        });
        const data = await chatResp.json();
        if (chatResp.ok && data.response) {
          setUiState('Done');
          setAgentMessage(data.response);
          if (isVoice) speak(data.response);
          setTimeout(() => {
            setAgentMessage('');
            setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
          }, Math.max(4000, (data.response?.length || 0) * 60));
        } else {
          setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
          setAgentMessage("How can I assist you?");
          setTimeout(() => setAgentMessage(''), 3000);
        }
      } catch (err) {
        setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
        setAgentMessage("Error connecting to chat engine.");
        setTimeout(() => setAgentMessage(''), 3000);
      }
      return;
    }

    // 4. Standard Automation Mode (Foreground OS Execution)
    setUiState('Working');
    playPopSound();
    setAgentMessage(`Executing...`);
    if (isVoice) speak("On it!");
    try {
      let inferredMode = "now";
      try {
        const intentResp = await fetch('http://127.0.0.1:8000/api/parse-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: text })
        });
        if (intentResp.ok) {
          const intentData = await intentResp.json();
          if (intentData.trigger) inferredMode = intentData.mode + ":" + intentData.trigger;
          else inferredMode = intentData.mode || "now";
        }
      } catch(e) {}

      const autoResp = await fetch('http://127.0.0.1:8000/api/watch-and-strike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_bbox: null,
          target_bbox: null,
          condition: text,
          action_text: "",
          mode: inferredMode
        })
      });
      if (autoResp.ok) {
        const data = await autoResp.json();
        if (data.task_id) {
          setActiveTaskId(data.task_id);
          
          // Poll for completion
          const pollInterval = setInterval(async () => {
            try {
              const statusResp = await fetch(`http://127.0.0.1:8000/api/status/${data.task_id}`);
              if (statusResp.ok) {
                const statusData = await statusResp.json();
                if (!statusData.active) {
                  clearInterval(pollInterval);
                  setUiState('Done');
                  setAgentMessage("Task complete.");
                  if (isVoice) speak("Task complete.");
                  setLatestThought('');
                  setTimeout(() => {
                    setAgentMessage('');
                    setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
                  }, 3000);
                }
              }
            } catch(e) {
              clearInterval(pollInterval);
              setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
            }
          }, 2000);
        }
      }
    } catch (err) {
      setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
      setAgentMessage("Error executing automation.");
      setTimeout(() => setAgentMessage(''), 3000);
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = chatInputText.trim();
    if (!text) return;
    
    setChatInputText('');
    closeChat();
    await processUnifiedCommand(text, false);
  };

  const handleMicClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uiState === 'Working' || uiState === 'Thinking') {
        if (activeTaskId) {
            try { await fetch(`http://127.0.0.1:8000/api/watch-and-strike/${activeTaskId}`, { method: 'DELETE' }); } catch(err) {}
            setActiveTaskId(null);
        }
        setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
        setAgentMessage('Execution cancelled.');
        setTimeout(() => setAgentMessage(''), 3000);
        setLatestThought('');
        return;
    }
    toggleMic(e);
  };

  const speak = (text: string) => {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1.3;
      utterance.rate = 1.05;
      utterance.volume = 1;
      
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferred = voices.find(v => v.name.includes('Zira') || v.name.includes('Female') || v.name.includes('Google')) || voices[0];
        utterance.voice = preferred;
      }
      
      window.speechSynthesis.speak(utterance);
    } catch(e) {
      console.error("Speech error:", e);
    }
  };

  // Ambient Cute Companion Remarks (Episodic Learned Habits - Subtle & Occasional)
  useEffect(() => {
    let dismissTimeout: any = null;
    const fetchCompanionRemark = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/companion/remarks');
        if (resp.ok) {
          const data = await resp.json();
          if (data.remark) {
            setAgentMessage(data.remark);
            // Auto-hide after 6 seconds so it doesn't stay permanently
            if (dismissTimeout) clearTimeout(dismissTimeout);
            dismissTimeout = setTimeout(() => {
              setAgentMessage('');
            }, 6000);
          }
        }
      } catch (e) {
        console.error("[Blob] Companion remarks fetch failed:", e);
      }
    };

    // First remark after 10 seconds, then only once every 5 minutes (300,000 ms)
    const initialTimer = setTimeout(fetchCompanionRemark, 10000);
    const interval = setInterval(fetchCompanionRemark, 300000);

    return () => {
      clearTimeout(initialTimer);
      if (dismissTimeout) clearTimeout(dismissTimeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    
    let logEventSource: EventSource | null = null;
    const connectLogSSE = () => {
      if (logEventSource) logEventSource.close();
      logEventSource = new EventSource('http://127.0.0.1:8000/api/logs/stream');
      logEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log') {
            const rawText = data.text || '';
            const rawLower = rawText.toLowerCase();
            
            // Check if this is a ReAct Iteration log containing reasoning
            // Format: "[task_id] ReAct Iteration X: ACTION - Reasoning text here"
            const reactMatch = rawText.match(/ReAct Iteration \d+:[^-]+-\s*(.*)/i);
            
            if (reactMatch && reactMatch[1]) {
                setLatestThought(reactMatch[1].trim());
            } else {
                let humanText = "Thinking...";
                if (rawLower.includes('parsed condition') || rawLower.includes('intent parsing')) humanText = "Understanding request...";
                else if (rawLower.includes('state change') || rawLower.includes('verifying condition')) humanText = "Analyzing screen state...";
                else if (rawLower.includes('evaluation: yes') || rawLower.includes('condition met') || rawLower.includes('firing background')) humanText = "Condition met! Taking action...";
                else if (rawLower.includes('evaluation: no') || rawLower.includes('sleep') || rawLower.includes('wait') || rawLower.includes('cooldown')) humanText = "Watching for changes...";
                else if (rawLower.includes('click') || rawLower.includes('type') || rawLower.includes('scroll')) humanText = "Executing action...";
                else if (rawLower.includes('fallback') || rawLower.includes('react loop')) humanText = "Planning next move...";
                else if (rawLower.includes('success') || rawLower.includes('finished') || rawLower.includes('done')) humanText = "Task completed.";
                else if (rawLower.includes('error') || rawLower.includes('failed')) humanText = "Encountered an issue.";
                
                // Only update if an active task is running and it's a meaningful change
                if (humanText !== "Thinking...") {
                    setLatestThought(humanText);
                    setTimeout(() => {
                      setLatestThought((prev) => (prev === humanText ? '' : prev));
                    }, 3000);
                }
            }
          }
        } catch (e) {}
      };
      logEventSource.onerror = () => {
        logEventSource?.close();
        setTimeout(connectLogSSE, 3000);
      };
    };
    connectLogSSE();

    const connectSSE = () => {
      if (eventSource) {
        eventSource.close();
      }
      
      eventSource = new EventSource('http://127.0.0.1:8000/api/mic/events');
      
      eventSource.onopen = () => {
        console.log("Connected to Mic SSE");
      };

      const handleMessage = async (event: any) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ghost_mouse') {
          setGhostMousePos({ x: data.x, y: data.y });
          setTimeout(() => setGhostMousePos(null), 2000); // Hide after 2 seconds
          return;
        }
        if (data.type === 'heard') {
          const rawText = (data.text || '').trim();
          if (!rawText) return;
          const text = rawText.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ');
          if (!text) return;

          // Strict Wake-word requirement: Only execute if "iris" (or phonetic variations) is in the command
          const hasWakeWord = text.includes('iris') || /\b(iris|ires|iriss|irish|ayris|isis|eyris)\b/i.test(rawText) || /\b(iris|ires|iriss|irish|ayris|isis|eyris)\b/i.test(text);
          if (!hasWakeWord) {
            // Completely ignore ambient speech/room talk unless addressed to "iris"
            return;
          }

          console.log("[Mic Heard]:", rawText);

          // Clean wake words to extract actual command
          const cleaned = rawText
            .replace(/\b(hey|hi|hello|ok|okay)?\s*(iris|ires|iriss|irish|ayris|isis|eyris)\b[,:]?\s*/gi, '')
            .trim();
          const cleanedLower = cleaned.toLowerCase().replace(/[^\w\s]/gi, '').trim();

          // Check if purely a greeting or check-in
          const isGreeting = !cleaned || (['hi', 'hello', 'hey', 'are you there', 'can you hear me', 'yo', 'sup'].includes(cleanedLower));
          if (isGreeting) {
            const msg = "Yes, I can hear you! How can I help?";
            playPopSound();
            setAgentMessage(msg);
            speak(msg);
            setTimeout(() => setAgentMessage(''), 4000);
            return;
          }

          // Execute command via unified engine with spoken voice feedback
          await processUnifiedCommand(cleaned, true);
        }
      } catch (e) {
        console.error("SSE parse error", e);
      }
      };

      eventSource.onmessage = handleMessage;

      eventSource.onerror = () => {
        console.error("SSE disconnected. Reconnecting in 3s...");
        eventSource?.close();
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Auto-clear the thought bubble after 4 seconds of inactivity
  useEffect(() => {
    if (latestThought) {
      const timer = setTimeout(() => {
        setLatestThought("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [latestThought]);

  useEffect(() => {
    if (uiState === 'Idle' && activePipelines.length === 0) {
      setLatestThought('');
    }
  }, [uiState, activePipelines.length]);

  const toggleMic = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMicOnRef.current) {
      setIsMicOn(true);
      isMicOnRef.current = true;
      setUiState('Listening');
      try {
        await fetch('http://127.0.0.1:8000/api/mic/start', { method: 'POST' });
      } catch(e) {}
    } else {
      setIsMicOn(false);
      isMicOnRef.current = false;
      setUiState('Idle');
      try {
        await fetch('http://127.0.0.1:8000/api/mic/stop', { method: 'POST' });
      } catch(e) {}
    }
  };

  useEffect(() => {
    const checkPipelines = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/pipelines');
        if (res.ok) {
          const data = await res.json();
          if (data.pipelines) {
             setActivePipelines(data.pipelines);
             if (activeTaskId) {
               const task = data.pipelines.find((p: any) => p.task_id === activeTaskId);
               if (task) {
                 if (task.thought) setLatestThought(task.thought);
                 if (task.current_action && task.current_action !== task.thought) {
                   setAgentMessage(task.current_action);
                 }
                 if (task.status === 'Success' || task.status === 'finished') {
                   setUiState('Done');
                   setLatestThought(task.thought || "Task complete.");
                   setAgentMessage(task.thought || "Task completed successfully!");
                   setTimeout(() => {
                     setAgentMessage('');
                     setLatestThought('');
                     setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
                     setActiveTaskId(null);
                   }, 4000);
                 }
               } else if (data.pipelines.length === 0 && uiState === 'Working') {
                 setUiState('Done');
                 setAgentMessage("Task completed successfully!");
                 setTimeout(() => {
                   setAgentMessage('');
                   setLatestThought('');
                   setUiState(isMicOnRef.current ? 'Listening' : 'Idle');
                   setActiveTaskId(null);
                 }, 3000);
               }
             } else if (data.pipelines.length > 0) {
               const latest = data.pipelines[0];
               if (latest.thought) setLatestThought(latest.thought);
             }
          }
        }
      } catch(e) {}
    };
    
    checkPipelines();
    const interval = setInterval(checkPipelines, (uiState === 'Working' || activePipelines.length > 0) ? 400 : 3000);
    return () => clearInterval(interval);
  }, [activeTaskId, uiState, activePipelines.length]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialPos.current = pos;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    
    // Increased threshold to 15px to prevent sloppy clicks from registering as drags
    if (Math.abs(dx) > 15 || Math.abs(dy) > 15) {
      hasMoved.current = true;
    }
    
    let newX = initialPos.current.x + dx;
    let newY = initialPos.current.y + dy;
    
    newX = Math.max(BLOB_RADIUS, Math.min(newX, window.innerWidth - BLOB_RADIUS));
    newY = Math.max(BLOB_RADIUS, Math.min(newY, window.innerHeight - BLOB_RADIUS));
    
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (!hasMoved.current) {
      if ((window as any).electronAPI && (window as any).electronAPI.toggleDashboard) {
        (window as any).electronAPI.toggleDashboard({ x: pos.x, y: pos.y });
      }
    }
    
    // Snap to nearest edge on release
    const distLeft = pos.x;
    const distRight = window.innerWidth - pos.x;
    const distTop = pos.y;
    const distBottom = window.innerHeight - pos.y;
    const min = Math.min(distLeft, distRight, distTop, distBottom);
    
    let snapX = pos.x;
    let snapY = pos.y;
    if (min === distLeft) snapX = BLOB_RADIUS;
    else if (min === distRight) snapX = window.innerWidth - BLOB_RADIUS;
    else if (min === distTop) snapY = BLOB_RADIUS;
    else snapY = window.innerHeight - BLOB_RADIUS;
    
    setPos({ x: snapX, y: snapY });

    if (!isHovered && (window as any).electronAPI) {
      (window as any).electronAPI.setClickThrough(true);
    }
  };

  const hoverTimeoutRef = React.useRef<any>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
    if ((window as any).electronAPI) {
      (window as any).electronAPI.setClickThrough(false);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isChatOpen && !floatingDossier) {
        setIsHovered(false);
      }
      if (!isDragging && !isChatOpen && !floatingDossier && (window as any).electronAPI) {
        (window as any).electronAPI.setClickThrough(true);
      }
    }, 250);
  };

  let transformX = 0;
  let transformY = 0;
  if (!isHovered && !isDragging && !isChatOpen) {
    if (pos.x <= BLOB_RADIUS) transformX = -BLOB_RADIUS;
    else if (pos.x >= window.innerWidth - BLOB_RADIUS) transformX = BLOB_RADIUS;
    else if (pos.y <= BLOB_RADIUS) transformY = -BLOB_RADIUS;
    else if (pos.y >= window.innerHeight - BLOB_RADIUS) transformY = BLOB_RADIUS;
  }

  const distLeft = pos.x;
  const distRight = window.innerWidth - pos.x;
  const distTop = pos.y;
  const distBottom = window.innerHeight - pos.y;
  const minEdge = Math.min(distLeft, distRight, distTop, distBottom);

  let micStyle: React.CSSProperties = {
      position: 'absolute',
      background: 'transparent',
      border: 'none',
      width: '28px', height: '28px',
      display: (isHovered || isMicOn || isChatOpen || uiState !== 'Idle') ? 'flex' : 'none',
      justifyContent: 'center', alignItems: 'center',
      cursor: 'pointer',
      pointerEvents: 'auto',
      color: isMicOn ? '#ff3232' : 'white',
      zIndex: 10005,
      transition: 'all 0.2s',
      filter: isMicOn ? 'drop-shadow(0 0 8px rgba(255, 50, 50, 0.8))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
  };

  let chatToggleStyle: React.CSSProperties = {
      position: 'absolute',
      background: isChatOpen ? 'rgba(0, 229, 255, 0.25)' : 'transparent',
      border: isChatOpen ? '1px solid #00e5ff' : 'none',
      borderRadius: '50%',
      width: '28px', height: '28px',
      display: (isHovered || isChatOpen || isMicOn || uiState !== 'Idle') ? 'flex' : 'none',
      justifyContent: 'center', alignItems: 'center',
      cursor: 'pointer',
      pointerEvents: 'auto',
      color: isChatOpen ? '#00e5ff' : 'white',
      zIndex: 10005,
      transition: 'all 0.2s',
      filter: isChatOpen ? 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.8))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
  };

  let chatBoxContainerStyle: React.CSSProperties = {
      position: 'absolute',
      background: 'rgba(10, 15, 25, 0.98)',
      border: '1px solid rgba(0, 229, 255, 0.45)',
      borderRadius: '24px',
      padding: '6px 10px 6px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '320px',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.85), 0 0 20px rgba(0, 229, 255, 0.25)',
      backdropFilter: 'blur(20px)',
      zIndex: 999999,
      pointerEvents: 'auto',
      transition: 'opacity 0.15s ease, transform 0.15s ease'
  };

  let chatStyle: React.CSSProperties = {
    position: 'absolute',
    background: 'rgba(10, 15, 25, 0.96)',
    border: '1px solid rgba(0, 229, 255, 0.4)',
    padding: '10px 16px',
    borderRadius: '16px',
    color: '#00e5ff',
    fontSize: '12.5px',
    fontWeight: 500,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    maxWidth: '360px',
    minWidth: '220px',
    width: 'max-content',
    boxSizing: 'border-box',
    lineHeight: '1.45',
    pointerEvents: 'none',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 16px rgba(0, 229, 255, 0.25)',
    zIndex: 999998,
    backdropFilter: 'blur(16px)',
    fontFamily: "'Outfit', sans-serif",
    transition: 'all 0.15s ease'
  };
  
  let chatPointerStyle: React.CSSProperties = {
    position: 'absolute',
    width: '10px',
    height: '10px',
    background: 'rgba(20,20,20,0.95)',
    borderBottom: '1px solid rgba(0, 229, 255, 0.4)',
    borderRight: '1px solid rgba(0, 229, 255, 0.4)'
  };
  
  let bubblesContainerStyle: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    gap: '10px',
    pointerEvents: 'auto',
  };
  
  let bubbleTextStyle: React.CSSProperties = {
    position: 'absolute',
  };

  // The parent container is (BLOB_RADIUS + 40)*2 = 120x120. The core is 40x40 in the center.
  if (minEdge === distRight) {
    micStyle.top = '30%'; micStyle.left = '-28px'; micStyle.transform = 'translateY(-50%)';
    chatToggleStyle.top = '70%'; chatToggleStyle.left = '-28px'; chatToggleStyle.transform = 'translateY(-50%)';
    chatBoxContainerStyle.top = '50%'; chatBoxContainerStyle.right = '100%'; chatBoxContainerStyle.marginRight = '35px'; chatBoxContainerStyle.transform = 'translateY(-50%)';
    
    if (isChatOpen) {
      chatStyle.bottom = 'calc(50% + 28px)'; chatStyle.right = '100%'; chatStyle.marginRight = '35px'; chatStyle.transform = 'none';
      chatPointerStyle.bottom = '-6px'; chatPointerStyle.right = '20px'; chatPointerStyle.transform = 'rotate(45deg)';
    } else {
      chatStyle.top = '50%'; chatStyle.right = '100%'; chatStyle.marginRight = '35px'; chatStyle.transform = 'translateY(-50%)';
      chatPointerStyle.top = '50%'; chatPointerStyle.right = '-6px'; chatPointerStyle.transform = 'translateY(-50%) rotate(-45deg)';
    }
    
    bubblesContainerStyle.top = 'calc(50% + 80px)'; bubblesContainerStyle.right = '120%'; bubblesContainerStyle.transform = 'translateY(-50%)'; bubblesContainerStyle.flexDirection = 'column';
    bubbleTextStyle.top = '50%'; bubbleTextStyle.right = '32px'; bubbleTextStyle.transform = 'translateY(-50%)';
  } else if (minEdge === distLeft) {
    micStyle.top = '30%'; micStyle.right = '-28px'; micStyle.transform = 'translateY(-50%)';
    chatToggleStyle.top = '70%'; chatToggleStyle.right = '-28px'; chatToggleStyle.transform = 'translateY(-50%)';
    chatBoxContainerStyle.top = '50%'; chatBoxContainerStyle.left = '100%'; chatBoxContainerStyle.marginLeft = '35px'; chatBoxContainerStyle.transform = 'translateY(-50%)';
    
    if (isChatOpen) {
      chatStyle.bottom = 'calc(50% + 28px)'; chatStyle.left = '100%'; chatStyle.marginLeft = '35px'; chatStyle.transform = 'none';
      chatPointerStyle.bottom = '-6px'; chatPointerStyle.left = '20px'; chatPointerStyle.transform = 'rotate(45deg)';
    } else {
      chatStyle.top = '50%'; chatStyle.left = '100%'; chatStyle.marginLeft = '35px'; chatStyle.transform = 'translateY(-50%)';
      chatPointerStyle.top = '50%'; chatPointerStyle.left = '-6px'; chatPointerStyle.transform = 'translateY(-50%) rotate(135deg)';
    }
    
    bubblesContainerStyle.top = 'calc(50% + 80px)'; bubblesContainerStyle.left = '120%'; bubblesContainerStyle.transform = 'translateY(-50%)'; bubblesContainerStyle.flexDirection = 'column';
    bubbleTextStyle.top = '50%'; bubbleTextStyle.left = '32px'; bubbleTextStyle.transform = 'translateY(-50%)';
  } else if (minEdge === distTop) {
    micStyle.bottom = '-28px'; micStyle.left = '35%'; micStyle.transform = 'translateX(-50%)';
    chatToggleStyle.bottom = '-28px'; chatToggleStyle.left = '65%'; chatToggleStyle.transform = 'translateX(-50%)';
    chatBoxContainerStyle.top = '100%'; chatBoxContainerStyle.left = '50%'; chatBoxContainerStyle.marginTop = '35px'; chatBoxContainerStyle.transform = 'translateX(-50%)';
    
    if (isChatOpen) {
      chatStyle.top = 'calc(100% + 55px)'; chatStyle.left = '50%'; chatStyle.marginTop = '35px'; chatStyle.transform = 'translateX(-50%)';
    } else {
      chatStyle.top = '100%'; chatStyle.left = '50%'; chatStyle.marginTop = '35px'; chatStyle.transform = 'translateX(-50%)';
    }
    chatPointerStyle.top = '-6px'; chatPointerStyle.left = '50%'; chatPointerStyle.transform = 'translateX(-50%) rotate(-135deg)';
    bubblesContainerStyle.top = '120%'; bubblesContainerStyle.left = 'calc(50% + 80px)'; bubblesContainerStyle.transform = 'translateX(-50%)'; bubblesContainerStyle.flexDirection = 'row';
    bubbleTextStyle.top = '32px'; bubbleTextStyle.left = '50%'; bubbleTextStyle.transform = 'translateX(-50%)';
  } else {
    // Bottom edge (default)
    micStyle.top = '-28px'; micStyle.left = '35%'; micStyle.transform = 'translateX(-50%)';
    chatToggleStyle.top = '-28px'; chatToggleStyle.left = '65%'; chatToggleStyle.transform = 'translateX(-50%)';
    chatBoxContainerStyle.bottom = '100%'; chatBoxContainerStyle.left = '50%'; chatBoxContainerStyle.marginBottom = '35px'; chatBoxContainerStyle.transform = 'translateX(-50%)';
    
    if (isChatOpen) {
      chatStyle.bottom = 'calc(100% + 55px)'; chatStyle.left = '50%'; chatStyle.marginBottom = '35px'; chatStyle.transform = 'translateX(-50%)';
    } else {
      chatStyle.bottom = '100%'; chatStyle.left = '50%'; chatStyle.marginBottom = '35px'; chatStyle.transform = 'translateX(-50%)';
    }
    chatPointerStyle.bottom = '-6px'; chatPointerStyle.left = '50%'; chatPointerStyle.transform = 'translateX(-50%) rotate(45deg)';
    bubblesContainerStyle.bottom = '120%'; bubblesContainerStyle.left = 'calc(50% + 80px)'; bubblesContainerStyle.transform = 'translateX(-50%)'; bubblesContainerStyle.flexDirection = 'row';
    bubbleTextStyle.bottom = '32px'; bubbleTextStyle.left = '50%'; bubbleTextStyle.transform = 'translateX(-50%)';
  }



  return (
    <div 
      style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'fixed',
        top: 0, left: 0,
        pointerEvents: 'none',
        zIndex: 9999
      }}
    >
      <div 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'absolute',
          left: pos.x - (BLOB_RADIUS + 40),
          top: pos.y - (BLOB_RADIUS + 40),
          width: `${(BLOB_RADIUS + 40) * 2}px`,
          height: `${(BLOB_RADIUS + 40) * 2}px`,
          borderRadius: '50%',
          background: 'transparent',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'auto',
          transform: `translate(${transformX}px, ${transformY}px)`,
          transition: isDragging ? 'none' : (isHovered || isChatOpen) ? 'left 0.5s cubic-bezier(0.16, 1, 0.3, 1), top 0.5s cubic-bezier(0.16, 1, 0.3, 1)' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.5s, left 0.5s cubic-bezier(0.16, 1, 0.3, 1), top 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          cursor: isDragging ? 'grabbing' : 'pointer'
        }}
        className={isHovered || isChatOpen ? 'blob-hovered' : ''}
      >
        <style>{`
          .blob-hovered {
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1) 0s, left 0.5s cubic-bezier(0.16, 1, 0.3, 1), top 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          @keyframes pulse-glow {
            0% { box-shadow: 0 0 15px rgba(138, 43, 226, 0.4), inset 0 0 10px rgba(0, 191, 255, 0.3); }
            50% { box-shadow: 0 0 25px rgba(138, 43, 226, 0.8), inset 0 0 15px rgba(0, 191, 255, 0.6); }
            100% { box-shadow: 0 0 15px rgba(138, 43, 226, 0.4), inset 0 0 10px rgba(0, 191, 255, 0.3); }
          }
          @keyframes float-face {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-2px) rotate(2deg); }
          }
          @keyframes blink {
            0%, 96%, 98% { transform: scaleY(1); }
            97% { transform: scaleY(0.1); }
          }
          @keyframes fadeInUpBubble {
            from { opacity: 0; transform: translate(-50%, 10px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
          .blob-core {
            width: ${BLOB_RADIUS * 2}px;
            height: ${BLOB_RADIUS * 2}px;
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, rgba(0,191,255,1) 0%, rgba(138,43,226,1) 100%);
            animation: pulse-glow 2.5s infinite ease-in-out;
            pointer-events: none;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            opacity: 1 !important; /* Forced to 1 to ensure visibility */
            z-index: 10000;
          }
          
          .blob-core.state-Listening { animation: pulse-listening 1.5s infinite ease-in-out; background: radial-gradient(circle at 30% 30%, rgba(255,100,100,1) 0%, rgba(200,43,43,1) 100%); }
          .blob-core.state-Thinking { animation: pulse-thinking 1s infinite ease-in-out; background: radial-gradient(circle at 30% 30%, rgba(200,100,255,1) 0%, rgba(138,43,226,1) 100%); }
          .blob-core.state-Working { animation: pulse-working 0.5s infinite ease-in-out; background: radial-gradient(circle at 30% 30%, rgba(255,200,100,1) 0%, rgba(255,140,0,1) 100%); }
          .blob-core.state-Done { animation: pulse-done 2s infinite ease-in-out; background: radial-gradient(circle at 30% 30%, rgba(100,255,150,1) 0%, rgba(46,204,113,1) 100%); }
          
          @keyframes pulse-listening {
            0%, 100% { box-shadow: 0 0 15px rgba(255, 50, 50, 0.6), inset 0 0 10px rgba(255, 50, 50, 0.4); }
            50% { box-shadow: 0 0 35px rgba(255, 50, 50, 1), inset 0 0 15px rgba(255, 50, 50, 0.7); }
          }
          @keyframes pulse-thinking {
            0%, 100% { box-shadow: 0 0 15px rgba(180, 100, 255, 0.6), inset 0 0 10px rgba(180, 100, 255, 0.4); }
            50% { box-shadow: 0 0 30px rgba(180, 100, 255, 0.9), inset 0 0 15px rgba(180, 100, 255, 0.7); }
          }
          @keyframes pulse-working {
            0%, 100% { box-shadow: 0 0 15px rgba(255, 180, 50, 0.6), inset 0 0 10px rgba(255, 180, 50, 0.4); }
            50% { box-shadow: 0 0 30px rgba(255, 180, 50, 0.9), inset 0 0 15px rgba(255, 180, 50, 0.7); }
          }
          @keyframes pulse-done {
            0%, 100% { box-shadow: 0 0 15px rgba(80, 255, 120, 0.6), inset 0 0 10px rgba(80, 255, 120, 0.4); }
            50% { box-shadow: 0 0 25px rgba(80, 255, 120, 0.8), inset 0 0 15px rgba(80, 255, 120, 0.6); }
          }
          .blob-hovered .blob-core {
            transform: scale(1.15);
          }
          .blob-face {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: float-face 4s infinite ease-in-out;
          }
          .iris-sclera {
            width: 22px;
            height: 22px;
            background: #ffffff;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 0 8px rgba(0, 191, 255, 0.8);
            animation: blink 5s infinite;
          }
          .iris-pupil {
            width: 12px;
            height: 12px;
            background: radial-gradient(circle at center, #101014 40%, rgba(138,43,226,0.9) 100%);
            border-radius: 50%;
            position: relative;
          }
          .iris-highlight {
            width: 3.5px;
            height: 3.5px;
            background: #ffffff;
            border-radius: 50%;
            position: absolute;
            top: 1.5px;
            right: 2px;
          }
          .automation-indicator {
            position: absolute;
            top: -2px;
            right: -2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #00e5ff;
            box-shadow: 0 0 10px #00e5ff, 0 0 20px #00e5ff;
            animation: pulse-indicator 1.5s infinite;
            z-index: 10001;
            border: 1px solid rgba(255, 255, 255, 0.8);
          }
          @keyframes pulse-indicator {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(0, 229, 255, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 229, 255, 0); }
          }
          .blob-tooltip {
            position: absolute;
            top: calc(100% + 15px);
            left: 50%;
            transform: translateX(-50%);
            background: rgba(10, 10, 10, 0.85);
            backdrop-filter: blur(15px);
            border: 1px solid rgba(0, 229, 255, 0.4);
            border-radius: 8px;
            padding: 10px 14px;
            color: #fff;
            font-size: 13px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            white-space: nowrap;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            z-index: 10002;
          }
          .blob-hovered .blob-tooltip {
            opacity: 1;
          }
          .blob-tooltip-title {
            color: #00e5ff;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .blob-tooltip-cond {
            color: #ddd;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        `}</style>
        {(agentMessage || (latestThought && uiState !== 'Idle')) && (
          <div style={chatStyle}>
            {latestThought && uiState !== 'Idle' && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '8px',
                color: '#e0f7fa', 
                fontSize: '12px', 
                fontWeight: 500,
                lineHeight: '1.45',
                marginBottom: agentMessage ? '8px' : '0' 
              }}>
                <Brain size={15} style={{ color: '#00e5ff', flexShrink: 0, marginTop: '2px', animation: 'pulse 1.5s infinite' }} />
                <span style={{ wordBreak: 'break-word' }}>{latestThought}</span>
              </div>
            )}
            {agentMessage && !latestThought && <span>{agentMessage}</span>}
            <div style={chatPointerStyle} />
          </div>
        )}
        <div className={`blob-core state-${uiState}`}>
          {activePipelines.length > 0 && (
            <div className="iris-bubbles-container" style={bubblesContainerStyle}>
              {activePipelines.map((pipeline: any, idx: number) => (
                <div key={pipeline.task_id} className="iris-bubble-wrapper">
                  {/* The Bubble */}
                  <div 
                    className="iris-bubble"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFeedTask(activeFeedTask === pipeline.task_id ? null : pipeline.task_id);
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Click to toggle Live Sandbox Preview"
                  >
                    <span className="iris-bubble-dot" />
                  </div>
                  
                  {/* The Clean Minimal Task Card */}
                  <div 
                    className="iris-bubble-text" 
                    style={{ 
                      ...bubbleTextStyle, 
                      opacity: 1, 
                      pointerEvents: 'auto', 
                      minWidth: '240px',
                      maxWidth: '340px',
                      width: '300px',
                      background: 'rgba(10, 15, 25, 0.94)',
                      border: '1px solid rgba(0, 229, 255, 0.3)',
                      borderRadius: '14px',
                      padding: '12px 16px',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 229, 255, 0.2)',
                      backdropFilter: 'blur(16px)',
                      fontFamily: "'Outfit', sans-serif",
                      boxSizing: 'border-box',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      whiteSpace: 'normal'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e5ff', display: 'inline-block', boxShadow: '0 0 8px #00e5ff' }} />
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', color: '#00e5ff', textTransform: 'uppercase' }}>
                          {pipeline.mode && pipeline.mode.startsWith('sandbox') ? 'SANDBOX TASK' : 'BACKGROUND TASK'}
                        </span>
                      </div>
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          fetch(`http://127.0.0.1:8000/api/watch-and-strike/${pipeline.task_id}`, { method: 'DELETE' });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        style={{ 
                          cursor: 'pointer', 
                          width: '18px', 
                          height: '18px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          borderRadius: '4px',
                          background: 'rgba(255, 60, 60, 0.15)',
                          color: '#ff4d4d',
                          fontSize: '11px',
                          lineHeight: 1
                        }}
                        title="Cancel Task"
                      >
                        ✕
                      </div>
                    </div>
                    
                    {/* Clean Task Objective (No duplicate thinking shown here) */}
                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.95)', fontWeight: 500, lineHeight: 1.4, margin: '2px 0', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                      {pipeline.condition}
                    </div>
                    
                    {/* Live Sandbox Preview Frame if sandbox mode */}
                    {pipeline.mode && pipeline.mode.startsWith('sandbox') && (
                      <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(0, 229, 255, 0.3)', background: '#000' }}>
                        <img 
                          src={`http://127.0.0.1:8000/api/sandbox/frame/IRIS_Room_${pipeline.task_id.slice(-6)}?t=${frameTick}`}
                          alt="Sandbox Preview" 
                          style={{ width: '100%', maxHeight: '120px', objectFit: 'contain', display: 'block' }}
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="blob-face">
            <div className="iris-sclera">
              <div className="iris-pupil">
                <div className="iris-highlight" />
              </div>
            </div>
          </div>
        </div>
        
        {/* Floating Mini Chat Input Box */}
        {isChatOpen && (
          <form 
            onSubmit={handleChatSubmit} 
            style={chatBoxContainerStyle}
            onMouseEnter={() => { if ((window as any).electronAPI) (window as any).electronAPI.setClickThrough(false); }}
            onMouseLeave={() => { if ((window as any).electronAPI && !chatInputRef.current?.matches(':focus')) (window as any).electronAPI.setClickThrough(true); }}
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e5ff', display: 'inline-block', boxShadow: '0 0 8px #00e5ff' }} />
            <input 
              ref={chatInputRef}
              type="text" 
              value={chatInputText} 
              onChange={e => setChatInputText(e.target.value)}
              onFocus={() => {
                if ((window as any).electronAPI) {
                  (window as any).electronAPI.setClickThrough(false);
                }
              }}
              onClick={e => {
                e.stopPropagation();
                if ((window as any).electronAPI) {
                  (window as any).electronAPI.setClickThrough(false);
                }
              }}
              placeholder="Type an order or ask IRIS..."
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  closeChat();
                }
              }}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '12px',
                fontFamily: "'Outfit', sans-serif"
              }}
            />
            <button 
              type="submit" 
              style={{
                background: 'rgba(0, 229, 255, 0.15)',
                border: '1px solid rgba(0, 229, 255, 0.4)',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00e5ff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Send Command (Enter)"
            >
              <Send size={11} />
            </button>
            <div 
              onClick={closeChat}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255, 255, 255, 0.4)',
                padding: '2px'
              }}
              title="Close"
            >
              <X size={13} />
            </div>
          </form>
        )}

        {/* Floating Chat Toggle Button */}
        <div 
          onClick={toggleChatBox}
          onPointerDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          style={chatToggleStyle}
          title={isChatOpen ? 'Close Chat' : 'Type Order / Chat'}
        >
          <MessageSquare size={13} />
        </div>

        {/* Floating Mic Toggle attached directly to the Blob */}
        <div 
          onClick={handleMicClick}
          onPointerDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          style={micStyle}
          title={uiState === 'Working' || uiState === 'Thinking' ? 'Voice Command' : 'Voice Command'}
        >
          {uiState === 'Thinking' ? <Brain size={14} className="spin-slow" /> : 
           uiState === 'Working' ? <Zap size={14} className="pulse-fast" /> : 
           uiState === 'Done' ? <CheckCircle2 size={14} /> : 
           <Mic size={14} />}
        </div>
      </div>
      {/* Ghost Mouse Overlay */}
      {ghostMousePos && (
        <div
          className="fixed pointer-events-none z-[9999] animate-fade-in transition-all duration-150 ease-out"
          style={{ left: ghostMousePos.x, top: ghostMousePos.y, transform: 'translate(-50%, -50%)' }}
        >
          <div className="relative">
            {/* Pulsing Aura */}
            <div className="absolute inset-0 w-8 h-8 -ml-4 -mt-4 bg-cyan-400 rounded-full animate-ping opacity-30" />
            
            {/* The Mouse Pointer Arrow (Custom SVG) */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] ml-1 mt-1"
            >
              <path
                d="M4.5 3L19.5 10.5L12 12.75L9 21L4.5 3Z"
                fill="#22d3ee"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Floating Autonomous Dossier Result HUD (Pop on completion) */}
      {floatingDossier && (
        <FloatingResultHUD
          task={floatingDossier}
          onClose={handleCloseDossier}
        />
      )}
    </div>
  );
}



export default function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [frameTick, setFrameTick] = useState(Date.now());
  const [activePipelines, setActivePipelines] = useState<any[]>([]);

  useEffect(() => {
    const checkPipelines = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/pipelines');
        if (resp.ok) {
          const data = await resp.json();
          setActivePipelines(data.pipelines || []);
        }
      } catch (e) {
        // ignore
      }
    };
    checkPipelines();
    const int = setInterval(checkPipelines, 1000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    let feedInterval: any;
    if (activePipelines.some((p: any) => p.mode && p.mode.startsWith('sandbox'))) {
      feedInterval = setInterval(() => setFrameTick(Date.now()), 200);
    }
    return () => clearInterval(feedInterval);
  }, [activePipelines]);
  const [isOpening, setIsOpening] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openingCoords, setOpeningCoords] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if ((window as any).electronAPI) {
      if ((window as any).electronAPI.onDashboardOpening) {
        (window as any).electronAPI.onDashboardOpening((coords?: {x: number, y: number}) => {
          if (coords) setOpeningCoords(coords);
          setIsOpen(true);
          setIsOpening(true);
          
          if ((window as any).electronAPI.readyToShowDashboard) {
            (window as any).electronAPI.readyToShowDashboard();
          }
          
          setTimeout(() => setIsOpening(false), 250); // matched to 0.25s animation length
        });
      }
      
      if ((window as any).electronAPI.onDashboardClosed) {
        (window as any).electronAPI.onDashboardClosed(() => {
          setIsOpen(false);
        });
      }
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if ((window as any).electronAPI && (window as any).electronAPI.closeDashboard) {
          (window as any).electronAPI.closeDashboard();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  if (route === '#/search') {
    return <SearchOverlay />;
  }
  if (route === '#/blob') {
    return <BlobOverlay />;
  }

  const getDynamicGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  };

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [currentTab, setCurrentTab] = useState<'overview' | 'timeline' | 'workspaces' | 'parallel-desktop' | 'chat' | 'security'>('overview');
  const [hasParallelTaskActive, setHasParallelTaskActive] = useState<boolean>(false);
  const [relaysList, setRelaysList] = useState<any[]>([]);
  const [overviewRemark, setOverviewRemark] = useState<string>(() => `${getDynamicGreeting()}, Anushree! Ready for your coding flow ✨`);

  useEffect(() => {
    const fetchOverviewRemark = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/companion/remarks');
        if (resp.ok) {
          const data = await resp.json();
          if (data.remark) {
            setOverviewRemark(data.remark);
          }
        }
      } catch (e) {}
    };

    fetchOverviewRemark();
    const interval = setInterval(fetchOverviewRemark, 300000);
    return () => clearInterval(interval);
  }, []);
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'agent', text: string, sessionContext?: any, matchedUrl?: string, matchedFile?: string, actions?: any[] }[]>([
    { role: 'agent', text: 'Hello! I am your autonomous agent. I am silently capturing your workflow context. Ask me anything about what you were doing or what files you were editing!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState<boolean>(false);
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
    // 1. Fetch persistent SQLite sessions on app launch
    const loadSavedSessions = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/timeline/sessions');
        if (resp.ok) {
          const data = await resp.json();
          if (data.sessions && data.sessions.length > 0) {
            setSessions(data.sessions);
            setActiveSession(data.sessions[0]);
          }
        }
      } catch (e) {
        console.error("Failed to load saved SQLite sessions:", e);
      }
    };
    loadSavedSessions();

    // 2. Real-time Workflow Stream Listener
    if ((window as any).electronAPI && (window as any).electronAPI.onWorkflowUpdate) {
      (window as any).electronAPI.onWorkflowUpdate((update: any) => {
        setSessions(prev => {
          const idx = prev.findIndex(s => s.id === update.id);
          let newSessions = [];
          if (idx >= 0) {
            newSessions = [...prev];
            newSessions[idx] = update;
          } else {
            newSessions = [update, ...prev];
          }
          
          // Learn habits & persist automatically into SQLite
          fetch('http://127.0.0.1:8000/api/companion/learn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessions: newSessions })
          }).catch(() => {});
          
          return newSessions;
        });
        setActiveSession((prev: any) => (prev && prev.id === update.id) || !prev ? update : prev);
      });
    }

    // 3. Parallel Desktop Status Poller
    const checkParallelTask = async () => {
      try {
        const pRes = await fetch('http://127.0.0.1:8000/api/parallel-desktop/status');
        if (pRes.ok) {
          const pData = await pRes.json();
          setHasParallelTaskActive(Boolean(pData.has_active_task));
        }
      } catch (e) {}
    };
    checkParallelTask();
    const pInterval = setInterval(checkParallelTask, 2000);
    return () => clearInterval(pInterval);
  }, []);

  const formatDuration = (durationMs: number, status?: string) => {
    if (!durationMs || durationMs < 60000) {
      return status === 'active' ? 'Live' : '< 1m';
    }
    const mins = Math.floor(durationMs / 60000);
    if (mins < 60) {
      return `${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  };

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
        if (!app) return;
        const lower = (app as string).toLowerCase();
        const isBrowser = lower.includes('chrome') || lower.includes('browser') || lower.includes('edge');
        const hasUrls = activeSession.urls && activeSession.urls.length > 0;
        const isIde = app === primaryIde;
        const hasFiles = activeSession.files && activeSession.files.length > 0;
        
        if ((!isBrowser || !hasUrls) && (!isIde || !hasFiles)) {
          trails.push({ type: 'app', title: app, summary: `Active workspace: ${app}`, icon: '💻' });
        }
      });
    }
  }

  const originX = openingCoords ? openingCoords.x : 0;
  const originY = openingCoords ? openingCoords.y : 0;

  return (
    <div 
      className={`iris-dashboard-scope ${isOpening ? 'opening-animation' : ''} ${!isOpen ? 'dashboard-closed' : ''}`}
      style={isOpening && openingCoords ? { '--origin-x': `${originX}px`, '--origin-y': `${originY}px` } as React.CSSProperties : undefined}
    >
      <CanvasGrid />
      <div 
        className="close-dashboard-btn"
        onClick={() => {
          if ((window as any).electronAPI && (window as any).electronAPI.closeDashboard) {
            (window as any).electronAPI.closeDashboard();
          }
        }}
        title="Close Dashboard"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
      <div className="global-layout">
        <aside className="global-sidebar">
          <div className="sidebar-top">
            <div className="sidebar-logo"><img src="/sidebar-logo.png" alt="IRIS" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
          </div>
          <div className="sidebar-nav">
            <div className={`nav-item ${currentTab === 'overview' ? 'active' : ''}`} title="Agent Persona & Overview" onClick={() => setCurrentTab('overview')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <div className={`nav-item ${currentTab === 'timeline' ? 'active' : ''}`} title="Timeline Dashboard" onClick={() => setCurrentTab('timeline')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className={`nav-item ${currentTab === 'workspaces' ? 'active' : ''}`} title="Workspaces & App Arrangements" onClick={() => setCurrentTab('workspaces')}>
              <LayoutGrid size={20} />
            </div>
            <div 
              className={`nav-item ${currentTab === 'parallel-desktop' ? 'active' : ''}`} 
              title="Parallel Desktop (Autonomous Background Workspace)" 
              onClick={() => setCurrentTab('parallel-desktop')}
              style={{ position: 'relative' }}
            >
              <Layers size={20} />
              {hasParallelTaskActive && (
                <span 
                  className="pd-nav-pulse-dot" 
                  style={{ 
                    position: 'absolute', 
                    top: '8px', 
                    right: '8px', 
                    width: '7px', 
                    height: '7px', 
                    borderRadius: '50%', 
                    backgroundColor: '#00e5ff', 
                    boxShadow: '0 0 10px #00e5ff' 
                  }} 
                />
              )}
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
              <div className="blob-shadow" />
            </div>
          </div>
        </aside>

        <div className="views-container">
          {currentTab === 'overview' ? (
            <div id="view-overview" className="app-view active" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 60px', color: '#fff', fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif", boxSizing: 'border-box', justifyContent: 'center' }}>
              <style>{`
                @keyframes iris-hero-breathe {
                  0%, 100% { transform: scale(1) translateY(0); filter: drop-shadow(0 0 35px rgba(0, 191, 255, 0.45)); }
                  50% { transform: scale(1.04) translateY(-8px); filter: drop-shadow(0 0 60px rgba(138, 43, 226, 0.65)); }
                }
                @keyframes iris-sclera-blink {
                  0%, 95%, 98% { transform: scaleY(1); }
                  96.5% { transform: scaleY(0.1); }
                }
                .overview-quick-link {
                  color: rgba(255, 255, 255, 0.7);
                  font-size: 13px;
                  cursor: pointer;
                  padding: 8px 18px;
                  border-radius: 20px;
                  background: rgba(255, 255, 255, 0.04);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  transition: all 0.2s ease;
                }
                .overview-quick-link:hover {
                  background: rgba(0, 229, 255, 0.1);
                  border-color: rgba(0, 229, 255, 0.3);
                  color: #fff;
                  transform: translateY(-1px);
                }
              `}</style>

              {/* Central Stage (No generic cards) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
                
                {/* Clean Floating Mascot with Live Speech Bubble */}
                <div style={{
                  position: 'relative',
                  marginBottom: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}>
                  {/* Cute Companion Learned Remark Bubble */}
                  {overviewRemark && (
                    <div style={{
                      position: 'absolute',
                      bottom: '125px',
                      background: 'rgba(10, 15, 25, 0.95)',
                      border: '1px solid rgba(0, 229, 255, 0.35)',
                      borderRadius: '16px',
                      padding: '8px 16px',
                      color: '#00e5ff',
                      fontSize: '13px',
                      fontWeight: 500,
                      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 229, 255, 0.15)',
                      backdropFilter: 'blur(16px)',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      animation: 'fadeInUpBubble 0.3s ease',
                      zIndex: 10
                    }}>
                      <span>✨</span>
                      <span>{overviewRemark}</span>
                      <div style={{
                        position: 'absolute',
                        bottom: '-5px',
                        left: '50%',
                        transform: 'translateX(-50%) rotate(45deg)',
                        width: '8px',
                        height: '8px',
                        background: 'rgba(10, 15, 25, 0.95)',
                        borderRight: '1px solid rgba(0, 229, 255, 0.35)',
                        borderBottom: '1px solid rgba(0, 229, 255, 0.35)'
                      }} />
                    </div>
                  )}

                  <div style={{
                    animation: 'iris-hero-breathe 4s ease-in-out infinite'
                  }}>
                    <div style={{
                      width: '110px',
                      height: '110px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle at 35% 35%, #00bfff 0%, #8a2be2 75%, #4b0082 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      border: '1.5px solid rgba(255, 255, 255, 0.2)'
                    }}>
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: '#ffffff',
                        boxShadow: '0 0 16px rgba(0, 191, 255, 0.8)',
                        animation: 'iris-sclera-blink 4.5s infinite ease-in-out',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                      }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: '#0d1117',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'flex-end',
                          padding: '4px',
                          boxSizing: 'border-box'
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            boxShadow: '0 0 4px #ffffff'
                          }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Minimal Header */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e5ff', display: 'inline-block', boxShadow: '0 0 8px #00e5ff' }}></span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.5)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    OS Intelligence
                  </span>
                </div>

                <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.6px', color: '#fff' }}>
                  {getDynamicGreeting()}, Anushree.
                </h1>

                <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.6, margin: '0 0 32px 0', maxWidth: '520px' }}>
                  Listening for your commands across VS Code, Chrome, and your workspace. Ready for data relays, sandbox inspections, and layout changes.
                </p>

                {/* Direct Action Hub */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <div className="overview-quick-link" onClick={() => setCurrentTab('workspaces')}>
                    📐 Workspaces
                  </div>
                  <div className="overview-quick-link" onClick={() => setCurrentTab('chat')}>
                    💬 Ask Agent
                  </div>
                  <div className="overview-quick-link" onClick={() => setCurrentTab('timeline')}>
                    🕒 Activity Log
                  </div>
                </div>

                {/* Subtle Ambient Context Footer */}
                <div style={{ marginTop: '48px', display: 'flex', gap: '24px', alignItems: 'center', color: 'rgba(255, 255, 255, 0.35)', fontSize: '11.5px' }}>
                  <span>⚡ 0ms Win32 OS Hooks</span>
                  <span>•</span>
                  <span>🔒 Air-Gapped Local Memory</span>
                  <span>•</span>
                  <span>📦 Isolated Ghost Sandbox</span>
                </div>

              </div>
            </div>
          ) : currentTab === 'timeline' ? (
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
                        <div key={s.id} 
                             className={`session-card ${activeSession?.id === s.id ? 'active-card' : ''}`}
                             onClick={() => setActiveSession(s)}>
                          <div className="session-header">
                            <div className="session-name">{s.name}</div>
                            <div className="session-time" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.7rem' }}>
                              <span>{formatDuration(s.duration, s.status)}</span>
                              <span style={{ opacity: 0.6 }}>{new Date(s.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
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
                            const allCheckboxes = container.querySelectorAll('.url-checkbox');
                            if (allCheckboxes.length > 0) {
                              const checked = container.querySelectorAll('.url-checkbox:checked');
                              payload.urls = Array.from(checked).map((el: any) => (el as HTMLInputElement).value);
                            }
                          }
                          if ((!payload.urls || payload.urls.length === 0) && (!payload.files || payload.files.length === 0) && (!payload.windowTitles || payload.windowTitles.length === 0) && (!payload.dominantApps || payload.dominantApps.length === 0)) {
                            alert(`Insufficient contextual anchors to resume "${payload.name}".`);
                            return;
                          }
                          if ((window as any).electronAPI && (window as any).electronAPI.resumeWorkflow) {
                            await (window as any).electronAPI.resumeWorkflow(payload);
                          } else {
                            try {
                              await fetch('http://127.0.0.1:8000/api/ai/command', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ command: `open workspace ${payload.name}` })
                              });
                            } catch (e) {
                              console.warn('Restore command error:', e);
                            }
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
                          {trails.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', padding: '10px 0' }}>
                              No detailed context paths or file modifications recorded for this session.
                            </div>
                          ) : (
                            trails.map((t, i) => {
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
                            })
                          )}
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
                              try { 
                                const parsed = new URL(u);
                                domain = parsed.hostname || u; 
                              } catch(e) {}
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
          ) : currentTab === 'workspaces' ? (
            <div id="view-workspaces" className="app-view active" style={{ height: '100%', overflow: 'hidden' }}>
              <WorkspacesTab />
            </div>
          ) : currentTab === 'parallel-desktop' ? (
            <div id="view-parallel-desktop" className="app-view active" style={{ height: '100%', overflow: 'hidden' }}>
              <ParallelDesktopTab />
            </div>
          ) : currentTab === 'security' ? (
            <div id="view-security" className="app-view active" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <header style={{ padding: '24px 32px 0 32px', flexShrink: 0 }}>
                <div className="brand-container">
                  <h1>Security Room</h1>
                </div>
              </header>
              <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                  {activePipelines.filter((p: any) => p.mode && p.mode.startsWith('sandbox')).length === 0 ? (
                    <div style={{ color: '#888', gridColumn: '1 / -1', textAlign: 'center', marginTop: '100px' }}>No active sandbox tasks to monitor.</div>
                  ) : (
                    activePipelines.filter((p: any) => p.mode && p.mode.startsWith('sandbox')).map((pipeline: any) => (
                      <div key={pipeline.task_id} style={{ background: '#1c1c1e', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', background: '#222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pipeline.condition}</span>
                          <span style={{ fontSize: '10px', background: '#ff3232', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>LIVE</span>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, background: '#0a0a0c' }}>
                          <div style={{ fontSize: '12px', color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '1px' }}>AGENT THOUGHT LOG</div>
                          <div style={{ fontSize: '14px', color: '#ccc', fontStyle: 'italic', fontFamily: 'monospace' }}>
                            {pipeline.thought || 'Analyzing sandbox environment...'}
                          </div>
                          <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                            {pipeline.current_action && pipeline.current_action !== 'None' ? `> Executing: ${pipeline.current_action}` : '> Working...'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : currentTab === 'chat' ? (
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
                {chatHistory.filter(msg => !msg.text.includes('[Meta-OS')).map((msg, i) => (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
