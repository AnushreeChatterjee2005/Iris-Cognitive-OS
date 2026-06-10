import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEvent, CollectorCapabilities, WindowPayload } from '../../shared/types';
import { BaseCollector } from './BaseCollector';

const execAsync = promisify(exec);

export class WindowCollector extends BaseCollector {
  private pollInterval: number = 2000; // 2 seconds
  private lastWindow: { processName: string; title: string; id: number } | null = null;
  private focusStartTime: number = Date.now();
  private pendingFocusTimer: NodeJS.Timeout | null = null;
  private sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  get capabilities(): CollectorCapabilities {
    return {
      source: 'window',
      eventTypes: ['window.focus', 'window.blur', 'app.switch'],
      pollIntervalMs: this.pollInterval,
      description: 'Tracks the active window using PowerShell on Windows.'
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[WindowCollector] Polling started');
    this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const currentWindow = await this.getActiveWindow();
        if (currentWindow) {
          const hasChanged = !this.lastWindow || 
                            this.lastWindow.processName !== currentWindow.processName || 
                            this.lastWindow.title !== currentWindow.title;

          if (hasChanged) {
            if (currentWindow.title.includes('IRIS |')) {
              continue; // Ignore IRIS itself so it doesn't pollute the session
            }

            const now = Date.now();

            // Emit blur/switch for old window
            if (this.lastWindow) {
              const duration = now - this.focusStartTime;
              this.emitEvent('window.blur', this.lastWindow, duration);
            }
            
            // Clear previous pending focus timer if it exists
            if (this.pendingFocusTimer) {
                clearTimeout(this.pendingFocusTimer);
                this.pendingFocusTimer = null;
            }

            // Set a timer to emit focus only after a dwell threshold
            this.pendingFocusTimer = setTimeout(() => {
                this.emitEvent('window.focus', currentWindow);
                this.pendingFocusTimer = null;
            }, 10000); // 10 seconds dwell time
            
            this.lastWindow = currentWindow;
            this.focusStartTime = now;
          }
        }
      } catch (error) {
        console.error('WindowCollector error:', error);
      }
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
  }

  private emitEvent(type: any, windowData: any, duration?: number) {
    const payload: WindowPayload & { url?: string } = {
      appName: windowData.processName,
      windowTitle: windowData.title,
      processId: windowData.id,
      executablePath: windowData.executable,
      platform: process.platform,
      url: windowData.url
    };

    const event: ActivityEvent = {
      id: uuidv4(),
      type,
      source: 'window',
      timestamp: Date.now(),
      duration,
      sessionId: this.sessionId,
      payload,
      raw: windowData
    };

    this.bus.publish(event);
  }

  private async getActiveWindow(): Promise<{ processName: string; title: string; id: number; executable: string } | null> {
    if (process.platform !== 'win32') {
      return null; // For now, only Windows via PowerShell
    }

    const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  }
"@
try {
  $hWnd = [Win32]::GetForegroundWindow()
  if ($hWnd -ne [IntPtr]::Zero) {
    $title = New-Object System.Text.StringBuilder 256
    [Win32]::GetWindowText($hWnd, $title, 256)
    $processId = 0
    [Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId)
    if ($processId -gt 0) {
      $processName = "Unknown"
      $exe = "Unknown"
      try {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
          $processName = $process.Name
          try {
            $exe = $process.MainModule.FileName
          } catch {}
        }
      } catch {
        try {
          $processName = (Get-Process -Id $processId).ProcessName
        } catch {}
      }
      $obj = @{
          title = $title.ToString()
          processName = $processName
          id = $processId
          executable = $exe
      }
      $obj | ConvertTo-Json -Compress
    }
  }
} catch {}
    `;

    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

    try {
      const { stdout, stderr } = await execAsync(`powershell -EncodedCommand ${encodedScript}`);
      if (stderr) console.error('[WindowCollector] PS Stderr:', stderr);
      if (stdout.trim()) {
        try {
          // Find the JSON block in case of pollution
          const jsonStart = stdout.indexOf('{');
          const jsonEnd = stdout.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
            return JSON.parse(jsonStr);
          }
        } catch (parseError) {
          console.error('[WindowCollector] JSON Parse Error:', parseError, 'Raw Output:', stdout);
        }
      }
    } catch (e) {
      console.error('[WindowCollector] PowerShell exec error:', e);
    }
    return null;
  }
}
