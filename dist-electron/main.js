import { BrowserWindow as e, app as t, globalShortcut as n, ipcMain as r, screen as i } from "electron";
import * as a from "path";
import { fileURLToPath as o } from "url";
import * as s from "fs";
//#region electron/main.ts
var c = a.dirname(o(import.meta.url)), l = null, u = null;
function d() {
	l = new e({
		width: 1e3,
		height: 700,
		webPreferences: {
			preload: a.join(c, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0
		}
	}), t.isPackaged ? l.loadFile(a.join(c, "../dist/index.html"), { hash: "/" }) : l.loadURL("http://localhost:5173/#/"), l.on("closed", () => {
		l = null;
	});
}
function f() {
	let { width: n, height: r } = i.getPrimaryDisplay().workAreaSize;
	u = new e({
		width: n,
		height: r,
		x: 0,
		y: 0,
		frame: !1,
		transparent: !0,
		skipTaskbar: !0,
		alwaysOnTop: !0,
		show: !1,
		webPreferences: {
			preload: a.join(c, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0
		}
	}), t.isPackaged ? u.loadFile(a.join(c, "../dist/index.html"), { hash: "/search" }) : u.loadURL("http://localhost:5173/#/search"), u.on("blur", () => {
		u?.webContents.executeJavaScript("window.dispatchEvent(new Event('electron-window-hidden'))").catch(console.error), setTimeout(() => {
			u?.hide();
		}, 50);
	}), u.on("closed", () => {
		u = null;
	});
}
t.whenReady().then(() => {
	d(), f(), n.register("CommandOrControl+K", () => {
		u && (u.isVisible() ? (u.webContents.executeJavaScript("window.dispatchEvent(new Event('electron-window-hidden'))").catch(console.error), setTimeout(() => {
			u?.hide();
		}, 50)) : (u.show(), u.focus(), u.webContents.executeJavaScript("window.dispatchEvent(new Event('electron-window-shown'))").catch(console.error)));
	}) || console.log("registration failed"), t.on("activate", () => {
		e.getAllWindows().length === 0 && (d(), f());
	});
}), t.on("window-all-closed", () => {
	process.platform !== "darwin" && t.quit();
}), t.on("will-quit", () => {
	n.unregisterAll();
}), r.on("hide-window", () => {
	u && (u.blur(), u.hide());
}), r.on("set-click-through", (e, t) => {
	u && (t ? u.setIgnoreMouseEvents(!0, { forward: !0 }) : u.setIgnoreMouseEvents(!1));
}), r.handle("read-workspace-files", async () => {
	let e = process.cwd(), t = [];
	function n(e, t) {
		let n = [], r = "";
		for (let i of e.split("\n")) (r + "\n" + i).length > t ? (r.trim() && n.push(r.trim()), r = i) : r += (r ? "\n" : "") + i;
		return r.trim() && n.push(r.trim()), n;
	}
	function r(e) {
		if (s.existsSync(e)) for (let i of s.readdirSync(e)) {
			let o = a.join(e, i);
			try {
				if (s.statSync(o).isDirectory()) !i.startsWith(".") && i !== "node_modules" && i !== "dist" && i !== "dist-electron" && r(o);
				else {
					let e = a.extname(i).toLowerCase();
					if ([
						".md",
						".txt",
						".ts",
						".tsx",
						".json",
						".css"
					].includes(e)) {
						let e = s.readFileSync(o, "utf-8");
						if (e.trim()) {
							let r = n(e, 500);
							for (let e of r) t.push({
								filePath: o,
								text: e
							});
						}
					}
				}
			} catch {}
		}
	}
	return r(e), t;
}), r.handle("save-semantic-index", async (e, t) => (s.writeFileSync(a.join(process.cwd(), ".iris_semantic_index.json"), JSON.stringify(t), "utf-8"), !0)), r.handle("load-semantic-index", async () => {
	let e = a.join(process.cwd(), ".iris_semantic_index.json");
	return s.existsSync(e) ? JSON.parse(s.readFileSync(e, "utf-8")) : [];
});
//#endregion
export {};
