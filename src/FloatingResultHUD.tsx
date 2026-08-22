import React, { useState, useEffect, useMemo } from 'react';
import {
  Copy,
  Check,
  FileText,
  X,
  FileSpreadsheet,
  ExternalLink,
  Sparkles,
  Layers,
  Cpu,
  Zap,
  Globe,
  Terminal,
  Database,
  Award,
  Box
} from 'lucide-react';

export interface DossierTask {
  task_id: string;
  condition: string;
  results: {
    summary?: string;
    urls?: string[];
    files?: string[];
    images?: string[];
  };
  created_at?: number;
  completed_at?: number;
}

interface FloatingResultHUDProps {
  task: DossierTask;
  onClose: () => void;
  onOpenParallelDesktop?: () => void;
}

interface VisualItem {
  id: string;
  name: string;
  category: string;
  badge?: string;
  color: string;
  gradient: string;
  iconType: 'ai' | 'code' | 'db' | 'award' | 'hardware' | 'web';
  details?: string;
  image?: string;
}

// Extract visual items and images from research summary
function extractVisualHighlights(title: string, summary: string): VisualItem[] {
  const text = (title + ' ' + summary).toLowerCase();
  const items: VisualItem[] = [];

  // LLM Models
  if (text.includes('llama')) {
    items.push({
      id: 'llama',
      name: 'Llama 3.3 / 3.1',
      category: 'Meta AI',
      badge: 'Open Weights',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%)',
      iconType: 'ai',
      details: '78% MMLU • 128K Context',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('mistral')) {
    items.push({
      id: 'mistral',
      name: 'Mistral-NeMo / Large',
      category: 'Mistral AI',
      badge: 'Apache 2.0',
      color: '#f97316',
      gradient: 'linear-gradient(135deg, #7c2d12 0%, #271006 100%)',
      iconType: 'ai',
      details: 'High Reasoning • Native Multilingual',
      image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('gemma')) {
    items.push({
      id: 'gemma',
      name: 'Gemma 2 9B / 27B',
      category: 'Google DeepMind',
      badge: 'Efficient',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, #164e63 0%, #082f49 100%)',
      iconType: 'ai',
      details: 'Architecture Innovation • Low VRAM',
      image: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('phi')) {
    items.push({
      id: 'phi',
      name: 'Phi-3 / 3.5 Mini',
      category: 'Microsoft Research',
      badge: 'Ultra Compact',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #4c1d95 0%, #1f0d3d 100%)',
      iconType: 'ai',
      details: 'Edge & Mobile • 3.8B Params',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('openchat') || text.includes('qwen') || text.includes('deepseek')) {
    items.push({
      id: 'openchat',
      name: 'OpenChat / DeepSeek',
      category: 'Open Source',
      badge: 'Chat Champion',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
      iconType: 'ai',
      details: 'Top Arena Rating • Code Specialist',
      image: 'https://images.unsplash.com/photo-1633493106115-0d2382f7c006?w=400&auto=format&fit=crop&q=80'
    });
  }

  // Hackathons
  if (text.includes('hackmit') || text.includes('mit')) {
    items.push({
      id: 'hackmit',
      name: 'HackMIT 2026',
      category: 'Global Hackathon',
      badge: '$100K+ Prizes',
      color: '#ec4899',
      gradient: 'linear-gradient(135deg, #831843 0%, #3b0724 100%)',
      iconType: 'award',
      details: 'Cambridge, MA • In-Person & Virtual',
      image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('techcrunch') || text.includes('disrupt')) {
    items.push({
      id: 'disrupt',
      name: 'TechCrunch Disrupt',
      category: 'Startup Battlefield',
      badge: 'Tier-1 VC Access',
      color: '#22c55e',
      gradient: 'linear-gradient(135deg, #14532d 0%, #052e16 100%)',
      iconType: 'award',
      details: 'San Francisco • $100K Grand Prize',
      image: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('nasa') || text.includes('space apps')) {
    items.push({
      id: 'nasa',
      name: 'NASA Space Apps',
      category: 'Open Innovation',
      badge: 'Global Challenge',
      color: '#38bdf8',
      gradient: 'linear-gradient(135deg, #075985 0%, #082f49 100%)',
      iconType: 'award',
      details: 'NASA Open Data • Worldwide Teams',
      image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('ethglobal')) {
    items.push({
      id: 'ethglobal',
      name: 'ETHGlobal Series',
      category: 'Web3 & AI',
      badge: 'Bounties & Grants',
      color: '#a855f7',
      gradient: 'linear-gradient(135deg, #581c87 0%, #2e1065 100%)',
      iconType: 'award',
      details: 'Singapore / SF / London • Web3 Track',
      image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&auto=format&fit=crop&q=80'
    });
  }

  // Languages & Frameworks
  if (text.includes('rust')) {
    items.push({
      id: 'rust',
      name: 'Rust Ecosystem',
      category: 'Systems Language',
      badge: 'Memory Safe',
      color: '#f97316',
      gradient: 'linear-gradient(135deg, #7c2d12 0%, #271006 100%)',
      iconType: 'code',
      details: 'Zero-Cost Abstractions • Max Concurrency',
      image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&auto=format&fit=crop&q=80'
    });
  }
  if (text.includes('go') || text.includes('golang')) {
    items.push({
      id: 'go',
      name: 'Go (Golang)',
      category: 'Cloud Services',
      badge: 'Fast Compile',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, #164e63 0%, #082f49 100%)',
      iconType: 'code',
      details: 'Goroutines • Rapid Dev Velocity',
      image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&auto=format&fit=crop&q=80'
    });
  }

  // Default fallback visual cards if none matched
  if (items.length === 0) {
    items.push({
      id: 'item1',
      name: 'Executive Summary',
      category: 'Verified Insights',
      badge: 'Primary',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
      iconType: 'ai',
      details: 'Synthesized directly from live parallel index',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80'
    });
    items.push({
      id: 'item2',
      name: 'Comparative Matrix',
      category: 'Benchmarks',
      badge: 'Structured',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
      iconType: 'db',
      details: 'Trade-offs and architectural recommendations',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&auto=format&fit=crop&q=80'
    });
  }

  return items.slice(0, 4);
}

function parseMarkdownToElements(rawText: string): React.ReactNode[] {
  const lines = rawText.split('\n');
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#f8fafc', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              padding: '1.5px 5px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const header = tableRows[0];
    const body = tableRows.slice(1);
    elements.push(
      <div key={`tbl-${elements.length}`} style={{ overflowX: 'auto', margin: '14px 0', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {header.map((col, idx) => (
                <th key={idx} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#f1f5f9' }}>
                  {renderInline(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rIdx) => (
              <tr key={rIdx} style={{ borderBottom: rIdx === body.length - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.04)' }}>
                {row.map((col, cIdx) => (
                  <td key={cIdx} style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                    {renderInline(col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (inTable) flushTable();
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      if (inTable) flushTable();
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '16px 0' }} />);
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.includes('---')) continue;
      const cols = line.split('|').slice(1, -1).map(c => c.trim());
      tableRows.push(cols);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={i} style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: '18px 0 8px 0', letterSpacing: '-0.01em' }}>
          {renderInline(line.replace('# ', ''))}
        </h2>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} style={{ fontSize: '13.5px', fontWeight: 600, color: '#f1f5f9', margin: '14px 0 6px 0', letterSpacing: '-0.01em' }}>
          {renderInline(line.replace('## ', ''))}
        </h3>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} style={{ fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0', margin: '12px 0 4px 0' }}>
          {renderInline(line.replace('### ', ''))}
        </h4>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      const content = line.replace(/^[-*•]\s+/, '');
      elements.push(
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.55' }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.35)', marginTop: '1px' }}>•</span>
          <div style={{ flex: 1 }}>{renderInline(content)}</div>
        </div>
      );
    } else if (/^\d+\.\s+/.test(line)) {
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      if (match) {
        elements.push(
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.55' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontWeight: 500, minWidth: '16px' }}>{match[1]}.</span>
            <div style={{ flex: 1 }}>{renderInline(match[2])}</div>
          </div>
        );
      }
    } else {
      elements.push(
        <p key={i} style={{ margin: '6px 0', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
          {renderInline(line)}
        </p>
      );
    }
  }

  if (inTable) flushTable();
  return elements;
}

export function FloatingResultHUD({ task, onClose, onOpenParallelDesktop }: FloatingResultHUDProps) {
  const [copied, setCopied] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const summaryText = task.results?.summary || 'Task completed successfully.';

  // One-time focus acquisition without flood
  useEffect(() => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.setClickThrough?.(false);
      (window as any).electronAPI.enableBlobFocus?.();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setToastMsg('Copied to clipboard');
    setTimeout(() => {
      setCopied(false);
      setToastMsg(null);
    }, 2500);
  };

  const handleExport = async (e: React.MouseEvent, format: 'txt' | 'doc' | 'pdf') => {
    e.stopPropagation();
    setExportingFormat(format);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/parallel-desktop/tasks/${task.task_id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format })
      });
      
      let filename = `${task.condition.slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_')}.${format === 'doc' ? 'docx' : format}`;

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.filename) {
          filename = data.filename;
        }
      }

      if (format === 'txt') {
        const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'doc') {
        const docContent = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><meta charset='utf-8'><title>${task.condition}</title>
          <style>
            body { font-family: -apple-system, system-ui, 'Segoe UI', sans-serif; line-height: 1.6; color: #1e293b; }
            h1 { font-size: 18pt; color: #0f172a; margin-bottom: 4pt; }
            .meta { color: #64748b; font-size: 10pt; margin-bottom: 16pt; }
          </style>
          </head>
          <body>
            <h1>${task.condition}</h1>
            <div class="meta">${new Date().toLocaleString()}</div>
            <div>${summaryText.replace(/\n/g, '<br/>')}</div>
          </body>
          </html>
        `;
        const blob = new Blob([docContent], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'pdf') {
        const printWin = window.open('', '_blank', 'width=800,height=900');
        if (printWin) {
          printWin.document.write(`
            <html>
              <head>
                <title>${task.condition}</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
                  h1 { font-size: 20px; color: #0f172a; margin-bottom: 4px; }
                  .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
                  pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; }
                </style>
              </head>
              <body>
                <h1>${task.condition}</h1>
                <div class="meta">${new Date().toLocaleString()}</div>
                <pre>${summaryText}</pre>
                <script>window.onload = () => { window.print(); window.close(); };</script>
              </body>
            </html>
          `);
          printWin.document.close();
        }
      }

      setToastMsg(`Saved ${filename}`);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (err) {
      setToastMsg('Saved');
      setTimeout(() => setToastMsg(null), 2500);
    } finally {
      setExportingFormat(null);
    }
  };

  const visualItems = useMemo(() => extractVisualHighlights(task.condition, summaryText), [task.condition, summaryText]);
  const renderedElements = useMemo(() => parseMarkdownToElements(summaryText), [summaryText]);

  return (
    <div
      className="floating-result-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onMouseEnter={() => {
        (window as any).electronAPI?.setClickThrough?.(false);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 12, 16, 0.72)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        pointerEvents: 'auto',
        cursor: 'pointer',
        transform: 'translateZ(0)'
      }}
    >
      <div
        className="floating-result-modal"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => {
          (window as any).electronAPI?.setClickThrough?.(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '84vh',
          background: '#12141a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#ffffff',
          position: 'relative',
          pointerEvents: 'auto',
          cursor: 'default',
          transform: 'translateZ(0)'
        }}
      >
        {/* Toast */}
        {toastMsg && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#22c55e',
              color: '#052e16',
              fontWeight: 600,
              fontSize: '11.5px',
              padding: '4px 12px',
              borderRadius: '20px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Check size={13} strokeWidth={2.5} />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Clean Header Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#22c55e',
                display: 'inline-block',
                flexShrink: 0
              }}
            />
            <h2
              style={{
                margin: 0,
                fontSize: '14.5px',
                fontWeight: 600,
                color: '#f8fafc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '-0.01em'
              }}
            >
              {task.condition}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.35)',
                background: 'rgba(255, 255, 255, 0.06)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}
            >
              esc
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'color 0.15s',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)')}
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Visual Images / Cards Carousel Header */}
        {visualItems.length > 0 && (
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(255, 255, 255, 0.015)',
              display: 'grid',
              gridTemplateColumns: `repeat(${visualItems.length}, 1fr)`,
              gap: '10px'
            }}
          >
            {visualItems.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: '10px',
                  overflow: 'hidden',
                  position: 'relative',
                  height: '72px',
                  background: item.gradient,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '8px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
              >
                {/* Background preview image overlay */}
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: 0.28,
                      mixBlendMode: 'luminosity'
                    }}
                  />
                )}

                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '9.5px', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                      {item.category}
                    </span>
                    {item.badge && (
                      <span
                        style={{
                          fontSize: '9px',
                          color: item.color,
                          background: 'rgba(0, 0, 0, 0.4)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 600
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formatted Content Area */}
        <div
          style={{
            flex: 1,
            padding: '20px 24px',
            overflowY: 'auto',
            background: 'transparent',
            pointerEvents: 'auto'
          }}
        >
          {renderedElements}
        </div>

        {/* Minimalist Action Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: '#0e1015',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            pointerEvents: 'auto'
          }}
        >
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: copied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${copied ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
              color: copied ? '#4ade80' : '#e2e8f0',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'background 0.15s, border 0.15s',
              pointerEvents: 'auto'
            }}
          >
            {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Export Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.35)', marginRight: '2px' }}>Save as</span>
            
            <button
              onClick={(e) => handleExport(e, 'txt')}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={exportingFormat !== null}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            >
              .txt
            </button>

            <button
              onClick={(e) => handleExport(e, 'doc')}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={exportingFormat !== null}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            >
              .docx
            </button>

            <button
              onClick={(e) => handleExport(e, 'pdf')}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={exportingFormat !== null}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            >
              .pdf
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
