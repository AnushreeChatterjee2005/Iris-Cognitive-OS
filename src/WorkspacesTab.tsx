import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutGrid,
  Layers,
  Monitor,
  Laptop,
  Play,
  Edit2,
  Trash2,
  Copy,
  Plus,
  Check,
  Search,
  Sparkles,
  Code,
  BookOpen,
  Briefcase,
  Camera,
  RotateCcw,
  Power,
  Maximize2,
  Grid,
  Columns,
  ExternalLink,
  X,
  ChevronDown,
  Clock,
  AlertCircle,
  MoreVertical,
  Sliders,
  CheckSquare,
  Square,
  Terminal,
  FileText,
  Globe,
  Settings,
  HelpCircle,
  Gamepad2,
  Move,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export interface WorkspaceApp {
  id: string;
  name: string;
  appIdentifier: string;
  executablePath?: string;
  windowIdentifier?: string;
  windowClass?: string;
  monitor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state?: 'normal' | 'maximized' | 'minimized';
  order?: number;
  color?: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  startupEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
  layoutPreset?: string;
  splitRatio?: number;
  applications: WorkspaceApp[];
}

const COLOR_PALETTES = [
  { name: 'Cyan Glow', hex: '#00E5FF' },
  { name: 'Electric Purple', hex: '#A855F7' },
  { name: 'Emerald Focus', hex: '#10B981' },
  { name: 'Amber Study', hex: '#F59E0B' },
  { name: 'Rose Gaming', hex: '#EC4899' },
  { name: 'Blue Horizon', hex: '#3B82F6' },
  { name: 'Teal Matrix', hex: '#14B8A6' },
  { name: 'Violet Deep', hex: '#8B5CF6' }
];

const ICON_OPTIONS = [
  { name: 'Code', icon: Code },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'Search', icon: Search },
  { name: 'LayoutGrid', icon: LayoutGrid },
  { name: 'Terminal', icon: Terminal },
  { name: 'Gamepad2', icon: Gamepad2 },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Monitor', icon: Monitor },
  { name: 'Laptop', icon: Laptop }
];

const roundNum = (n: number) => Math.round(n * 100) / 100;

export function getAppTheme(nameOrId: string = '') {
  const s = nameOrId.toLowerCase();

  if (s.includes('chrome') || s.includes('google') || s.includes('browser')) {
    return {
      color: '#3B82F6',
      bg: 'rgba(59, 130, 246, 0.16)',
      border: '#3B82F6',
      accent: '#60A5FA',
      name: 'Google Chrome',
      type: 'chrome'
    };
  }
  if (s.includes('code') || s.includes('vscode') || s.includes('visual studio')) {
    return {
      color: '#0284C7',
      bg: 'rgba(2, 132, 199, 0.16)',
      border: '#0284C7',
      accent: '#38BDF8',
      name: 'Visual Studio Code',
      type: 'vscode'
    };
  }
  if (s.includes('excel') || s.includes('sheet') || s.includes('xlmain')) {
    return {
      color: '#10B981',
      bg: 'rgba(16, 185, 129, 0.16)',
      border: '#10B981',
      accent: '#34D399',
      name: 'Microsoft Excel',
      type: 'excel'
    };
  }
  if (s.includes('notepad') || s.includes('text') || s.includes('note')) {
    return {
      color: '#06B6D4',
      bg: 'rgba(6, 182, 212, 0.16)',
      border: '#06B6D4',
      accent: '#22D3EE',
      name: 'Notepad',
      type: 'notepad'
    };
  }
  if (s.includes('terminal') || s.includes('cmd') || s.includes('powershell') || s.includes('bash') || s.includes('wt')) {
    return {
      color: '#8B5CF6',
      bg: 'rgba(139, 92, 246, 0.16)',
      border: '#8B5CF6',
      accent: '#A78BFA',
      name: 'Windows Terminal',
      type: 'terminal'
    };
  }
  if (s.includes('spotify') || s.includes('music')) {
    return {
      color: '#22C55E',
      bg: 'rgba(34, 197, 94, 0.16)',
      border: '#22C55E',
      accent: '#4ADE80',
      name: 'Spotify',
      type: 'spotify'
    };
  }
  if (s.includes('discord')) {
    return {
      color: '#6366F1',
      bg: 'rgba(99, 102, 241, 0.16)',
      border: '#6366F1',
      accent: '#818CF8',
      name: 'Discord',
      type: 'discord'
    };
  }
  if (s.includes('slack')) {
    return {
      color: '#EC4899',
      bg: 'rgba(236, 72, 153, 0.16)',
      border: '#EC4899',
      accent: '#F472B6',
      name: 'Slack',
      type: 'slack'
    };
  }
  if (s.includes('obsidian')) {
    return {
      color: '#A855F7',
      bg: 'rgba(168, 85, 247, 0.16)',
      border: '#A855F7',
      accent: '#C084FC',
      name: 'Obsidian',
      type: 'obsidian'
    };
  }
  if (s.includes('notion')) {
    return {
      color: '#E2E8F0',
      bg: 'rgba(226, 232, 240, 0.14)',
      border: '#94A3B8',
      accent: '#FFFFFF',
      name: 'Notion',
      type: 'notion'
    };
  }
  if (s.includes('figma')) {
    return {
      color: '#F97316',
      bg: 'rgba(249, 115, 22, 0.16)',
      border: '#F97316',
      accent: '#FB923C',
      name: 'Figma',
      type: 'figma'
    };
  }
  if (s.includes('explorer') || s.includes('file') || s.includes('folder')) {
    return {
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.16)',
      border: '#F59E0B',
      accent: '#FBBF24',
      name: 'File Explorer',
      type: 'explorer'
    };
  }

  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const palette = COLOR_PALETTES[Math.abs(hash) % COLOR_PALETTES.length];
  return {
    color: palette.hex,
    bg: `${palette.hex}22`,
    border: palette.hex,
    accent: palette.hex,
    name: nameOrId,
    type: 'generic'
  };
}

