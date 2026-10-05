/**
 * Founder OS - desktop shell.
 *
 * The app is a Next.js server plus a browser. Rather than shipping a separate
 * server binary, this main process boots the same `next start` the CLI runs and
 * points a native BrowserWindow at it, so the OS shows up as an ordinary desktop
 * program: its own taskbar entry, its own window, its own menu, no browser
 * chrome or address bar.
 *
 * Responsibilities, in order:
 *   1. claim a free port, so a `next dev` on 4100 can run alongside the app
 *   2. spawn the Next server and wait until it actually answers
 *   3. show the window (after a themed splash, so boot never flashes white)
 *   4. own the child's lifetime, so quitting the window stops the server
 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

// The repo root is this file's parent directory (desktop/main.cjs -> repo).
const repoRoot = path.join(__dirname, '..');
const isDev = process.argv.includes('--dev');

/**
 * `--shot <file.png>` captures the rendered window and exits.
 *
 * Useful for verifying the shell without a human at the screen: the proof is
 * written to disk, so it survives even if the session ends right afterwards.
 */
const shotArg = process.argv.indexOf('--shot');
const shotPath = shotArg !== -1 ? process.argv[shotArg + 1] : null;

/** Set by the preload; lets the renderer ask the main process to quit cleanly. */
let mainWindow = null;
let serverProcess = null;
let serverPort = null;

/* ------------------------------------------------------------------ helpers */

/** Ask the OS for an unused port, then release it for Next to bind. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Poll the server until it serves the app shell, or give up. */
function waitForServer(port, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/', timeout: 10_000 },
        (res) => {
          // Drain the body so the socket can be reused.
          res.resume();
          // Require a real 200. Next answers 500 when a module fails to load
          // (a native-module ABI mismatch, say), and accepting that would open
          // a window onto an error page and call it success.
          if (res.statusCode === 200) resolve();
          else retry(new Error(`server answered ${res.statusCode}`));
        }
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry(new Error('server timed out'));
      });
    };
    const retry = (err) => {
      if (Date.now() > deadline) reject(err);
      else setTimeout(attempt, 1500);
    };
    attempt();
  });
}

/**
 * Locate a real Node runtime to host the Next server.
 *
 * This must NOT be Electron's own runtime. better-sqlite3 ships a compiled
 * addon built for Node's ABI (NODE_MODULE_VERSION 127 on Node 22); Electron
 * embeds a different one (130), so loading the database inside
 * ELECTRON_RUN_AS_NODE dies with ERR_DLOPEN_FAILED. Hosting the server under
 * the same Node the app was installed with keeps the native modules valid, and
 * leaves `npm run dev` / `npm start` working against the identical tree.
 */
