const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("biology", {
  call: (action, args = {}) => ipcRenderer.invoke("biology:call", action, args),
  onChange: (callback) => { const listener = () => callback(); ipcRenderer.on("biology:change", listener); return () => ipcRenderer.removeListener("biology:change", listener); },
  onTerminal: (callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on("biology:terminal", listener); return () => ipcRenderer.removeListener("biology:terminal", listener); },
  terminalInput: (data) => ipcRenderer.send("biology:terminal-input", data),
  terminalResize: (cols, rows) => ipcRenderer.send("biology:terminal-resize", cols, rows),
});
