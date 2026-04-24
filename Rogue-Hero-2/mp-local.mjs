// mp-local.mjs — launch N isolated Chrome windows pointed at the dev server
// so you can pretend to be up to 4 remote-coop peers on a single machine.
// Each window gets its own --user-data-dir, which means an independent
// localStorage (save / unlocks / cosmetics) and an independent WebRTC
// identity — required for the four peers to see each other as distinct.
//
// Usage:
//   npm run mp            # 4 windows, default http://localhost:8000
//   npm run mp -- 2       # 2 windows instead of 4
//   npm run mp -- 4 9000  # 4 windows pointed at http://localhost:9000
//
// Start the server separately (`npm run serve` or `python -m http.server 8000`).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

const args   = process.argv.slice(2);
const count  = Math.max(1, Math.min(8, parseInt(args[0], 10) || 4));
const port   = parseInt(args[1], 10) || 8000;
const url    = `http://localhost:${port}`;

// Tile windows in a 2-column grid at 960×540 so four fit on a 1920×1080.
const W = 960, H = 540;

function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const plat = platform();
  const candidates = plat === 'win32' ? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ] : plat === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  return candidates.find(p => existsSync(p));
}

const browser = resolveChrome();
if (!browser) {
  console.error('[mp-local] Could not find Chrome or Edge. Set CHROME_PATH to the binary and retry.');
  process.exit(1);
}

console.log(`[mp-local] Launching ${count} window(s) against ${url}`);
console.log(`[mp-local] Using: ${browser}`);

for (let i = 0; i < count; i++) {
  const profile = join(tmpdir(), `rh2-mp-p${i + 1}`);
  if (!existsSync(profile)) mkdirSync(profile, { recursive: true });
  const col = i % 2, row = Math.floor(i / 2);
  const child = spawn(browser, [
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    `--window-position=${col * W},${row * H}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=ChromeWhatsNewUI',
    url,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  console.log(`[mp-local] peer ${i + 1} → profile ${profile} at (${col * W},${row * H})`);
}

console.log(`[mp-local] Done. First window = host. Copy its 6-char code into the other ${count - 1}.`);