export function AppFavicon({ name = '', size = 18 }: { name?: string; size?: number }) {
  const theme = getAppTheme(name);

  switch (theme.type) {
    case 'chrome':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#3B82F6" fillOpacity="0.2" stroke="#3B82F6" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="4.5" fill="#3B82F6" />
          <circle cx="12" cy="12" r="2" fill="#FFFFFF" />
          <path d="M12 2C15 2 18 4 20 7L12 12" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 7C22 11 21 16 18 19L12 12" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 19C15 22 9 22 5 19L12 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'vscode':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#0284C7" fillOpacity="0.2" />
          <path d="M17.5 3L7.5 10.5L3.5 7.5L2 8.5V15.5L3.5 16.5L7.5 13.5L17.5 21L22 19V5L17.5 3Z" stroke="#007ACC" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M17.5 7L9.5 13.5L17.5 20" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'excel':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="20" height="18" rx="4" fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1.5" />
          <rect x="5" y="6" width="14" height="12" rx="2" fill="#10B981" />
          <path d="M8.5 9L15.5 15M15.5 9L8.5 15" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'notepad':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="16" height="18" rx="3" fill="#06B6D4" fillOpacity="0.2" stroke="#06B6D4" strokeWidth="1.5" />
          <line x1="8" y1="7" x2="16" y2="7" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="11" x2="16" y2="11" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="15" x2="13" y2="15" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'terminal':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="3" fill="#1E293B" stroke="#8B5CF6" strokeWidth="1.5" />
          <path d="M7 9L10.5 12L7 15" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="15" x2="16" y2="15" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'spotify':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#22C55E" fillOpacity="0.2" stroke="#22C55E" strokeWidth="1.5" />
          <path d="M6.5 9.5C10 8 14.5 8.5 17.5 10.2" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
          <path d="M7.5 12.5C10.5 11.2 14 11.6 16.5 13" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.5 15.5C11 14.5 13.5 14.8 15.5 16" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'discord':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#6366F1" fillOpacity="0.2" />
          <path d="M18.5 5.5C17.2 4.9 15.8 4.5 14.3 4.3C14.1 4.7 13.9 5.2 13.7 5.6C12.1 5.4 10.5 5.4 8.9 5.6C8.7 5.2 8.5 4.7 8.3 4.3C6.8 4.5 5.4 4.9 4.1 5.5C1.6 9.3 0.9 13 1.2 16.6C3.1 18 4.9 18.9 6.7 19.4C7.1 18.8 7.5 18.2 7.8 17.5C7.1 17.2 6.5 16.9 5.9 16.5C6.1 16.3 6.2 16.2 6.4 16C9.9 17.6 13.7 17.6 17.2 16C17.4 16.2 17.5 16.3 17.7 16.5C17.1 16.9 16.5 17.2 15.8 17.5C16.1 18.2 16.5 18.8 16.9 19.4C18.7 18.9 20.5 18 22.4 16.6C22.8 12.4 21.6 8.7 18.5 5.5Z" stroke="#6366F1" strokeWidth="1.4" />
          <circle cx="8.5" cy="11.5" r="1.5" fill="#6366F1" />
          <circle cx="15.5" cy="11.5" r="1.5" fill="#6366F1" />
        </svg>
      );
    case 'slack':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#EC4899" fillOpacity="0.2" />
          <path d="M6 10.5C6 9.7 6.7 9 7.5 9H9V10.5C9 11.3 8.3 12 7.5 12C6.7 12 6 11.3 6 10.5Z" fill="#36C5F0" />
          <path d="M10.5 6C9.7 6 9 6.7 9 7.5V13.5C9 14.3 9.7 15 10.5 15C11.3 15 12 14.3 12 13.5V7.5C12 6.7 11.3 6 10.5 6Z" fill="#36C5F0" />
          <path d="M13.5 6C14.3 6 15 6.7 15 7.5V9H13.5C12.7 9 12 8.3 12 7.5C12 6.7 12.7 6 13.5 6Z" fill="#2EB67D" />
          <path d="M18 10.5C18 9.7 17.3 9 16.5 9H10.5C9.7 9 9 9.7 9 10.5C9 11.3 9.7 12 10.5 12H16.5C17.3 12 18 11.3 18 10.5Z" fill="#2EB67D" />
          <path d="M18 13.5C18 14.3 17.3 15 16.5 15H15V13.5C15 12.7 15.7 12 16.5 12C17.3 12 18 12.7 18 13.5Z" fill="#ECB22E" />
          <path d="M13.5 18C14.3 18 15 17.3 15 16.5V10.5C15 9.7 14.3 9 13.5 9C12.7 9 12 9.7 12 10.5V16.5C12 17.3 12.7 18 13.5 18Z" fill="#ECB22E" />
          <path d="M10.5 18C9.7 18 9 17.3 9 16.5V15H10.5C11.3 15 12 15.7 12 16.5C12 17.3 11.3 18 10.5 18Z" fill="#E01E5A" />
          <path d="M6 13.5C6 14.3 6.7 15 7.5 15H13.5C14.3 15 15 14.3 15 13.5C15 12.7 14.3 12 13.5 12H7.5C6.7 12 6 12.7 6 13.5Z" fill="#E01E5A" />
        </svg>
      );
    case 'obsidian':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L19 7V17L12 22L5 17V7L12 2Z" fill="#7C3AED" fillOpacity="0.2" stroke="#A855F7" strokeWidth="1.5" />
          <path d="M12 6L16 10L12 18L8 10L12 6Z" fill="#A855F7" />
        </svg>
      );
    default:
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '6px',
            background: theme.bg,
            border: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.color
          }}
        >
          <LayoutGrid size={size * 0.65} />
        </div>
      );
  }
}

const POPULAR_APPS = [
  { name: 'Google Chrome', appIdentifier: 'chrome', category: 'Browser' },
  { name: 'Visual Studio Code', appIdentifier: 'code', category: 'Dev' },
  { name: 'Microsoft Excel', appIdentifier: 'excel', category: 'Office' },
  { name: 'Notepad', appIdentifier: 'notepad', category: 'Utility' },
  { name: 'Windows Terminal', appIdentifier: 'terminal', category: 'Dev' },
  { name: 'Spotify', appIdentifier: 'spotify', category: 'Media' },
  { name: 'Discord', appIdentifier: 'discord', category: 'Social' },
  { name: 'Slack', appIdentifier: 'slack', category: 'Work' },
  { name: 'Obsidian', appIdentifier: 'obsidian', category: 'Notes' }
];

