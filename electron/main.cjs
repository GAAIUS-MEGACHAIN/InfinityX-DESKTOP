const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let backendProcess = null;

function backendCandidates() {
  const resources = process.resourcesPath;
  return [
    {
      command: path.join(resources, "backend", "infinityx_backend.exe"),
      args: [],
      dataDir: path.join(resources, "backend", "data")
    },
    {
      command: path.join(__dirname, "..", "backend-dist", "infinityx_backend.exe"),
      args: [],
      dataDir: path.join(__dirname, "..", "backend-dist", "data")
    },
    {
      command: "python",
      args: [path.join(__dirname, "..", "backend", "infinityx_backend.py")],
      dataDir: path.join(__dirname, "..", "backend", "data")
    }
  ];
}

function startBackend() {
  if (backendProcess) return;
  const candidate = backendCandidates().find((item) => item.command === "python" || fs.existsSync(item.command));
  if (!candidate) return;
  backendProcess = spawn(candidate.command, candidate.args, {
    env: {
      ...process.env,
      INFINITYX_HOST: "127.0.0.1",
      INFINITYX_PORT: "8787",
      INFINITYX_DATA_DIR: candidate.dataDir
    },
    stdio: "ignore",
    windowsHide: true
  });
  backendProcess.on("exit", () => {
    backendProcess = null;
  });
}

function stopBackend() {
  if (!backendProcess) return;
  backendProcess.kill();
  backendProcess = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "InfinityX Wallet",
    backgroundColor: "#eef4f1",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackend);