function resolveNodeBinary() {
  if (process.env.FOUNDER_OS_NODE && fs.existsSync(process.env.FOUNDER_OS_NODE)) {
    return process.env.FOUNDER_OS_NODE;
  }
  try {
    const found = execFileSync('where.exe', ['node'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    // Skip anything that is this Electron build masquerading as node.
    const real = found.find((p) => !/electron/i.test(p) && fs.existsSync(p));
    if (real) return real;
  } catch {
    /* fall through to the error below */
  }
  throw new Error(
    'Could not find a Node.js executable to run the Founder OS server.\n' +
      'Install Node 22 and reopen the app, or set FOUNDER_OS_NODE to the full\n' +
      'path of node.exe.'
  );
}

/** Themed boot screen, shown until the first paint of the real app. */
function splashHtml(status) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;background:#0a0a0a;color:#e8e8e8;
    font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  h1{font-size:13px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;
     color:#fafafa;margin:0 0 14px}
  p{margin:0;color:#8a8a8a;font-size:12px}
  .bar{margin:22px auto 0;width:190px;height:2px;background:#1e1e1e;overflow:hidden}
  .bar i{display:block;width:40%;height:100%;background:#fafafa;
    animation:sweep 1.15s cubic-bezier(.32,.72,0,1) infinite}
  @keyframes sweep{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
</style></head><body><div class="wrap">
  <h1>Founder OS</h1><p>${status}</p><div class="bar"><i></i></div>
</div></body></html>`;
}

/* ------------------------------------------------------------- the Next server */

/**
 * Start `next start` (or `next dev` with --dev) as a child process.
 *
 * ELECTRON_RUN_AS_NODE makes electron.exe behave as a plain Node runtime, so
 * the desktop app does not need a separate node.exe on PATH.
 *
 * Two environment details are load-bearing:
 *   - DATA_DIR: lib/paths.ts puts the SQLite file in <cwd>/data, which is not
 *     writable once the app is installed under Program Files. Pointing it at
 *     Electron's userData keeps the seeded database in a writable location.
 *   - --max-old-space-size: without a heap cap this app's larger routes push
 *     V8 past available RAM and the server is killed outright, with no error.
 */
async function startServer() {
  serverPort = await findFreePort();

  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextBin)) {
    throw new Error(
      `Next.js is not installed at ${nextBin}.\n` +
        `Run "npm install" in ${repoRoot} first.`
    );
  }
  const hasBuild = fs.existsSync(path.join(repoRoot, '.next', 'BUILD_ID'));

  const args = isDev
    ? [nextBin, 'dev', '-p', String(serverPort)]
    : [nextBin, 'start', '-p', String(serverPort)];
  if (!isDev && !hasBuild) {
    throw new Error(
      `No production build found at ${path.join(repoRoot, '.next')}.\n` +
        `Run "npm run build" in ${repoRoot}, or launch with: npm run desktop:dev`
    );
  }

  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const nodeBin = resolveNodeBinary();
  console.log(`[server] node: ${nodeBin}`);

  serverProcess = spawn(nodeBin, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: String(serverPort),
      DATA_DIR: dataDir,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=2048']
        .filter(Boolean)
        .join(' '),
      // The demo has no live integrations configured; skipping the boot
      // timers keeps the window responsive and the log quiet.
      FOUNDER_OS_SKIP_WARMUP: '1',
      FOUNDER_OS_DISABLE_CRON: '1',
      FOUNDER_OS_DISABLE_FAILOVER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const relay = (stream, label) => {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) console.log(`[server:${label}] ${line.trim()}`);
      }
    });
  };
  relay(serverProcess.stdout, 'out');
  relay(serverProcess.stderr, 'err');

  serverProcess.on('exit', (code, signal) => {
    console.log(`[server] exited code=${code} signal=${signal}`);
    serverProcess = null;
  });

  await waitForServer(serverPort);
  console.log(`[server] ready on http://127.0.0.1:${serverPort}`);
  return serverPort;
}

/** Stop the Next server, escalating to a hard kill if it ignores the ask. */
function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      if (child.exitCode === null) child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }, 4000).unref?.();
}

/* -------------------------------------------------------------- the window */

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        {
          label: 'Open in Browser',
          click: () => shell.openExternal(`http://127.0.0.1:${serverPort}`),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  // Fit the work area rather than trusting a fixed size: a 1440x900 default is
  // larger than a 1366x768 laptop screen, and an oversized window opens partly
  // off-screen with no way to reach the title bar.
  const { screen } = require('electron');
  const work = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1440, work.width),
    height: Math.min(900, work.height),
    minWidth: Math.min(1024, work.width),
    minHeight: Math.min(680, work.height),
    // Matches the default "mono" theme background so there is no flash
    // between the splash and the first painted frame.
    backgroundColor: '#0a0a0a',
    title: 'Founder OS',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // This app is a single local surface; anything else belongs in the real
  // browser, and in-window navigation away from the server would strand the user
  // on a blank frame.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/** Swap the boot screen for the live app once the server answers. */
function showApp(window) {
  buildMenu();
  serverPort && window.loadURL(`http://127.0.0.1:${serverPort}`);

  if (shotPath) {
    // Wait for the app to actually paint before capturing, so the shot shows
    // the UI rather than a blank frame.
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await window.webContents.capturePage();
          const png = image.toPNG();
          fs.writeFileSync(shotPath, png);
          // capturePage resolves even when the window is occluded or not yet
          // composited, and an empty buffer writes a 0-byte file that reads as
          // a corrupt PNG. Fail loudly instead of leaving that behind.
          const bytes = fs.statSync(shotPath).size;
          if (bytes < 1024) {
            console.error(`[shot] capture was empty (${bytes} bytes) at ${shotPath}`);
          } else {
            console.log(`[shot] saved ${shotPath} (${Math.round(bytes / 1024)} KB)`);
          }
        } catch (err) {
          console.error('[shot] failed:', err);
        }
        stopServer();
        app.quit();
      }, 6000);
    });
  }
}

/* ------------------------------------------------------------- app lifecycle */

// Two copies of the OS would fight over the same SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // The renderer's only privileged request: close the app the same way the
    // window close button does, so the Next server is never orphaned.
    ipcMain.on('app:quit', () => {
      stopServer();
      app.quit();
    });

    // Show the boot screen immediately, then swap the *same* window over to the
    // app once the server answers. An earlier version opened a splash window and
    // destroyed it before opening the real one; in the gap there were zero
    // windows, Electron fired window-all-closed, and the app quit itself.
    mainWindow = createWindow();
    mainWindow.setTitle('Founder OS');
    mainWindow.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml('starting the engine'))
    );

    try {
      await startServer();
      // Grow from the splash card to the full app window, then load.
      mainWindow.setMinimumSize(Math.min(1024, mainWindow.getBounds().width), 0);
      mainWindow.setSize(
        Math.min(1440, require('electron').screen.getPrimaryDisplay().workAreaSize.width),
        Math.min(900, require('electron').screen.getPrimaryDisplay().workAreaSize.height)
      );
      mainWindow.center();
      showApp(mainWindow);
    } catch (err) {
      dialog.showErrorBox('Founder OS could not start', String(err?.message || err));
      stopServer();
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Close the window => quit on every platform (this is an app, not a
  // document), and never leave an orphaned Next server holding the DB.
  app.on('window-all-closed', () => {
    stopServer();
    app.quit();
  });

  app.on('before-quit', stopServer);
  process.on('exit', stopServer);
  process.on('SIGINT', () => {
    stopServer();
    app.quit();
  });
}