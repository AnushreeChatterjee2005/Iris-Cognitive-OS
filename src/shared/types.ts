// =============================================================================
// IRIS Event Schema — The Cognitive Foundation Contract
// =============================================================================
// All activity flowing through IRIS is normalized into ActivityEvents.
// Every future collector (browser, IDE, terminal) must conform to this schema.
// The schema is intentionally extensible via typed payload unions.
// =============================================================================

// --- Source Identifiers ------------------------------------------------------

/** Which subsystem produced this event */
export type CollectorSource =
  | 'window'    // OS window focus tracker
  | 'browser'   // Browser extension bridge (future)
  | 'ide'       // IDE plugin bridge (future)
  | 'terminal'  // Terminal session tracker (future)
  | 'system'    // IRIS internal (session lifecycle, etc.)
  | 'user';     // User generated events (intent anchors)

// --- Event Types -------------------------------------------------------------

export type EventType =
  // Window-level events
  | 'window.focus'       // User brought a window to foreground
  | 'window.blur'        // Window lost focus (duration attached)
  | 'app.switch'         // User switched to a different application

  // Session lifecycle
  | 'session.start'      // IRIS tracking session began
  | 'session.end'        // IRIS tracking session ended

  // Browser events (future — reserved for extension bridge)
  | 'browser.navigation' // URL change within browser
  | 'browser.tab.focus'  // User switched browser tab
  | 'browser.tab.close'  // Tab closed

  // IDE events (future — reserved for IDE plugin)
  | 'ide.file.open'      // File opened in editor
  | 'ide.file.save'      // File saved
  | 'ide.file.close'     // File closed

  // Terminal events (future)
  | 'terminal.command'   // Command executed in shell

  // User events
  | 'user.intent_anchor'; // User explicitly set an intent anchor

// --- Payloads ----------------------------------------------------------------

/** Emitted by the WindowCollector */
export interface WindowPayload {
  appName: string;           // e.g. "Code", "Chrome", "Slack"
  windowTitle: string;       // Full window title text
  processId: number;         // OS process ID
  executablePath?: string;   // Full path to executable
  platform: NodeJS.Platform; // 'win32' | 'darwin' | 'linux'
}

/** Emitted by the BrowserCollector (future) */
export interface BrowserPayload {
  url: string;
  title: string;
  domain: string;
  browser: string;           // 'chrome' | 'firefox' | 'edge' etc.
  tabId?: string;
}

/** Emitted by the IDECollector (future) */
export interface IDEPayload {
  editor: string;            // 'vscode' | 'cursor' | 'intellij' etc.
  filePath: string;
  projectRoot?: string;
  language?: string;
  lineNumber?: number;
}

/** Emitted by the TerminalCollector (future) */
export interface TerminalPayload {
  shell: string;             // 'powershell' | 'bash' | 'zsh' etc.
  command?: string;
  workingDirectory?: string;
  exitCode?: number;
}

/** Session metadata payload */
export interface SessionPayload {
  hostname: string;
  platform: NodeJS.Platform;
  reason?: string;           // Why session ended
}

/** Emitted by User */
export interface UserPayload {
  intent?: string;           // The semantic intent anchor text
}

export type EventPayload =
  | WindowPayload
  | BrowserPayload
  | IDEPayload
  | TerminalPayload
  | SessionPayload
  | UserPayload;

// --- Core Event --------------------------------------------------------------

/**
 * The canonical IRIS activity event.
 * Every observation IRIS makes is stored as an ActivityEvent.
 */
export interface ActivityEvent {
  id: string;               // UUID v4 — globally unique event ID
  type: EventType;
  source: CollectorSource;
  timestamp: number;         // Unix epoch milliseconds (when event occurred)
  duration?: number;         // Milliseconds spent in this context (on blur/switch)
  sessionId: string;         // Groups events into a continuous tracking session
  payload: EventPayload;
  raw?: Record<string, unknown>; // Original raw data from the collector (debug)
}

// --- Session -----------------------------------------------------------------

export interface Session {
  id: string;
  startTime: number;
  endTime?: number;
  hostname: string;
  platform: NodeJS.Platform;
  eventCount: number;
}

// --- Collector Capability Advertisement --------------------------------------

/** What a collector declares it can emit */
export interface CollectorCapabilities {
  source: CollectorSource;
  eventTypes: EventType[];
  pollIntervalMs?: number;   // If poll-based, the polling interval
  description: string;
}

// --- Workflow Session (Layer 2) -----------------------------------------------

export interface WorkflowSession {
  id: string;
  name: string;             // Inferred: e.g. "Implementing JWT Authentication"
  startTime: number;
  endTime?: number;
  duration: number;         // Total active milliseconds
  dominantApps: string[];   // e.g. ["Chrome", "VS Code"]
  windowTitles: string[];
  urls: string[];
  files: string[];
  eventCount: number;
  status: 'active' | 'closed';
  contextSummary?: string;  // Brief semantic description
  probableObjective?: string; // What the user was likely trying to achieve
  confidenceScore: number;    // How confident IRIS is about this session grouping (0-1)
  relatedSessions: string[];  // IDs of similar past sessions
}

// --- IPC Contracts -----------------------------------------------------------

/** Shape of data sent from main → renderer over IPC */
export interface IRISRendererEvent {
  type: 'activity' | 'session' | 'workflow-update' | 'stats';
  payload: ActivityEvent | Session | WorkflowSession | WorkflowSession[] | ActivityStats;
}

export interface ActivityStats {
  sessionId: string;
  sessionStartTime: number;
  totalEvents: number;
  uniqueApps: string[];
  currentApp?: string;
  currentWindowTitle?: string;
  focusedSince?: number;
}
