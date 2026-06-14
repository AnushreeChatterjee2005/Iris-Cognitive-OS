import { createRequire as e } from "node:module";
import { BrowserWindow as t, app as n, globalShortcut as r, ipcMain as i, screen as a, shell as o } from "electron";
import * as s from "path";
import c from "path";
import { fileURLToPath as l } from "url";
import u from "os";
import { exec as d } from "child_process";
import f, { promisify as p } from "util";
import { EventEmitter as m } from "events";
import ee from "http";
import * as h from "fs";
import g from "fs";
//#region \0rolldown/runtime.js
var _ = Object.create, v = Object.defineProperty, te = Object.getOwnPropertyDescriptor, ne = Object.getOwnPropertyNames, re = Object.getPrototypeOf, y = Object.prototype.hasOwnProperty, b = (e, t) => () => (e && (t = e(e = 0)), t), x = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), S = (e, t) => {
	let n = {};
	for (var r in e) v(n, r, {
		get: e[r],
		enumerable: !0
	});
	return t || v(n, Symbol.toStringTag, { value: "Module" }), n;
}, C = (e, t, n, r) => {
	if (t && typeof t == "object" || typeof t == "function") for (var i = ne(t), a = 0, o = i.length, s; a < o; a++) s = i[a], !y.call(e, s) && s !== n && v(e, s, {
		get: ((e) => t[e]).bind(null, s),
		enumerable: !(r = te(t, s)) || r.enumerable
	});
	return e;
}, ie = (e, t, n) => (n = e == null ? {} : _(re(e)), C(t || !e || !e.__esModule ? v(n, "default", {
	value: e,
	enumerable: !0
}) : n, e)), ae = (e) => y.call(e, "module.exports") ? e["module.exports"] : C(v({}, "__esModule", { value: !0 }), e), oe = /* @__PURE__ */ e(import.meta.url), w = [];
for (let e = 0; e < 256; ++e) w.push((e + 256).toString(16).slice(1));
function se(e, t = 0) {
	return (w[e[t + 0]] + w[e[t + 1]] + w[e[t + 2]] + w[e[t + 3]] + "-" + w[e[t + 4]] + w[e[t + 5]] + "-" + w[e[t + 6]] + w[e[t + 7]] + "-" + w[e[t + 8]] + w[e[t + 9]] + "-" + w[e[t + 10]] + w[e[t + 11]] + w[e[t + 12]] + w[e[t + 13]] + w[e[t + 14]] + w[e[t + 15]]).toLowerCase();
}
//#endregion
//#region node_modules/uuid/dist-node/rng.js
var T = new Uint8Array(16);
function ce() {
	return crypto.getRandomValues(T);
}
//#endregion
//#region node_modules/uuid/dist-node/v4.js
function E(e, t, n) {
	return !t && !e && crypto.randomUUID ? crypto.randomUUID() : le(e, t, n);
}
function le(e, t, n) {
	e ||= {};
	let r = e.random ?? e.rng?.() ?? ce();
	if (r.length < 16) throw Error("Random bytes length must be >= 16");
	if (r[6] = r[6] & 15 | 64, r[8] = r[8] & 63 | 128, t) {
		if (n ||= 0, n < 0 || n + 16 > t.length) throw RangeError(`UUID byte range ${n}:${n + 15} is out of buffer bounds`);
		for (let e = 0; e < 16; ++e) t[n + e] = r[e];
		return t;
	}
	return se(r);
}
//#endregion
//#region electron/engine/EventBus.ts
var ue = /* @__PURE__ */ S({ EventBus: () => D }), D, O = b((() => {
	D = class e extends m {
		constructor() {
			super(), this.setMaxListeners(50);
		}
		static getInstance() {
			return e.instance ||= new e(), e.instance;
		}
		publish(e) {
			this.emit("activity", e), this.emit(`activity:${e.source}`, e), this.emit(`activity:${e.type}`, e);
		}
		onActivity(e) {
			this.on("activity", e);
		}
		onSource(e, t) {
			this.on(`activity:${e}`, t);
		}
		onEventType(e, t) {
			this.on(`activity:${e}`, t);
		}
		offActivity(e) {
			this.off("activity", e);
		}
	};
}));
//#endregion
//#region electron/collectors/BaseCollector.ts
O();
var de = class {
	constructor() {
		this.isRunning = !1, this.bus = D.getInstance();
	}
	async stop() {
		this.isRunning = !1;
	}
	get source() {
		return this.capabilities.source;
	}
}, fe = p(d), pe = class extends de {
	constructor(e) {
		super(), this.pollInterval = 2e3, this.lastWindow = null, this.focusStartTime = Date.now(), this.pendingFocusTimer = null, this.sessionId = e;
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
		this.isRunning || (this.isRunning = !0, console.log("[WindowCollector] Polling started"), this.poll());
	}
	async poll() {
		for (; this.isRunning;) {
			try {
				let e = await this.getActiveWindow();
				if (e && (!this.lastWindow || this.lastWindow.processName !== e.processName || this.lastWindow.title !== e.title)) {
					if (e.title.includes("IRIS |") || e.title.toLowerCase().includes("hackathon-iris")) continue;
					let t = Date.now();
					if (this.lastWindow) {
						let e = t - this.focusStartTime;
						this.emitEvent("window.blur", this.lastWindow, e);
					}
					this.pendingFocusTimer &&= (clearTimeout(this.pendingFocusTimer), null), this.pendingFocusTimer = setTimeout(() => {
						this.emitEvent("window.focus", e), this.pendingFocusTimer = null;
					}, 2e3), this.lastWindow = e, this.focusStartTime = t;
				}
			} catch (e) {
				console.error("WindowCollector error:", e);
			}
			await new Promise((e) => setTimeout(e, this.pollInterval));
		}
	}
	emitEvent(e, t, n) {
		let r = {
			appName: t.processName,
			windowTitle: t.title,
			processId: t.id,
			executablePath: t.executable,
			platform: process.platform,
			url: t.url
		}, i = {
			id: E(),
			type: e,
			source: "window",
			timestamp: Date.now(),
			duration: n,
			sessionId: this.sessionId,
			payload: r,
			raw: t
		};
		this.bus.publish(i);
	}
	async getActiveWindow() {
		if (process.platform !== "win32") return null;
		let e = Buffer.from("\n$ProgressPreference = 'SilentlyContinue'\nAdd-Type -TypeDefinition @\"\n  using System;\n  using System.Runtime.InteropServices;\n  using System.Text;\n  public class Win32 {\n    [DllImport(\"user32.dll\")]\n    public static extern IntPtr GetForegroundWindow();\n    [DllImport(\"user32.dll\")]\n    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);\n    [DllImport(\"user32.dll\")]\n    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);\n  }\n\"@\ntry {\n  $hWnd = [Win32]::GetForegroundWindow()\n  if ($hWnd -ne [IntPtr]::Zero) {\n    $title = New-Object System.Text.StringBuilder 256\n    [Win32]::GetWindowText($hWnd, $title, 256)\n    $processId = 0\n    [Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId)\n    if ($processId -gt 0) {\n      $processName = \"Unknown\"\n      $exe = \"Unknown\"\n      try {\n        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue\n        if ($process) {\n          $processName = $process.Name\n          try {\n            $exe = $process.MainModule.FileName\n          } catch {}\n        }\n      } catch {\n        try {\n          $processName = (Get-Process -Id $processId).ProcessName\n        } catch {}\n      }\n      $obj = @{\n          title = $title.ToString()\n          processName = $processName\n          id = $processId\n          executable = $exe\n      }\n      $obj | ConvertTo-Json -Compress\n    }\n  }\n} catch {}\n    ", "utf16le").toString("base64");
		try {
			let { stdout: t, stderr: n } = await fe(`powershell -EncodedCommand ${e}`);
			if (n && console.error("[WindowCollector] PS Stderr:", n), t.trim()) try {
				let e = t.indexOf("{"), n = t.lastIndexOf("}");
				if (e !== -1 && n !== -1) {
					let r = t.substring(e, n + 1);
					return JSON.parse(r);
				}
			} catch (e) {
				console.error("[WindowCollector] JSON Parse Error:", e, "Raw Output:", t);
			}
		} catch (e) {
			console.error("[WindowCollector] PowerShell exec error:", e);
		}
		return null;
	}
};
//#endregion
//#region electron/engine/ActivityGateway.ts
O();
var k = class {
	constructor(e) {
		this.port = 32e3, this.bus = D.getInstance(), this.sessionId = e, this.server = ee.createServer((e, t) => {
			if (t.setHeader("Access-Control-Allow-Origin", "*"), t.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"), t.setHeader("Access-Control-Allow-Headers", "Content-Type"), e.method === "OPTIONS") {
				t.writeHead(204), t.end();
				return;
			}
			if (e.method === "POST" && e.url === "/activity") {
				let n = "";
				e.on("data", (e) => n += e.toString()), e.on("end", () => {
					try {
						let e = JSON.parse(n);
						this.handleIncomingActivity(e), t.writeHead(200, { "Content-Type": "application/json" }), t.end(JSON.stringify({ status: "ok" }));
					} catch {
						t.writeHead(400), t.end("Invalid JSON");
					}
				});
			} else t.writeHead(404), t.end();
		});
	}
	start() {
		this.server.on("error", (e) => {
			e.code === "EADDRINUSE" ? console.error(`[ActivityGateway] Port ${this.port} is already in use. External collectors will be disabled.`) : console.error("[ActivityGateway] Server error:", e);
		}), this.server.listen(this.port, "127.0.0.1", () => {
			console.log(`[ActivityGateway] Listening for external collectors on port ${this.port}`);
		});
	}
	stop() {
		this.server.close();
	}
	handleIncomingActivity(e) {
		let t = {
			id: E(),
			type: e.type,
			source: e.source,
			timestamp: Date.now(),
			sessionId: this.sessionId,
			payload: e.payload,
			raw: e
		};
		console.log(`[ActivityGateway] Received external event: ${t.type} from ${t.source}`), this.bus.publish(t);
	}
}, A = f.promisify(d), j = class {
	async resumeWorkflow(e) {
		let { EventBus: t } = (O(), ae(ue)), n = t.getInstance();
		console.log(`[ResumeEngine] Orchestrating reconstruction for: ${e.name}`);
		let r = e.urls || [], i = e.files || [], a = e.dominantApps || [];
		e.windowTitles;
		let s = r.filter((e) => e && !e.includes("google.com/search") && !e.includes("newtab") && !e.includes("chrome://")), c = i.filter((e) => e && !e.includes("node_modules") && !e.includes(".git")), l = /* @__PURE__ */ new Set();
		for (let e of c) {
			let t = e.indexOf("src");
			t > -1 ? l.add(e.substring(0, t)) : l.add(e);
		}
		let u = /* @__PURE__ */ new Set(), d = [
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
		for (let e of a) e && d.some((t) => e.toLowerCase().includes(t)) && u.add(e);
		let f = Array.from(l).slice(0, 2), p = Array.from(u).slice(0, 3);
		if (n.emit("resume-sequence", {
			type: "start",
			name: e.name || "Monitoring Cognition...",
			summary: e.contextSummary || "Resuming workspace patterns...",
			counts: {
				tabs: s.length,
				workspaces: f.length + p.length
			}
		}), await new Promise((e) => setTimeout(e, 800)), f.length > 0 || p.length > 0) {
			let e = a.find((e) => e && [
				"code",
				"cursor",
				"antigravity",
				"vscode"
			].some((t) => e.toLowerCase().includes(t)));
			n.emit("resume-sequence", {
				type: "progress",
				message: `Restoring ${f.length + p.length} app(s)/workspace(s)`,
				item: "vscode"
			});
			for (let t of f) this.openWorkspaceOrApp(t, e);
			for (let t of p) this.openWorkspaceOrApp(t, e);
			await new Promise((e) => setTimeout(e, 600));
		}
		if (s.length > 0) {
			n.emit("resume-sequence", {
				type: "progress",
				message: `Reopening ${s.length} research tabs`,
				item: "chrome"
			});
			for (let e of s) o.openExternal(e), await new Promise((e) => setTimeout(e, 200));
			await new Promise((e) => setTimeout(e, 400));
		}
		let m = this.inferWorkingDirectory(i, a);
		m && (n.emit("resume-sequence", {
			type: "progress",
			message: `Restoring shell context in ${m.split("\\").pop()}`,
			item: "terminal"
		}), console.log(`[ResumeEngine] Preparing to restore shell context in: ${m}`), await new Promise((e) => setTimeout(e, 400))), n.emit("resume-sequence", { type: "complete" });
	}
	inferWorkingDirectory(e, t) {
		if (e.length > 0) {
			let t = e[0], n = t.indexOf("src");
			return n > -1 ? t.substring(0, n) : null;
		}
		return t.some((e) => e.toLowerCase().includes("terminal") || e.toLowerCase().includes("powershell")) ? process.cwd() : null;
	}
	async resolveWindowsAppId(e) {
		try {
			let { stdout: t } = await A(`powershell.exe -NoProfile -Command "Get-StartApps | Where-Object { $_.Name -match '${e.replace(/[^a-zA-Z0-9 ]/g, "")}' } | Select-Object -First 1 -ExpandProperty AppID"`);
			return t.trim() || null;
		} catch {
			return null;
		}
	}
	async openWorkspaceOrApp(e, t) {
		let n = e.toLowerCase();
		if (console.log(`[ResumeEngine] Attempting to restore workspace or app: ${e}`), e.includes("/") || e.includes("\\") || e.includes(".") || n === "code" || n === "cursor" || n === "vscode") {
			let n = "code";
			if (t) {
				let e = t.toLowerCase();
				e.includes("cursor") ? n = "cursor" : e.includes("antigravity") && (n = "antigravity");
			}
			d(`${n} "${e}"`, (t) => {
				t && o.openPath(e);
			});
			return;
		}
		let r = await this.resolveWindowsAppId(e);
		if (r) {
			console.log(`[ResumeEngine] Universally launching app: ${e} (AppID: ${r})`), d(`explorer.exe shell:AppsFolder\\${r}`);
			return;
		}
		console.log(`[ResumeEngine] Could not dynamically resolve AppID for: ${e}. Skipping generic protocol launch to prevent OS popups.`);
	}
};
//#endregion
//#region electron/engine/ActivityEngine.ts
O();
var M = "http://127.0.0.1:8000", me = class {
	constructor(e) {
		this.collectors = [], this.fallbackApps = /* @__PURE__ */ new Set(), this.fallbackTitles = /* @__PURE__ */ new Set(), this.fallbackUrls = /* @__PURE__ */ new Set(), this.fallbackFiles = /* @__PURE__ */ new Set(), this.fallbackIdleTimer = null, this.bus = D.getInstance(), this.store = e, this.resumer = new j(), this.currentSession = {
			id: E(),
			startTime: Date.now(),
			hostname: u.hostname(),
			platform: process.platform,
			eventCount: 0
		}, this.gateway = new k(this.currentSession.id);
	}
	getSessionId() {
		return this.currentSession.id;
	}
	async start() {
		console.log(`[ActivityEngine] Starting session: ${this.currentSession.id}`), this.gateway.start(), this.store.saveSession(this.currentSession), this.bus.onActivity(async (e) => {
			try {
				this.store.saveEvent(e);
			} catch (e) {
				console.error("[ActivityEngine] Failed to save event to database:", e);
			}
			try {
				let t = await fetch(`${M}/session/events`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(e)
				});
				if (t.ok) {
					let e = await t.json();
					if (e && e.session) {
						let t = e.session;
						if (console.log(`[ActivityEngine] Received UI update. Name: ${t.name}, URLs: ${t.urls.length}`), this.currentSession.id !== t.id) {
							console.log(`[ActivityEngine] Session boundary crossed. New ID: ${t.id}`), this.currentSession.id = t.id;
							for (let e of this.collectors) e.sessionId &&= t.id;
						}
						this.bus.emit("ui-workflow-update", t), fetch(`${M}/memory/embed`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(t)
						}).catch((e) => console.error("[ActivityEngine] Live embed failed:", e));
					}
				} else this.emitFallbackSession(e);
			} catch {
				this.emitFallbackSession(e);
			}
		});
		let e = new pe(this.currentSession.id);
		this.collectors.push(e);
		for (let e of this.collectors) await e.start();
	}
	generateDynamicName(e, t) {
		let n = e.join(" ").toLowerCase(), r = t.join(" ").toLowerCase();
		if (n.includes("code") || n.includes("cursor") || n.includes("terminal")) return r.includes("github") || r.includes("stackoverflow") ? "Codebase Integration & Troubleshooting" : r.includes("react") || r.includes("node") || r.includes("mdn") || r.includes("developer") ? "Development & Documentation Review" : "Software Engineering & Architecture";
		if (n.includes("figma") || n.includes("photoshop") || n.includes("design")) return "Creative Design & Prototyping";
		if (r.includes("youtube") || r.includes("twitch") || r.includes("vimeo")) return "Media Consumption & Video Research";
		if (r.includes("docs.google") || n.includes("word") || n.includes("notion") || n.includes("obsidian")) return "Documentation & Strategy Planning";
		if (r.includes("slideshare") || r.includes("presentation") || r.includes("slides")) return "Presentation & Slide Deck Assembly";
		if (r.includes("mail") || r.includes("slack") || r.includes("discord")) return "Communication & Team Sync";
		if (n.includes("chrome") || n.includes("edge") || n.includes("browser")) {
			if (t.length > 0) try {
				return `Web Exploration: ${new URL(t[0]).hostname.replace("www.", "")}`;
			} catch {}
			return "Ambient Web Exploration";
		}
		return e.length > 0 ? `Focused Workflow: ${e[0]}` : "Ambient Cognitive Context";
	}
	emitFallbackSession(e) {
		let t = e.payload?.appName || e.payload?.browser, n = e.payload?.windowTitle || e.payload?.title, r = e.payload?.url;
		if (t && this.fallbackApps.add(t), n) {
			this.fallbackTitles.add(n);
			let e = n.match(/(?:^|[\\/\s])([a-zA-Z0-9_-]+\.(?:tsx|ts|js|jsx|py|css|html|md|json|txt|cpp|c|h|go|rs))(?:\s|-|$)/i);
			e && e[1] && this.fallbackFiles.add(e[1]);
		}
		r && this.fallbackUrls.add(r);
		let i = {
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
		this.bus.emit("ui-workflow-update", i), this.fallbackIdleTimer && clearTimeout(this.fallbackIdleTimer), this.fallbackIdleTimer = setTimeout(async () => {
			console.log("[ActivityEngine] Idle timeout reached. Splitting local session boundary.");
			let e = "Local Captured Context";
			try {
				let t = await fetch("http://127.0.0.1:8000/api/generate-name", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						apps: Array.from(this.fallbackApps),
						urls: Array.from(this.fallbackUrls)
					})
				});
				if (t.ok) {
					let n = await t.json();
					n.name && (e = n.name);
				}
			} catch {
				console.log("[ActivityEngine] LLM Naming failed, using fallback.");
			}
			let t = {
				...i,
				name: e,
				duration: Date.now() - this.currentSession.startTime,
				contextSummary: `Captured ${this.fallbackApps.size} apps and ${this.fallbackUrls.size} urls locally`
			};
			this.bus.emit("ui-workflow-update", t), this.currentSession.id = E(), this.currentSession.startTime = Date.now(), this.currentSession.eventCount = 0, this.fallbackApps.clear(), this.fallbackTitles.clear(), this.fallbackUrls.clear(), this.fallbackFiles.clear();
		}, 12e4);
	}
	async searchMemory(e) {
		try {
			let t = await fetch(`${M}/memory/search`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: e,
					limit: 5
				})
			});
			return t.ok ? await t.json() : [];
		} catch (e) {
			return console.error("[ActivityEngine] Failed to search memory via backend:", e), [];
		}
	}
	async resumeWorkflow(e) {
		await this.resumer.resumeWorkflow(e);
	}
	async stop() {
		this.currentSession.endTime = Date.now(), this.store.saveSession(this.currentSession), this.gateway.stop();
		for (let e of this.collectors) await e.stop();
		console.log(`[ActivityEngine] Stopped session: ${this.currentSession.id}`);
	}
	getCurrentSession() {
		return this.currentSession;
	}
}, he = /* @__PURE__ */ ie((/* @__PURE__ */ x(((e, t) => {
	var n = void 0, r = function(e) {
		return n || (n = new Promise(function(n, r) {
			var i = e === void 0 ? {} : e, a = i.onAbort;
			i.onAbort = function(e) {
				r(Error(e)), a && a(e);
			}, i.postRun = i.postRun || [], i.postRun.push(function() {
				n(i);
			}), t = void 0;
			var o;
			o ||= i === void 0 ? {} : i;
			var s = !!globalThis.window, c = !!globalThis.WorkerGlobalScope, l = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";
			o.onRuntimeInitialized = function() {
				function e(e, t) {
					switch (typeof t) {
						case "boolean":
							M(e, +!!t);
							break;
						case "number":
							fe(e, t);
							break;
						case "string":
							k(e, t, -1, -1);
							break;
						case "object":
							if (t === null) pe(e);
							else if (t.length != null) {
								var n = Mt(t.length);
								y.set(t, n), A(e, n, t.length, -1), Nt(n);
							} else he(e, "Wrong API use : tried to return a value of an unknown type (" + t + ").", -1);
							break;
						default: pe(e);
					}
				}
				function t(e, t) {
					for (var n = [], r = 0; r < e; r += 1) {
						var i = j(t + 4 * r, "i32"), a = le(i);
						if (a === 1 || a === 2) i = de(i);
						else if (a === 3) i = D(i);
						else if (a === 4) {
							a = i, i = ue(a), a = O(a);
							for (var o = new Uint8Array(i), s = 0; s < i; s += 1) o[s] = y[a + s];
							i = o;
						} else i = null;
						n.push(i);
					}
					return n;
				}
				function n(e, t) {
					this.Qa = e, this.db = t, this.Oa = 1, this.mb = [];
				}
				function r(e, t) {
					if (this.db = t, this.fb = Tt(e), this.fb === null) throw Error("Unable to allocate memory for the SQL string");
					this.lb = this.fb, this.$a = this.sb = null;
				}
				function i(e) {
					if (this.filename = "dbfile_" + (4294967295 * Math.random() >>> 0), e != null) {
						var t = this.filename, n = "/", r = t;
						if (n && (n = typeof n == "string" ? n : Fe(n), r = t ? F(n + "/" + t) : n), t = Ee(!0, !0), r = Xe(r, t), e) {
							if (typeof e == "string") {
								n = Array(e.length);
								for (var i = 0, o = e.length; i < o; ++i) n[i] = e.charCodeAt(i);
								e = n;
							}
							rt(r, t | 146), n = at(r, 577), lt(n, e, 0, e.length, 0), ot(n), rt(r, t);
						}
					}
					this.handleError(c(this.filename, a)), this.db = j(a, "i32"), P(this.db), this.gb = {}, this.Sa = {};
				}
				var a = Q(4), s = o.cwrap, c = s("sqlite3_open", "number", ["string", "number"]), l = s("sqlite3_close_v2", "number", ["number"]), u = s("sqlite3_exec", "number", [
					"number",
					"string",
					"number",
					"number",
					"number"
				]), d = s("sqlite3_changes", "number", ["number"]), f = s("sqlite3_prepare_v2", "number", [
					"number",
					"string",
					"number",
					"number",
					"number"
				]), p = s("sqlite3_sql", "string", ["number"]), m = s("sqlite3_normalized_sql", "string", ["number"]), ee = s("sqlite3_prepare_v2", "number", [
					"number",
					"number",
					"number",
					"number",
					"number"
				]), h = s("sqlite3_bind_text", "number", [
					"number",
					"number",
					"number",
					"number",
					"number"
				]), g = s("sqlite3_bind_blob", "number", [
					"number",
					"number",
					"number",
					"number",
					"number"
				]), _ = s("sqlite3_bind_double", "number", [
					"number",
					"number",
					"number"
				]), v = s("sqlite3_bind_int", "number", [
					"number",
					"number",
					"number"
				]), te = s("sqlite3_bind_parameter_index", "number", ["number", "string"]), ne = s("sqlite3_step", "number", ["number"]), re = s("sqlite3_errmsg", "string", ["number"]), b = s("sqlite3_column_count", "number", ["number"]), x = s("sqlite3_data_count", "number", ["number"]), S = s("sqlite3_column_double", "number", ["number", "number"]), C = s("sqlite3_column_text", "string", ["number", "number"]), ie = s("sqlite3_column_blob", "number", ["number", "number"]), ae = s("sqlite3_column_bytes", "number", ["number", "number"]), oe = s("sqlite3_column_type", "number", ["number", "number"]), w = s("sqlite3_column_name", "string", ["number", "number"]), se = s("sqlite3_reset", "number", ["number"]), T = s("sqlite3_clear_bindings", "number", ["number"]), ce = s("sqlite3_finalize", "number", ["number"]), E = s("sqlite3_create_function_v2", "number", "number string number number number number number number number".split(" ")), le = s("sqlite3_value_type", "number", ["number"]), ue = s("sqlite3_value_bytes", "number", ["number"]), D = s("sqlite3_value_text", "string", ["number"]), O = s("sqlite3_value_blob", "number", ["number"]), de = s("sqlite3_value_double", "number", ["number"]), fe = s("sqlite3_result_double", "", ["number", "number"]), pe = s("sqlite3_result_null", "", ["number"]), k = s("sqlite3_result_text", "", [
					"number",
					"string",
					"number",
					"number"
				]), A = s("sqlite3_result_blob", "", [
					"number",
					"number",
					"number",
					"number"
				]), M = s("sqlite3_result_int", "", ["number", "number"]), he = s("sqlite3_result_error", "", [
					"number",
					"string",
					"number"
				]), ge = s("sqlite3_aggregate_context", "number", ["number", "number"]), P = s("RegisterExtensionFunctions", "number", ["number"]), I = s("sqlite3_update_hook", "number", [
					"number",
					"number",
					"number"
				]);
				n.prototype.bind = function(e) {
					if (!this.Qa) throw "Statement closed";
					return this.reset(), Array.isArray(e) ? this.Gb(e) : typeof e == "object" && e ? this.Hb(e) : !0;
				}, n.prototype.step = function() {
					if (!this.Qa) throw "Statement closed";
					this.Oa = 1;
					var e = ne(this.Qa);
					switch (e) {
						case 100: return !0;
						case 101: return !1;
						default: throw this.db.handleError(e);
					}
				}, n.prototype.Ab = function(e) {
					return e ?? (e = this.Oa, this.Oa += 1), S(this.Qa, e);
				}, n.prototype.Ob = function(e) {
					if (e ?? (e = this.Oa, this.Oa += 1), e = C(this.Qa, e), typeof BigInt != "function") throw Error("BigInt is not supported");
					return BigInt(e);
				}, n.prototype.Tb = function(e) {
					return e ?? (e = this.Oa, this.Oa += 1), C(this.Qa, e);
				}, n.prototype.getBlob = function(e) {
					e ?? (e = this.Oa, this.Oa += 1);
					var t = ae(this.Qa, e);
					e = ie(this.Qa, e);
					for (var n = new Uint8Array(t), r = 0; r < t; r += 1) n[r] = y[e + r];
					return n;
				}, n.prototype.get = function(e, t) {
					t ||= {}, e != null && this.bind(e) && this.step(), e = [];
					for (var n = x(this.Qa), r = 0; r < n; r += 1) switch (oe(this.Qa, r)) {
						case 1:
							var i = t.useBigInt ? this.Ob(r) : this.Ab(r);
							e.push(i);
							break;
						case 2:
							e.push(this.Ab(r));
							break;
						case 3:
							e.push(this.Tb(r));
							break;
						case 4:
							e.push(this.getBlob(r));
							break;
						default: e.push(null);
					}
					return e;
				}, n.prototype.qb = function() {
					for (var e = [], t = b(this.Qa), n = 0; n < t; n += 1) e.push(w(this.Qa, n));
					return e;
				}, n.prototype.zb = function(e, t) {
					e = this.get(e, t), t = this.qb();
					for (var n = {}, r = 0; r < t.length; r += 1) n[t[r]] = e[r];
					return n;
				}, n.prototype.Sb = function() {
					return p(this.Qa);
				}, n.prototype.Pb = function() {
					return m(this.Qa);
				}, n.prototype.run = function(e) {
					return e != null && this.bind(e), this.step(), this.reset();
				}, n.prototype.wb = function(e, t) {
					t ?? (t = this.Oa, this.Oa += 1), e = Tt(e), this.mb.push(e), this.db.handleError(h(this.Qa, t, e, -1, 0));
				}, n.prototype.Fb = function(e, t) {
					t ?? (t = this.Oa, this.Oa += 1);
					var n = Mt(e.length);
					y.set(e, n), this.mb.push(n), this.db.handleError(g(this.Qa, t, n, e.length, 0));
				}, n.prototype.vb = function(e, t) {
					t ?? (t = this.Oa, this.Oa += 1), this.db.handleError((e === (e | 0) ? v : _)(this.Qa, t, e));
				}, n.prototype.Ib = function(e) {
					e ?? (e = this.Oa, this.Oa += 1), g(this.Qa, e, 0, 0, 0);
				}, n.prototype.xb = function(e, t) {
					switch (t ?? (t = this.Oa, this.Oa += 1), typeof e) {
						case "string":
							this.wb(e, t);
							return;
						case "number":
							this.vb(e, t);
							return;
						case "bigint":
							this.wb(e.toString(), t);
							return;
						case "boolean":
							this.vb(e + 0, t);
							return;
						case "object":
							if (e === null) {
								this.Ib(t);
								return;
							}
							if (e.length != null) {
								this.Fb(e, t);
								return;
							}
					}
					throw "Wrong API use : tried to bind a value of an unknown type (" + e + ").";
				}, n.prototype.Hb = function(e) {
					var t = this;
					return Object.keys(e).forEach(function(n) {
						var r = te(t.Qa, n);
						r !== 0 && t.xb(e[n], r);
					}), !0;
				}, n.prototype.Gb = function(e) {
					for (var t = 0; t < e.length; t += 1) this.xb(e[t], t + 1);
					return !0;
				}, n.prototype.reset = function() {
					return this.freemem(), T(this.Qa) === 0 && se(this.Qa) === 0;
				}, n.prototype.freemem = function() {
					for (var e; (e = this.mb.pop()) !== void 0;) Nt(e);
				}, n.prototype.Ya = function() {
					this.freemem();
					var e = ce(this.Qa) === 0;
					return delete this.db.gb[this.Qa], this.Qa = 0, e;
				}, r.prototype.next = function() {
					if (this.fb === null) return { done: !0 };
					if (this.$a !== null && (this.$a.Ya(), this.$a = null), !this.db.db) throw this.ob(), Error("Database closed");
					var e = Lt(), t = Q(4);
					me(a), me(t);
					try {
						this.db.handleError(ee(this.db.db, this.lb, -1, a, t)), this.lb = j(t, "i32");
						var r = j(a, "i32");
						return r === 0 ? (this.ob(), { done: !0 }) : (this.$a = new n(r, this.db), this.db.gb[r] = this.$a, {
							value: this.$a,
							done: !1
						});
					} catch (e) {
						throw this.sb = N(this.lb), this.ob(), e;
					} finally {
						It(e);
					}
				}, r.prototype.ob = function() {
					Nt(this.fb), this.fb = null;
				}, r.prototype.Qb = function() {
					return this.sb === null ? N(this.lb) : this.sb;
				}, typeof Symbol == "function" && typeof Symbol.iterator == "symbol" && (r.prototype[Symbol.iterator] = function() {
					return this;
				}), i.prototype.run = function(e, t) {
					if (!this.db) throw "Database closed";
					if (t) {
						e = this.tb(e, t);
						try {
							e.step();
						} finally {
							e.Ya();
						}
					} else this.handleError(u(this.db, e, 0, 0, a));
					return this;
				}, i.prototype.exec = function(e, t, r) {
					if (!this.db) throw "Database closed";
					var i = null, o = null, s = null;
					try {
						s = o = Tt(e);
						var c = Q(4);
						for (e = []; j(s, "i8") !== 0;) {
							me(a), me(c), this.handleError(ee(this.db, s, -1, a, c));
							var l = j(a, "i32");
							if (s = j(c, "i32"), l !== 0) {
								var u = null;
								for (i = new n(l, this), t != null && i.bind(t); i.step();) u === null && (u = {
									columns: i.qb(),
									values: []
								}, e.push(u)), u.values.push(i.get(null, r));
								i.Ya();
							}
						}
						return e;
					} catch (e) {
						throw i && i.Ya(), e;
					} finally {
						o && Nt(o);
					}
				}, i.prototype.Mb = function(e, t, n, r, i) {
					typeof t == "function" && (r = n, n = t, t = void 0), e = this.tb(e, t);
					try {
						for (; e.step();) n(e.zb(null, i));
					} finally {
						e.Ya();
					}
					if (typeof r == "function") return r();
				}, i.prototype.tb = function(e, t) {
					if (me(a), this.handleError(f(this.db, e, -1, a, 0)), e = j(a, "i32"), e === 0) throw "Nothing to prepare";
					var r = new n(e, this);
					return t != null && r.bind(t), this.gb[e] = r;
				}, i.prototype.Ub = function(e) {
					return new r(e, this);
				}, i.prototype.Nb = function() {
					Object.values(this.gb).forEach(function(e) {
						e.Ya();
					}), Object.values(this.Sa).forEach(Z), this.Sa = {}, this.handleError(l(this.db));
					var e = ut(this.filename);
					return this.handleError(c(this.filename, a)), this.db = j(a, "i32"), P(this.db), e;
				}, i.prototype.close = function() {
					this.db !== null && (Object.values(this.gb).forEach(function(e) {
						e.Ya();
					}), Object.values(this.Sa).forEach(Z), this.Sa = {}, this.Za &&= (Z(this.Za), void 0), this.handleError(l(this.db)), et("/" + this.filename), this.db = null);
				}, i.prototype.handleError = function(e) {
					if (e === 0) return null;
					throw e = re(this.db), Error(e);
				}, i.prototype.Rb = function() {
					return d(this.db);
				}, i.prototype.Kb = function(n, r) {
					Object.prototype.hasOwnProperty.call(this.Sa, n) && (Z(this.Sa[n]), delete this.Sa[n]);
					var i = jt(function(n, i, a) {
						i = t(i, a);
						try {
							var o = r.apply(null, i);
						} catch (e) {
							he(n, e, -1);
							return;
						}
						e(n, o);
					}, "viii");
					return this.Sa[n] = i, this.handleError(E(this.db, n, r.length, 1, 0, i, 0, 0, 0)), this;
				}, i.prototype.Jb = function(n, r) {
					var i = r.init || function() {
						return null;
					}, a = r.finalize || function(e) {
						return e;
					}, o = r.step;
					if (!o) throw "An aggregate function must have a step function in " + n;
					var s = {};
					Object.hasOwnProperty.call(this.Sa, n) && (Z(this.Sa[n]), delete this.Sa[n]), r = n + "__finalize", Object.hasOwnProperty.call(this.Sa, r) && (Z(this.Sa[r]), delete this.Sa[r]);
					var c = jt(function(e, n, r) {
						var a = ge(e, 1);
						Object.hasOwnProperty.call(s, a) || (s[a] = i()), n = t(n, r), n = [s[a]].concat(n);
						try {
							s[a] = o.apply(null, n);
						} catch (t) {
							delete s[a], he(e, t, -1);
						}
					}, "viii"), l = jt(function(t) {
						var n = ge(t, 1);
						try {
							var r = a(s[n]);
						} catch (e) {
							delete s[n], he(t, e, -1);
							return;
						}
						e(t, r), delete s[n];
					}, "vi");
					return this.Sa[n] = c, this.Sa[r] = l, this.handleError(E(this.db, n, o.length - 1, 1, 0, 0, c, l, 0)), this;
				}, i.prototype.Zb = function(e) {
					return this.Za &&= (I(this.db, 0, 0), Z(this.Za), void 0), e ? (this.Za = jt(function(t, n, r, i, a) {
						switch (n) {
							case 18:
								t = "insert";
								break;
							case 23:
								t = "update";
								break;
							case 9:
								t = "delete";
								break;
							default: throw "unknown operationCode in updateHook callback: " + n;
						}
						if (r = N(r), i = N(i), a > 2 ** 53 - 1) throw "rowId too big to fit inside a Number";
						e(t, r, i, Number(a));
					}, "viiiij"), I(this.db, this.Za, 0), this) : this;
				}, n.prototype.bind = n.prototype.bind, n.prototype.step = n.prototype.step, n.prototype.get = n.prototype.get, n.prototype.getColumnNames = n.prototype.qb, n.prototype.getAsObject = n.prototype.zb, n.prototype.getSQL = n.prototype.Sb, n.prototype.getNormalizedSQL = n.prototype.Pb, n.prototype.run = n.prototype.run, n.prototype.reset = n.prototype.reset, n.prototype.freemem = n.prototype.freemem, n.prototype.free = n.prototype.Ya, r.prototype.next = r.prototype.next, r.prototype.getRemainingSQL = r.prototype.Qb, i.prototype.run = i.prototype.run, i.prototype.exec = i.prototype.exec, i.prototype.each = i.prototype.Mb, i.prototype.prepare = i.prototype.tb, i.prototype.iterateStatements = i.prototype.Ub, i.prototype.export = i.prototype.Nb, i.prototype.close = i.prototype.close, i.prototype.handleError = i.prototype.handleError, i.prototype.getRowsModified = i.prototype.Rb, i.prototype.create_function = i.prototype.Kb, i.prototype.create_aggregate = i.prototype.Jb, i.prototype.updateHook = i.prototype.Zb, o.Database = i;
			};
			var u = "./this.program", d = (e, t) => {
				throw t;
			}, f = globalThis.document?.currentScript?.src;
			typeof __filename < "u" ? f = __filename : c && (f = self.location.href);
			var p = "", m, ee;
			if (l) {
				var h = oe("node:fs");
				p = __dirname + "/", ee = (e) => (e = re(e) ? new URL(e) : e, h.readFileSync(e)), m = async (e) => (e = re(e) ? new URL(e) : e, h.readFileSync(e, void 0)), 1 < process.argv.length && (u = process.argv[1].replace(/\\/g, "/")), process.argv.slice(2), t !== void 0 && (t.exports = o), d = (e, t) => {
					throw process.exitCode = e, t;
				};
			} else if (s || c) {
				try {
					p = new URL(".", f).href;
				} catch {}
				c && (ee = (e) => {
					var t = new XMLHttpRequest();
					return t.open("GET", e, !1), t.responseType = "arraybuffer", t.send(null), new Uint8Array(t.response);
				}), m = async (e) => {
					if (re(e)) return new Promise((t, n) => {
						var r = new XMLHttpRequest();
						r.open("GET", e, !0), r.responseType = "arraybuffer", r.onload = () => {
							r.status == 200 || r.status == 0 && r.response ? t(r.response) : n(r.status);
						}, r.onerror = n, r.send(null);
					});
					var t = await fetch(e, { credentials: "same-origin" });
					if (t.ok) return t.arrayBuffer();
					throw Error(t.status + " : " + t.url);
				};
			}
			var g = console.log.bind(console), _ = console.error.bind(console), v, te = !1, ne, re = (e) => e.startsWith("file://"), y, b, x, S, C, ie, ae, w;
			function se() {
				var e = Rt.buffer;
				y = new Int8Array(e), x = new Int16Array(e), b = new Uint8Array(e), new Uint16Array(e), S = new Int32Array(e), C = new Uint32Array(e), ie = new Float32Array(e), ae = new Float64Array(e), w = new BigInt64Array(e), new BigUint64Array(e);
			}
			function T(e) {
				throw o.onAbort?.(e), e = "Aborted(" + e + ")", _(e), te = !0, new WebAssembly.RuntimeError(e + ". Build with -sASSERTIONS for more info.");
			}
			var ce;
			async function E(e) {
				if (!v) try {
					var t = await m(e);
					return new Uint8Array(t);
				} catch {}
				if (e == ce && v) e = new Uint8Array(v);
				else if (ee) e = ee(e);
				else throw "both async and sync fetching of the wasm failed";
				return e;
			}
			async function le(e, t) {
				try {
					var n = await E(e);
					return await WebAssembly.instantiate(n, t);
				} catch (e) {
					_(`failed to asynchronously prepare wasm: ${e}`), T(e);
				}
			}
			async function ue(e) {
				var t = ce;
				if (!v && !re(t) && !l) try {
					var n = fetch(t, { credentials: "same-origin" });
					return await WebAssembly.instantiateStreaming(n, e);
				} catch (e) {
					_(`wasm streaming compile failed: ${e}`), _("falling back to ArrayBuffer instantiation");
				}
				return le(t, e);
			}
			class D {
				name = "ExitStatus";
				constructor(e) {
					this.message = `Program terminated with exit(${e})`, this.status = e;
				}
			}
			var O = (e) => {
				for (; 0 < e.length;) e.shift()(o);
			}, de = [], fe = [], pe = () => {
				var e = o.preRun.shift();
				fe.push(e);
			}, k = 0, A = null;
			function j(e, t = "i8") {
				switch (t.endsWith("*") && (t = "*"), t) {
					case "i1": return y[e];
					case "i8": return y[e];
					case "i16": return x[e >> 1];
					case "i32": return S[e >> 2];
					case "i64": return w[e >> 3];
					case "float": return ie[e >> 2];
					case "double": return ae[e >> 3];
					case "*": return C[e >> 2];
					default: T(`invalid type for getValue: ${t}`);
				}
			}
			var M = !0;
			function me(e) {
				var t = "i32";
				switch (t.endsWith("*") && (t = "*"), t) {
					case "i1":
						y[e] = 0;
						break;
					case "i8":
						y[e] = 0;
						break;
					case "i16":
						x[e >> 1] = 0;
						break;
					case "i32":
						S[e >> 2] = 0;
						break;
					case "i64":
						w[e >> 3] = BigInt(0);
						break;
					case "float":
						ie[e >> 2] = 0;
						break;
					case "double":
						ae[e >> 3] = 0;
						break;
					case "*":
						C[e >> 2] = 0;
						break;
					default: T(`invalid type for setValue: ${t}`);
				}
			}
			var he = new TextDecoder(), ge = (e, t, n, r) => {
				if (n = t + n, r) return n;
				for (; e[t] && !(t >= n);) ++t;
				return t;
			}, N = (e, t, n) => e ? he.decode(b.subarray(e, ge(b, e, t, n))) : "", P = (e, t) => {
				for (var n = 0, r = e.length - 1; 0 <= r; r--) {
					var i = e[r];
					i === "." ? e.splice(r, 1) : i === ".." ? (e.splice(r, 1), n++) : n && (e.splice(r, 1), n--);
				}
				if (t) for (; n; n--) e.unshift("..");
				return e;
			}, F = (e) => {
				var t = e.charAt(0) === "/", n = e.slice(-1) === "/";
				return (e = P(e.split("/").filter((e) => !!e), !t).join("/")) || t || (e = "."), e && n && (e += "/"), (t ? "/" : "") + e;
			}, I = (e) => {
				var t = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(e).slice(1);
				return e = t[0], t = t[1], !e && !t ? "." : (t &&= t.slice(0, -1), e + t);
			}, _e = (e) => e && e.match(/([^\/]+|\/)\/*$/)[1], ve = () => {
				if (l) {
					var e = oe("node:crypto");
					return (t) => e.randomFillSync(t);
				}
				return (e) => crypto.getRandomValues(e);
			}, L = (e) => {
				(L = ve())(e);
			}, ye = (...e) => {
				for (var t = "", n = !1, r = e.length - 1; -1 <= r && !n; r--) {
					if (n = 0 <= r ? e[r] : "/", typeof n != "string") throw TypeError("Arguments to path.resolve must be strings");
					if (!n) return "";
					t = n + "/" + t, n = n.charAt(0) === "/";
				}
				return t = P(t.split("/").filter((e) => !!e), !n).join("/"), (n ? "/" : "") + t || ".";
			}, R = (e) => {
				var t = ge(e, 0);
				return he.decode(e.buffer ? e.subarray(0, t) : new Uint8Array(e.slice(0, t)));
			}, be = [], z = (e) => {
				for (var t = 0, n = 0; n < e.length; ++n) {
					var r = e.charCodeAt(n);
					127 >= r ? t++ : 2047 >= r ? t += 2 : 55296 <= r && 57343 >= r ? (t += 4, ++n) : t += 3;
				}
				return t;
			}, B = (e, t, n, r) => {
				if (!(0 < r)) return 0;
				var i = n;
				r = n + r - 1;
				for (var a = 0; a < e.length; ++a) {
					var o = e.codePointAt(a);
					if (127 >= o) {
						if (n >= r) break;
						t[n++] = o;
					} else if (2047 >= o) {
						if (n + 1 >= r) break;
						t[n++] = 192 | o >> 6, t[n++] = 128 | o & 63;
					} else if (65535 >= o) {
						if (n + 2 >= r) break;
						t[n++] = 224 | o >> 12, t[n++] = 128 | o >> 6 & 63, t[n++] = 128 | o & 63;
					} else {
						if (n + 3 >= r) break;
						t[n++] = 240 | o >> 18, t[n++] = 128 | o >> 12 & 63, t[n++] = 128 | o >> 6 & 63, t[n++] = 128 | o & 63, a++;
					}
				}
				return t[n] = 0, n - i;
			}, xe = [];
			function Se(e, t) {
				xe[e] = {
					input: [],
					output: [],
					eb: t
				}, qe(e, Ce);
			}
			var Ce = {
				open(e) {
					var t = xe[e.node.rdev];
					if (!t) throw new U(43);
					e.tty = t, e.seekable = !1;
				},
				close(e) {
					e.tty.eb.fsync(e.tty);
				},
				fsync(e) {
					e.tty.eb.fsync(e.tty);
				},
				read(e, t, n, r) {
					if (!e.tty || !e.tty.eb.Bb) throw new U(60);
					for (var i = 0, a = 0; a < r; a++) {
						try {
							var o = e.tty.eb.Bb(e.tty);
						} catch {
							throw new U(29);
						}
						if (o === void 0 && i === 0) throw new U(6);
						if (o == null) break;
						i++, t[n + a] = o;
					}
					return i && (e.node.atime = Date.now()), i;
				},
				write(e, t, n, r) {
					if (!e.tty || !e.tty.eb.ub) throw new U(60);
					try {
						for (var i = 0; i < r; i++) e.tty.eb.ub(e.tty, t[n + i]);
					} catch {
						throw new U(29);
					}
					return r && (e.node.mtime = e.node.ctime = Date.now()), i;
				}
			}, we = {
				Bb() {
					a: {
						if (!be.length) {
							var e = null;
							if (l) {
								var t = Buffer.alloc(256), n = 0, r = process.stdin.fd;
								try {
									n = h.readSync(r, t, 0, 256);
								} catch (e) {
									if (e.toString().includes("EOF")) n = 0;
									else throw e;
								}
								0 < n && (e = t.slice(0, n).toString("utf-8"));
							} else globalThis.window?.prompt && (e = window.prompt("Input: "), e !== null && (e += "\n"));
							if (!e) {
								e = null;
								break a;
							}
							t = Array(z(e) + 1), e = B(e, t, 0, t.length), t.length = e, be = t;
						}
						e = be.shift();
					}
					return e;
				},
				ub(e, t) {
					t === null || t === 10 ? (g(R(e.output)), e.output = []) : t != 0 && e.output.push(t);
				},
				fsync(e) {
					0 < e.output?.length && (g(R(e.output)), e.output = []);
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
			}, Te = {
				ub(e, t) {
					t === null || t === 10 ? (_(R(e.output)), e.output = []) : t != 0 && e.output.push(t);
				},
				fsync(e) {
					0 < e.output?.length && (_(R(e.output)), e.output = []);
				}
			}, V = {
				Wa: null,
				Xa() {
					return V.createNode(null, "/", 16895, 0);
				},
				createNode(e, t, n, r) {
					if ((n & 61440) == 24576 || (n & 61440) == 4096) throw new U(63);
					return V.Wa ||= {
						dir: {
							node: {
								Ta: V.La.Ta,
								Ua: V.La.Ua,
								lookup: V.La.lookup,
								ib: V.La.ib,
								rename: V.La.rename,
								unlink: V.La.unlink,
								rmdir: V.La.rmdir,
								readdir: V.La.readdir,
								symlink: V.La.symlink
							},
							stream: { Va: V.Ma.Va }
						},
						file: {
							node: {
								Ta: V.La.Ta,
								Ua: V.La.Ua
							},
							stream: {
								Va: V.Ma.Va,
								read: V.Ma.read,
								write: V.Ma.write,
								jb: V.Ma.jb,
								kb: V.Ma.kb
							}
						},
						link: {
							node: {
								Ta: V.La.Ta,
								Ua: V.La.Ua,
								readlink: V.La.readlink
							},
							stream: {}
						},
						yb: {
							node: {
								Ta: V.La.Ta,
								Ua: V.La.Ua
							},
							stream: Ke
						}
					}, n = Re(e, t, n, r), K(n.mode) ? (n.La = V.Wa.dir.node, n.Ma = V.Wa.dir.stream, n.Na = {}) : (n.mode & 61440) == 32768 ? (n.La = V.Wa.file.node, n.Ma = V.Wa.file.stream, n.Ra = 0, n.Na = null) : (n.mode & 61440) == 40960 ? (n.La = V.Wa.link.node, n.Ma = V.Wa.link.stream) : (n.mode & 61440) == 8192 && (n.La = V.Wa.yb.node, n.Ma = V.Wa.yb.stream), n.atime = n.mtime = n.ctime = Date.now(), e && (e.Na[t] = n, e.atime = e.mtime = e.ctime = n.atime), n;
				},
				fc(e) {
					return e.Na ? e.Na.subarray ? e.Na.subarray(0, e.Ra) : new Uint8Array(e.Na) : new Uint8Array();
				},
				La: {
					Ta(e) {
						var t = {};
						return t.dev = (e.mode & 61440) == 8192 ? e.id : 1, t.ino = e.id, t.mode = e.mode, t.nlink = 1, t.uid = 0, t.gid = 0, t.rdev = e.rdev, K(e.mode) ? t.size = 4096 : (e.mode & 61440) == 32768 ? t.size = e.Ra : (e.mode & 61440) == 40960 ? t.size = e.link.length : t.size = 0, t.atime = new Date(e.atime), t.mtime = new Date(e.mtime), t.ctime = new Date(e.ctime), t.blksize = 4096, t.blocks = Math.ceil(t.size / t.blksize), t;
					},
					Ua(e, t) {
						for (var n of [
							"mode",
							"atime",
							"mtime",
							"ctime"
						]) t[n] != null && (e[n] = t[n]);
						t.size !== void 0 && (t = t.size, e.Ra != t && (t == 0 ? (e.Na = null, e.Ra = 0) : (n = e.Na, e.Na = new Uint8Array(t), n && e.Na.set(n.subarray(0, Math.min(t, e.Ra))), e.Ra = t)));
					},
					lookup() {
						throw V.nb || (V.nb = new U(44), V.nb.stack = "<generic error, no stack>"), V.nb;
					},
					ib(e, t, n, r) {
						return V.createNode(e, t, n, r);
					},
					rename(e, t, n) {
						try {
							var r = G(t, n);
						} catch {}
						if (r) {
							if (K(e.mode)) for (var i in r.Na) throw new U(55);
							Le(r);
						}
						delete e.parent.Na[e.name], t.Na[n] = e, e.name = n, t.ctime = t.mtime = e.parent.ctime = e.parent.mtime = Date.now();
					},
					unlink(e, t) {
						delete e.Na[t], e.ctime = e.mtime = Date.now();
					},
					rmdir(e, t) {
						var n = G(e, t), r;
						for (r in n.Na) throw new U(55);
						delete e.Na[t], e.ctime = e.mtime = Date.now();
					},
					readdir(e) {
						return [
							".",
							"..",
							...Object.keys(e.Na)
						];
					},
					symlink(e, t, n) {
						return e = V.createNode(e, t, 41471, 0), e.link = n, e;
					},
					readlink(e) {
						if ((e.mode & 61440) != 40960) throw new U(28);
						return e.link;
					}
				},
				Ma: {
					read(e, t, n, r, i) {
						var a = e.node.Na;
						if (i >= e.node.Ra) return 0;
						if (e = Math.min(e.node.Ra - i, r), 8 < e && a.subarray) t.set(a.subarray(i, i + e), n);
						else for (r = 0; r < e; r++) t[n + r] = a[i + r];
						return e;
					},
					write(e, t, n, r, i, a) {
						if (t.buffer === y.buffer && (a = !1), !r) return 0;
						if (e = e.node, e.mtime = e.ctime = Date.now(), t.subarray && (!e.Na || e.Na.subarray)) {
							if (a) return e.Na = t.subarray(n, n + r), e.Ra = r;
							if (e.Ra === 0 && i === 0) return e.Na = t.slice(n, n + r), e.Ra = r;
							if (i + r <= e.Ra) return e.Na.set(t.subarray(n, n + r), i), r;
						}
						a = i + r;
						var o = e.Na ? e.Na.length : 0;
						if (o >= a || (a = Math.max(a, o * (1048576 > o ? 2 : 1.125) >>> 0), o != 0 && (a = Math.max(a, 256)), o = e.Na, e.Na = new Uint8Array(a), 0 < e.Ra && e.Na.set(o.subarray(0, e.Ra), 0)), e.Na.subarray && t.subarray) e.Na.set(t.subarray(n, n + r), i);
						else for (a = 0; a < r; a++) e.Na[i + a] = t[n + a];
						return e.Ra = Math.max(e.Ra, i + r), r;
					},
					Va(e, t, n) {
						if (n === 1 ? t += e.position : n === 2 && (e.node.mode & 61440) == 32768 && (t += e.node.Ra), 0 > t) throw new U(28);
						return t;
					},
					jb(e, t, n, r, i) {
						if ((e.node.mode & 61440) != 32768) throw new U(43);
						if (e = e.node.Na, i & 2 || !e || e.buffer !== y.buffer) {
							i = !0, r = 65536 * Math.ceil(t / 65536);
							var a = Pt(65536, r);
							if (a && b.fill(0, a, a + r), r = a, !r) throw new U(48);
							e && ((0 < n || n + t < e.length) && (e = e.subarray ? e.subarray(n, n + t) : Array.prototype.slice.call(e, n, n + t)), y.set(e, r));
						} else i = !1, r = e.byteOffset;
						return {
							Xb: r,
							Eb: i
						};
					},
					kb(e, t, n, r) {
						return V.Ma.write(e, t, 0, r, n, !1), 0;
					}
				}
			}, Ee = (e, t) => {
				var n = 0;
				return e && (n |= 365), t && (n |= 146), n;
			}, De = null, Oe = {}, ke = [], Ae = 1, H = null, je = !1, Me = !0, U = class {
				name = "ErrnoError";
				constructor(e) {
					this.Pa = e;
				}
			}, Ne = class {
				hb = {};
				node = null;
				get flags() {
					return this.hb.flags;
				}
				set flags(e) {
					this.hb.flags = e;
				}
				get position() {
					return this.hb.position;
				}
				set position(e) {
					this.hb.position = e;
				}
			}, Pe = class {
				La = {};
				Ma = {};
				bb = null;
				constructor(e, t, n, r) {
					e ||= this, this.parent = e, this.Xa = e.Xa, this.id = Ae++, this.name = t, this.mode = n, this.rdev = r, this.atime = this.mtime = this.ctime = Date.now();
				}
				get read() {
					return (this.mode & 365) == 365;
				}
				set read(e) {
					e ? this.mode |= 365 : this.mode &= -366;
				}
				get write() {
					return (this.mode & 146) == 146;
				}
				set write(e) {
					e ? this.mode |= 146 : this.mode &= -147;
				}
			};
			function W(e, t = {}) {
				if (!e) throw new U(44);
				t.pb ??= !0, e.charAt(0) === "/" || (e = "//" + e);
				var n = 0;
				a: for (; 40 > n; n++) {
					e = e.split("/").filter((e) => !!e);
					for (var r = De, i = "/", a = 0; a < e.length; a++) {
						var o = a === e.length - 1;
						if (o && t.parent) break;
						if (e[a] !== ".") if (e[a] === "..") if (i = I(i), r === r.parent) {
							e = i + "/" + e.slice(a + 1).join("/"), n--;
							continue a;
						} else r = r.parent;
						else {
							i = F(i + "/" + e[a]);
							try {
								r = G(r, e[a]);
							} catch (e) {
								if (e?.Pa === 44 && o && t.Wb) return { path: i };
								throw e;
							}
							if (!r.bb || o && !t.pb || (r = r.bb.root), (r.mode & 61440) == 40960 && (!o || t.ab)) {
								if (!r.La.readlink) throw new U(52);
								r = r.La.readlink(r), r.charAt(0) === "/" || (r = I(i) + "/" + r), e = r + "/" + e.slice(a + 1).join("/");
								continue a;
							}
						}
					}
					return {
						path: i,
						node: r
					};
				}
				throw new U(32);
			}
			function Fe(e) {
				for (var t;;) {
					if (e === e.parent) return e = e.Xa.Db, t ? e[e.length - 1] === "/" ? e + t : `${e}/${t}` : e;
					t = t ? `${e.name}/${t}` : e.name, e = e.parent;
				}
			}
			function Ie(e, t) {
				for (var n = 0, r = 0; r < t.length; r++) n = (n << 5) - n + t.charCodeAt(r) | 0;
				return (e + n >>> 0) % H.length;
			}
			function Le(e) {
				var t = Ie(e.parent.id, e.name);
				if (H[t] === e) H[t] = e.cb;
				else for (t = H[t]; t;) {
					if (t.cb === e) {
						t.cb = e.cb;
						break;
					}
					t = t.cb;
				}
			}
			function G(e, t) {
				var n = K(e.mode) ? (n = ze(e, "x")) ? n : e.La.lookup ? 0 : 2 : 54;
				if (n) throw new U(n);
				for (n = H[Ie(e.id, t)]; n; n = n.cb) {
					var r = n.name;
					if (n.parent.id === e.id && r === t) return n;
				}
				return e.La.lookup(e, t);
			}
			function Re(e, t, n, r) {
				return e = new Pe(e, t, n, r), t = Ie(e.parent.id, e.name), e.cb = H[t], H[t] = e;
			}
			function K(e) {
				return (e & 61440) == 16384;
			}
			function ze(e, t) {
				return Me ? 0 : t.includes("r") && !(e.mode & 292) || t.includes("w") && !(e.mode & 146) || t.includes("x") && !(e.mode & 73) ? 2 : 0;
			}
			function Be(e, t) {
				if (!K(e.mode)) return 54;
				try {
					return G(e, t), 20;
				} catch {}
				return ze(e, "wx");
			}
			function Ve(e, t, n) {
				try {
					var r = G(e, t);
				} catch (e) {
					return e.Pa;
				}
				if (e = ze(e, "wx")) return e;
				if (n) {
					if (!K(r.mode)) return 54;
					if (r === r.parent || Fe(r) === "/") return 10;
				} else if (K(r.mode)) return 31;
				return 0;
			}
			function He(e) {
				if (!e) throw new U(63);
				return e;
			}
			function q(e) {
				if (e = ke[e], !e) throw new U(8);
				return e;
			}
			function Ue(e, t = -1) {
				if (e = Object.assign(new Ne(), e), t == -1) a: {
					for (t = 0; 4096 >= t; t++) if (!ke[t]) break a;
					throw new U(33);
				}
				return e.fd = t, ke[t] = e;
			}
			function We(e, t = -1) {
				return e = Ue(e, t), e.Ma?.ec?.(e), e;
			}
			function Ge(e, t, n) {
				var r = e?.Ma.Ua;
				e = r ? e : t, r ??= t.La.Ua, He(r), r(e, n);
			}
			var Ke = {
				open(e) {
					e.Ma = Oe[e.node.rdev].Ma, e.Ma.open?.(e);
				},
				Va() {
					throw new U(70);
				}
			};
			function qe(e, t) {
				Oe[e] = { Ma: t };
			}
			function Je(e, t) {
				var n = t === "/";
				if (n && De) throw new U(10);
				if (!n && t) {
					var r = W(t, { pb: !1 });
					if (t = r.path, r = r.node, r.bb) throw new U(10);
					if (!K(r.mode)) throw new U(54);
				}
				t = {
					type: e,
					kc: {},
					Db: t,
					Vb: []
				}, e = e.Xa(t), e.Xa = t, t.root = e, n ? De = e : r && (r.bb = t, r.Xa && r.Xa.Vb.push(t));
			}
			function Ye(e, t, n) {
				var r = W(e, { parent: !0 }).node;
				if (e = _e(e), !e) throw new U(28);
				if (e === "." || e === "..") throw new U(20);
				var i = Be(r, e);
				if (i) throw new U(i);
				if (!r.La.ib) throw new U(63);
				return r.La.ib(r, e, t, n);
			}
			function Xe(e, t = 438) {
				return Ye(e, t & 4095 | 32768, 0);
			}
			function J(e, t = 511) {
				return Ye(e, t & 1023 | 16384, 0);
			}
			function Ze(e, t, n) {
				n === void 0 && (n = t, t = 438), Ye(e, t | 8192, n);
			}
			function Qe(e, t) {
				if (!ye(e)) throw new U(44);
				var n = W(t, { parent: !0 }).node;
				if (!n) throw new U(44);
				t = _e(t);
				var r = Be(n, t);
				if (r) throw new U(r);
				if (!n.La.symlink) throw new U(63);
				n.La.symlink(n, t, e);
			}
			function $e(e) {
				var t = W(e, { parent: !0 }).node;
				e = _e(e);
				var n = G(t, e), r = Ve(t, e, !0);
				if (r) throw new U(r);
				if (!t.La.rmdir) throw new U(63);
				if (n.bb) throw new U(10);
				t.La.rmdir(t, e), Le(n);
			}
			function et(e) {
				var t = W(e, { parent: !0 }).node;
				if (!t) throw new U(44);
				e = _e(e);
				var n = G(t, e), r = Ve(t, e, !1);
				if (r) throw new U(r);
				if (!t.La.unlink) throw new U(63);
				if (n.bb) throw new U(10);
				t.La.unlink(t, e), Le(n);
			}
			function tt(e, t) {
				return e = W(e, { ab: !t }).node, He(e.La.Ta)(e);
			}
			function nt(e, t, n, r) {
				Ge(e, t, {
					mode: n & 4095 | t.mode & -4096,
					ctime: Date.now(),
					Lb: r
				});
			}
			function rt(e, t) {
				e = typeof e == "string" ? W(e, { ab: !0 }).node : e, nt(null, e, t);
			}
			function it(e, t, n) {
				if (K(t.mode)) throw new U(31);
				if ((t.mode & 61440) != 32768) throw new U(28);
				var r = ze(t, "w");
				if (r) throw new U(r);
				Ge(e, t, {
					size: n,
					timestamp: Date.now()
				});
			}
			function at(e, t, n = 438) {
				if (e === "") throw new U(44);
				if (typeof t == "string") {
					var r = {
						r: 0,
						"r+": 2,
						w: 577,
						"w+": 578,
						a: 1089,
						"a+": 1090
					}[t];
					if (r === void 0) throw Error(`Unknown file open mode: ${t}`);
					t = r;
				}
				if (n = t & 64 ? n & 4095 | 32768 : 0, typeof e == "object") r = e;
				else {
					var i = e.endsWith("/"), a = W(e, {
						ab: !(t & 131072),
						Wb: !0
					});
					r = a.node, e = a.path;
				}
				if (a = !1, t & 64) if (r) {
					if (t & 128) throw new U(20);
				} else {
					if (i) throw new U(31);
					r = Ye(e, n | 511, 0), a = !0;
				}
				if (!r) throw new U(44);
				if ((r.mode & 61440) == 8192 && (t &= -513), t & 65536 && !K(r.mode)) throw new U(54);
				if (!a && (r ? (r.mode & 61440) == 40960 ? i = 32 : (i = [
					"r",
					"w",
					"rw"
				][t & 3], t & 512 && (i += "w"), i = K(r.mode) && (i !== "r" || t & 576) ? 31 : ze(r, i)) : i = 44, i)) throw new U(i);
				return t & 512 && !a && (i = r, i = typeof i == "string" ? W(i, { ab: !0 }).node : i, it(null, i, 0)), t = Ue({
					node: r,
					path: Fe(r),
					flags: t & -131713,
					seekable: !0,
					position: 0,
					Ma: r.Ma,
					Yb: [],
					error: !1
				}), t.Ma.open && t.Ma.open(t), a && rt(r, n & 511), t;
			}
			function ot(e) {
				if (e.fd === null) throw new U(8);
				e.rb &&= null;
				try {
					e.Ma.close && e.Ma.close(e);
				} catch (e) {
					throw e;
				} finally {
					ke[e.fd] = null;
				}
				e.fd = null;
			}
			function st(e, t, n) {
				if (e.fd === null) throw new U(8);
				if (!e.seekable || !e.Ma.Va) throw new U(70);
				if (n != 0 && n != 1 && n != 2) throw new U(28);
				e.position = e.Ma.Va(e, t, n), e.Yb = [];
			}
			function ct(e, t, n, r, i) {
				if (0 > r || 0 > i) throw new U(28);
				if (e.fd === null || (e.flags & 2097155) == 1) throw new U(8);
				if (K(e.node.mode)) throw new U(31);
				if (!e.Ma.read) throw new U(28);
				var a = i !== void 0;
				if (!a) i = e.position;
				else if (!e.seekable) throw new U(70);
				return t = e.Ma.read(e, t, n, r, i), a || (e.position += t), t;
			}
			function lt(e, t, n, r, i) {
				if (0 > r || 0 > i) throw new U(28);
				if (e.fd === null || !(e.flags & 2097155)) throw new U(8);
				if (K(e.node.mode)) throw new U(31);
				if (!e.Ma.write) throw new U(28);
				e.seekable && e.flags & 1024 && st(e, 0, 2);
				var a = i !== void 0;
				if (!a) i = e.position;
				else if (!e.seekable) throw new U(70);
				return t = e.Ma.write(e, t, n, r, i, void 0), a || (e.position += t), t;
			}
			function ut(e) {
				var t = t || 0, n = "binary";
				n !== "utf8" && n !== "binary" && T(`Invalid encoding type "${n}"`), t = at(e, t), e = tt(e).size;
				var r = new Uint8Array(e);
				return ct(t, r, 0, e, 0), n === "utf8" && (r = R(r)), ot(t), r;
			}
			function dt(e, t, n) {
				e = F("/dev/" + e);
				var r = Ee(!!t, !!n);
				dt.Cb ??= 64;
				var i = dt.Cb++ << 8 | 0;
				qe(i, {
					open(e) {
						e.seekable = !1;
					},
					close() {
						n?.buffer?.length && n(10);
					},
					read(e, n, r, i) {
						for (var a = 0, o = 0; o < i; o++) {
							try {
								var s = t();
							} catch {
								throw new U(29);
							}
							if (s === void 0 && a === 0) throw new U(6);
							if (s == null) break;
							a++, n[r + o] = s;
						}
						return a && (e.node.atime = Date.now()), a;
					},
					write(e, t, r, i) {
						for (var a = 0; a < i; a++) try {
							n(t[r + a]);
						} catch {
							throw new U(29);
						}
						return i && (e.node.mtime = e.node.ctime = Date.now()), a;
					}
				}), Ze(e, r, i);
			}
			var Y = {};
			function X(e, t, n) {
				if (t.charAt(0) === "/") return t;
				if (e = e === -100 ? "/" : q(e).path, t.length == 0) {
					if (!n) throw new U(44);
					return e;
				}
				return e + "/" + t;
			}
			function ft(e, t) {
				C[e >> 2] = t.dev, C[e + 4 >> 2] = t.mode, C[e + 8 >> 2] = t.nlink, C[e + 12 >> 2] = t.uid, C[e + 16 >> 2] = t.gid, C[e + 20 >> 2] = t.rdev, w[e + 24 >> 3] = BigInt(t.size), S[e + 32 >> 2] = 4096, S[e + 36 >> 2] = t.blocks;
				var n = t.atime.getTime(), r = t.mtime.getTime(), i = t.ctime.getTime();
				return w[e + 40 >> 3] = BigInt(Math.floor(n / 1e3)), C[e + 48 >> 2] = n % 1e3 * 1e6, w[e + 56 >> 3] = BigInt(Math.floor(r / 1e3)), C[e + 64 >> 2] = r % 1e3 * 1e6, w[e + 72 >> 3] = BigInt(Math.floor(i / 1e3)), C[e + 80 >> 2] = i % 1e3 * 1e6, w[e + 88 >> 3] = BigInt(t.ino), 0;
			}
			var pt = void 0, mt = () => {
				var e = S[pt >> 2];
				return pt += 4, e;
			}, ht = 0, gt = [
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
			], _t = [
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
			], vt = {}, yt = (e) => {
				ne = e, M || 0 < ht || (o.onExit?.(e), te = !0), d(e, new D(e));
			}, bt = (e) => {
				if (!te) try {
					e();
				} catch (e) {
					e instanceof D || e == "unwind" || d(1, e);
				} finally {
					if (!(M || 0 < ht)) try {
						ne = e = ne, yt(e);
					} catch (e) {
						e instanceof D || e == "unwind" || d(1, e);
					}
				}
			}, xt = {}, St = () => {
				if (!Ct) {
					var e = {
						USER: "web_user",
						LOGNAME: "web_user",
						PATH: "/",
						PWD: "/",
						HOME: "/home/web_user",
						LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8",
						_: u || "./this.program"
					}, t;
					for (t in xt) xt[t] === void 0 ? delete e[t] : e[t] = xt[t];
					var n = [];
					for (t in e) n.push(`${t}=${e[t]}`);
					Ct = n;
				}
				return Ct;
			}, Ct, wt = (e, t, n, r) => {
				var i = {
					string: (e) => {
						var t = 0;
						if (e != null && e !== 0) {
							t = z(e) + 1;
							var n = Q(t);
							B(e, b, n, t), t = n;
						}
						return t;
					},
					array: (e) => {
						var t = Q(e.length);
						return y.set(e, t), t;
					}
				};
				e = o["_" + e];
				var a = [], s = 0;
				if (r) for (var c = 0; c < r.length; c++) {
					var l = i[n[c]];
					l ? (s === 0 && (s = Lt()), a[c] = l(r[c])) : a[c] = r[c];
				}
				return n = e(...a), n = function(e) {
					return s !== 0 && It(s), t === "string" ? N(e) : t === "boolean" ? !!e : e;
				}(n);
			}, Tt = (e) => {
				var t = z(e) + 1, n = Mt(t);
				return n && B(e, b, n, t), n;
			}, Et, Dt = [], Z = (e) => {
				Et.delete($.get(e)), $.set(e, null), Dt.push(e);
			}, Ot = (e) => {
				let t = e.length;
				return [
					t % 128 | 128,
					t >> 7,
					...e
				];
			}, kt = {
				i: 127,
				p: 127,
				j: 126,
				f: 125,
				d: 124,
				e: 111
			}, At = (e) => Ot(Array.from(e, (e) => kt[e])), jt = (e, t) => {
				if (!Et) {
					Et = /* @__PURE__ */ new WeakMap();
					var n = $.length;
					if (Et) for (var r = 0; r < 0 + n; r++) {
						var i = $.get(r);
						i && Et.set(i, r);
					}
				}
				if (n = Et.get(e) || 0) return n;
				n = Dt.length ? Dt.pop() : $.grow(1);
				try {
					$.set(n, e);
				} catch (r) {
					if (!(r instanceof TypeError)) throw r;
					t = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...Ot([
						1,
						96,
						...At(t.slice(1)),
						...At(t[0] === "v" ? "" : t[0])
					]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0), t = new WebAssembly.Module(t), t = new WebAssembly.Instance(t, { e: { f: e } }).exports.f, $.set(n, t);
				}
				return Et.set(e, n), n;
			};
			if (H = Array(4096), Je(V, "/"), J("/tmp"), J("/home"), J("/home/web_user"), (function() {
				J("/dev"), qe(259, {
					read: () => 0,
					write: (e, t, n, r) => r,
					Va: () => 0
				}), Ze("/dev/null", 259), Se(1280, we), Se(1536, Te), Ze("/dev/tty", 1280), Ze("/dev/tty1", 1536);
				var e = new Uint8Array(1024), t = 0, n = () => (t === 0 && (L(e), t = e.byteLength), e[--t]);
				dt("random", n), dt("urandom", n), J("/dev/shm"), J("/dev/shm/tmp");
			})(), (function() {
				J("/proc");
				var e = J("/proc/self");
				J("/proc/self/fd"), Je({ Xa() {
					var t = Re(e, "fd", 16895, 73);
					return t.Ma = { Va: V.Ma.Va }, t.La = {
						lookup(e, t) {
							e = +t;
							var n = q(e);
							return e = {
								parent: null,
								Xa: { Db: "fake" },
								La: { readlink: () => n.path },
								id: e + 1
							}, e.parent = e;
						},
						readdir() {
							return Array.from(ke.entries()).filter(([, e]) => e).map(([e]) => e.toString());
						}
					}, t;
				} }, "/proc/self/fd");
			})(), o.noExitRuntime && (M = o.noExitRuntime), o.print && (g = o.print), o.printErr && (_ = o.printErr), o.wasmBinary && (v = o.wasmBinary), o.thisProgram && (u = o.thisProgram), o.preInit) for (typeof o.preInit == "function" && (o.preInit = [o.preInit]); 0 < o.preInit.length;) o.preInit.shift()();
			o.stackSave = () => Lt(), o.stackRestore = (e) => It(e), o.stackAlloc = (e) => Q(e), o.cwrap = (e, t, n, r) => {
				var i = !n || n.every((e) => e === "number" || e === "boolean");
				return t !== "string" && i && !r ? o["_" + e] : (...r) => wt(e, t, n, r);
			}, o.addFunction = jt, o.removeFunction = Z, o.UTF8ToString = N, o.stringToNewUTF8 = Tt, o.writeArrayToMemory = (e, t) => {
				y.set(e, t);
			};
			var Mt, Nt, Pt, Ft, It, Q, Lt, Rt, $, zt = {
				a: (e, t, n, r) => T(`Assertion failed: ${N(e)}, at: ` + [
					t ? N(t) : "unknown filename",
					n,
					r ? N(r) : "unknown function"
				]),
				i: function(e, t) {
					try {
						return e = N(e), rt(e, t), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				L: function(e, t, n) {
					try {
						if (t = N(t), t = X(e, t), n & -8) return -28;
						var r = W(t, { ab: !0 }).node;
						return r ? (e = "", n & 4 && (e += "r"), n & 2 && (e += "w"), n & 1 && (e += "x"), e && ze(r, e) ? -2 : 0) : -44;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				j: function(e, t) {
					try {
						var n = q(e);
						return nt(n, n.node, t, !1), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				h: function(e) {
					try {
						var t = q(e);
						return Ge(t, t.node, {
							timestamp: Date.now(),
							Lb: !1
						}), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				b: function(e, t, n) {
					pt = n;
					try {
						var r = q(e);
						switch (t) {
							case 0:
								var i = mt();
								if (0 > i) break;
								for (; ke[i];) i++;
								return We(r, i).fd;
							case 1:
							case 2: return 0;
							case 3: return r.flags;
							case 4: return i = mt(), r.flags |= i, 0;
							case 12: return i = mt(), x[i + 0 >> 1] = 2, 0;
							case 13:
							case 14: return 0;
						}
						return -28;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				g: function(e, t) {
					try {
						var n = q(e), r = n.node, i = n.Ma.Ta;
						return e = i ? n : r, i ??= r.La.Ta, He(i), ft(t, i(e));
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				H: function(e, t) {
					t = -9007199254740992 > t || 9007199254740992 < t ? NaN : Number(t);
					try {
						if (isNaN(t)) return -61;
						var n = q(e);
						if (0 > t || !(n.flags & 2097155)) throw new U(28);
						return it(n, n.node, t), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				G: function(e, t) {
					try {
						if (t === 0) return -28;
						var n = z("/") + 1;
						return t < n ? -68 : (B("/", b, e, t), n);
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				K: function(e, t) {
					try {
						return e = N(e), ft(t, tt(e, !0));
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				C: function(e, t, n) {
					try {
						return t = N(t), t = X(e, t), J(t, n), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				J: function(e, t, n, r) {
					try {
						t = N(t);
						var i = r & 256;
						return t = X(e, t, r & 4096), ft(n, i ? tt(t, !0) : tt(t));
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				x: function(e, t, n, r) {
					pt = r;
					try {
						t = N(t), t = X(e, t);
						var i = r ? mt() : 0;
						return at(t, n, i).fd;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				v: function(e, t, n, r) {
					try {
						if (t = N(t), t = X(e, t), 0 >= r) return -28;
						var i = W(t).node;
						if (!i) throw new U(44);
						if (!i.La.readlink) throw new U(28);
						var a = i.La.readlink(i), o = Math.min(r, z(a)), s = y[n + o];
						return B(a, b, n, r + 1), y[n + o] = s, o;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				u: function(e) {
					try {
						return e = N(e), $e(e), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				f: function(e, t) {
					try {
						return e = N(e), ft(t, tt(e));
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				r: function(e, t, n) {
					try {
						if (t = N(t), t = X(e, t), n) if (n === 512) $e(t);
						else return -28;
						else et(t);
						return 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				q: function(e, t, n) {
					try {
						t = N(t), t = X(e, t, !0);
						var r = Date.now(), i, a;
						if (n) {
							var o = C[n >> 2] + 4294967296 * S[n + 4 >> 2], s = S[n + 8 >> 2];
							i = s == 1073741823 ? r : s == 1073741822 ? null : 1e3 * o + s / 1e6, n += 16, o = C[n >> 2] + 4294967296 * S[n + 4 >> 2], s = S[n + 8 >> 2], a = s == 1073741823 ? r : s == 1073741822 ? null : 1e3 * o + s / 1e6;
						} else a = i = r;
						if ((a ?? i) !== null) {
							e = i;
							var c = W(t, { ab: !0 }).node;
							He(c.La.Ua)(c, {
								atime: e,
								mtime: a
							});
						}
						return 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				m: () => T(""),
				l: () => {
					M = !1, ht = 0;
				},
				A: function(e, t) {
					e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e), e = /* @__PURE__ */ new Date(1e3 * e), S[t >> 2] = e.getSeconds(), S[t + 4 >> 2] = e.getMinutes(), S[t + 8 >> 2] = e.getHours(), S[t + 12 >> 2] = e.getDate(), S[t + 16 >> 2] = e.getMonth(), S[t + 20 >> 2] = e.getFullYear() - 1900, S[t + 24 >> 2] = e.getDay();
					var n = e.getFullYear();
					S[t + 28 >> 2] = (n % 4 != 0 || n % 100 == 0 && n % 400 != 0 ? _t : gt)[e.getMonth()] + e.getDate() - 1 | 0, S[t + 36 >> 2] = -(60 * e.getTimezoneOffset()), n = new Date(e.getFullYear(), 6, 1).getTimezoneOffset();
					var r = new Date(e.getFullYear(), 0, 1).getTimezoneOffset();
					S[t + 32 >> 2] = (n != r && e.getTimezoneOffset() == Math.min(r, n)) | 0;
				},
				y: function(e, t, n, r, i, a, o) {
					i = -9007199254740992 > i || 9007199254740992 < i ? NaN : Number(i);
					try {
						var s = q(r);
						if (t & 2 && !(n & 2) && (s.flags & 2097155) != 2 || (s.flags & 2097155) == 1) throw new U(2);
						if (!s.Ma.jb) throw new U(43);
						if (!e) throw new U(28);
						var c = s.Ma.jb(s, e, i, t, n), l = c.Xb;
						return S[a >> 2] = c.Eb, C[o >> 2] = l, 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				z: function(e, t, n, r, i, a) {
					a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
					try {
						var o = q(i);
						if (n & 2) {
							if (n = a, (o.node.mode & 61440) != 32768) throw new U(43);
							if (!(r & 2)) {
								var s = b.slice(e, e + t);
								o.Ma.kb && o.Ma.kb(o, s, n, t, r);
							}
						}
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return -e.Pa;
					}
				},
				n: (e, t) => (vt[e] && (clearTimeout(vt[e].id), delete vt[e]), t && (vt[e] = {
					id: setTimeout(() => {
						delete vt[e], bt(() => Ft(e, performance.now()));
					}, t),
					lc: t
				}), 0),
				B: (e, t, n, r) => {
					var i = (/* @__PURE__ */ new Date()).getFullYear(), a = new Date(i, 0, 1).getTimezoneOffset();
					i = new Date(i, 6, 1).getTimezoneOffset(), C[e >> 2] = 60 * Math.max(a, i), S[t >> 2] = Number(a != i), t = (e) => {
						var t = Math.abs(e);
						return `UTC${0 <= e ? "-" : "+"}${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}`;
					}, e = t(a), t = t(i), i < a ? (B(e, b, n, 17), B(t, b, r, 17)) : (B(e, b, r, 17), B(t, b, n, 17));
				},
				d: () => Date.now(),
				s: () => 2147483648,
				c: () => performance.now(),
				o: (e) => {
					var t = b.length;
					if (e >>>= 0, 2147483648 < e) return !1;
					for (var n = 1; 4 >= n; n *= 2) {
						var r = t * (1 + .2 / n);
						r = Math.min(r, e + 100663296);
						a: {
							r = (Math.min(2147483648, 65536 * Math.ceil(Math.max(e, r) / 65536)) - Rt.buffer.byteLength + 65535) / 65536 | 0;
							try {
								Rt.grow(r), se();
								var i = 1;
								break a;
							} catch {}
							i = void 0;
						}
						if (i) return !0;
					}
					return !1;
				},
				E: (e, t) => {
					var n = 0, r = 0, i;
					for (i of St()) {
						var a = t + n;
						C[e + r >> 2] = a, n += B(i, b, a, Infinity) + 1, r += 4;
					}
					return 0;
				},
				F: (e, t) => {
					var n = St();
					C[e >> 2] = n.length, e = 0;
					for (var r of n) e += z(r) + 1;
					return C[t >> 2] = e, 0;
				},
				e: function(e) {
					try {
						return ot(q(e)), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return e.Pa;
					}
				},
				p: function(e, t) {
					try {
						var n = q(e);
						return y[t] = n.tty ? 2 : K(n.mode) ? 3 : (n.mode & 61440) == 40960 ? 7 : 4, x[t + 2 >> 1] = 0, w[t + 8 >> 3] = BigInt(0), w[t + 16 >> 3] = BigInt(0), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return e.Pa;
					}
				},
				w: function(e, t, n, r) {
					try {
						a: {
							var i = q(e);
							e = t;
							for (var a, o = t = 0; o < n; o++) {
								var s = C[e >> 2], c = C[e + 4 >> 2];
								e += 8;
								var l = ct(i, y, s, c, a);
								if (0 > l) {
									var u = -1;
									break a;
								}
								if (t += l, l < c) break;
								a !== void 0 && (a += l);
							}
							u = t;
						}
						return C[r >> 2] = u, 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return e.Pa;
					}
				},
				D: function(e, t, n, r) {
					t = -9007199254740992 > t || 9007199254740992 < t ? NaN : Number(t);
					try {
						if (isNaN(t)) return 61;
						var i = q(e);
						return st(i, t, n), w[r >> 3] = BigInt(i.position), i.rb && t === 0 && n === 0 && (i.rb = null), 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return e.Pa;
					}
				},
				I: function(e) {
					try {
						var t = q(e);
						return t.Ma?.fsync?.(t);
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return e.Pa;
					}
				},
				t: function(e, t, n, r) {
					try {
						a: {
							var i = q(e);
							e = t;
							for (var a, o = t = 0; o < n; o++) {
								var s = C[e >> 2], c = C[e + 4 >> 2];
								e += 8;
								var l = lt(i, y, s, c, a);
								if (0 > l) {
									var u = -1;
									break a;
								}
								if (t += l, l < c) break;
								a !== void 0 && (a += l);
							}
							u = t;
						}
						return C[r >> 2] = u, 0;
					} catch (e) {
						if (Y === void 0 || e.name !== "ErrnoError") throw e;
						return e.Pa;
					}
				},
				k: yt
			};
			function Bt() {
				function e() {
					if (o.calledRun = !0, !te) {
						if (!o.noFSInit && !je) {
							var e, t;
							je = !0, e ??= o.stdin, t ??= o.stdout, n ??= o.stderr, e ? dt("stdin", e) : Qe("/dev/tty", "/dev/stdin"), t ? dt("stdout", null, t) : Qe("/dev/tty", "/dev/stdout"), n ? dt("stderr", null, n) : Qe("/dev/tty1", "/dev/stderr"), at("/dev/stdin", 0), at("/dev/stdout", 1), at("/dev/stderr", 1);
						}
						if (Vt.N(), Me = !1, o.onRuntimeInitialized?.(), o.postRun) for (typeof o.postRun == "function" && (o.postRun = [o.postRun]); o.postRun.length;) {
							var n = o.postRun.shift();
							de.push(n);
						}
						O(de);
					}
				}
				if (0 < k) A = Bt;
				else {
					if (o.preRun) for (typeof o.preRun == "function" && (o.preRun = [o.preRun]); o.preRun.length;) pe();
					O(fe), 0 < k ? A = Bt : o.setStatus ? (o.setStatus("Running..."), setTimeout(() => {
						setTimeout(() => o.setStatus(""), 1), e();
					}, 1)) : e();
				}
			}
			var Vt;
			return (async function() {
				function e(e) {
					return e = Vt = e.exports, o._sqlite3_free = e.P, o._sqlite3_value_text = e.Q, o._sqlite3_prepare_v2 = e.R, o._sqlite3_step = e.S, o._sqlite3_reset = e.T, o._sqlite3_exec = e.U, o._sqlite3_finalize = e.V, o._sqlite3_column_name = e.W, o._sqlite3_column_text = e.X, o._sqlite3_column_type = e.Y, o._sqlite3_errmsg = e.Z, o._sqlite3_clear_bindings = e._, o._sqlite3_value_blob = e.$, o._sqlite3_value_bytes = e.aa, o._sqlite3_value_double = e.ba, o._sqlite3_value_int = e.ca, o._sqlite3_value_type = e.da, o._sqlite3_result_blob = e.ea, o._sqlite3_result_double = e.fa, o._sqlite3_result_error = e.ga, o._sqlite3_result_int = e.ha, o._sqlite3_result_int64 = e.ia, o._sqlite3_result_null = e.ja, o._sqlite3_result_text = e.ka, o._sqlite3_aggregate_context = e.la, o._sqlite3_column_count = e.ma, o._sqlite3_data_count = e.na, o._sqlite3_column_blob = e.oa, o._sqlite3_column_bytes = e.pa, o._sqlite3_column_double = e.qa, o._sqlite3_bind_blob = e.ra, o._sqlite3_bind_double = e.sa, o._sqlite3_bind_int = e.ta, o._sqlite3_bind_text = e.ua, o._sqlite3_bind_parameter_index = e.va, o._sqlite3_sql = e.wa, o._sqlite3_normalized_sql = e.xa, o._sqlite3_changes = e.ya, o._sqlite3_close_v2 = e.za, o._sqlite3_create_function_v2 = e.Aa, o._sqlite3_update_hook = e.Ba, o._sqlite3_open = e.Ca, Mt = o._malloc = e.Da, Nt = o._free = e.Ea, o._RegisterExtensionFunctions = e.Fa, Pt = e.Ga, Ft = e.Ha, It = e.Ia, Q = e.Ja, Lt = e.Ka, Rt = e.M, $ = e.O, se(), k--, o.monitorRunDependencies?.(k), k == 0 && A && (e = A, A = null, e()), Vt;
				}
				k++, o.monitorRunDependencies?.(k);
				var t = { a: zt };
				return o.instantiateWasm ? new Promise((n) => {
					o.instantiateWasm(t, (t, r) => {
						n(e(t, r));
					});
				}) : (ce ??= o.locateFile ? o.locateFile("sql-wasm.wasm", p) : p + "sql-wasm.wasm", e((await ue(t)).instance));
			})(), Bt(), i;
		}), n);
	};
	typeof e == "object" && typeof t == "object" ? (t.exports = r, t.exports.default = r) : typeof define == "function" && define.amd ? define([], function() {
		return r;
	}) : typeof e == "object" && (e.Module = r);
})))(), 1), ge = class {
	constructor(e) {
		this.dbPath = c.join(e, "iris.sqlite");
	}
	async init() {
		if (global.__dirname === void 0 && (global.__dirname = c.dirname(l(import.meta.url))), this.SQL = await (0, he.default)({ locateFile: (e) => c.join(global.__dirname, "../node_modules/sql.js/dist", e) }), g.existsSync(this.dbPath)) {
			console.log(`[ActivityStore] Loading existing database from ${this.dbPath}`);
			let e = g.readFileSync(this.dbPath);
			this.db = new this.SQL.Database(e);
		} else console.log(`[ActivityStore] Creating new database at ${this.dbPath}`), this.db = new this.SQL.Database();
		this.createSchema(), this.persist();
	}
	createSchema() {
		this.db.run("\n      CREATE TABLE IF NOT EXISTS sessions (\n        id TEXT PRIMARY KEY,\n        startTime INTEGER,\n        endTime INTEGER,\n        hostname TEXT,\n        platform TEXT,\n        eventCount INTEGER DEFAULT 0\n      );\n\n      CREATE TABLE IF NOT EXISTS events (\n        id TEXT PRIMARY KEY,\n        type TEXT,\n        source TEXT,\n        timestamp INTEGER,\n        duration INTEGER,\n        sessionId TEXT,\n        appName TEXT,\n        windowTitle TEXT,\n        payload TEXT,\n        FOREIGN KEY(sessionId) REFERENCES sessions(id)\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);\n      CREATE INDEX IF NOT EXISTS idx_events_session ON events(sessionId);\n    ");
	}
	saveSession(e) {
		let t = this.db.prepare("\n      INSERT OR REPLACE INTO sessions (id, startTime, endTime, hostname, platform, eventCount)\n      VALUES (?, ?, ?, ?, ?, ?)\n    ");
		t.run([
			e.id,
			e.startTime,
			e.endTime || null,
			e.hostname,
			e.platform,
			e.eventCount
		]), t.free(), this.persist();
	}
	saveEvent(e) {
		let t = e.payload.appName || e.payload.browser || "", n = e.payload.windowTitle || e.payload.title || "", r = this.db.prepare("\n      INSERT INTO events (id, type, source, timestamp, duration, sessionId, appName, windowTitle, payload)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ");
		r.run([
			e.id,
			e.type,
			e.source,
			e.timestamp,
			e.duration || null,
			e.sessionId,
			t,
			n,
			JSON.stringify(e.payload)
		]), r.free(), this.db.run("UPDATE sessions SET eventCount = eventCount + 1 WHERE id = ?", [e.sessionId]), this.persist();
	}
	getRecentEvents(e = 100) {
		let t = this.db.exec("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?", [e]);
		if (t.length === 0) return [];
		let n = t[0].columns;
		return t[0].values.map((e) => {
			let t = {};
			return n.forEach((n, r) => t[n] = e[r]), {
				id: t.id,
				type: t.type,
				source: t.source,
				timestamp: t.timestamp,
				duration: t.duration,
				sessionId: t.sessionId,
				payload: JSON.parse(t.payload)
			};
		});
	}
	persist() {
		try {
			let e = this.db.export(), t = Buffer.from(e);
			g.writeFileSync(this.dbPath, t);
		} catch (e) {
			console.error("[ActivityStore] Failed to persist database:", e);
		}
	}
	close() {
		this.db && this.db.close();
	}
};
//#endregion
//#region electron/main.ts
O();
var N = s.dirname(l(import.meta.url)), P = null, F = null, I = null, _e = !1, ve = !1, L = null, ye = null;
n.disableHardwareAcceleration();
function R() {
	P = new t({
		width: 1e3,
		height: 700,
		webPreferences: {
			preload: s.join(N, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0
		}
	}), n.isPackaged ? P.loadFile(s.join(N, "../dist/index.html"), { hash: "/" }) : P.loadURL("http://localhost:5173/#/"), P.on("closed", () => {
		P = null;
	});
}
function be() {
	let { width: e, height: r } = a.getPrimaryDisplay().workAreaSize;
	I = new t({
		width: e,
		height: r,
		x: 0,
		y: 0,
		show: !1,
		frame: !1,
		transparent: !0,
		alwaysOnTop: !0,
		skipTaskbar: !0,
		movable: !1,
		resizable: !1,
		webPreferences: {
			nodeIntegration: !0,
			contextIsolation: !1
		}
	}), I.setIgnoreMouseEvents(!0, { forward: !0 }), n.isPackaged ? I.loadFile(s.join(N, "../dist/overlay.html")) : I.loadURL("http://localhost:5173/overlay.html");
}
function z() {
	let { width: e, height: r } = a.getPrimaryDisplay().workAreaSize;
	F = new t({
		width: e,
		height: r,
		x: 0,
		y: 0,
		frame: !1,
		transparent: !0,
		skipTaskbar: !0,
		alwaysOnTop: !0,
		show: !1,
		webPreferences: {
			preload: s.join(N, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0
		}
	}), n.isPackaged ? F.loadFile(s.join(N, "../dist/index.html"), { hash: "/search" }) : F.loadURL("http://localhost:5173/#/search"), F.on("blur", () => {
		_e || (F?.webContents.executeJavaScript("window.dispatchEvent(new Event('electron-window-hidden'))").catch(console.error), setTimeout(() => {
			F?.hide();
		}, 50));
	}), F.on("closed", () => {
		F = null;
	});
}
n.whenReady().then(async () => {
	R(), z(), be();
	try {
		ye = new ge(n.getPath("userData")), await ye.init(), L = new me(ye), await L.start();
	} catch (e) {
		console.error("[IRIS] Engine failed to start fully:", e);
	}
	D.getInstance().onActivity((e) => {
		P && !P.isDestroyed() && P.webContents.send("activity-event", e);
	}), D.getInstance().on("ui-workflow-update", (e) => {
		P && !P.isDestroyed() && P.webContents.send("workflow-update", e);
	}), D.getInstance().on("resume-sequence", (e) => {
		I && !I.isDestroyed() && (e.type === "start" && (I.setAlwaysOnTop(!0, "screen-saver"), I.showInactive()), I.webContents.send("resume-sequence", e), e.type === "complete" && setTimeout(() => {
			I && !I.isDestroyed() && I.hide();
		}, 4e3));
	}), r.register("CommandOrControl+K", () => {
		F && (F.isVisible() ? (F.webContents.executeJavaScript("window.dispatchEvent(new Event('electron-window-hidden'))").catch(console.error), ve || setTimeout(() => {
			F?.hide();
		}, 50)) : (F.show(), F.focus(), F.webContents.executeJavaScript("window.dispatchEvent(new Event('electron-window-shown'))").catch(console.error)));
	}) || console.log("registration failed"), n.on("activate", () => {
		t.getAllWindows().length === 0 && (R(), z());
	});
}), n.on("window-all-closed", () => {
	process.platform !== "darwin" && n.quit();
}), n.on("will-quit", () => {
	r.unregisterAll(), L && L.stop(), ye && ye.close();
}), i.on("hide-window", () => {
	F && !ve && F.hide();
}), i.on("set-has-pipelines", (e, t) => {
	ve = t;
}), i.on("set-click-through", (e, t) => {
	F && F.setIgnoreMouseEvents(t, { forward: !0 });
}), i.on("set-ignore-blur", (e, t) => {
	_e = t;
}), i.handle("read-workspace-files", async () => {
	let e = process.cwd(), t = [];
	function n(e, t) {
		let n = [], r = "";
		for (let i of e.split("\n")) (r + "\n" + i).length > t ? (r.trim() && n.push(r.trim()), r = i) : r += (r ? "\n" : "") + i;
		return r.trim() && n.push(r.trim()), n;
	}
	function r(e) {
		if (h.existsSync(e)) for (let i of h.readdirSync(e)) {
			let a = s.join(e, i);
			try {
				if (h.statSync(a).isDirectory()) !i.startsWith(".") && i !== "node_modules" && i !== "dist" && i !== "dist-electron" && r(a);
				else {
					let e = s.extname(i).toLowerCase();
					if ([
						".md",
						".txt",
						".ts",
						".tsx",
						".json",
						".css"
					].includes(e)) {
						let e = h.readFileSync(a, "utf-8");
						if (e.trim()) {
							let r = n(e, 500);
							for (let e of r) t.push({
								filePath: a,
								text: e
							});
						}
					}
				}
			} catch {}
		}
	}
	return r(e), t;
}), i.handle("save-semantic-index", async (e, t) => (h.writeFileSync(s.join(process.cwd(), ".iris_semantic_index.json"), JSON.stringify(t), "utf-8"), !0)), i.handle("load-semantic-index", async () => {
	let e = s.join(process.cwd(), ".iris_semantic_index.json");
	return h.existsSync(e) ? JSON.parse(h.readFileSync(e, "utf-8")) : [];
}), i.handle("search-memory", async (e, t) => L ? await L.searchMemory(t) : []), i.handle("resume-workflow", async (e, t) => {
	L && await L.resumeWorkflow(t);
});
//#endregion
export {};
