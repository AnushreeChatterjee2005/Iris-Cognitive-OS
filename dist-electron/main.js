import { createRequire } from "node:module";
import { BrowserWindow, app, globalShortcut, ipcMain, screen, shell } from "electron";
import * as path$1 from "path";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { exec } from "child_process";
import util, { promisify } from "util";
import { EventEmitter } from "events";
import http from "http";
import * as fs$1 from "fs";
import fs from "fs";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __require = /* @__PURE__ */ createRequire(import.meta.url);
//#endregion
//#region node_modules/uuid/dist-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) byteToHex.push((i + 256).toString(16).slice(1));
function unsafeStringify(arr, offset = 0) {
	return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
//#endregion
//#region node_modules/uuid/dist-node/rng.js
var rnds8 = new Uint8Array(16);
function rng() {
	return crypto.getRandomValues(rnds8);
}
//#endregion
//#region node_modules/uuid/dist-node/v4.js
function v4(options, buf, offset) {
	if (!buf && !options && crypto.randomUUID) return crypto.randomUUID();
	return _v4(options, buf, offset);
}
function _v4(options, buf, offset) {
	options = options || {};
	const rnds = options.random ?? options.rng?.() ?? rng();
	if (rnds.length < 16) throw new Error("Random bytes length must be >= 16");
	rnds[6] = rnds[6] & 15 | 64;
	rnds[8] = rnds[8] & 63 | 128;
	if (buf) {
		offset = offset || 0;
		if (offset < 0 || offset + 16 > buf.length) throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
		for (let i = 0; i < 16; ++i) buf[offset + i] = rnds[i];
		return buf;
	}
	return unsafeStringify(rnds);
}
//#endregion
//#region electron/engine/EventBus.ts
var EventBus_exports = /* @__PURE__ */ __exportAll({ EventBus: () => EventBus });
var EventBus;
var init_EventBus = __esmMin((() => {
	EventBus = class EventBus extends EventEmitter {
		constructor() {
			super();
			this.setMaxListeners(50);
		}
		/** Singleton — one bus for the lifetime of the app */
		static getInstance() {
			if (!EventBus.instance) EventBus.instance = new EventBus();
			return EventBus.instance;
		}
		/** Emit an activity event to all subscribers */
		publish(event) {
			this.emit("activity", event);
			this.emit(`activity:${event.source}`, event);
			this.emit(`activity:${event.type}`, event);
		}
		/** Subscribe to ALL activity events */
		onActivity(listener) {
			this.on("activity", listener);
		}
		/** Subscribe to events from a specific source */
		onSource(source, listener) {
			this.on(`activity:${source}`, listener);
		}
		/** Subscribe to a specific event type */
		onEventType(type, listener) {
			this.on(`activity:${type}`, listener);
		}
		/** Remove a listener from the main activity channel */
		offActivity(listener) {
			this.off("activity", listener);
		}
	};
}));
//#endregion
//#region electron/collectors/BaseCollector.ts
init_EventBus();
var BaseCollector = class {
	constructor() {
		this.isRunning = false;
		this.bus = EventBus.getInstance();
	}
	async stop() {
		this.isRunning = false;
	}
	get source() {
		return this.capabilities.source;
	}
};
//#endregion
//#region electron/collectors/WindowCollector.ts
var execAsync$1 = promisify(exec);
var WindowCollector = class extends BaseCollector {
	constructor(sessionId) {
		super();
		this.pollInterval = 2e3;
		this.lastWindow = null;
		this.focusStartTime = Date.now();
		this.pendingFocusTimer = null;
		this.sessionId = sessionId;
	}
	get capabilities() {
		return {
			source: "window",
			eventTypes: [
				"window.focus",
				"window.blur",
				"app.switch"
			],
			pollIntervalMs: this.pollInterval,
			description: "Tracks the active window using PowerShell on Windows."
		};
	}
	async start() {
		if (this.isRunning) return;
		this.isRunning = true;
		console.log("[WindowCollector] Polling started");
		this.poll();
	}
	async poll() {
		while (this.isRunning) {
			try {
				const currentWindow = await this.getActiveWindow();
				if (currentWindow) {
					if (!this.lastWindow || this.lastWindow.processName !== currentWindow.processName || this.lastWindow.title !== currentWindow.title) {
						if (currentWindow.title.includes("IRIS |") || currentWindow.title.toLowerCase().includes("hackathon-iris")) continue;
						const now = Date.now();
						if (this.lastWindow) {
							const duration = now - this.focusStartTime;
							this.emitEvent("window.blur", this.lastWindow, duration);
						}
						if (this.pendingFocusTimer) {
							clearTimeout(this.pendingFocusTimer);
							this.pendingFocusTimer = null;
						}
						this.pendingFocusTimer = setTimeout(() => {
							this.emitEvent("window.focus", currentWindow);
							this.pendingFocusTimer = null;
						}, 2e3);
						this.lastWindow = currentWindow;
						this.focusStartTime = now;
					}
				}
			} catch (error) {
				console.error("WindowCollector error:", error);
			}
			await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
		}
	}
	emitEvent(type, windowData, duration) {
		const payload = {
			appName: windowData.processName,
			windowTitle: windowData.title,
			processId: windowData.id,
			executablePath: windowData.executable,
			platform: process.platform,
			url: windowData.url
		};
		const event = {
			id: v4(),
			type,
			source: "window",
			timestamp: Date.now(),
			duration,
			sessionId: this.sessionId,
			payload,
			raw: windowData
		};
		this.bus.publish(event);
	}
	async getActiveWindow() {
		if (process.platform !== "win32") return null;
		const encodedScript = Buffer.from(`
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
    `, "utf16le").toString("base64");
		try {
			const { stdout, stderr } = await execAsync$1(`powershell -EncodedCommand ${encodedScript}`);
			if (stderr) console.error("[WindowCollector] PS Stderr:", stderr);
			if (stdout.trim()) try {
				const jsonStart = stdout.indexOf("{");
				const jsonEnd = stdout.lastIndexOf("}");
				if (jsonStart !== -1 && jsonEnd !== -1) {
					const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
					return JSON.parse(jsonStr);
				}
			} catch (parseError) {
				console.error("[WindowCollector] JSON Parse Error:", parseError, "Raw Output:", stdout);
			}
		} catch (e) {
			console.error("[WindowCollector] PowerShell exec error:", e);
		}
		return null;
	}
};
//#endregion
//#region electron/engine/ActivityGateway.ts
init_EventBus();
var ActivityGateway = class {
	constructor(sessionId) {
		this.port = 32e3;
		this.bus = EventBus.getInstance();
		this.sessionId = sessionId;
		this.server = http.createServer((req, res) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}
			if (req.method === "POST" && req.url === "/activity") {
				let body = "";
				req.on("data", (chunk) => body += chunk.toString());
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						this.handleIncomingActivity(data);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ status: "ok" }));
					} catch (e) {
						res.writeHead(400);
						res.end("Invalid JSON");
					}
				});
			} else {
				res.writeHead(404);
				res.end();
			}
		});
	}
	start() {
		this.server.on("error", (e) => {
			if (e.code === "EADDRINUSE") console.error(`[ActivityGateway] Port ${this.port} is already in use. External collectors will be disabled.`);
			else console.error(`[ActivityGateway] Server error:`, e);
		});
		this.server.listen(this.port, "127.0.0.1", () => {
			console.log(`[ActivityGateway] Listening for external collectors on port ${this.port}`);
		});
	}
	stop() {
		this.server.close();
	}
	handleIncomingActivity(data) {
		const event = {
			id: v4(),
			type: data.type,
			source: data.source,
			timestamp: Date.now(),
			sessionId: this.sessionId,
			payload: data.payload,
			raw: data
		};
		console.log(`[ActivityGateway] Received external event: ${event.type} from ${event.source}`);
		this.bus.publish(event);
	}
};
//#endregion
//#region electron/engine/ResumeEngine.ts
var execAsync = util.promisify(exec);
var ResumeEngine = class {
	/**
	* Orchestrates the restoration of a cognitive environment.
	*/
	async resumeWorkflow(session) {
		const { EventBus } = (init_EventBus(), __toCommonJS(EventBus_exports));
		const bus = EventBus.getInstance();
		console.log(`[ResumeEngine] Orchestrating reconstruction for: ${session.name}`);
		const urls = session.urls || [];
		const files = session.files || [];
		const dominantApps = session.dominantApps || [];
		session.windowTitles;
		const relevantUrls = urls.filter((url) => url && !url.includes("google.com/search") && !url.includes("newtab") && !url.includes("chrome://"));
		const relevantFiles = files.filter((f) => f && !f.includes("node_modules") && !f.includes(".git"));
		const workspaces = /* @__PURE__ */ new Set();
		for (const file of relevantFiles) {
			const srcIndex = file.indexOf("src");
			if (srcIndex > -1) workspaces.add(file.substring(0, srcIndex));
			else workspaces.add(file);
		}
		const appsToLaunch = /* @__PURE__ */ new Set();
		const workApps = [
			"obsidian",
			"notepad",
			"notion",
			"slack",
			"discord",
			"figma",
			"codex",
			"code",
			"cursor",
			"vscode",
			"terminal"
		];
		for (const app of dominantApps) if (app && workApps.some((w) => app.toLowerCase().includes(w))) appsToLaunch.add(app);
		const topWorkspaces = Array.from(workspaces).slice(0, 2);
		const topApps = Array.from(appsToLaunch).slice(0, 3);
		bus.emit("resume-sequence", {
			type: "start",
			name: session.name || "Monitoring Cognition...",
			summary: session.contextSummary || "Resuming workspace patterns...",
			counts: {
				tabs: relevantUrls.length,
				workspaces: topWorkspaces.length + topApps.length
			}
		});
		await new Promise((r) => setTimeout(r, 800));
		if (topWorkspaces.length > 0 || topApps.length > 0) {
			const primaryApp = dominantApps.find((a) => a && [
				"code",
				"cursor",
				"antigravity",
				"vscode"
			].some((ide) => a.toLowerCase().includes(ide)));
			bus.emit("resume-sequence", {
				type: "progress",
				message: `Restoring ${topWorkspaces.length + topApps.length} app(s)/workspace(s)`,
				item: "vscode"
			});
			for (const path of topWorkspaces) this.openWorkspaceOrApp(path, primaryApp);
			for (const app of topApps) this.openWorkspaceOrApp(app, primaryApp);
			await new Promise((r) => setTimeout(r, 600));
		}
		if (relevantUrls.length > 0) {
			bus.emit("resume-sequence", {
				type: "progress",
				message: `Reopening ${relevantUrls.length} research tabs`,
				item: "chrome"
			});
			for (const url of relevantUrls) {
				shell.openExternal(url);
				await new Promise((r) => setTimeout(r, 200));
			}
			await new Promise((r) => setTimeout(r, 400));
		}
		const likelyWorkingDir = this.inferWorkingDirectory(files, dominantApps);
		if (likelyWorkingDir) {
			bus.emit("resume-sequence", {
				type: "progress",
				message: `Restoring shell context in ${likelyWorkingDir.split("\\").pop()}`,
				item: "terminal"
			});
			console.log(`[ResumeEngine] Preparing to restore shell context in: ${likelyWorkingDir}`);
			await new Promise((r) => setTimeout(r, 400));
		}
		bus.emit("resume-sequence", { type: "complete" });
	}
	inferWorkingDirectory(files, dominantApps) {
		if (files.length > 0) {
			const file = files[0];
			const srcIndex = file.indexOf("src");
			if (srcIndex > -1) return file.substring(0, srcIndex);
			return null;
		}
		if (dominantApps.some((a) => a.toLowerCase().includes("terminal") || a.toLowerCase().includes("powershell"))) return process.cwd();
		return null;
	}
	async resolveWindowsAppId(appName) {
		try {
			const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "Get-StartApps | Where-Object { $_.Name -match '${appName.replace(/[^a-zA-Z0-9 ]/g, "")}' } | Select-Object -First 1 -ExpandProperty AppID"`);
			return stdout.trim() || null;
		} catch (e) {
			return null;
		}
	}
	async openWorkspaceOrApp(path, primaryApp) {
		const targetLower = path.toLowerCase();
		console.log(`[ResumeEngine] Attempting to restore workspace or app: ${path}`);
		if (path.includes("/") || path.includes("\\") || path.includes(".") || targetLower === "code" || targetLower === "cursor" || targetLower === "vscode") {
			let ideCmd = "code";
			if (primaryApp) {
				const appLower = primaryApp.toLowerCase();
				if (appLower.includes("cursor")) ideCmd = "cursor";
				else if (appLower.includes("antigravity")) ideCmd = "antigravity";
			}
			exec(`${ideCmd} "${path}"`, (error) => {
				if (error) shell.openPath(path);
			});
			return;
		}
		const appId = await this.resolveWindowsAppId(path);
		if (appId) {
			console.log(`[ResumeEngine] Universally launching app: ${path} (AppID: ${appId})`);
			exec(`explorer.exe shell:AppsFolder\\${appId}`);
			return;
		}
		console.log(`[ResumeEngine] Could not dynamically resolve AppID for: ${path}. Skipping generic protocol launch to prevent OS popups.`);
	}
};
//#endregion
//#region electron/engine/ActivityEngine.ts
init_EventBus();
var BACKEND_URL = "http://127.0.0.1:8000";
var ActivityEngine = class {
	constructor(store) {
		this.collectors = [];
		this.fallbackApps = /* @__PURE__ */ new Set();
		this.fallbackTitles = /* @__PURE__ */ new Set();
		this.fallbackUrls = /* @__PURE__ */ new Set();
		this.fallbackFiles = /* @__PURE__ */ new Set();
		this.fallbackIdleTimer = null;
		this.bus = EventBus.getInstance();
		this.store = store;
		this.resumer = new ResumeEngine();
		this.currentSession = {
			id: v4(),
			startTime: Date.now(),
			hostname: os.hostname(),
			platform: process.platform,
			eventCount: 0
		};
		this.gateway = new ActivityGateway(this.currentSession.id);
	}
	getSessionId() {
		return this.currentSession.id;
	}
	async start() {
		console.log(`[ActivityEngine] Starting session: ${this.currentSession.id}`);
		this.gateway.start();
		this.store.saveSession(this.currentSession);
		this.bus.onActivity(async (event) => {
			try {
				this.store.saveEvent(event);
			} catch (err) {
				console.error("[ActivityEngine] Failed to save event to database:", err);
			}
			try {
				const response = await fetch(`${BACKEND_URL}/session/events`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(event)
				});
				if (response.ok) {
					const data = await response.json();
					if (data && data.session) {
						const workflowSession = data.session;
						console.log(`[ActivityEngine] Received UI update. Name: ${workflowSession.name}, URLs: ${workflowSession.urls.length}`);
						if (this.currentSession.id !== workflowSession.id) {
							console.log(`[ActivityEngine] Session boundary crossed. New ID: ${workflowSession.id}`);
							this.currentSession.id = workflowSession.id;
							for (const collector of this.collectors) if (collector.sessionId) collector.sessionId = workflowSession.id;
						}
						this.bus.emit("ui-workflow-update", workflowSession);
						fetch(`${BACKEND_URL}/memory/embed`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(workflowSession)
						}).catch((err) => console.error("[ActivityEngine] Live embed failed:", err));
					}
				} else this.emitFallbackSession(event);
			} catch (err) {
				this.emitFallbackSession(event);
			}
		});
		const windowCollector = new WindowCollector(this.currentSession.id);
		this.collectors.push(windowCollector);
		for (const collector of this.collectors) await collector.start();
	}
	generateDynamicName(apps, urls) {
		const appsText = apps.join(" ").toLowerCase();
		const urlsText = urls.join(" ").toLowerCase();
		if (appsText.includes("code") || appsText.includes("cursor") || appsText.includes("terminal")) {
			if (urlsText.includes("github") || urlsText.includes("stackoverflow")) return "Codebase Integration & Troubleshooting";
			if (urlsText.includes("react") || urlsText.includes("node") || urlsText.includes("mdn") || urlsText.includes("developer")) return "Development & Documentation Review";
			return "Software Engineering & Architecture";
		}
		if (appsText.includes("figma") || appsText.includes("photoshop") || appsText.includes("design")) return "Creative Design & Prototyping";
		if (urlsText.includes("youtube") || urlsText.includes("twitch") || urlsText.includes("vimeo")) return "Media Consumption & Video Research";
		if (urlsText.includes("docs.google") || appsText.includes("word") || appsText.includes("notion") || appsText.includes("obsidian")) return "Documentation & Strategy Planning";
		if (urlsText.includes("slideshare") || urlsText.includes("presentation") || urlsText.includes("slides")) return "Presentation & Slide Deck Assembly";
		if (urlsText.includes("mail") || urlsText.includes("slack") || urlsText.includes("discord")) return "Communication & Team Sync";
		if (appsText.includes("chrome") || appsText.includes("edge") || appsText.includes("browser")) {
			if (urls.length > 0) try {
				return `Web Exploration: ${new URL(urls[0]).hostname.replace("www.", "")}`;
			} catch (e) {}
			return "Ambient Web Exploration";
		}
		if (apps.length > 0) return `Focused Workflow: ${apps[0]}`;
		return "Ambient Cognitive Context";
	}
	emitFallbackSession(event) {
		const appName = event.payload?.appName || event.payload?.browser;
		const windowTitle = event.payload?.windowTitle || event.payload?.title;
		const url = event.payload?.url;
		if (appName) this.fallbackApps.add(appName);
		if (windowTitle) {
			this.fallbackTitles.add(windowTitle);
			const fileMatch = windowTitle.match(/(?:^|[\\/\s])([a-zA-Z0-9_-]+\.(?:tsx|ts|js|jsx|py|css|html|md|json|txt|cpp|c|h|go|rs))(?:\s|-|$)/i);
			if (fileMatch && fileMatch[1]) this.fallbackFiles.add(fileMatch[1]);
		}
		if (url) this.fallbackUrls.add(url);
		const liveSession = {
			id: this.currentSession.id,
			name: "Capturing Live Context...",
			startTime: this.currentSession.startTime,
			duration: Date.now() - this.currentSession.startTime,
			dominantApps: Array.from(this.fallbackApps),
			windowTitles: Array.from(this.fallbackTitles),
			urls: Array.from(this.fallbackUrls),
			files: Array.from(this.fallbackFiles),
			eventCount: this.currentSession.eventCount,
			status: "active",
			contextSummary: `Actively capturing ${this.fallbackApps.size} apps and ${this.fallbackUrls.size} urls locally...`,
			probableObjective: "Live Ambient Monitoring",
			confidenceScore: .8,
			relatedSessions: []
		};
		this.bus.emit("ui-workflow-update", liveSession);
		if (this.fallbackIdleTimer) clearTimeout(this.fallbackIdleTimer);
		this.fallbackIdleTimer = setTimeout(async () => {
			console.log(`[ActivityEngine] Idle timeout reached. Splitting local session boundary.`);
			let sessionName = "Local Captured Context";
			try {
				const res = await fetch("http://127.0.0.1:8000/api/generate-name", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						apps: Array.from(this.fallbackApps),
						urls: Array.from(this.fallbackUrls)
					})
				});
				if (res.ok) {
					const data = await res.json();
					if (data.name) sessionName = data.name;
				}
			} catch (e) {
				console.log("[ActivityEngine] LLM Naming failed, using fallback.");
			}
			const sealedSession = {
				...liveSession,
				name: sessionName,
				duration: Date.now() - this.currentSession.startTime,
				contextSummary: `Captured ${this.fallbackApps.size} apps and ${this.fallbackUrls.size} urls locally`
			};
			this.bus.emit("ui-workflow-update", sealedSession);
			this.currentSession.id = v4();
			this.currentSession.startTime = Date.now();
			this.currentSession.eventCount = 0;
			this.fallbackApps.clear();
			this.fallbackTitles.clear();
			this.fallbackUrls.clear();
			this.fallbackFiles.clear();
		}, 12e4);
	}
	async searchMemory(query) {
		try {
			const response = await fetch(`${BACKEND_URL}/memory/search`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query,
					limit: 5
				})
			});
			if (response.ok) return await response.json();
			return [];
		} catch (err) {
			console.error("[ActivityEngine] Failed to search memory via backend:", err);
			return [];
		}
	}
	async resumeWorkflow(session) {
		await this.resumer.resumeWorkflow(session);
	}
	async stop() {
		this.currentSession.endTime = Date.now();
		this.store.saveSession(this.currentSession);
		this.gateway.stop();
		for (const collector of this.collectors) await collector.stop();
		console.log(`[ActivityEngine] Stopped session: ${this.currentSession.id}`);
	}
	getCurrentSession() {
		return this.currentSession;
	}
};
//#endregion
//#region electron/store/ActivityStore.ts
var import_sql_wasm = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var initSqlJsPromise = void 0;
	var initSqlJs$1 = function(moduleConfig) {
		if (initSqlJsPromise) return initSqlJsPromise;
		initSqlJsPromise = new Promise(function(resolveModule, reject) {
			var Module = typeof moduleConfig !== "undefined" ? moduleConfig : {};
			var originalOnAbortFunction = Module["onAbort"];
			Module["onAbort"] = function(errorThatCausedAbort) {
				reject(new Error(errorThatCausedAbort));
				if (originalOnAbortFunction) originalOnAbortFunction(errorThatCausedAbort);
			};
			Module["postRun"] = Module["postRun"] || [];
			Module["postRun"].push(function() {
				resolveModule(Module);
			});
			module = void 0;
			var k;
			k ||= typeof Module != "undefined" ? Module : {};
			var aa = !!globalThis.window, ba = !!globalThis.WorkerGlobalScope, ca = globalThis.process?.versions?.node && "renderer" != globalThis.process?.type;
			k.onRuntimeInitialized = function() {
				function a(f, l) {
					switch (typeof l) {
						case "boolean":
							bc(f, l ? 1 : 0);
							break;
						case "number":
							cc(f, l);
							break;
						case "string":
							dc(f, l, -1, -1);
							break;
						case "object":
							if (null === l) lb(f);
							else if (null != l.length) {
								var n = da(l.length);
								m.set(l, n);
								ec(f, n, l.length, -1);
								ea(n);
							} else sa(f, "Wrong API use : tried to return a value of an unknown type (" + l + ").", -1);
							break;
						default: lb(f);
					}
				}
				function b(f, l) {
					for (var n = [], p = 0; p < f; p += 1) {
						var u = r(l + 4 * p, "i32"), v = fc(u);
						if (1 === v || 2 === v) u = gc(u);
						else if (3 === v) u = hc(u);
						else if (4 === v) {
							v = u;
							u = ic(v);
							v = jc(v);
							for (var K = new Uint8Array(u), I = 0; I < u; I += 1) K[I] = m[v + I];
							u = K;
						} else u = null;
						n.push(u);
					}
					return n;
				}
				function c(f, l) {
					this.Qa = f;
					this.db = l;
					this.Oa = 1;
					this.mb = [];
				}
				function d(f, l) {
					this.db = l;
					this.fb = fa(f);
					if (null === this.fb) throw Error("Unable to allocate memory for the SQL string");
					this.lb = this.fb;
					this.$a = this.sb = null;
				}
				function e(f) {
					this.filename = "dbfile_" + (4294967295 * Math.random() >>> 0);
					if (null != f) {
						var l = this.filename, n = "/", p = l;
						n && (n = "string" == typeof n ? n : ha(n), p = l ? ia(n + "/" + l) : n);
						l = ja(!0, !0);
						p = ka(p, l);
						if (f) {
							if ("string" == typeof f) {
								n = Array(f.length);
								for (var u = 0, v = f.length; u < v; ++u) n[u] = f.charCodeAt(u);
								f = n;
							}
							la(p, l | 146);
							n = ma(p, 577);
							na(n, f, 0, f.length, 0);
							oa(n);
							la(p, l);
						}
					}
					this.handleError(q(this.filename, g));
					this.db = r(g, "i32");
					ob(this.db);
					this.gb = {};
					this.Sa = {};
				}
				var g = y(4), h = k.cwrap, q = h("sqlite3_open", "number", ["string", "number"]), w = h("sqlite3_close_v2", "number", ["number"]), t = h("sqlite3_exec", "number", [
					"number",
					"string",
					"number",
					"number",
					"number"
				]), x = h("sqlite3_changes", "number", ["number"]), D = h("sqlite3_prepare_v2", "number", [
					"number",
					"string",
					"number",
					"number",
					"number"
				]), pb = h("sqlite3_sql", "string", ["number"]), lc = h("sqlite3_normalized_sql", "string", ["number"]), qb = h("sqlite3_prepare_v2", "number", [
					"number",
					"number",
					"number",
					"number",
					"number"
				]), mc = h("sqlite3_bind_text", "number", [
					"number",
					"number",
					"number",
					"number",
					"number"
				]), rb = h("sqlite3_bind_blob", "number", [
					"number",
					"number",
					"number",
					"number",
					"number"
				]), nc = h("sqlite3_bind_double", "number", [
					"number",
					"number",
					"number"
				]), oc = h("sqlite3_bind_int", "number", [
					"number",
					"number",
					"number"
				]), pc = h("sqlite3_bind_parameter_index", "number", ["number", "string"]), qc = h("sqlite3_step", "number", ["number"]), rc = h("sqlite3_errmsg", "string", ["number"]), sc = h("sqlite3_column_count", "number", ["number"]), tc = h("sqlite3_data_count", "number", ["number"]), uc = h("sqlite3_column_double", "number", ["number", "number"]), sb = h("sqlite3_column_text", "string", ["number", "number"]), vc = h("sqlite3_column_blob", "number", ["number", "number"]), wc = h("sqlite3_column_bytes", "number", ["number", "number"]), xc = h("sqlite3_column_type", "number", ["number", "number"]), yc = h("sqlite3_column_name", "string", ["number", "number"]), zc = h("sqlite3_reset", "number", ["number"]), Ac = h("sqlite3_clear_bindings", "number", ["number"]), Bc = h("sqlite3_finalize", "number", ["number"]), tb = h("sqlite3_create_function_v2", "number", "number string number number number number number number number".split(" ")), fc = h("sqlite3_value_type", "number", ["number"]), ic = h("sqlite3_value_bytes", "number", ["number"]), hc = h("sqlite3_value_text", "string", ["number"]), jc = h("sqlite3_value_blob", "number", ["number"]), gc = h("sqlite3_value_double", "number", ["number"]), cc = h("sqlite3_result_double", "", ["number", "number"]), lb = h("sqlite3_result_null", "", ["number"]), dc = h("sqlite3_result_text", "", [
					"number",
					"string",
					"number",
					"number"
				]), ec = h("sqlite3_result_blob", "", [
					"number",
					"number",
					"number",
					"number"
				]), bc = h("sqlite3_result_int", "", ["number", "number"]), sa = h("sqlite3_result_error", "", [
					"number",
					"string",
					"number"
				]), ub = h("sqlite3_aggregate_context", "number", ["number", "number"]), ob = h("RegisterExtensionFunctions", "number", ["number"]), vb = h("sqlite3_update_hook", "number", [
					"number",
					"number",
					"number"
				]);
				c.prototype.bind = function(f) {
					if (!this.Qa) throw "Statement closed";
					this.reset();
					return Array.isArray(f) ? this.Gb(f) : null != f && "object" === typeof f ? this.Hb(f) : !0;
				};
				c.prototype.step = function() {
					if (!this.Qa) throw "Statement closed";
					this.Oa = 1;
					var f = qc(this.Qa);
					switch (f) {
						case 100: return !0;
						case 101: return !1;
						default: throw this.db.handleError(f);
					}
				};
				c.prototype.Ab = function(f) {
					f ?? (f = this.Oa, this.Oa += 1);
					return uc(this.Qa, f);
				};
				c.prototype.Ob = function(f) {
					f ?? (f = this.Oa, this.Oa += 1);
					f = sb(this.Qa, f);
					if ("function" !== typeof BigInt) throw Error("BigInt is not supported");
					return BigInt(f);
				};
				c.prototype.Tb = function(f) {
					f ?? (f = this.Oa, this.Oa += 1);
					return sb(this.Qa, f);
				};
				c.prototype.getBlob = function(f) {
					f ?? (f = this.Oa, this.Oa += 1);
					var l = wc(this.Qa, f);
					f = vc(this.Qa, f);
					for (var n = new Uint8Array(l), p = 0; p < l; p += 1) n[p] = m[f + p];
					return n;
				};
				c.prototype.get = function(f, l) {
					l = l || {};
					null != f && this.bind(f) && this.step();
					f = [];
					for (var n = tc(this.Qa), p = 0; p < n; p += 1) switch (xc(this.Qa, p)) {
						case 1:
							var u = l.useBigInt ? this.Ob(p) : this.Ab(p);
							f.push(u);
							break;
						case 2:
							f.push(this.Ab(p));
							break;
						case 3:
							f.push(this.Tb(p));
							break;
						case 4:
							f.push(this.getBlob(p));
							break;
						default: f.push(null);
					}
					return f;
				};
				c.prototype.qb = function() {
					for (var f = [], l = sc(this.Qa), n = 0; n < l; n += 1) f.push(yc(this.Qa, n));
					return f;
				};
				c.prototype.zb = function(f, l) {
					f = this.get(f, l);
					l = this.qb();
					for (var n = {}, p = 0; p < l.length; p += 1) n[l[p]] = f[p];
					return n;
				};
				c.prototype.Sb = function() {
					return pb(this.Qa);
				};
				c.prototype.Pb = function() {
					return lc(this.Qa);
				};
				c.prototype.run = function(f) {
					null != f && this.bind(f);
					this.step();
					return this.reset();
				};
				c.prototype.wb = function(f, l) {
					l ?? (l = this.Oa, this.Oa += 1);
					f = fa(f);
					this.mb.push(f);
					this.db.handleError(mc(this.Qa, l, f, -1, 0));
				};
				c.prototype.Fb = function(f, l) {
					l ?? (l = this.Oa, this.Oa += 1);
					var n = da(f.length);
					m.set(f, n);
					this.mb.push(n);
					this.db.handleError(rb(this.Qa, l, n, f.length, 0));
				};
				c.prototype.vb = function(f, l) {
					l ?? (l = this.Oa, this.Oa += 1);
					this.db.handleError((f === (f | 0) ? oc : nc)(this.Qa, l, f));
				};
				c.prototype.Ib = function(f) {
					f ?? (f = this.Oa, this.Oa += 1);
					rb(this.Qa, f, 0, 0, 0);
				};
				c.prototype.xb = function(f, l) {
					l ?? (l = this.Oa, this.Oa += 1);
					switch (typeof f) {
						case "string":
							this.wb(f, l);
							return;
						case "number":
							this.vb(f, l);
							return;
						case "bigint":
							this.wb(f.toString(), l);
							return;
						case "boolean":
							this.vb(f + 0, l);
							return;
						case "object":
							if (null === f) {
								this.Ib(l);
								return;
							}
							if (null != f.length) {
								this.Fb(f, l);
								return;
							}
					}
					throw "Wrong API use : tried to bind a value of an unknown type (" + f + ").";
				};
				c.prototype.Hb = function(f) {
					var l = this;
					Object.keys(f).forEach(function(n) {
						var p = pc(l.Qa, n);
						0 !== p && l.xb(f[n], p);
					});
					return !0;
				};
				c.prototype.Gb = function(f) {
					for (var l = 0; l < f.length; l += 1) this.xb(f[l], l + 1);
					return !0;
				};
				c.prototype.reset = function() {
					this.freemem();
					return 0 === Ac(this.Qa) && 0 === zc(this.Qa);
				};
				c.prototype.freemem = function() {
					for (var f; void 0 !== (f = this.mb.pop());) ea(f);
				};
				c.prototype.Ya = function() {
					this.freemem();
					var f = 0 === Bc(this.Qa);
					delete this.db.gb[this.Qa];
					this.Qa = 0;
					return f;
				};
				d.prototype.next = function() {
					if (null === this.fb) return { done: !0 };
					null !== this.$a && (this.$a.Ya(), this.$a = null);
					if (!this.db.db) throw this.ob(), Error("Database closed");
					var f = pa(), l = y(4);
					qa(g);
					qa(l);
					try {
						this.db.handleError(qb(this.db.db, this.lb, -1, g, l));
						this.lb = r(l, "i32");
						var n = r(g, "i32");
						if (0 === n) return this.ob(), { done: !0 };
						this.$a = new c(n, this.db);
						this.db.gb[n] = this.$a;
						return {
							value: this.$a,
							done: !1
						};
					} catch (p) {
						throw this.sb = z(this.lb), this.ob(), p;
					} finally {
						ra(f);
					}
				};
				d.prototype.ob = function() {
					ea(this.fb);
					this.fb = null;
				};
				d.prototype.Qb = function() {
					return null !== this.sb ? this.sb : z(this.lb);
				};
				"function" === typeof Symbol && "symbol" === typeof Symbol.iterator && (d.prototype[Symbol.iterator] = function() {
					return this;
				});
				e.prototype.run = function(f, l) {
					if (!this.db) throw "Database closed";
					if (l) {
						f = this.tb(f, l);
						try {
							f.step();
						} finally {
							f.Ya();
						}
					} else this.handleError(t(this.db, f, 0, 0, g));
					return this;
				};
				e.prototype.exec = function(f, l, n) {
					if (!this.db) throw "Database closed";
					var p = null, u = null, v = null;
					try {
						v = u = fa(f);
						var K = y(4);
						for (f = []; 0 !== r(v, "i8");) {
							qa(g);
							qa(K);
							this.handleError(qb(this.db, v, -1, g, K));
							var I = r(g, "i32");
							v = r(K, "i32");
							if (0 !== I) {
								var H = null;
								p = new c(I, this);
								for (null != l && p.bind(l); p.step();) null === H && (H = {
									columns: p.qb(),
									values: []
								}, f.push(H)), H.values.push(p.get(null, n));
								p.Ya();
							}
						}
						return f;
					} catch (L) {
						throw p && p.Ya(), L;
					} finally {
						u && ea(u);
					}
				};
				e.prototype.Mb = function(f, l, n, p, u) {
					"function" === typeof l && (p = n, n = l, l = void 0);
					f = this.tb(f, l);
					try {
						for (; f.step();) n(f.zb(null, u));
					} finally {
						f.Ya();
					}
					if ("function" === typeof p) return p();
				};
				e.prototype.tb = function(f, l) {
					qa(g);
					this.handleError(D(this.db, f, -1, g, 0));
					f = r(g, "i32");
					if (0 === f) throw "Nothing to prepare";
					var n = new c(f, this);
					null != l && n.bind(l);
					return this.gb[f] = n;
				};
				e.prototype.Ub = function(f) {
					return new d(f, this);
				};
				e.prototype.Nb = function() {
					Object.values(this.gb).forEach(function(l) {
						l.Ya();
					});
					Object.values(this.Sa).forEach(A);
					this.Sa = {};
					this.handleError(w(this.db));
					var f = ta(this.filename);
					this.handleError(q(this.filename, g));
					this.db = r(g, "i32");
					ob(this.db);
					return f;
				};
				e.prototype.close = function() {
					null !== this.db && (Object.values(this.gb).forEach(function(f) {
						f.Ya();
					}), Object.values(this.Sa).forEach(A), this.Sa = {}, this.Za && (A(this.Za), this.Za = void 0), this.handleError(w(this.db)), ua("/" + this.filename), this.db = null);
				};
				e.prototype.handleError = function(f) {
					if (0 === f) return null;
					f = rc(this.db);
					throw Error(f);
				};
				e.prototype.Rb = function() {
					return x(this.db);
				};
				e.prototype.Kb = function(f, l) {
					Object.prototype.hasOwnProperty.call(this.Sa, f) && (A(this.Sa[f]), delete this.Sa[f]);
					var n = va(function(p, u, v) {
						u = b(u, v);
						try {
							var K = l.apply(null, u);
						} catch (I) {
							sa(p, I, -1);
							return;
						}
						a(p, K);
					}, "viii");
					this.Sa[f] = n;
					this.handleError(tb(this.db, f, l.length, 1, 0, n, 0, 0, 0));
					return this;
				};
				e.prototype.Jb = function(f, l) {
					var n = l.init || function() {
						return null;
					}, p = l.finalize || function(H) {
						return H;
					}, u = l.step;
					if (!u) throw "An aggregate function must have a step function in " + f;
					var v = {};
					Object.hasOwnProperty.call(this.Sa, f) && (A(this.Sa[f]), delete this.Sa[f]);
					l = f + "__finalize";
					Object.hasOwnProperty.call(this.Sa, l) && (A(this.Sa[l]), delete this.Sa[l]);
					var K = va(function(H, L, Pa) {
						var V = ub(H, 1);
						Object.hasOwnProperty.call(v, V) || (v[V] = n());
						L = b(L, Pa);
						L = [v[V]].concat(L);
						try {
							v[V] = u.apply(null, L);
						} catch (Dc) {
							delete v[V], sa(H, Dc, -1);
						}
					}, "viii"), I = va(function(H) {
						var L = ub(H, 1);
						try {
							var Pa = p(v[L]);
						} catch (V) {
							delete v[L];
							sa(H, V, -1);
							return;
						}
						a(H, Pa);
						delete v[L];
					}, "vi");
					this.Sa[f] = K;
					this.Sa[l] = I;
					this.handleError(tb(this.db, f, u.length - 1, 1, 0, 0, K, I, 0));
					return this;
				};
				e.prototype.Zb = function(f) {
					this.Za && (vb(this.db, 0, 0), A(this.Za), this.Za = void 0);
					if (!f) return this;
					this.Za = va(function(l, n, p, u, v) {
						switch (n) {
							case 18:
								l = "insert";
								break;
							case 23:
								l = "update";
								break;
							case 9:
								l = "delete";
								break;
							default: throw "unknown operationCode in updateHook callback: " + n;
						}
						p = z(p);
						u = z(u);
						if (v > Number.MAX_SAFE_INTEGER) throw "rowId too big to fit inside a Number";
						f(l, p, u, Number(v));
					}, "viiiij");
					vb(this.db, this.Za, 0);
					return this;
				};
				c.prototype.bind = c.prototype.bind;
				c.prototype.step = c.prototype.step;
				c.prototype.get = c.prototype.get;
				c.prototype.getColumnNames = c.prototype.qb;
				c.prototype.getAsObject = c.prototype.zb;
				c.prototype.getSQL = c.prototype.Sb;
				c.prototype.getNormalizedSQL = c.prototype.Pb;
				c.prototype.run = c.prototype.run;
				c.prototype.reset = c.prototype.reset;
				c.prototype.freemem = c.prototype.freemem;
				c.prototype.free = c.prototype.Ya;
				d.prototype.next = d.prototype.next;
				d.prototype.getRemainingSQL = d.prototype.Qb;
				e.prototype.run = e.prototype.run;
				e.prototype.exec = e.prototype.exec;
				e.prototype.each = e.prototype.Mb;
				e.prototype.prepare = e.prototype.tb;
				e.prototype.iterateStatements = e.prototype.Ub;
				e.prototype["export"] = e.prototype.Nb;
				e.prototype.close = e.prototype.close;
				e.prototype.handleError = e.prototype.handleError;
				e.prototype.getRowsModified = e.prototype.Rb;
				e.prototype.create_function = e.prototype.Kb;
				e.prototype.create_aggregate = e.prototype.Jb;
				e.prototype.updateHook = e.prototype.Zb;
				k.Database = e;
			};
			var wa = "./this.program", xa = (a, b) => {
				throw b;
			}, ya = globalThis.document?.currentScript?.src;
			"undefined" != typeof __filename ? ya = __filename : ba && (ya = self.location.href);
			var za = "", Aa, Ba;
			if (ca) {
				var fs = __require("node:fs");
				za = __dirname + "/";
				Ba = (a) => {
					a = Ca(a) ? new URL(a) : a;
					return fs.readFileSync(a);
				};
				Aa = async (a) => {
					a = Ca(a) ? new URL(a) : a;
					return fs.readFileSync(a, void 0);
				};
				1 < process.argv.length && (wa = process.argv[1].replace(/\\/g, "/"));
				process.argv.slice(2);
				"undefined" != typeof module && (module.exports = k);
				xa = (a, b) => {
					process.exitCode = a;
					throw b;
				};
			} else if (aa || ba) {
				try {
					za = new URL(".", ya).href;
				} catch {}
				ba && (Ba = (a) => {
					var b = new XMLHttpRequest();
					b.open("GET", a, !1);
					b.responseType = "arraybuffer";
					b.send(null);
					return new Uint8Array(b.response);
				});
				Aa = async (a) => {
					if (Ca(a)) return new Promise((c, d) => {
						var e = new XMLHttpRequest();
						e.open("GET", a, !0);
						e.responseType = "arraybuffer";
						e.onload = () => {
							200 == e.status || 0 == e.status && e.response ? c(e.response) : d(e.status);
						};
						e.onerror = d;
						e.send(null);
					});
					var b = await fetch(a, { credentials: "same-origin" });
					if (b.ok) return b.arrayBuffer();
					throw Error(b.status + " : " + b.url);
				};
			}
			var Da = console.log.bind(console), B = console.error.bind(console), Ea, Fa = !1, Ga, Ca = (a) => a.startsWith("file://"), m, C, Ha, E, F, Ia, Ja, G;
			function Ka() {
				var a = La.buffer;
				m = new Int8Array(a);
				Ha = new Int16Array(a);
				C = new Uint8Array(a);
				new Uint16Array(a);
				E = new Int32Array(a);
				F = new Uint32Array(a);
				Ia = new Float32Array(a);
				Ja = new Float64Array(a);
				G = new BigInt64Array(a);
				new BigUint64Array(a);
			}
			function Ma(a) {
				k.onAbort?.(a);
				a = "Aborted(" + a + ")";
				B(a);
				Fa = !0;
				throw new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
			}
			var Na;
			async function Oa(a) {
				if (!Ea) try {
					var b = await Aa(a);
					return new Uint8Array(b);
				} catch {}
				if (a == Na && Ea) a = new Uint8Array(Ea);
				else if (Ba) a = Ba(a);
				else throw "both async and sync fetching of the wasm failed";
				return a;
			}
			async function Qa(a, b) {
				try {
					var c = await Oa(a);
					return await WebAssembly.instantiate(c, b);
				} catch (d) {
					B(`failed to asynchronously prepare wasm: ${d}`), Ma(d);
				}
			}
			async function Ra(a) {
				var b = Na;
				if (!Ea && !Ca(b) && !ca) try {
					var c = fetch(b, { credentials: "same-origin" });
					return await WebAssembly.instantiateStreaming(c, a);
				} catch (d) {
					B(`wasm streaming compile failed: ${d}`), B("falling back to ArrayBuffer instantiation");
				}
				return Qa(b, a);
			}
			class Sa {
				name = "ExitStatus";
				constructor(a) {
					this.message = `Program terminated with exit(${a})`;
					this.status = a;
				}
			}
			var Ta = (a) => {
				for (; 0 < a.length;) a.shift()(k);
			}, Ua = [], Va = [], Wa = () => {
				var a = k.preRun.shift();
				Va.push(a);
			}, J = 0, Xa = null;
			function r(a, b = "i8") {
				b.endsWith("*") && (b = "*");
				switch (b) {
					case "i1": return m[a];
					case "i8": return m[a];
					case "i16": return Ha[a >> 1];
					case "i32": return E[a >> 2];
					case "i64": return G[a >> 3];
					case "float": return Ia[a >> 2];
					case "double": return Ja[a >> 3];
					case "*": return F[a >> 2];
					default: Ma(`invalid type for getValue: ${b}`);
				}
			}
			var Ya = !0;
			function qa(a) {
				var b = "i32";
				b.endsWith("*") && (b = "*");
				switch (b) {
					case "i1":
						m[a] = 0;
						break;
					case "i8":
						m[a] = 0;
						break;
					case "i16":
						Ha[a >> 1] = 0;
						break;
					case "i32":
						E[a >> 2] = 0;
						break;
					case "i64":
						G[a >> 3] = BigInt(0);
						break;
					case "float":
						Ia[a >> 2] = 0;
						break;
					case "double":
						Ja[a >> 3] = 0;
						break;
					case "*":
						F[a >> 2] = 0;
						break;
					default: Ma(`invalid type for setValue: ${b}`);
				}
			}
			var Za = new TextDecoder(), $a = (a, b, c, d) => {
				c = b + c;
				if (d) return c;
				for (; a[b] && !(b >= c);) ++b;
				return b;
			}, z = (a, b, c) => a ? Za.decode(C.subarray(a, $a(C, a, b, c))) : "", ab = (a, b) => {
				for (var c = 0, d = a.length - 1; 0 <= d; d--) {
					var e = a[d];
					"." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
				}
				if (b) for (; c; c--) a.unshift("..");
				return a;
			}, ia = (a) => {
				var b = "/" === a.charAt(0), c = "/" === a.slice(-1);
				(a = ab(a.split("/").filter((d) => !!d), !b).join("/")) || b || (a = ".");
				a && c && (a += "/");
				return (b ? "/" : "") + a;
			}, bb = (a) => {
				var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
				a = b[0];
				b = b[1];
				if (!a && !b) return ".";
				b &&= b.slice(0, -1);
				return a + b;
			}, cb = (a) => a && a.match(/([^\/]+|\/)\/*$/)[1], db = () => {
				if (ca) {
					var a = __require("node:crypto");
					return (b) => a.randomFillSync(b);
				}
				return (b) => crypto.getRandomValues(b);
			}, eb = (a) => {
				(eb = db())(a);
			}, fb = (...a) => {
				for (var b = "", c = !1, d = a.length - 1; -1 <= d && !c; d--) {
					c = 0 <= d ? a[d] : "/";
					if ("string" != typeof c) throw new TypeError("Arguments to path.resolve must be strings");
					if (!c) return "";
					b = c + "/" + b;
					c = "/" === c.charAt(0);
				}
				b = ab(b.split("/").filter((e) => !!e), !c).join("/");
				return (c ? "/" : "") + b || ".";
			}, gb = (a) => {
				var b = $a(a, 0);
				return Za.decode(a.buffer ? a.subarray(0, b) : new Uint8Array(a.slice(0, b)));
			}, hb = [], ib = (a) => {
				for (var b = 0, c = 0; c < a.length; ++c) {
					var d = a.charCodeAt(c);
					127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
				}
				return b;
			}, M = (a, b, c, d) => {
				if (!(0 < d)) return 0;
				var e = c;
				d = c + d - 1;
				for (var g = 0; g < a.length; ++g) {
					var h = a.codePointAt(g);
					if (127 >= h) {
						if (c >= d) break;
						b[c++] = h;
					} else if (2047 >= h) {
						if (c + 1 >= d) break;
						b[c++] = 192 | h >> 6;
						b[c++] = 128 | h & 63;
					} else if (65535 >= h) {
						if (c + 2 >= d) break;
						b[c++] = 224 | h >> 12;
						b[c++] = 128 | h >> 6 & 63;
						b[c++] = 128 | h & 63;
					} else {
						if (c + 3 >= d) break;
						b[c++] = 240 | h >> 18;
						b[c++] = 128 | h >> 12 & 63;
						b[c++] = 128 | h >> 6 & 63;
						b[c++] = 128 | h & 63;
						g++;
					}
				}
				b[c] = 0;
				return c - e;
			}, jb = [];
			function kb(a, b) {
				jb[a] = {
					input: [],
					output: [],
					eb: b
				};
				mb(a, nb);
			}
			var nb = {
				open(a) {
					var b = jb[a.node.rdev];
					if (!b) throw new N(43);
					a.tty = b;
					a.seekable = !1;
				},
				close(a) {
					a.tty.eb.fsync(a.tty);
				},
				fsync(a) {
					a.tty.eb.fsync(a.tty);
				},
				read(a, b, c, d) {
					if (!a.tty || !a.tty.eb.Bb) throw new N(60);
					for (var e = 0, g = 0; g < d; g++) {
						try {
							var h = a.tty.eb.Bb(a.tty);
						} catch (q) {
							throw new N(29);
						}
						if (void 0 === h && 0 === e) throw new N(6);
						if (null === h || void 0 === h) break;
						e++;
						b[c + g] = h;
					}
					e && (a.node.atime = Date.now());
					return e;
				},
				write(a, b, c, d) {
					if (!a.tty || !a.tty.eb.ub) throw new N(60);
					try {
						for (var e = 0; e < d; e++) a.tty.eb.ub(a.tty, b[c + e]);
					} catch (g) {
						throw new N(29);
					}
					d && (a.node.mtime = a.node.ctime = Date.now());
					return e;
				}
			}, wb = {
				Bb() {
					a: {
						if (!hb.length) {
							var a = null;
							if (ca) {
								var b = Buffer.alloc(256), c = 0, d = process.stdin.fd;
								try {
									c = fs.readSync(d, b, 0, 256);
								} catch (e) {
									if (e.toString().includes("EOF")) c = 0;
									else throw e;
								}
								0 < c && (a = b.slice(0, c).toString("utf-8"));
							} else globalThis.window?.prompt && (a = window.prompt("Input: "), null !== a && (a += "\n"));
							if (!a) {
								a = null;
								break a;
							}
							b = Array(ib(a) + 1);
							a = M(a, b, 0, b.length);
							b.length = a;
							hb = b;
						}
						a = hb.shift();
					}
					return a;
				},
				ub(a, b) {
					null === b || 10 === b ? (Da(gb(a.output)), a.output = []) : 0 != b && a.output.push(b);
				},
				fsync(a) {
					0 < a.output?.length && (Da(gb(a.output)), a.output = []);
				},
				hc() {
					return {
						bc: 25856,
						dc: 5,
						ac: 191,
						cc: 35387,
						$b: [
							3,
							28,
							127,
							21,
							4,
							0,
							1,
							0,
							17,
							19,
							26,
							0,
							18,
							15,
							23,
							22,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0
						]
					};
				},
				ic() {
					return 0;
				},
				jc() {
					return [24, 80];
				}
			}, xb = {
				ub(a, b) {
					null === b || 10 === b ? (B(gb(a.output)), a.output = []) : 0 != b && a.output.push(b);
				},
				fsync(a) {
					0 < a.output?.length && (B(gb(a.output)), a.output = []);
				}
			}, O = {
				Wa: null,
				Xa() {
					return O.createNode(null, "/", 16895, 0);
				},
				createNode(a, b, c, d) {
					if (24576 === (c & 61440) || 4096 === (c & 61440)) throw new N(63);
					O.Wa || (O.Wa = {
						dir: {
							node: {
								Ta: O.La.Ta,
								Ua: O.La.Ua,
								lookup: O.La.lookup,
								ib: O.La.ib,
								rename: O.La.rename,
								unlink: O.La.unlink,
								rmdir: O.La.rmdir,
								readdir: O.La.readdir,
								symlink: O.La.symlink
							},
							stream: { Va: O.Ma.Va }
						},
						file: {
							node: {
								Ta: O.La.Ta,
								Ua: O.La.Ua
							},
							stream: {
								Va: O.Ma.Va,
								read: O.Ma.read,
								write: O.Ma.write,
								jb: O.Ma.jb,
								kb: O.Ma.kb
							}
						},
						link: {
							node: {
								Ta: O.La.Ta,
								Ua: O.La.Ua,
								readlink: O.La.readlink
							},
							stream: {}
						},
						yb: {
							node: {
								Ta: O.La.Ta,
								Ua: O.La.Ua
							},
							stream: yb
						}
					});
					c = zb(a, b, c, d);
					P(c.mode) ? (c.La = O.Wa.dir.node, c.Ma = O.Wa.dir.stream, c.Na = {}) : 32768 === (c.mode & 61440) ? (c.La = O.Wa.file.node, c.Ma = O.Wa.file.stream, c.Ra = 0, c.Na = null) : 40960 === (c.mode & 61440) ? (c.La = O.Wa.link.node, c.Ma = O.Wa.link.stream) : 8192 === (c.mode & 61440) && (c.La = O.Wa.yb.node, c.Ma = O.Wa.yb.stream);
					c.atime = c.mtime = c.ctime = Date.now();
					a && (a.Na[b] = c, a.atime = a.mtime = a.ctime = c.atime);
					return c;
				},
				fc(a) {
					return a.Na ? a.Na.subarray ? a.Na.subarray(0, a.Ra) : new Uint8Array(a.Na) : new Uint8Array(0);
				},
				La: {
					Ta(a) {
						var b = {};
						b.dev = 8192 === (a.mode & 61440) ? a.id : 1;
						b.ino = a.id;
						b.mode = a.mode;
						b.nlink = 1;
						b.uid = 0;
						b.gid = 0;
						b.rdev = a.rdev;
						P(a.mode) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.Ra : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
						b.atime = new Date(a.atime);
						b.mtime = new Date(a.mtime);
						b.ctime = new Date(a.ctime);
						b.blksize = 4096;
						b.blocks = Math.ceil(b.size / b.blksize);
						return b;
					},
					Ua(a, b) {
						for (var c of [
							"mode",
							"atime",
							"mtime",
							"ctime"
						]) null != b[c] && (a[c] = b[c]);
						void 0 !== b.size && (b = b.size, a.Ra != b && (0 == b ? (a.Na = null, a.Ra = 0) : (c = a.Na, a.Na = new Uint8Array(b), c && a.Na.set(c.subarray(0, Math.min(b, a.Ra))), a.Ra = b)));
					},
					lookup() {
						O.nb || (O.nb = new N(44), O.nb.stack = "<generic error, no stack>");
						throw O.nb;
					},
					ib(a, b, c, d) {
						return O.createNode(a, b, c, d);
					},
					rename(a, b, c) {
						try {
							var d = Q(b, c);
						} catch (g) {}
						if (d) {
							if (P(a.mode)) for (var e in d.Na) throw new N(55);
							Ab(d);
						}
						delete a.parent.Na[a.name];
						b.Na[c] = a;
						a.name = c;
						b.ctime = b.mtime = a.parent.ctime = a.parent.mtime = Date.now();
					},
					unlink(a, b) {
						delete a.Na[b];
						a.ctime = a.mtime = Date.now();
					},
					rmdir(a, b) {
						var c = Q(a, b), d;
						for (d in c.Na) throw new N(55);
						delete a.Na[b];
						a.ctime = a.mtime = Date.now();
					},
					readdir(a) {
						return [
							".",
							"..",
							...Object.keys(a.Na)
						];
					},
					symlink(a, b, c) {
						a = O.createNode(a, b, 41471, 0);
						a.link = c;
						return a;
					},
					readlink(a) {
						if (40960 !== (a.mode & 61440)) throw new N(28);
						return a.link;
					}
				},
				Ma: {
					read(a, b, c, d, e) {
						var g = a.node.Na;
						if (e >= a.node.Ra) return 0;
						a = Math.min(a.node.Ra - e, d);
						if (8 < a && g.subarray) b.set(g.subarray(e, e + a), c);
						else for (d = 0; d < a; d++) b[c + d] = g[e + d];
						return a;
					},
					write(a, b, c, d, e, g) {
						b.buffer === m.buffer && (g = !1);
						if (!d) return 0;
						a = a.node;
						a.mtime = a.ctime = Date.now();
						if (b.subarray && (!a.Na || a.Na.subarray)) {
							if (g) return a.Na = b.subarray(c, c + d), a.Ra = d;
							if (0 === a.Ra && 0 === e) return a.Na = b.slice(c, c + d), a.Ra = d;
							if (e + d <= a.Ra) return a.Na.set(b.subarray(c, c + d), e), d;
						}
						g = e + d;
						var h = a.Na ? a.Na.length : 0;
						h >= g || (g = Math.max(g, h * (1048576 > h ? 2 : 1.125) >>> 0), 0 != h && (g = Math.max(g, 256)), h = a.Na, a.Na = new Uint8Array(g), 0 < a.Ra && a.Na.set(h.subarray(0, a.Ra), 0));
						if (a.Na.subarray && b.subarray) a.Na.set(b.subarray(c, c + d), e);
						else for (g = 0; g < d; g++) a.Na[e + g] = b[c + g];
						a.Ra = Math.max(a.Ra, e + d);
						return d;
					},
					Va(a, b, c) {
						1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.Ra);
						if (0 > b) throw new N(28);
						return b;
					},
					jb(a, b, c, d, e) {
						if (32768 !== (a.node.mode & 61440)) throw new N(43);
						a = a.node.Na;
						if (e & 2 || !a || a.buffer !== m.buffer) {
							e = !0;
							d = 65536 * Math.ceil(b / 65536);
							var g = Bb(65536, d);
							g && C.fill(0, g, g + d);
							d = g;
							if (!d) throw new N(48);
							if (a) {
								if (0 < c || c + b < a.length) a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
								m.set(a, d);
							}
						} else e = !1, d = a.byteOffset;
						return {
							Xb: d,
							Eb: e
						};
					},
					kb(a, b, c, d) {
						O.Ma.write(a, b, 0, d, c, !1);
						return 0;
					}
				}
			}, ja = (a, b) => {
				var c = 0;
				a && (c |= 365);
				b && (c |= 146);
				return c;
			}, Cb = null, Db = {}, Eb = [], Fb = 1, R = null, Gb = !1, Hb = !0, N = class {
				name = "ErrnoError";
				constructor(a) {
					this.Pa = a;
				}
			}, Ib = class {
				hb = {};
				node = null;
				get flags() {
					return this.hb.flags;
				}
				set flags(a) {
					this.hb.flags = a;
				}
				get position() {
					return this.hb.position;
				}
				set position(a) {
					this.hb.position = a;
				}
			}, Jb = class {
				La = {};
				Ma = {};
				bb = null;
				constructor(a, b, c, d) {
					a ||= this;
					this.parent = a;
					this.Xa = a.Xa;
					this.id = Fb++;
					this.name = b;
					this.mode = c;
					this.rdev = d;
					this.atime = this.mtime = this.ctime = Date.now();
				}
				get read() {
					return 365 === (this.mode & 365);
				}
				set read(a) {
					a ? this.mode |= 365 : this.mode &= -366;
				}
				get write() {
					return 146 === (this.mode & 146);
				}
				set write(a) {
					a ? this.mode |= 146 : this.mode &= -147;
				}
			};
			function S(a, b = {}) {
				if (!a) throw new N(44);
				b.pb ?? (b.pb = !0);
				"/" === a.charAt(0) || (a = "//" + a);
				var c = 0;
				a: for (; 40 > c; c++) {
					a = a.split("/").filter((q) => !!q);
					for (var d = Cb, e = "/", g = 0; g < a.length; g++) {
						var h = g === a.length - 1;
						if (h && b.parent) break;
						if ("." !== a[g]) if (".." === a[g]) if (e = bb(e), d === d.parent) {
							a = e + "/" + a.slice(g + 1).join("/");
							c--;
							continue a;
						} else d = d.parent;
						else {
							e = ia(e + "/" + a[g]);
							try {
								d = Q(d, a[g]);
							} catch (q) {
								if (44 === q?.Pa && h && b.Wb) return { path: e };
								throw q;
							}
							!d.bb || h && !b.pb || (d = d.bb.root);
							if (40960 === (d.mode & 61440) && (!h || b.ab)) {
								if (!d.La.readlink) throw new N(52);
								d = d.La.readlink(d);
								"/" === d.charAt(0) || (d = bb(e) + "/" + d);
								a = d + "/" + a.slice(g + 1).join("/");
								continue a;
							}
						}
					}
					return {
						path: e,
						node: d
					};
				}
				throw new N(32);
			}
			function ha(a) {
				for (var b;;) {
					if (a === a.parent) return a = a.Xa.Db, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
					b = b ? `${a.name}/${b}` : a.name;
					a = a.parent;
				}
			}
			function Kb(a, b) {
				for (var c = 0, d = 0; d < b.length; d++) c = (c << 5) - c + b.charCodeAt(d) | 0;
				return (a + c >>> 0) % R.length;
			}
			function Ab(a) {
				var b = Kb(a.parent.id, a.name);
				if (R[b] === a) R[b] = a.cb;
				else for (b = R[b]; b;) {
					if (b.cb === a) {
						b.cb = a.cb;
						break;
					}
					b = b.cb;
				}
			}
			function Q(a, b) {
				var c = P(a.mode) ? (c = Lb(a, "x")) ? c : a.La.lookup ? 0 : 2 : 54;
				if (c) throw new N(c);
				for (c = R[Kb(a.id, b)]; c; c = c.cb) {
					var d = c.name;
					if (c.parent.id === a.id && d === b) return c;
				}
				return a.La.lookup(a, b);
			}
			function zb(a, b, c, d) {
				a = new Jb(a, b, c, d);
				b = Kb(a.parent.id, a.name);
				a.cb = R[b];
				return R[b] = a;
			}
			function P(a) {
				return 16384 === (a & 61440);
			}
			function Lb(a, b) {
				return Hb ? 0 : b.includes("r") && !(a.mode & 292) || b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73) ? 2 : 0;
			}
			function Mb(a, b) {
				if (!P(a.mode)) return 54;
				try {
					return Q(a, b), 20;
				} catch (c) {}
				return Lb(a, "wx");
			}
			function Nb(a, b, c) {
				try {
					var d = Q(a, b);
				} catch (e) {
					return e.Pa;
				}
				if (a = Lb(a, "wx")) return a;
				if (c) {
					if (!P(d.mode)) return 54;
					if (d === d.parent || "/" === ha(d)) return 10;
				} else if (P(d.mode)) return 31;
				return 0;
			}
			function Ob(a) {
				if (!a) throw new N(63);
				return a;
			}
			function T(a) {
				a = Eb[a];
				if (!a) throw new N(8);
				return a;
			}
			function Pb(a, b = -1) {
				a = Object.assign(new Ib(), a);
				if (-1 == b) a: {
					for (b = 0; 4096 >= b; b++) if (!Eb[b]) break a;
					throw new N(33);
				}
				a.fd = b;
				return Eb[b] = a;
			}
			function Qb(a, b = -1) {
				a = Pb(a, b);
				a.Ma?.ec?.(a);
				return a;
			}
			function Rb(a, b, c) {
				var d = a?.Ma.Ua;
				a = d ? a : b;
				d ??= b.La.Ua;
				Ob(d);
				d(a, c);
			}
			var yb = {
				open(a) {
					a.Ma = Db[a.node.rdev].Ma;
					a.Ma.open?.(a);
				},
				Va() {
					throw new N(70);
				}
			};
			function mb(a, b) {
				Db[a] = { Ma: b };
			}
			function Sb(a, b) {
				var c = "/" === b;
				if (c && Cb) throw new N(10);
				if (!c && b) {
					var d = S(b, { pb: !1 });
					b = d.path;
					d = d.node;
					if (d.bb) throw new N(10);
					if (!P(d.mode)) throw new N(54);
				}
				b = {
					type: a,
					kc: {},
					Db: b,
					Vb: []
				};
				a = a.Xa(b);
				a.Xa = b;
				b.root = a;
				c ? Cb = a : d && (d.bb = b, d.Xa && d.Xa.Vb.push(b));
			}
			function Tb(a, b, c) {
				var d = S(a, { parent: !0 }).node;
				a = cb(a);
				if (!a) throw new N(28);
				if ("." === a || ".." === a) throw new N(20);
				var e = Mb(d, a);
				if (e) throw new N(e);
				if (!d.La.ib) throw new N(63);
				return d.La.ib(d, a, b, c);
			}
			function ka(a, b = 438) {
				return Tb(a, b & 4095 | 32768, 0);
			}
			function U(a, b = 511) {
				return Tb(a, b & 1023 | 16384, 0);
			}
			function Ub(a, b, c) {
				"undefined" == typeof c && (c = b, b = 438);
				Tb(a, b | 8192, c);
			}
			function Vb(a, b) {
				if (!fb(a)) throw new N(44);
				var c = S(b, { parent: !0 }).node;
				if (!c) throw new N(44);
				b = cb(b);
				var d = Mb(c, b);
				if (d) throw new N(d);
				if (!c.La.symlink) throw new N(63);
				c.La.symlink(c, b, a);
			}
			function Wb(a) {
				var b = S(a, { parent: !0 }).node;
				a = cb(a);
				var c = Q(b, a), d = Nb(b, a, !0);
				if (d) throw new N(d);
				if (!b.La.rmdir) throw new N(63);
				if (c.bb) throw new N(10);
				b.La.rmdir(b, a);
				Ab(c);
			}
			function ua(a) {
				var b = S(a, { parent: !0 }).node;
				if (!b) throw new N(44);
				a = cb(a);
				var c = Q(b, a), d = Nb(b, a, !1);
				if (d) throw new N(d);
				if (!b.La.unlink) throw new N(63);
				if (c.bb) throw new N(10);
				b.La.unlink(b, a);
				Ab(c);
			}
			function Xb(a, b) {
				a = S(a, { ab: !b }).node;
				return Ob(a.La.Ta)(a);
			}
			function Yb(a, b, c, d) {
				Rb(a, b, {
					mode: c & 4095 | b.mode & -4096,
					ctime: Date.now(),
					Lb: d
				});
			}
			function la(a, b) {
				a = "string" == typeof a ? S(a, { ab: !0 }).node : a;
				Yb(null, a, b);
			}
			function Zb(a, b, c) {
				if (P(b.mode)) throw new N(31);
				if (32768 !== (b.mode & 61440)) throw new N(28);
				var d = Lb(b, "w");
				if (d) throw new N(d);
				Rb(a, b, {
					size: c,
					timestamp: Date.now()
				});
			}
			function ma(a, b, c = 438) {
				if ("" === a) throw new N(44);
				if ("string" == typeof b) {
					var d = {
						r: 0,
						"r+": 2,
						w: 577,
						"w+": 578,
						a: 1089,
						"a+": 1090
					}[b];
					if ("undefined" == typeof d) throw Error(`Unknown file open mode: ${b}`);
					b = d;
				}
				c = b & 64 ? c & 4095 | 32768 : 0;
				if ("object" == typeof a) d = a;
				else {
					var e = a.endsWith("/");
					var g = S(a, {
						ab: !(b & 131072),
						Wb: !0
					});
					d = g.node;
					a = g.path;
				}
				g = !1;
				if (b & 64) if (d) {
					if (b & 128) throw new N(20);
				} else {
					if (e) throw new N(31);
					d = Tb(a, c | 511, 0);
					g = !0;
				}
				if (!d) throw new N(44);
				8192 === (d.mode & 61440) && (b &= -513);
				if (b & 65536 && !P(d.mode)) throw new N(54);
				if (!g && (d ? 40960 === (d.mode & 61440) ? e = 32 : (e = [
					"r",
					"w",
					"rw"
				][b & 3], b & 512 && (e += "w"), e = P(d.mode) && ("r" !== e || b & 576) ? 31 : Lb(d, e)) : e = 44, e)) throw new N(e);
				b & 512 && !g && (e = d, e = "string" == typeof e ? S(e, { ab: !0 }).node : e, Zb(null, e, 0));
				b = Pb({
					node: d,
					path: ha(d),
					flags: b & -131713,
					seekable: !0,
					position: 0,
					Ma: d.Ma,
					Yb: [],
					error: !1
				});
				b.Ma.open && b.Ma.open(b);
				g && la(d, c & 511);
				return b;
			}
			function oa(a) {
				if (null === a.fd) throw new N(8);
				a.rb && (a.rb = null);
				try {
					a.Ma.close && a.Ma.close(a);
				} catch (b) {
					throw b;
				} finally {
					Eb[a.fd] = null;
				}
				a.fd = null;
			}
			function $b(a, b, c) {
				if (null === a.fd) throw new N(8);
				if (!a.seekable || !a.Ma.Va) throw new N(70);
				if (0 != c && 1 != c && 2 != c) throw new N(28);
				a.position = a.Ma.Va(a, b, c);
				a.Yb = [];
			}
			function ac(a, b, c, d, e) {
				if (0 > d || 0 > e) throw new N(28);
				if (null === a.fd) throw new N(8);
				if (1 === (a.flags & 2097155)) throw new N(8);
				if (P(a.node.mode)) throw new N(31);
				if (!a.Ma.read) throw new N(28);
				var g = "undefined" != typeof e;
				if (!g) e = a.position;
				else if (!a.seekable) throw new N(70);
				b = a.Ma.read(a, b, c, d, e);
				g || (a.position += b);
				return b;
			}
			function na(a, b, c, d, e) {
				if (0 > d || 0 > e) throw new N(28);
				if (null === a.fd) throw new N(8);
				if (0 === (a.flags & 2097155)) throw new N(8);
				if (P(a.node.mode)) throw new N(31);
				if (!a.Ma.write) throw new N(28);
				a.seekable && a.flags & 1024 && $b(a, 0, 2);
				var g = "undefined" != typeof e;
				if (!g) e = a.position;
				else if (!a.seekable) throw new N(70);
				b = a.Ma.write(a, b, c, d, e, void 0);
				g || (a.position += b);
				return b;
			}
			function ta(a) {
				var b = b || 0;
				var c = "binary";
				"utf8" !== c && "binary" !== c && Ma(`Invalid encoding type "${c}"`);
				b = ma(a, b);
				a = Xb(a).size;
				var d = new Uint8Array(a);
				ac(b, d, 0, a, 0);
				"utf8" === c && (d = gb(d));
				oa(b);
				return d;
			}
			function W(a, b, c) {
				a = ia("/dev/" + a);
				var d = ja(!!b, !!c);
				W.Cb ?? (W.Cb = 64);
				var e = W.Cb++ << 8 | 0;
				mb(e, {
					open(g) {
						g.seekable = !1;
					},
					close() {
						c?.buffer?.length && c(10);
					},
					read(g, h, q, w) {
						for (var t = 0, x = 0; x < w; x++) {
							try {
								var D = b();
							} catch (pb) {
								throw new N(29);
							}
							if (void 0 === D && 0 === t) throw new N(6);
							if (null === D || void 0 === D) break;
							t++;
							h[q + x] = D;
						}
						t && (g.node.atime = Date.now());
						return t;
					},
					write(g, h, q, w) {
						for (var t = 0; t < w; t++) try {
							c(h[q + t]);
						} catch (x) {
							throw new N(29);
						}
						w && (g.node.mtime = g.node.ctime = Date.now());
						return t;
					}
				});
				Ub(a, d, e);
			}
			var X = {};
			function Y(a, b, c) {
				if ("/" === b.charAt(0)) return b;
				a = -100 === a ? "/" : T(a).path;
				if (0 == b.length) {
					if (!c) throw new N(44);
					return a;
				}
				return a + "/" + b;
			}
			function kc(a, b) {
				F[a >> 2] = b.dev;
				F[a + 4 >> 2] = b.mode;
				F[a + 8 >> 2] = b.nlink;
				F[a + 12 >> 2] = b.uid;
				F[a + 16 >> 2] = b.gid;
				F[a + 20 >> 2] = b.rdev;
				G[a + 24 >> 3] = BigInt(b.size);
				E[a + 32 >> 2] = 4096;
				E[a + 36 >> 2] = b.blocks;
				var c = b.atime.getTime(), d = b.mtime.getTime(), e = b.ctime.getTime();
				G[a + 40 >> 3] = BigInt(Math.floor(c / 1e3));
				F[a + 48 >> 2] = c % 1e3 * 1e6;
				G[a + 56 >> 3] = BigInt(Math.floor(d / 1e3));
				F[a + 64 >> 2] = d % 1e3 * 1e6;
				G[a + 72 >> 3] = BigInt(Math.floor(e / 1e3));
				F[a + 80 >> 2] = e % 1e3 * 1e6;
				G[a + 88 >> 3] = BigInt(b.ino);
				return 0;
			}
			var Cc = void 0, Ec = () => {
				var a = E[+Cc >> 2];
				Cc += 4;
				return a;
			}, Fc = 0, Gc = [
				0,
				31,
				60,
				91,
				121,
				152,
				182,
				213,
				244,
				274,
				305,
				335
			], Hc = [
				0,
				31,
				59,
				90,
				120,
				151,
				181,
				212,
				243,
				273,
				304,
				334
			], Ic = {}, Jc = (a) => {
				Ga = a;
				Ya || 0 < Fc || (k.onExit?.(a), Fa = !0);
				xa(a, new Sa(a));
			}, Kc = (a) => {
				if (!Fa) try {
					a();
				} catch (b) {
					b instanceof Sa || "unwind" == b || xa(1, b);
				} finally {
					if (!(Ya || 0 < Fc)) try {
						Ga = a = Ga, Jc(a);
					} catch (b) {
						b instanceof Sa || "unwind" == b || xa(1, b);
					}
				}
			}, Lc = {}, Nc = () => {
				if (!Mc) {
					var a = {
						USER: "web_user",
						LOGNAME: "web_user",
						PATH: "/",
						PWD: "/",
						HOME: "/home/web_user",
						LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8",
						_: wa || "./this.program"
					}, b;
					for (b in Lc) void 0 === Lc[b] ? delete a[b] : a[b] = Lc[b];
					var c = [];
					for (b in a) c.push(`${b}=${a[b]}`);
					Mc = c;
				}
				return Mc;
			}, Mc, Oc = (a, b, c, d) => {
				var e = {
					string: (t) => {
						var x = 0;
						if (null !== t && void 0 !== t && 0 !== t) {
							x = ib(t) + 1;
							var D = y(x);
							M(t, C, D, x);
							x = D;
						}
						return x;
					},
					array: (t) => {
						var x = y(t.length);
						m.set(t, x);
						return x;
					}
				};
				a = k["_" + a];
				var g = [], h = 0;
				if (d) for (var q = 0; q < d.length; q++) {
					var w = e[c[q]];
					w ? (0 === h && (h = pa()), g[q] = w(d[q])) : g[q] = d[q];
				}
				c = a(...g);
				return c = function(t) {
					0 !== h && ra(h);
					return "string" === b ? z(t) : "boolean" === b ? !!t : t;
				}(c);
			}, fa = (a) => {
				var b = ib(a) + 1, c = da(b);
				c && M(a, C, c, b);
				return c;
			}, Pc, Qc = [], A = (a) => {
				Pc.delete(Z.get(a));
				Z.set(a, null);
				Qc.push(a);
			}, Rc = (a) => {
				const b = a.length;
				return [
					b % 128 | 128,
					b >> 7,
					...a
				];
			}, Sc = {
				i: 127,
				p: 127,
				j: 126,
				f: 125,
				d: 124,
				e: 111
			}, Tc = (a) => Rc(Array.from(a, (b) => Sc[b])), va = (a, b) => {
				if (!Pc) {
					Pc = /* @__PURE__ */ new WeakMap();
					var c = Z.length;
					if (Pc) for (var d = 0; d < 0 + c; d++) {
						var e = Z.get(d);
						e && Pc.set(e, d);
					}
				}
				if (c = Pc.get(a) || 0) return c;
				c = Qc.length ? Qc.pop() : Z.grow(1);
				try {
					Z.set(c, a);
				} catch (g) {
					if (!(g instanceof TypeError)) throw g;
					b = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...Rc([
						1,
						96,
						...Tc(b.slice(1)),
						...Tc("v" === b[0] ? "" : b[0])
					]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
					b = new WebAssembly.Module(b);
					b = new WebAssembly.Instance(b, { e: { f: a } }).exports.f;
					Z.set(c, b);
				}
				Pc.set(a, c);
				return c;
			};
			R = Array(4096);
			Sb(O, "/");
			U("/tmp");
			U("/home");
			U("/home/web_user");
			(function() {
				U("/dev");
				mb(259, {
					read: () => 0,
					write: (d, e, g, h) => h,
					Va: () => 0
				});
				Ub("/dev/null", 259);
				kb(1280, wb);
				kb(1536, xb);
				Ub("/dev/tty", 1280);
				Ub("/dev/tty1", 1536);
				var a = new Uint8Array(1024), b = 0, c = () => {
					0 === b && (eb(a), b = a.byteLength);
					return a[--b];
				};
				W("random", c);
				W("urandom", c);
				U("/dev/shm");
				U("/dev/shm/tmp");
			})();
			(function() {
				U("/proc");
				var a = U("/proc/self");
				U("/proc/self/fd");
				Sb({ Xa() {
					var b = zb(a, "fd", 16895, 73);
					b.Ma = { Va: O.Ma.Va };
					b.La = {
						lookup(c, d) {
							c = +d;
							var e = T(c);
							c = {
								parent: null,
								Xa: { Db: "fake" },
								La: { readlink: () => e.path },
								id: c + 1
							};
							return c.parent = c;
						},
						readdir() {
							return Array.from(Eb.entries()).filter(([, c]) => c).map(([c]) => c.toString());
						}
					};
					return b;
				} }, "/proc/self/fd");
			})();
			k.noExitRuntime && (Ya = k.noExitRuntime);
			k.print && (Da = k.print);
			k.printErr && (B = k.printErr);
			k.wasmBinary && (Ea = k.wasmBinary);
			k.thisProgram && (wa = k.thisProgram);
			if (k.preInit) for ("function" == typeof k.preInit && (k.preInit = [k.preInit]); 0 < k.preInit.length;) k.preInit.shift()();
			k.stackSave = () => pa();
			k.stackRestore = (a) => ra(a);
			k.stackAlloc = (a) => y(a);
			k.cwrap = (a, b, c, d) => {
				var e = !c || c.every((g) => "number" === g || "boolean" === g);
				return "string" !== b && e && !d ? k["_" + a] : (...g) => Oc(a, b, c, g);
			};
			k.addFunction = va;
			k.removeFunction = A;
			k.UTF8ToString = z;
			k.stringToNewUTF8 = fa;
			k.writeArrayToMemory = (a, b) => {
				m.set(a, b);
			};
			var da, ea, Bb, Uc, ra, y, pa, La, Z, Vc = {
				a: (a, b, c, d) => Ma(`Assertion failed: ${z(a)}, at: ` + [
					b ? z(b) : "unknown filename",
					c,
					d ? z(d) : "unknown function"
				]),
				i: function(a, b) {
					try {
						return a = z(a), la(a, b), 0;
					} catch (c) {
						if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
						return -c.Pa;
					}
				},
				L: function(a, b, c) {
					try {
						b = z(b);
						b = Y(a, b);
						if (c & -8) return -28;
						var d = S(b, { ab: !0 }).node;
						if (!d) return -44;
						a = "";
						c & 4 && (a += "r");
						c & 2 && (a += "w");
						c & 1 && (a += "x");
						return a && Lb(d, a) ? -2 : 0;
					} catch (e) {
						if ("undefined" == typeof X || "ErrnoError" !== e.name) throw e;
						return -e.Pa;
					}
				},
				j: function(a, b) {
					try {
						var c = T(a);
						Yb(c, c.node, b, !1);
						return 0;
					} catch (d) {
						if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
						return -d.Pa;
					}
				},
				h: function(a) {
					try {
						var b = T(a);
						Rb(b, b.node, {
							timestamp: Date.now(),
							Lb: !1
						});
						return 0;
					} catch (c) {
						if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
						return -c.Pa;
					}
				},
				b: function(a, b, c) {
					Cc = c;
					try {
						var d = T(a);
						switch (b) {
							case 0:
								var e = Ec();
								if (0 > e) break;
								for (; Eb[e];) e++;
								return Qb(d, e).fd;
							case 1:
							case 2: return 0;
							case 3: return d.flags;
							case 4: return e = Ec(), d.flags |= e, 0;
							case 12: return e = Ec(), Ha[e + 0 >> 1] = 2, 0;
							case 13:
							case 14: return 0;
						}
						return -28;
					} catch (g) {
						if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
						return -g.Pa;
					}
				},
				g: function(a, b) {
					try {
						var c = T(a), d = c.node, e = c.Ma.Ta;
						a = e ? c : d;
						e ??= d.La.Ta;
						Ob(e);
						return kc(b, e(a));
					} catch (h) {
						if ("undefined" == typeof X || "ErrnoError" !== h.name) throw h;
						return -h.Pa;
					}
				},
				H: function(a, b) {
					b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
					try {
						if (isNaN(b)) return -61;
						var c = T(a);
						if (0 > b || 0 === (c.flags & 2097155)) throw new N(28);
						Zb(c, c.node, b);
						return 0;
					} catch (d) {
						if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
						return -d.Pa;
					}
				},
				G: function(a, b) {
					try {
						if (0 === b) return -28;
						var c = ib("/") + 1;
						if (b < c) return -68;
						M("/", C, a, b);
						return c;
					} catch (d) {
						if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
						return -d.Pa;
					}
				},
				K: function(a, b) {
					try {
						return a = z(a), kc(b, Xb(a, !0));
					} catch (c) {
						if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
						return -c.Pa;
					}
				},
				C: function(a, b, c) {
					try {
						return b = z(b), b = Y(a, b), U(b, c), 0;
					} catch (d) {
						if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
						return -d.Pa;
					}
				},
				J: function(a, b, c, d) {
					try {
						b = z(b);
						var e = d & 256;
						b = Y(a, b, d & 4096);
						return kc(c, e ? Xb(b, !0) : Xb(b));
					} catch (g) {
						if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
						return -g.Pa;
					}
				},
				x: function(a, b, c, d) {
					Cc = d;
					try {
						b = z(b);
						b = Y(a, b);
						var e = d ? Ec() : 0;
						return ma(b, c, e).fd;
					} catch (g) {
						if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
						return -g.Pa;
					}
				},
				v: function(a, b, c, d) {
					try {
						b = z(b);
						b = Y(a, b);
						if (0 >= d) return -28;
						var e = S(b).node;
						if (!e) throw new N(44);
						if (!e.La.readlink) throw new N(28);
						var g = e.La.readlink(e);
						var h = Math.min(d, ib(g)), q = m[c + h];
						M(g, C, c, d + 1);
						m[c + h] = q;
						return h;
					} catch (w) {
						if ("undefined" == typeof X || "ErrnoError" !== w.name) throw w;
						return -w.Pa;
					}
				},
				u: function(a) {
					try {
						return a = z(a), Wb(a), 0;
					} catch (b) {
						if ("undefined" == typeof X || "ErrnoError" !== b.name) throw b;
						return -b.Pa;
					}
				},
				f: function(a, b) {
					try {
						return a = z(a), kc(b, Xb(a));
					} catch (c) {
						if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
						return -c.Pa;
					}
				},
				r: function(a, b, c) {
					try {
						b = z(b);
						b = Y(a, b);
						if (c) if (512 === c) Wb(b);
						else return -28;
						else ua(b);
						return 0;
					} catch (d) {
						if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
						return -d.Pa;
					}
				},
				q: function(a, b, c) {
					try {
						b = z(b);
						b = Y(a, b, !0);
						var d = Date.now(), e, g;
						if (c) {
							var h = F[c >> 2] + 4294967296 * E[c + 4 >> 2], q = E[c + 8 >> 2];
							1073741823 == q ? e = d : 1073741822 == q ? e = null : e = 1e3 * h + q / 1e6;
							c += 16;
							h = F[c >> 2] + 4294967296 * E[c + 4 >> 2];
							q = E[c + 8 >> 2];
							1073741823 == q ? g = d : 1073741822 == q ? g = null : g = 1e3 * h + q / 1e6;
						} else g = e = d;
						if (null !== (g ?? e)) {
							a = e;
							var w = S(b, { ab: !0 }).node;
							Ob(w.La.Ua)(w, {
								atime: a,
								mtime: g
							});
						}
						return 0;
					} catch (t) {
						if ("undefined" == typeof X || "ErrnoError" !== t.name) throw t;
						return -t.Pa;
					}
				},
				m: () => Ma(""),
				l: () => {
					Ya = !1;
					Fc = 0;
				},
				A: function(a, b) {
					a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
					a = /* @__PURE__ */ new Date(1e3 * a);
					E[b >> 2] = a.getSeconds();
					E[b + 4 >> 2] = a.getMinutes();
					E[b + 8 >> 2] = a.getHours();
					E[b + 12 >> 2] = a.getDate();
					E[b + 16 >> 2] = a.getMonth();
					E[b + 20 >> 2] = a.getFullYear() - 1900;
					E[b + 24 >> 2] = a.getDay();
					var c = a.getFullYear();
					E[b + 28 >> 2] = (0 !== c % 4 || 0 === c % 100 && 0 !== c % 400 ? Hc : Gc)[a.getMonth()] + a.getDate() - 1 | 0;
					E[b + 36 >> 2] = -(60 * a.getTimezoneOffset());
					c = new Date(a.getFullYear(), 6, 1).getTimezoneOffset();
					var d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
					E[b + 32 >> 2] = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
				},
				y: function(a, b, c, d, e, g, h) {
					e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e);
					try {
						var q = T(d);
						if (0 !== (b & 2) && 0 === (c & 2) && 2 !== (q.flags & 2097155)) throw new N(2);
						if (1 === (q.flags & 2097155)) throw new N(2);
						if (!q.Ma.jb) throw new N(43);
						if (!a) throw new N(28);
						var w = q.Ma.jb(q, a, e, b, c);
						var t = w.Xb;
						E[g >> 2] = w.Eb;
						F[h >> 2] = t;
						return 0;
					} catch (x) {
						if ("undefined" == typeof X || "ErrnoError" !== x.name) throw x;
						return -x.Pa;
					}
				},
				z: function(a, b, c, d, e, g) {
					g = -9007199254740992 > g || 9007199254740992 < g ? NaN : Number(g);
					try {
						var h = T(e);
						if (c & 2) {
							c = g;
							if (32768 !== (h.node.mode & 61440)) throw new N(43);
							if (!(d & 2)) {
								var q = C.slice(a, a + b);
								h.Ma.kb && h.Ma.kb(h, q, c, b, d);
							}
						}
					} catch (w) {
						if ("undefined" == typeof X || "ErrnoError" !== w.name) throw w;
						return -w.Pa;
					}
				},
				n: (a, b) => {
					Ic[a] && (clearTimeout(Ic[a].id), delete Ic[a]);
					if (!b) return 0;
					Ic[a] = {
						id: setTimeout(() => {
							delete Ic[a];
							Kc(() => Uc(a, performance.now()));
						}, b),
						lc: b
					};
					return 0;
				},
				B: (a, b, c, d) => {
					var e = (/* @__PURE__ */ new Date()).getFullYear(), g = new Date(e, 0, 1).getTimezoneOffset();
					e = new Date(e, 6, 1).getTimezoneOffset();
					F[a >> 2] = 60 * Math.max(g, e);
					E[b >> 2] = Number(g != e);
					b = (h) => {
						var q = Math.abs(h);
						return `UTC${0 <= h ? "-" : "+"}${String(Math.floor(q / 60)).padStart(2, "0")}${String(q % 60).padStart(2, "0")}`;
					};
					a = b(g);
					b = b(e);
					e < g ? (M(a, C, c, 17), M(b, C, d, 17)) : (M(a, C, d, 17), M(b, C, c, 17));
				},
				d: () => Date.now(),
				s: () => 2147483648,
				c: () => performance.now(),
				o: (a) => {
					var b = C.length;
					a >>>= 0;
					if (2147483648 < a) return !1;
					for (var c = 1; 4 >= c; c *= 2) {
						var d = b * (1 + .2 / c);
						d = Math.min(d, a + 100663296);
						a: {
							d = (Math.min(2147483648, 65536 * Math.ceil(Math.max(a, d) / 65536)) - La.buffer.byteLength + 65535) / 65536 | 0;
							try {
								La.grow(d);
								Ka();
								var e = 1;
								break a;
							} catch (g) {}
							e = void 0;
						}
						if (e) return !0;
					}
					return !1;
				},
				E: (a, b) => {
					var c = 0, d = 0, e;
					for (e of Nc()) {
						var g = b + c;
						F[a + d >> 2] = g;
						c += M(e, C, g, Infinity) + 1;
						d += 4;
					}
					return 0;
				},
				F: (a, b) => {
					var c = Nc();
					F[a >> 2] = c.length;
					a = 0;
					for (var d of c) a += ib(d) + 1;
					F[b >> 2] = a;
					return 0;
				},
				e: function(a) {
					try {
						oa(T(a));
						return 0;
					} catch (c) {
						if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
						return c.Pa;
					}
				},
				p: function(a, b) {
					try {
						var c = T(a);
						m[b] = c.tty ? 2 : P(c.mode) ? 3 : 40960 === (c.mode & 61440) ? 7 : 4;
						Ha[b + 2 >> 1] = 0;
						G[b + 8 >> 3] = BigInt(0);
						G[b + 16 >> 3] = BigInt(0);
						return 0;
					} catch (d) {
						if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
						return d.Pa;
					}
				},
				w: function(a, b, c, d) {
					try {
						a: {
							var e = T(a);
							a = b;
							for (var g, h = b = 0; h < c; h++) {
								var q = F[a >> 2], w = F[a + 4 >> 2];
								a += 8;
								var t = ac(e, m, q, w, g);
								if (0 > t) {
									var x = -1;
									break a;
								}
								b += t;
								if (t < w) break;
								"undefined" != typeof g && (g += t);
							}
							x = b;
						}
						F[d >> 2] = x;
						return 0;
					} catch (D) {
						if ("undefined" == typeof X || "ErrnoError" !== D.name) throw D;
						return D.Pa;
					}
				},
				D: function(a, b, c, d) {
					b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
					try {
						if (isNaN(b)) return 61;
						var e = T(a);
						$b(e, b, c);
						G[d >> 3] = BigInt(e.position);
						e.rb && 0 === b && 0 === c && (e.rb = null);
						return 0;
					} catch (g) {
						if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
						return g.Pa;
					}
				},
				I: function(a) {
					try {
						var b = T(a);
						return b.Ma?.fsync?.(b);
					} catch (c) {
						if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
						return c.Pa;
					}
				},
				t: function(a, b, c, d) {
					try {
						a: {
							var e = T(a);
							a = b;
							for (var g, h = b = 0; h < c; h++) {
								var q = F[a >> 2], w = F[a + 4 >> 2];
								a += 8;
								var t = na(e, m, q, w, g);
								if (0 > t) {
									var x = -1;
									break a;
								}
								b += t;
								if (t < w) break;
								"undefined" != typeof g && (g += t);
							}
							x = b;
						}
						F[d >> 2] = x;
						return 0;
					} catch (D) {
						if ("undefined" == typeof X || "ErrnoError" !== D.name) throw D;
						return D.Pa;
					}
				},
				k: Jc
			};
			function Wc() {
				function a() {
					k.calledRun = !0;
					if (!Fa) {
						if (!k.noFSInit && !Gb) {
							var b, c;
							Gb = !0;
							b ??= k.stdin;
							c ??= k.stdout;
							d ??= k.stderr;
							b ? W("stdin", b) : Vb("/dev/tty", "/dev/stdin");
							c ? W("stdout", null, c) : Vb("/dev/tty", "/dev/stdout");
							d ? W("stderr", null, d) : Vb("/dev/tty1", "/dev/stderr");
							ma("/dev/stdin", 0);
							ma("/dev/stdout", 1);
							ma("/dev/stderr", 1);
						}
						Xc.N();
						Hb = !1;
						k.onRuntimeInitialized?.();
						if (k.postRun) for ("function" == typeof k.postRun && (k.postRun = [k.postRun]); k.postRun.length;) {
							var d = k.postRun.shift();
							Ua.push(d);
						}
						Ta(Ua);
					}
				}
				if (0 < J) Xa = Wc;
				else {
					if (k.preRun) for ("function" == typeof k.preRun && (k.preRun = [k.preRun]); k.preRun.length;) Wa();
					Ta(Va);
					0 < J ? Xa = Wc : k.setStatus ? (k.setStatus("Running..."), setTimeout(() => {
						setTimeout(() => k.setStatus(""), 1);
						a();
					}, 1)) : a();
				}
			}
			var Xc;
			(async function() {
				function a(c) {
					c = Xc = c.exports;
					k._sqlite3_free = c.P;
					k._sqlite3_value_text = c.Q;
					k._sqlite3_prepare_v2 = c.R;
					k._sqlite3_step = c.S;
					k._sqlite3_reset = c.T;
					k._sqlite3_exec = c.U;
					k._sqlite3_finalize = c.V;
					k._sqlite3_column_name = c.W;
					k._sqlite3_column_text = c.X;
					k._sqlite3_column_type = c.Y;
					k._sqlite3_errmsg = c.Z;
					k._sqlite3_clear_bindings = c._;
					k._sqlite3_value_blob = c.$;
					k._sqlite3_value_bytes = c.aa;
					k._sqlite3_value_double = c.ba;
					k._sqlite3_value_int = c.ca;
					k._sqlite3_value_type = c.da;
					k._sqlite3_result_blob = c.ea;
					k._sqlite3_result_double = c.fa;
					k._sqlite3_result_error = c.ga;
					k._sqlite3_result_int = c.ha;
					k._sqlite3_result_int64 = c.ia;
					k._sqlite3_result_null = c.ja;
					k._sqlite3_result_text = c.ka;
					k._sqlite3_aggregate_context = c.la;
					k._sqlite3_column_count = c.ma;
					k._sqlite3_data_count = c.na;
					k._sqlite3_column_blob = c.oa;
					k._sqlite3_column_bytes = c.pa;
					k._sqlite3_column_double = c.qa;
					k._sqlite3_bind_blob = c.ra;
					k._sqlite3_bind_double = c.sa;
					k._sqlite3_bind_int = c.ta;
					k._sqlite3_bind_text = c.ua;
					k._sqlite3_bind_parameter_index = c.va;
					k._sqlite3_sql = c.wa;
					k._sqlite3_normalized_sql = c.xa;
					k._sqlite3_changes = c.ya;
					k._sqlite3_close_v2 = c.za;
					k._sqlite3_create_function_v2 = c.Aa;
					k._sqlite3_update_hook = c.Ba;
					k._sqlite3_open = c.Ca;
					da = k._malloc = c.Da;
					ea = k._free = c.Ea;
					k._RegisterExtensionFunctions = c.Fa;
					Bb = c.Ga;
					Uc = c.Ha;
					ra = c.Ia;
					y = c.Ja;
					pa = c.Ka;
					La = c.M;
					Z = c.O;
					Ka();
					J--;
					k.monitorRunDependencies?.(J);
					0 == J && Xa && (c = Xa, Xa = null, c());
					return Xc;
				}
				J++;
				k.monitorRunDependencies?.(J);
				var b = { a: Vc };
				if (k.instantiateWasm) return new Promise((c) => {
					k.instantiateWasm(b, (d, e) => {
						c(a(d, e));
					});
				});
				Na ??= k.locateFile ? k.locateFile("sql-wasm.wasm", za) : za + "sql-wasm.wasm";
				return a((await Ra(b)).instance);
			})();
			Wc();
			return Module;
		});
		return initSqlJsPromise;
	};
	if (typeof exports === "object" && typeof module === "object") {
		module.exports = initSqlJs$1;
		module.exports.default = initSqlJs$1;
	} else if (typeof define === "function" && define["amd"]) define([], function() {
		return initSqlJs$1;
	});
	else if (typeof exports === "object") exports["Module"] = initSqlJs$1;
})))(), 1);
var ActivityStore = class {
	constructor(userDataPath) {
		this.dbPath = path.join(userDataPath, "iris.sqlite");
	}
	async init() {
		if (typeof global.__dirname === "undefined") global.__dirname = path.dirname(fileURLToPath(import.meta.url));
		this.SQL = await (0, import_sql_wasm.default)({ locateFile: (file) => path.join(global.__dirname, "../node_modules/sql.js/dist", file) });
		if (fs.existsSync(this.dbPath)) {
			console.log(`[ActivityStore] Loading existing database from ${this.dbPath}`);
			const fileBuffer = fs.readFileSync(this.dbPath);
			this.db = new this.SQL.Database(fileBuffer);
		} else {
			console.log(`[ActivityStore] Creating new database at ${this.dbPath}`);
			this.db = new this.SQL.Database();
		}
		this.createSchema();
		this.persist();
	}
	createSchema() {
		this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        startTime INTEGER,
        endTime INTEGER,
        hostname TEXT,
        platform TEXT,
        eventCount INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT,
        source TEXT,
        timestamp INTEGER,
        duration INTEGER,
        sessionId TEXT,
        appName TEXT,
        windowTitle TEXT,
        payload TEXT,
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(sessionId);
    `);
	}
	saveSession(session) {
		const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, startTime, endTime, hostname, platform, eventCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
		stmt.run([
			session.id,
			session.startTime,
			session.endTime || null,
			session.hostname,
			session.platform,
			session.eventCount
		]);
		stmt.free();
		this.persist();
	}
	saveEvent(event) {
		const appName = event.payload.appName || event.payload.browser || "";
		const windowTitle = event.payload.windowTitle || event.payload.title || "";
		const stmt = this.db.prepare(`
      INSERT INTO events (id, type, source, timestamp, duration, sessionId, appName, windowTitle, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
		stmt.run([
			event.id,
			event.type,
			event.source,
			event.timestamp,
			event.duration || null,
			event.sessionId,
			appName,
			windowTitle,
			JSON.stringify(event.payload)
		]);
		stmt.free();
		this.db.run("UPDATE sessions SET eventCount = eventCount + 1 WHERE id = ?", [event.sessionId]);
		this.persist();
	}
	getRecentEvents(limit = 100) {
		const res = this.db.exec("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?", [limit]);
		if (res.length === 0) return [];
		const columns = res[0].columns;
		return res[0].values.map((row) => {
			const rowObj = {};
			columns.forEach((col, i) => rowObj[col] = row[i]);
			return {
				id: rowObj.id,
				type: rowObj.type,
				source: rowObj.source,
				timestamp: rowObj.timestamp,
				duration: rowObj.duration,
				sessionId: rowObj.sessionId,
				payload: JSON.parse(rowObj.payload)
			};
		});
	}
	persist() {
		try {
			const data = this.db.export();
			const buffer = Buffer.from(data);
			fs.writeFileSync(this.dbPath, buffer);
		} catch (e) {
			console.error("[ActivityStore] Failed to persist database:", e);
		}
	}
	close() {
		if (this.db) this.db.close();
	}
};
//#endregion
//#region electron/main.ts
init_EventBus();
var __dirname$1 = path$1.dirname(fileURLToPath(import.meta.url));
var dashboardWindow = null;
var searchWindow = null;
var overlayWindow = null;
var ignoreBlur = false;
var hasPipelines = false;
var engine = null;
var store = null;
app.disableHardwareAcceleration();
function createDashboardWindow() {
	dashboardWindow = new BrowserWindow({
		width: 1e3,
		height: 700,
		webPreferences: {
			preload: path$1.join(__dirname$1, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	if (!app.isPackaged) dashboardWindow.loadURL("http://localhost:5173/#/");
	else dashboardWindow.loadFile(path$1.join(__dirname$1, "../dist/index.html"), { hash: "/" });
	dashboardWindow.on("closed", () => {
		dashboardWindow = null;
	});
}
function createOverlayWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	overlayWindow = new BrowserWindow({
		width,
		height,
		x: 0,
		y: 0,
		show: false,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		skipTaskbar: true,
		movable: false,
		resizable: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});
	overlayWindow.setIgnoreMouseEvents(true, { forward: true });
	if (!app.isPackaged) overlayWindow.loadURL("http://localhost:5173/overlay.html");
	else overlayWindow.loadFile(path$1.join(__dirname$1, "../dist/overlay.html"));
}
function createSearchWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	searchWindow = new BrowserWindow({
		width,
		height,
		x: 0,
		y: 0,
		frame: false,
		transparent: true,
		skipTaskbar: true,
		alwaysOnTop: true,
		show: false,
		webPreferences: {
			preload: path$1.join(__dirname$1, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	if (!app.isPackaged) searchWindow.loadURL("http://localhost:5173/#/search");
	else searchWindow.loadFile(path$1.join(__dirname$1, "../dist/index.html"), { hash: "/search" });
	searchWindow.on("blur", () => {
		if (ignoreBlur) return;
		searchWindow?.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
		setTimeout(() => {
			searchWindow?.hide();
		}, 50);
	});
	searchWindow.on("closed", () => {
		searchWindow = null;
	});
}
app.whenReady().then(async () => {
	createDashboardWindow();
	createSearchWindow();
	createOverlayWindow();
	try {
		store = new ActivityStore(app.getPath("userData"));
		await store.init();
		engine = new ActivityEngine(store);
		await engine.start();
	} catch (e) {
		console.error("[IRIS] Engine failed to start fully:", e);
	}
	EventBus.getInstance().onActivity((event) => {
		if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send("activity-event", event);
	});
	EventBus.getInstance().on("ui-workflow-update", (workflow) => {
		if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send("workflow-update", workflow);
	});
	EventBus.getInstance().on("resume-sequence", (data) => {
		if (overlayWindow && !overlayWindow.isDestroyed()) {
			if (data.type === "start") {
				overlayWindow.setAlwaysOnTop(true, "screen-saver");
				overlayWindow.showInactive();
			}
			overlayWindow.webContents.send("resume-sequence", data);
			if (data.type === "complete") setTimeout(() => {
				if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
			}, 4e3);
		}
	});
	if (!globalShortcut.register("CommandOrControl+K", () => {
		if (searchWindow) if (searchWindow.isVisible()) {
			searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
			if (!hasPipelines) setTimeout(() => {
				searchWindow?.hide();
			}, 50);
		} else {
			searchWindow.show();
			searchWindow.focus();
			searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-shown'))`).catch(console.error);
		}
	})) console.log("registration failed");
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createDashboardWindow();
			createSearchWindow();
		}
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
	globalShortcut.unregisterAll();
	if (engine) engine.stop();
	if (store) store.close();
});
ipcMain.on("hide-window", () => {
	if (searchWindow && !hasPipelines) searchWindow.hide();
});
ipcMain.on("set-has-pipelines", (event, val) => {
	hasPipelines = val;
});
ipcMain.on("set-click-through", (event, ignore) => {
	if (searchWindow) searchWindow.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on("set-ignore-blur", (event, ignore) => {
	ignoreBlur = ignore;
});
ipcMain.handle("read-workspace-files", async () => {
	const dirPath = process.cwd();
	const chunksToEmbed = [];
	function chunkText(text, maxLen) {
		const chunks = [];
		let currentChunk = "";
		for (const line of text.split("\n")) if ((currentChunk + "\n" + line).length > maxLen) {
			if (currentChunk.trim()) chunks.push(currentChunk.trim());
			currentChunk = line;
		} else currentChunk += (currentChunk ? "\n" : "") + line;
		if (currentChunk.trim()) chunks.push(currentChunk.trim());
		return chunks;
	}
	function scan(currentDir) {
		if (!fs$1.existsSync(currentDir)) return;
		for (const file of fs$1.readdirSync(currentDir)) {
			const fullPath = path$1.join(currentDir, file);
			try {
				if (fs$1.statSync(fullPath).isDirectory()) {
					if (!file.startsWith(".") && file !== "node_modules" && file !== "dist" && file !== "dist-electron") scan(fullPath);
				} else {
					const ext = path$1.extname(file).toLowerCase();
					if ([
						".md",
						".txt",
						".ts",
						".tsx",
						".json",
						".css"
					].includes(ext)) {
						const content = fs$1.readFileSync(fullPath, "utf-8");
						if (content.trim()) {
							const fileChunks = chunkText(content, 500);
							for (const c of fileChunks) chunksToEmbed.push({
								filePath: fullPath,
								text: c
							});
						}
					}
				}
			} catch (e) {}
		}
	}
	scan(dirPath);
	return chunksToEmbed;
});
ipcMain.handle("save-semantic-index", async (_, data) => {
	fs$1.writeFileSync(path$1.join(process.cwd(), ".iris_semantic_index.json"), JSON.stringify(data), "utf-8");
	return true;
});
ipcMain.handle("load-semantic-index", async () => {
	const p = path$1.join(process.cwd(), ".iris_semantic_index.json");
	if (fs$1.existsSync(p)) return JSON.parse(fs$1.readFileSync(p, "utf-8"));
	return [];
});
ipcMain.handle("search-memory", async (event, query) => {
	if (engine) return await engine.searchMemory(query);
	return [];
});
ipcMain.handle("resume-workflow", async (event, session) => {
	if (engine) await engine.resumeWorkflow(session);
});
//#endregion
export {};
