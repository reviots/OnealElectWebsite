import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PUPPETEER_ROOT = 'C:/Users/nateh/AppData/Local/Temp/puppeteer-test/';
const OUT_DIR = resolve('./temporary screenshots');

async function resolvePuppeteer() {
  try { return (await import('puppeteer')).default; } catch {}
  const candidates = [
    `${PUPPETEER_ROOT}node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js`,
    `${PUPPETEER_ROOT}node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js`,
  ];
  for (const p of candidates) {
    try { const m = await import(p); return m.default ?? m; } catch {}
  }
  throw new Error('puppeteer not found — install with `npm i puppeteer` in project or at ' + PUPPETEER_ROOT);
}

async function nextIndex(label) {
  await mkdir(OUT_DIR, { recursive: true });
  const files = await readdir(OUT_DIR);
  const nums = files
    .map(f => /^screenshot-(\d+)/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

async function main() {
  const url = process.argv[2] || 'http://localhost:3000';
  const label = process.argv[3];

  const puppeteer = await resolvePuppeteer();
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });

  // Trigger scroll-reveal observers by scrolling through the entire page.
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const total = document.documentElement.scrollHeight;
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= total; y += step) {
      window.scrollTo(0, y);
      await sleep(90);
    }
    window.scrollTo(0, 0);
    await sleep(400);
    // Belt-and-suspenders: force any lingering reveals to their visible state.
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    await sleep(200);
  });

  const n = await nextIndex(label);
  const name = label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`;
  const path = resolve(OUT_DIR, name);
  const full = process.argv.includes('--viewport') ? false : true;
  // Optional: --at=<selector> scrolls that section into view before a viewport shot.
  const atArg = process.argv.find(a => a.startsWith('--at='));
  if (atArg && !full) {
    const sel = atArg.slice(5);
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, sel);
    await new Promise(r => setTimeout(r, 400));
  }
  await page.screenshot({ path, fullPage: full });
  console.log('saved', path);

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
