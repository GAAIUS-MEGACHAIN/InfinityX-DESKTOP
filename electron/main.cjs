const { app, BrowserWindow, Menu } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

let backendProcess = null;
let backendUrl = "http://127.0.0.1:8787";

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

async function startBackend() {
  if (backendProcess) return backendUrl;
  const candidate = backendCandidates().find((item) => item.command === "python" || fs.existsSync(item.command));
  if (!candidate) return backendUrl;
  const port = await findOpenPort(8787, 40);
  backendUrl = `http://127.0.0.1:${port}`;
  backendProcess = spawn(candidate.command, candidate.args, {
    env: {
      ...process.env,
      INFINITYX_HOST: "127.0.0.1",
      INFINITYX_PORT: String(port),
      INFINITYX_DATA_DIR: candidate.dataDir
    },
    stdio: "ignore",
    windowsHide: true
  });
  backendProcess.on("exit", () => {
    backendProcess = null;
  });
  return backendUrl;
}

function stopBackend() {
  if (!backendProcess) return;
  backendProcess.kill();
  backendProcess = null;
}

function createWindow(activeBackendUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: "InfinityX Wallet",
    backgroundColor: "#eef4f1",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
    query: { backend: activeBackendUrl }
  });
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
    win.focus();
  });
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.maximize();
      win.show();
      win.focus();
    }
  }, 5000);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const activeBackendUrl = await startBackend();
  createWindow(activeBackendUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(backendUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackend);

function findOpenPort(startPort, attempts) {
  const checks = [];
  for (let port = startPort; port < startPort + attempts; port += 1) checks.push(port);
  return checks.reduce(
    (promise, port) => promise.catch(() => portIsOpen(port).then(() => port)),
    Promise.reject(new Error("No port checked yet"))
  );
}

function portIsOpen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => {
      server.close(() => resolve(port));
    });
    server.listen(port, "127.0.0.1");
  });
}
