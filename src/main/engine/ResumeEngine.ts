import { exec } from 'child_process';
import { shell } from 'electron';
import { WorkflowSession } from '../../shared/types';
import util from 'util';

const execAsync = util.promisify(exec);

// =============================================================================
// IRIS Resume Engine (Layer 4)
// =============================================================================
// The orchestration layer for "Resume Intent™". 
// Responsible for reconstructing the physical environment (tabs, files, 
// terminals) based on a semantic session.
// =============================================================================

export class ResumeEngine {
  /**
   * Orchestrates the restoration of a cognitive environment.
   */
  async resumeWorkflow(session: WorkflowSession): Promise<void> {
    const { EventBus } = require('./EventBus');
    const bus = EventBus.getInstance();
    
    console.log(`[ResumeEngine] Orchestrating reconstruction for: ${session.name}`);

    // Safe default fallbacks
    const urls = session.urls || [];
    const files = session.files || [];
    const dominantApps = session.dominantApps || [];
    const windowTitles = session.windowTitles || [];

    // Context Prioritization: Filter out generic/noise URLs and files
    const relevantUrls = urls.filter(url => 
      url &&
      !url.includes('google.com/search') && 
      !url.includes('newtab') && 
      !url.includes('chrome://')
    ); 

    const relevantFiles = files.filter(f => f && !f.includes('node_modules') && !f.includes('.git'));
    const workspaces = new Set<string>();
    for (const file of relevantFiles) {
      const srcIndex = file.indexOf('src');
      if (srcIndex > -1) {
        workspaces.add(file.substring(0, srcIndex));
      } else {
        workspaces.add(file);
      }
    }

    const appsToLaunch = new Set<string>();
    const workApps = ['obsidian', 'notepad', 'notion', 'slack', 'discord', 'figma', 'codex', 'code', 'cursor', 'vscode', 'terminal'];
    for (const app of dominantApps) {
      if (app && workApps.some(w => app.toLowerCase().includes(w))) {
        appsToLaunch.add(app);
      }
    }

    // Check window titles for workspace indicators if still empty
    if (workspaces.size === 0 && appsToLaunch.size === 0) {
      for (const title of windowTitles) {
        if (title) {
          const tLower = title.toLowerCase();
          if (!tLower.includes('chrome') && !tLower.includes('edge') && !tLower.includes('firefox') && !tLower.includes('safari') && !tLower.includes('snipping tool')) {
            const cleanTitle = title.split('-')[0].trim();
            if (cleanTitle) {
              workspaces.add(cleanTitle);
            }
          }
        }
      }
    }
    const topWorkspaces = Array.from(workspaces).slice(0, 2);
    const topApps = Array.from(appsToLaunch).slice(0, 3);

    // STEP 1: Environmental Transition
    bus.emit('resume-sequence', { 
      type: 'start', 
      name: session.name || 'Monitoring Cognition...', 
      summary: session.contextSummary || 'Resuming workspace patterns...',
      counts: { tabs: relevantUrls.length, workspaces: topWorkspaces.length + topApps.length }
    });

    // Wait for cinematic darkening and UI to show up
    await new Promise(r => setTimeout(r, 2000));

    // STEP 2: Primary Context Opens
    if (topWorkspaces.length > 0 || topApps.length > 0) {
      bus.emit('resume-sequence', { type: 'progress', message: `Restoring ${topWorkspaces.length + topApps.length} app(s)/workspace(s)`, item: 'vscode' });
      for (const path of topWorkspaces) {
        await this.openWorkspaceOrApp(path);
      }
      for (const app of topApps) {
        await this.openWorkspaceOrApp(app);
      }
      // Wait for VS Code & Apps to anchor the user's brain
      await new Promise(r => setTimeout(r, 2500));
    }

    // STEP 3: Supporting Research Opens
    if (relevantUrls.length > 0) {
      bus.emit('resume-sequence', { type: 'progress', message: `Reopening ${relevantUrls.length} research tabs`, item: 'chrome' });
      for (const url of relevantUrls) {
        await shell.openExternal(url);
        // Stagger tab opening so it feels curated, not dumped
        await new Promise(r => setTimeout(r, 600));
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    // STEP 4: Terminal Context Restores
    const likelyWorkingDir = this.inferWorkingDirectory(files, dominantApps);
    if (likelyWorkingDir) {
      bus.emit('resume-sequence', { type: 'progress', message: `Restoring shell context in ${likelyWorkingDir.split('\\').pop()}`, item: 'terminal' });
      console.log(`[ResumeEngine] Preparing to restore shell context in: ${likelyWorkingDir}`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // STEP 5: IRIS Context Summary Appears & Overlay Dissolves
    bus.emit('resume-sequence', { type: 'complete' });
  }

  private inferWorkingDirectory(files: string[], dominantApps: string[]): string | null {
    if (files.length > 0) {
      const file = files[0];
      const srcIndex = file.indexOf('src');
      if (srcIndex > -1) {
        return file.substring(0, srcIndex);
      }
      return null;
    }
    const hasTerminal = dominantApps.some(a => a.toLowerCase().includes('terminal') || a.toLowerCase().includes('powershell'));
    if (hasTerminal) {
      return process.cwd();
    }
    return null;
  }

  private async resolveWindowsAppId(appName: string): Promise<string | null> {
    try {
      // Clean string for regex matching
      const cleanName = appName.replace(/[^a-zA-Z0-9 ]/g, '');
      const command = `powershell.exe -NoProfile -Command "Get-StartApps | Where-Object { $_.Name -match '${cleanName}' } | Select-Object -First 1 -ExpandProperty AppID"`;
      const { stdout } = await execAsync(command);
      const appId = stdout.trim();
      return appId || null;
    } catch (e) {
      return null;
    }
  }

  private async openWorkspaceOrApp(path: string) {
    const targetLower = path.toLowerCase();
    console.log(`[ResumeEngine] Attempting to restore workspace or app: ${path}`);

    // If it's a known IDE string or directory path, open with the IDE natively
    if (path.includes('/') || path.includes('\\') || path.includes('.') || targetLower === 'code' || targetLower === 'cursor' || targetLower === 'vscode') {
      exec(`code "${path}"`, (error) => {
        if (error) shell.openPath(path);
      });
      return;
    }

    // It's an application name. Try Universal Dynamic App Resolution first!
    const appId = await this.resolveWindowsAppId(path);
    if (appId) {
      console.log(`[ResumeEngine] Universally launching app: ${path} (AppID: ${appId})`);
      exec(`explorer.exe shell:AppsFolder\\${appId}`);
      return;
    }

    // Universal Fallback for weird edge cases
    console.log(`[ResumeEngine] Could not dynamically resolve AppID for: ${path}. Skipping generic protocol launch to prevent OS popups.`);
  }
}