const renderIconComponent = (iconName?: string, size = 18, color = 'currentColor') => {
  const found = ICON_OPTIONS.find(o => o.name === iconName);
  const IconComp = found ? found.icon : LayoutGrid;
  return <IconComp size={size} color={color} />;
};

export function WorkspacesTab() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartupOnly, setFilterStartupOnly] = useState(false);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeOpeningId, setActiveOpeningId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const [availableApps, setAvailableApps] = useState<{ running: any[]; installed: any[]; monitors: any[] }>({
    running: [],
    installed: [],
    monitors: []
  });

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3800);
  };

  const fetchWorkspaces = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch('http://127.0.0.1:8000/api/workspaces', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
      }
    } catch (e) {
      console.warn('Workspace sync warning:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableApps = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/workspaces/available-apps');
      if (res.ok) {
        const data = await res.json();
        setAvailableApps(data.data || { running: [], installed: [], monitors: [] });
      }
    } catch (e) {
      console.warn('App discovery warning:', e);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    fetchAvailableApps();
  }, []);

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter(ws => {
      if (filterStartupOnly && !ws.startupEnabled) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = ws.name.toLowerCase().includes(q);
      const matchDesc = (ws.description || '').toLowerCase().includes(q);
      const matchApp = ws.applications.some(a => a.name.toLowerCase().includes(q) || a.appIdentifier.toLowerCase().includes(q));
      return matchName || matchDesc || matchApp;
    });
  }, [workspaces, searchQuery, filterStartupOnly]);

  const startupWorkspace = useMemo(() => {
    return workspaces.find(w => w.startupEnabled);
  }, [workspaces]);

  const handleOpenWorkspace = async (ws: Workspace) => {
    setActiveOpeningId(ws.id);
    showToast(`Restoring ${ws.name} workspace...`, 'info');
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/workspaces/${ws.id}/open`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        const result = data?.result;
        const restored = result?.appsRestored ?? 0;
        const total = result?.appsTotal ?? ws.applications.length;
        if (restored === 0) {
          const appNames = ws.applications.map(a => a.name).join(' & ');
          showToast(`⚠️ No open windows found for "${ws.name}". Please launch ${appNames} on your desktop first.`, 'error');
        } else if (restored < total) {
          const notFound = (result?.details || [])
            .filter((d: any) => d.status === 'window_not_found')
            .map((d: any) => d.name)
            .join(', ');
          showToast(`Arranged ${restored} of ${total} apps for "${ws.name}" (${notFound} was not running).`, 'info');
        } else {
          showToast(`✓ ${ws.name} layout restored (${restored}/${total} apps arranged)!`, 'success');
        }
        fetchWorkspaces();
      } else {
        showToast(`Could not arrange all windows for ${ws.name}.`, 'error');
      }
    } catch (e) {
      showToast(`Error opening workspace ${ws.name}`, 'error');
    } finally {
      setActiveOpeningId(null);
    }
  };

  const handleToggleStartup = async (ws: Workspace) => {
    const nextState = !ws.startupEnabled;
    try {
      await fetch(`http://127.0.0.1:8000/api/workspaces/${ws.id}/startup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      showToast(nextState ? `⚡ "${ws.name}" set as startup workspace!` : `Startup disabled for "${ws.name}".`, 'success');
      fetchWorkspaces();
    } catch (e) {
      showToast('Failed to update startup configuration', 'error');
    }
  };

  const handleDuplicate = async (ws: Workspace) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/workspaces/${ws.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${ws.name} (Copy)` })
      });
      if (res.ok) {
        showToast(`Duplicated workspace as "${ws.name} (Copy)"`, 'success');
        fetchWorkspaces();
      }
    } catch (e) {
      showToast('Failed to duplicate workspace', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`http://127.0.0.1:8000/api/workspaces/${id}`, { method: 'DELETE' });
      showToast('Workspace deleted.', 'info');
      setDeleteConfirmId(null);
      fetchWorkspaces();
    } catch (e) {
      showToast('Failed to delete workspace', 'error');
    }
  };

  const handleCaptureCurrentDesktop = async () => {
    showToast('Capturing live multi-window desktop coordinates...', 'info');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/workspaces/current-layout');
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setEditingWorkspace(data.workspace);
          setIsEditorOpen(true);
        }
      }
    } catch (e) {
      showToast('Failed to capture desktop layout', 'error');
    }
  };

  const formatLastUsed = (timestamp?: number) => {
    if (!timestamp) return 'Never used';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="workspaces-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`ws-toast ${toastMessage.type}`}>
          <div className="ws-toast-dot" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="workspaces-header">
        <div>
          <div className="ws-title-row">
            <h1 className="workspaces-main-title">Workspaces</h1>
          </div>
          <p className="workspaces-subtitle">
            Instantly launch and restore multi-app window arrangements.
          </p>
        </div>

        <div className="ws-header-actions">
          <button className="ws-btn secondary" onClick={handleCaptureCurrentDesktop} title="Capture open windows on your desktop">
            <Camera size={14} />
            <span>Capture</span>
          </button>
          <button className="ws-btn primary" onClick={() => { setEditingWorkspace(null); setIsEditorOpen(true); }}>
            <Plus size={15} />
            <span>New Workspace</span>
          </button>
        </div>
      </div>

      {/* Startup Workspace Indicator Banner */}
      {startupWorkspace && (
        <div className="ws-startup-banner">
          <div className="ws-startup-left">
            <div className="ws-startup-dot" />
            <span className="ws-startup-title">
              Default Startup: <strong>{startupWorkspace.name}</strong>
            </span>
          </div>
          <button
            className="ws-startup-disable-btn"
            onClick={() => handleToggleStartup(startupWorkspace)}
            title="Disable automatic startup for this workspace"
          >
            Disable
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="ws-filter-bar">
        <div className="ws-search-input-wrapper">
          <Search size={14} className="ws-search-icon" />
          <input
            type="text"
            className="ws-search-input"
            placeholder="Search workspaces or apps..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="ws-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ws-filter-pills">
          <button
            className={`ws-filter-pill ${!filterStartupOnly ? 'active' : ''}`}
            onClick={() => setFilterStartupOnly(false)}
          >
            All ({workspaces.length})
          </button>
          {workspaces.some(w => w.startupEnabled) && (
            <button
              className={`ws-filter-pill ${filterStartupOnly ? 'active' : ''}`}
              onClick={() => setFilterStartupOnly(true)}
            >
              ⚡ Startup ({workspaces.filter(w => w.startupEnabled).length})
            </button>
          )}
        </div>
      </div>

      {/* Grid of Workspaces */}
      {workspaces.length === 0 && loading ? (
        <div className="ws-loading-state">
          <div className="ws-spinner" />
          <span>Synchronizing workspace layouts...</span>
        </div>
      ) : filteredWorkspaces.length === 0 ? (
        <div className="ws-empty-state">
          <div className="ws-empty-icon">
            <LayoutGrid size={36} color="rgba(0, 229, 255, 0.4)" />
          </div>
          <div className="ws-empty-title">
            {searchQuery ? 'No matching workspaces found' : 'No Workspaces Created Yet'}
          </div>
          <p className="ws-empty-sub">
            {searchQuery
              ? 'Try searching with a different keyword or clear your filter.'
              : 'Create a custom multi-app layout or snap your current desktop arrangement with one click!'}
          </p>
          <button className="ws-btn primary" onClick={() => { setEditingWorkspace(null); setIsEditorOpen(true); }}>
            <Plus size={15} />
            <span>Create Your First Workspace</span>
          </button>
        </div>
      ) : (
        <div className="ws-cards-grid">
          {filteredWorkspaces.map(ws => {
            const isOpening = activeOpeningId === ws.id;
            const isMenuOpen = activeMenuId === ws.id;

            return (
              <div key={ws.id} className="ws-card">
                <div className="ws-card-header">
                  <div className="ws-card-title-row">
                    <div className="ws-card-icon-badge" style={{ backgroundColor: `${ws.color || '#00E5FF'}18`, borderColor: `${ws.color || '#00E5FF'}40` }}>
                      {renderIconComponent(ws.icon, 16, ws.color || '#00E5FF')}
                    </div>
                    <div>
                      <div className="ws-card-title-container">
                        <span className="ws-card-name">{ws.name}</span>
                        {ws.startupEnabled && (
                          <span className="ws-card-startup-badge" title="Opens automatically on system startup">
                            ⚡ Startup
                          </span>
                        )}
                      </div>
                      <div className="ws-card-meta-line">
                        <span>{ws.applications.length} {ws.applications.length === 1 ? 'App' : 'Apps'}</span>
                        <span>•</span>
                        <span>{formatLastUsed(ws.lastUsed)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="ws-card-top-right">
                    <div className="ws-menu-container">
                      <button
                        className="ws-card-menu-btn"
                        onClick={e => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : ws.id);
                        }}
                      >
                        <MoreVertical size={15} />
                      </button>

                      {isMenuOpen && (
                        <div className="ws-dropdown-menu" onClick={e => e.stopPropagation()}>
                          <button
                            className="ws-dropdown-item"
                            onClick={() => {
                              setActiveMenuId(null);
                              setEditingWorkspace(ws);
                              setIsEditorOpen(true);
                            }}
                          >
                            <Edit2 size={13} />
                            <span>Edit Layout</span>
                          </button>
                          <button
                            className="ws-dropdown-item"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleDuplicate(ws);
                            }}
                          >
                            <Copy size={13} />
                            <span>Duplicate</span>
                          </button>
                          <button
                            className="ws-dropdown-item"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleToggleStartup(ws);
                            }}
                          >
                            <Power size={13} />
                            <span>{ws.startupEnabled ? 'Disable Startup' : 'Set as Startup'}</span>
                          </button>
                          <div className="ws-dropdown-divider" />
                          <button
                            className="ws-dropdown-item danger"
                            onClick={() => {
                              setActiveMenuId(null);
                              setDeleteConfirmId(ws.id);
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Minimalist Multi-Color Layout Thumbnail */}
                <div className="ws-card-preview-stage" onClick={() => handleOpenWorkspace(ws)} title="Click to launch workspace">
                  <LayoutThumbnail applications={ws.applications} />
                </div>

                {/* Description */}
                {ws.description && (
                  <p className="ws-card-desc">{ws.description}</p>
                )}

                {/* App Favicon Pills List */}
                <div className="ws-card-apps-chips">
                  {ws.applications.map((app, i) => {
                    const theme = getAppTheme(app.name || app.appIdentifier);
                    return (
                      <div key={app.id || i} className="ws-app-chip" style={{ borderColor: `${theme.color}35`, backgroundColor: `${theme.color}10` }}>
                        <AppFavicon name={app.name || app.appIdentifier} size={12} />
                        <span style={{ color: '#E2E8F0' }}>{app.name}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Card Actions */}
                <div className="ws-card-footer">
                  <button
                    className="ws-launch-btn"
                    onClick={() => handleOpenWorkspace(ws)}
                    disabled={isOpening}
                  >
                    {isOpening ? (
                      <>
                        <div className="ws-btn-spinner" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} fill="currentColor" />
                        <span>Launch Workspace</span>
                      </>
                    )}
                  </button>

                  <button
                    className="ws-edit-btn"
                    onClick={() => {
                      setEditingWorkspace(ws);
                      setIsEditorOpen(true);
                    }}
                    title="Edit layout coordinates"
                  >
                    <Sliders size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Workspace Editor Modal */}
      {isEditorOpen && (
        <InteractiveDragSnapEditorModal
          initialWorkspace={editingWorkspace}
          availableApps={availableApps}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingWorkspace(null);
          }}
          onSave={async (savedWs) => {
            try {
              if (editingWorkspace && editingWorkspace.id && !editingWorkspace.id.startsWith('ws-captured-')) {
                const res = await fetch(`http://127.0.0.1:8000/api/workspaces/${editingWorkspace.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(savedWs)
                });
                if (!res.ok) throw new Error('Failed to update');
                showToast(`Workspace "${savedWs.name}" updated!`, 'success');
              } else {
                const res = await fetch('http://127.0.0.1:8000/api/workspaces', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(savedWs)
                });
                if (!res.ok) throw new Error('Failed to create');
                showToast(`Workspace "${savedWs.name}" created successfully!`, 'success');
              }
              setIsEditorOpen(false);
              setEditingWorkspace(null);
              fetchWorkspaces();
            } catch (err: any) {
              console.error('Workspace save error:', err);
              showToast('Could not save workspace. Backend service may be restarting.', 'error');
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="ws-modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
          <div className="ws-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="ws-confirm-icon">
              <AlertCircle size={24} color="#ff4d4d" />
            </div>
            <div className="ws-confirm-title">Delete Workspace?</div>
            <p className="ws-confirm-sub">
              Are you sure you want to delete this workspace arrangement?
            </p>
            <div className="ws-confirm-actions">
              <button className="ws-btn secondary" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="ws-btn danger" onClick={() => handleDelete(deleteConfirmId)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Visual Layout Thumbnail Component (Multi-Color App Specific Boxes)
// -----------------------------------------------------------------------------

const LayoutThumbnail = React.memo(function LayoutThumbnail({ applications }: { applications: WorkspaceApp[] }) {
  if (!applications || applications.length === 0) {
    return (
      <div className="ws-thumb-empty">
        <span>No applications in layout</span>
      </div>
    );
  }

  return (
    <div className="ws-thumbnail-desktop">
      <div className="ws-thumb-screen">
        {applications.map((app, idx) => {
          const theme = getAppTheme(app.name || app.appIdentifier);
          const leftPct = `${Math.max(0, Math.min(100, app.x * 100))}%`;
          const topPct = `${Math.max(0, Math.min(100, app.y * 100))}%`;
          const widthPct = `${Math.max(8, Math.min(100, app.width * 100))}%`;
          const heightPct = `${Math.max(8, Math.min(100, app.height * 100))}%`;

          return (
            <div
              key={app.id || idx}
              className="ws-thumb-window"
              style={{
                left: leftPct,
                top: topPct,
                width: widthPct,
                height: heightPct,
                borderColor: `${theme.color}60`,
                backgroundColor: `${theme.color}15`
              }}
            >
              <div className="ws-thumb-titlebar" style={{ backgroundColor: `${theme.color}30` }}>
                <AppFavicon name={app.name || app.appIdentifier} size={11} />
                <span className="ws-thumb-window-name">{app.name}</span>
              </div>
              <div className="ws-thumb-window-body">
                <div className="ws-thumb-window-accent-line" style={{ backgroundColor: `${theme.color}40` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// -----------------------------------------------------------------------------
// MINIMALIST ZERO-LAG DRAG-TO-SNAP WORKSPACE BUILDER MODAL
// -----------------------------------------------------------------------------

interface DragEditorProps {
  initialWorkspace?: Workspace | null;
  availableApps: { running: any[]; installed: any[]; monitors: any[] };
  onClose: () => void;
  onSave: (ws: any) => Promise<void>;
}

type SnapZone = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | null;

function InteractiveDragSnapEditorModal({ initialWorkspace, availableApps, onClose, onSave }: DragEditorProps) {
  const isEditing = !!initialWorkspace && !!initialWorkspace.id && !initialWorkspace.id.startsWith('ws-captured-');

  const [name, setName] = useState(initialWorkspace?.name || 'My Workspace');
  const [description, setDescription] = useState(initialWorkspace?.description || '');
  const [icon, setIcon] = useState(initialWorkspace?.icon || 'Code');
  const [color, setColor] = useState(initialWorkspace?.color || '#00E5FF');
  const [startupEnabled, setStartupEnabled] = useState(!!initialWorkspace?.startupEnabled);
  const [selectedApps, setSelectedApps] = useState<WorkspaceApp[]>(initialWorkspace?.applications || []);
  
  const [activeTab, setActiveTab] = useState<'canvas' | 'details'>('canvas');
  const runningList = availableApps.running || [];
  const installedList = availableApps.installed || [];

  const [appSearch, setAppSearch] = useState('');
  const [appSourceTab, setAppSourceTab] = useState<'popular' | 'running' | 'installed'>(
    runningList.length > 0 ? 'running' : 'popular'
  );
  const [isSaving, setIsSaving] = useState(false);

  // Performance-optimized Drag Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const currentZoneRef = useRef<SnapZone>(null);
  const [activeSnapZone, setActiveSnapZone] = useState<SnapZone>(null);
  const [draggingApp, setDraggingApp] = useState<any>(null);

  const displayedApps = useMemo(() => {
    const q = appSearch.toLowerCase();
    if (appSourceTab === 'popular') {
      return POPULAR_APPS.filter(a => a.name.toLowerCase().includes(q) || a.appIdentifier.toLowerCase().includes(q));
    }
    if (appSourceTab === 'running') {
      return runningList.filter((a: any) => a.name.toLowerCase().includes(q) || (a.windowTitle || '').toLowerCase().includes(q));
    }
    return installedList.filter((a: any) => a.name.toLowerCase().includes(q) || (a.appIdentifier || '').toLowerCase().includes(q));
  }, [appSourceTab, appSearch, runningList, installedList]);

  // Snapping Computation
  const snapAppToZone = (appItem: any, zone: SnapZone) => {
    if (!appItem) return;
    const theme = getAppTheme(appItem.name || appItem.appIdentifier);

    setSelectedApps(prevApps => {
      let updated = [...prevApps];
      const existingIdx = updated.findIndex(
        a => a.id === appItem.id || a.name.toLowerCase() === appItem.name.toLowerCase() || a.appIdentifier === appItem.appIdentifier
      );

      let x = 0.0, y = 0.0, width = 0.5, height = 1.0;

      if (zone === 'left') {
        x = 0.0; y = 0.0; width = 0.5; height = 1.0;
        if (updated.length === 1 && existingIdx === -1) {
          updated[0] = { ...updated[0], x: 0.5, y: 0.0, width: 0.5, height: 1.0 };
        } else if (existingIdx >= 0 && updated.length === 2) {
          const otherIdx = existingIdx === 0 ? 1 : 0;
          updated[otherIdx] = { ...updated[otherIdx], x: 0.5, y: 0.0, width: 0.5, height: 1.0 };
        }
      } else if (zone === 'right') {
        x = 0.5; y = 0.0; width = 0.5; height = 1.0;
        if (updated.length === 1 && existingIdx === -1) {
          updated[0] = { ...updated[0], x: 0.0, y: 0.0, width: 0.5, height: 1.0 };
        } else if (existingIdx >= 0 && updated.length === 2) {
          const otherIdx = existingIdx === 0 ? 1 : 0;
          updated[otherIdx] = { ...updated[otherIdx], x: 0.0, y: 0.0, width: 0.5, height: 1.0 };
        }
      } else if (zone === 'top') {
        x = 0.0; y = 0.0; width = 1.0; height = 0.5;
        if (updated.length === 1 && existingIdx === -1) {
          updated[0] = { ...updated[0], x: 0.0, y: 0.5, width: 1.0, height: 0.5 };
        }
      } else if (zone === 'bottom') {
        x = 0.0; y = 0.5; width = 1.0; height = 0.5;
        if (updated.length === 1 && existingIdx === -1) {
          updated[0] = { ...updated[0], x: 0.0, y: 0.0, width: 1.0, height: 0.5 };
        }
      } else if (zone === 'top-left') {
        x = 0.0; y = 0.0; width = 0.5; height = 0.5;
      } else if (zone === 'top-right') {
        x = 0.5; y = 0.0; width = 0.5; height = 0.5;
      } else if (zone === 'bottom-left') {
        x = 0.0; y = 0.5; width = 0.5; height = 0.5;
      } else if (zone === 'bottom-right') {
        x = 0.5; y = 0.5; width = 0.5; height = 0.5;
      } else {
        x = 0.0; y = 0.0; width = 0.5; height = 0.5;
      }

      const targetApp: WorkspaceApp = {
        id: appItem.id || `app-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: appItem.name,
        appIdentifier: appItem.appIdentifier || appItem.name.toLowerCase().replace(/\s+/g, '_'),
        executablePath: appItem.executablePath,
        windowIdentifier: appItem.windowTitle || appItem.name,
        windowClass: appItem.windowClass,
        monitor: 0,
        x: roundNum(x),
        y: roundNum(y),
        width: roundNum(width),
        height: roundNum(height),
        state: 'normal',
        order: existingIdx >= 0 ? updated[existingIdx].order : updated.length + 1,
        color: theme.color
      };

      if (existingIdx >= 0) {
        updated[existingIdx] = targetApp;
        return updated;
      } else {
        return [...updated, targetApp];
      }
    });
  };

  const canvasRectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  // 144FPS Hardware-Accelerated Pointer Drag Listener (Zero Reflow Overhead)
  useEffect(() => {
    if (!draggingApp) return;

    if (canvasRef.current) {
      canvasRectRef.current = canvasRef.current.getBoundingClientRect();
    }

    const computeZone = (clientX: number, clientY: number): SnapZone => {
      const rect = canvasRectRef.current;
      if (!rect) return null;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }

      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;

      if (relX < 0.35 && relY < 0.35) return 'top-left';
      if (relX > 0.65 && relY < 0.35) return 'top-right';
      if (relX < 0.35 && relY > 0.65) return 'bottom-left';
      if (relX > 0.65 && relY > 0.65) return 'bottom-right';
      if (relX < 0.35) return 'left';
      if (relX > 0.65) return 'right';
      if (relY < 0.35) return 'top';
      if (relY > 0.65) return 'bottom';
      return 'center';
    };

    let latestX = 0;
    let latestY = 0;

    const updateGhostPosition = () => {
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(${latestX + 14}px, ${latestY + 14}px, 0)`;
      }
      const zone = computeZone(latestX, latestY);
      if (zone !== currentZoneRef.current) {
        currentZoneRef.current = zone;
        setActiveSnapZone(zone);
      }
      rafRef.current = null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      latestX = e.clientX;
      latestY = e.clientY;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(updateGhostPosition);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const zone = computeZone(e.clientX, e.clientY);
      if (draggingApp && zone) {
        snapAppToZone(draggingApp, zone);
      }

      setDraggingApp(null);
      currentZoneRef.current = null;
      setActiveSnapZone(null);
      canvasRectRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingApp]);

  const applyPreset = (preset: string) => {
    if (selectedApps.length === 0) return;
    const apps = [...selectedApps];
    const count = apps.length;

    if (preset === '50_50' && count >= 2) {
      apps[0] = { ...apps[0], x: 0.0, y: 0.0, width: 0.5, height: 1.0 };
      apps[1] = { ...apps[1], x: 0.5, y: 0.0, width: 0.5, height: 1.0 };
    } else if (preset === 'top_bottom' && count >= 2) {
      apps[0] = { ...apps[0], x: 0.0, y: 0.0, width: 1.0, height: 0.5 };
      apps[1] = { ...apps[1], x: 0.0, y: 0.5, width: 1.0, height: 0.5 };
    } else if (preset === '60_40' && count >= 2) {
      apps[0] = { ...apps[0], x: 0.0, y: 0.0, width: 0.6, height: 1.0 };
      apps[1] = { ...apps[1], x: 0.6, y: 0.0, width: 0.4, height: 1.0 };
    } else if (preset === 'master_stack' && count >= 3) {
      apps[0] = { ...apps[0], x: 0.0, y: 0.0, width: 0.6, height: 1.0 };
      apps[1] = { ...apps[1], x: 0.6, y: 0.0, width: 0.4, height: 0.5 };
      apps[2] = { ...apps[2], x: 0.6, y: 0.5, width: 0.4, height: 0.5 };
    } else if (preset === 'columns' && count >= 3) {
      const colW = roundNum(1.0 / count);
      apps.forEach((a, i) => {
        apps[i] = { ...a, x: roundNum(i * colW), y: 0.0, width: colW, height: 1.0 };
      });
    } else if (preset === 'grid' && count >= 4) {
      apps[0] = { ...apps[0], x: 0.0, y: 0.0, width: 0.5, height: 0.5 };
      apps[1] = { ...apps[1], x: 0.5, y: 0.0, width: 0.5, height: 0.5 };
      apps[2] = { ...apps[2], x: 0.0, y: 0.5, width: 0.5, height: 0.5 };
      apps[3] = { ...apps[3], x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
    } else if (preset === 'fullscreen' && count >= 1) {
      apps[0] = { ...apps[0], x: 0.0, y: 0.0, width: 1.0, height: 1.0 };
    }
    setSelectedApps(apps);
  };

  const handleRemoveApp = (id: string) => {
    setSelectedApps(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    const finalName = name.trim() || (isEditing ? initialWorkspace?.name : 'My Workspace') || 'My Workspace';
    setIsSaving(true);
    try {
      await onSave({
        name: finalName,
        description: description.trim(),
        icon,
        color,
        startupEnabled,
        layoutPreset: 'custom',
        applications: selectedApps
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getSnapZonePreviewStyle = () => {
    if (!activeSnapZone) return { display: 'none' };
    switch (activeSnapZone) {
      case 'left':
        return { left: 0, top: 0, width: '50%', height: '100%', label: 'LEFT 50%' };
      case 'right':
        return { left: '50%', top: 0, width: '50%', height: '100%', label: 'RIGHT 50%' };
      case 'top':
        return { left: 0, top: 0, width: '100%', height: '50%', label: 'TOP 50%' };
      case 'bottom':
        return { left: 0, top: '50%', width: '100%', height: '50%', label: 'BOTTOM 50%' };
      case 'top-left':
        return { left: 0, top: 0, width: '50%', height: '50%', label: 'TOP-LEFT' };
      case 'top-right':
        return { left: '50%', top: 0, width: '50%', height: '50%', label: 'TOP-RIGHT' };
      case 'bottom-left':
        return { left: 0, top: '50%', width: '50%', height: '50%', label: 'BOTTOM-LEFT' };
      case 'bottom-right':
        return { left: '50%', top: '50%', width: '50%', height: '50%', label: 'BOTTOM-RIGHT' };
      case 'center':
      default:
        return { left: 0, top: 0, width: '100%', height: '100%', label: 'FULLSCREEN' };
    }
  };

  const snapStyle = getSnapZonePreviewStyle();

  return (
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-editor-modal ws-minimal-studio" onClick={e => e.stopPropagation()}>
        {/* Minimalist Header */}
        <div className="ws-editor-header">
          <div className="ws-editor-header-left">
            <div className="ws-editor-badge" style={{ backgroundColor: `${color}18`, borderColor: `${color}40` }}>
              {renderIconComponent(icon, 16, color)}
            </div>
            <div>
              <div className="ws-editor-title-row">
                <input
                  type="text"
                  className="ws-inline-modal-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Workspace Name (e.g. My Workspace)"
                  title="Click to rename workspace"
                />
              </div>
              <div className="ws-editor-sub">Drag apps onto the canvas or click to snap into your custom arrangement.</div>
            </div>
          </div>

          <div className="ws-editor-tabs">
            <button className={`ws-editor-tab-btn ${activeTab === 'canvas' ? 'active' : ''}`} onClick={() => setActiveTab('canvas')}>
              <Grid size={13} />
              <span>Canvas ({selectedApps.length})</span>
            </button>
            <button className={`ws-editor-tab-btn ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
              <Sliders size={13} />
              <span>Settings</span>
            </button>
          </div>

          <button className="ws-modal-close-btn" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="ws-editor-body ws-studio-body">
          {activeTab === 'canvas' ? (
            <div className="ws-minimal-stage">
              {/* Left Side: Minimalist App Tray */}
              <div className="ws-minimal-dock">
                <div className="ws-dock-header">
                  <span className="ws-dock-title">Applications</span>
                  <span className="ws-dock-hint">Drag or click to snap</span>
                </div>

                {/* Source Filter Tabs */}
                <div className="ws-dock-tabs">
                  <button
                    className={`ws-dock-tab ${appSourceTab === 'popular' ? 'active' : ''}`}
                    onClick={() => setAppSourceTab('popular')}
                  >
                    Popular
                  </button>
                  <button
                    className={`ws-dock-tab ${appSourceTab === 'running' ? 'active' : ''}`}
                    onClick={() => setAppSourceTab('running')}
                  >
                    Running ({runningList.length})
                  </button>
                  <button
                    className={`ws-dock-tab ${appSourceTab === 'installed' ? 'active' : ''}`}
                    onClick={() => setAppSourceTab('installed')}
                  >
                    Installed
                  </button>
                </div>

                {/* Search */}
                <div className="ws-dock-search">
                  <Search size={13} className="ws-dock-search-icon" />
                  <input
                    type="text"
                    placeholder="Filter apps..."
                    value={appSearch}
                    onChange={e => setAppSearch(e.target.value)}
                  />
                </div>

                {/* Minimalist App Tiles List */}
                <div className="ws-minimal-app-list">
                  {displayedApps.map((item: any, idx: number) => {
                    const theme = getAppTheme(item.name || item.appIdentifier);
                    const isAdded = selectedApps.some(a => a.name.toLowerCase() === item.name.toLowerCase() || a.appIdentifier === item.appIdentifier);

                    return (
                      <div
                        key={idx}
                        className={`ws-minimal-app-tile ${isAdded ? 'added' : ''}`}
                        onPointerDown={(e) => {
                          if (e.button === 0) {
                            setDraggingApp(item);
                          }
                        }}
                        onClick={() => snapAppToZone(item, selectedApps.length === 0 ? 'left' : 'right')}
                        style={{
                          '--app-color': theme.color,
                          '--app-bg': theme.bg
                        } as React.CSSProperties}
                        title="Drag to canvas or click to add"
                      >
                        <div className="ws-tile-icon-box">
                          <AppFavicon name={item.name || item.appIdentifier} size={22} />
                        </div>
                        <div className="ws-tile-text">
                          <div className="ws-tile-name">{item.name}</div>
                          <div className="ws-tile-category">{item.category || 'App'}</div>
                        </div>
                        {isAdded ? (
                          <div className="ws-tile-added-check">
                            <Check size={12} />
                          </div>
                        ) : (
                          <div className="ws-tile-add-icon">
                            <Plus size={13} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Side: Minimalist Monitor Canvas */}
              <div className="ws-minimal-canvas-col">
                {/* Presets Row */}
                <div className="ws-minimal-presets-row">
                  <span className="ws-presets-label">Layout:</span>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('50_50')}>◫ 50/50</button>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('60_40')}>◧ 60/40 Dev</button>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('top_bottom')}>⬒ Top/Bottom</button>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('master_stack')}>☵ Master + 2</button>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('columns')}>||| 3 Cols</button>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('grid')}>⊞ 2×2 Grid</button>
                  <button className="ws-min-preset-btn" onClick={() => applyPreset('fullscreen')}>⬛ Fullscreen</button>
                  {selectedApps.length > 0 && (
                    <button className="ws-min-clear-btn" onClick={() => setSelectedApps([])}>
                      <Trash2 size={11} /> Clear
                    </button>
                  )}
                </div>

                {/* Minimalist 16:9 Display Frame */}
                <div className="ws-minimal-monitor">
                  <div className="ws-minimal-screen-bezel">
                    <span className="ws-bezel-camera" />
                    <span className="ws-bezel-label">Desktop Screen (1920 × 1080)</span>
                  </div>

                  <div ref={canvasRef} className="ws-minimal-canvas">
                    {/* Empty Canvas Placeholder */}
                    {selectedApps.length === 0 && !activeSnapZone && (
                      <div className="ws-canvas-placeholder">
                        <Move size={32} color="rgba(255, 255, 255, 0.25)" className="pulse-slow" />
                        <div className="ws-canvas-placeholder-title">Canvas Empty</div>
                        <p>Drag any app from the left tray onto the screen or click an app to snap.</p>
                      </div>
                    )}

                    {/* Holographic Snap Target Zone Highlight */}
                    {activeSnapZone && (
                      <div
                        className="ws-minimal-snap-hologram"
                        style={{
                          left: snapStyle.left,
                          top: snapStyle.top,
                          width: snapStyle.width,
                          height: snapStyle.height
                        }}
                      >
                        <div className="ws-hologram-pill">
                          <Sparkles size={12} />
                          <span>{snapStyle.label}</span>
                        </div>
                      </div>
                    )}

                    {/* Multi-Color Application Window Boxes on Canvas */}
                    {selectedApps.map((app, idx) => {
                      const theme = getAppTheme(app.name || app.appIdentifier);
                      const leftPct = `${Math.max(0, Math.min(95, app.x * 100))}%`;
                      const topPct = `${Math.max(0, Math.min(95, app.y * 100))}%`;
                      const widthPct = `${Math.max(10, Math.min(100, app.width * 100))}%`;
                      const heightPct = `${Math.max(10, Math.min(100, app.height * 100))}%`;

                      return (
                        <div
                          key={app.id || idx}
                          className="ws-canvas-app-box"
                          style={{
                            left: leftPct,
                            top: topPct,
                            width: widthPct,
                            height: heightPct,
                            borderColor: theme.border,
                            backgroundColor: theme.bg
                          }}
                        >
                          {/* Titlebar with App Favicon and distinct color */}
                          <div
                            className="ws-app-box-header"
                            style={{ backgroundColor: `${theme.color}25` }}
                            onPointerDown={(e) => {
                              if (e.button === 0) {
                                e.stopPropagation();
                                setDraggingApp(app);
                              }
                            }}
                          >
                            <div className="ws-app-box-title-group">
                              <AppFavicon name={app.name || app.appIdentifier} size={13} />
                              <span className="ws-app-box-title">{app.name}</span>
                            </div>

                            <button
                              className="ws-app-box-close"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveApp(app.id);
                              }}
                              title="Remove from layout"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {/* App Body Content */}
                          <div className="ws-app-box-body">
                            <div className="ws-app-dim-pill" style={{ color: theme.color, borderColor: `${theme.color}40` }}>
                              {Math.round(app.width * 100)}% × {Math.round(app.height * 100)}%
                            </div>

                            <div className="ws-app-snap-anchors">
                              <button onClick={() => snapAppToZone(app, 'left')} title="Snap Left">◧</button>
                              <button onClick={() => snapAppToZone(app, 'right')} title="Snap Right">◨</button>
                              <button onClick={() => snapAppToZone(app, 'top')} title="Snap Top">⬒</button>
                              <button onClick={() => snapAppToZone(app, 'bottom')} title="Snap Bottom">⬓</button>
                              <button onClick={() => snapAppToZone(app, 'center')} title="Fullscreen">⛶</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Details Tab */
            <div className="ws-details-stage">
              <div className="ws-form-group">
                <label className="ws-form-label">Workspace Name</label>
                <input
                  type="text"
                  className="ws-form-input"
                  placeholder="e.g. Full-Stack Dev, Research & Writing"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="ws-form-group">
                <label className="ws-form-label">Description (Optional)</label>
                <input
                  type="text"
                  className="ws-form-input"
                  placeholder="e.g. VS Code on left, Chrome and Terminal on right"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="ws-form-group">
                <label className="ws-form-label">Color Accent</label>
                <div className="ws-color-swatches">
                  {COLOR_PALETTES.map(p => (
                    <div
                      key={p.hex}
                      className={`ws-color-swatch ${color === p.hex ? 'active' : ''}`}
                      style={{ backgroundColor: p.hex }}
                      onClick={() => setColor(p.hex)}
                      title={p.name}
                    >
                      {color === p.hex && <Check size={13} color="#000" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="ws-form-group">
                <label className="ws-form-label">Workspace Icon</label>
                <div className="ws-icon-options">
                  {ICON_OPTIONS.map(opt => {
                    const isSelected = icon === opt.name;
                    return (
                      <div
                        key={opt.name}
                        className={`ws-icon-opt ${isSelected ? 'active' : ''}`}
                        onClick={() => setIcon(opt.name)}
                      >
                        {renderIconComponent(opt.name, 16, isSelected ? color : 'rgba(255,255,255,0.6)')}
                        <span>{opt.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="ws-form-checkbox-row" onClick={() => setStartupEnabled(!startupEnabled)}>
                <div className="ws-checkbox-custom">
                  {startupEnabled ? <CheckSquare size={16} color="#00E5FF" /> : <Square size={16} color="rgba(255,255,255,0.3)" />}
                </div>
                <div>
                  <div className="ws-checkbox-label">Launch automatically on system startup</div>
                  <div className="ws-checkbox-sub">Set this workspace as your default startup desktop layout.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="ws-editor-footer">
          <div className="ws-footer-left">
            <span className="ws-footer-app-count">{selectedApps.length} applications configured in layout</span>
          </div>
          <div className="ws-footer-right">
            <button className="ws-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="ws-btn primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving Workspace...' : isEditing ? 'Save Changes' : 'Save Workspace'}
            </button>
          </div>
        </div>
      </div>

      {/* Zero-Lag Floating Cursor Drag Ghost (GPU hardware accelerated) */}
      <div
        ref={ghostRef}
        className="ws-zero-lag-ghost"
        style={{
          display: draggingApp ? 'flex' : 'none'
        }}
      >
        {draggingApp && (
          <>
            <AppFavicon name={draggingApp.name || draggingApp.appIdentifier} size={18} />
            <span>{draggingApp.name}</span>
          </>
        )}
      </div>
    </div>
  );
}
