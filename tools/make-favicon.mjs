// Render brand_assets/favicon.svg → favicon.ico (32×32) + apple-touch-icon.png (180×180)
// Uses puppeteer for rasterization; writes a valid ICO container wrapping a PNG frame.
import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve('./brand_assets');
const SVG_PATH = resolve(OUT_DIR, 'favicon.svg');

function pngToIco(pngBuffer, size) {
  const icondir = Buffer.alloc(6);
  icondir.writeUInt16LE(0, 0);  // reserved
  icondir.writeUInt16LE(1, 2);  // type: ICO
  icondir.writeUInt16LE(1, 4);  // num images

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2);                       // palette colors
  entry.writeUInt8(0, 3);                       // reserved
  entry.writeUInt16LE(1, 4);                    // planes
  entry.writeUInt16LE(32, 6);                   // bpp
  entry.writeUInt32LE(pngBuffer.length, 8);     // bytes
  entry.writeUInt32LE(6 + 16, 12);              // offset

  return Buffer.concat([icondir, entry, pngBuffer]);
}

async function renderSvgToPng(svg, size) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent;}
    svg{display:block;width:${size}px;height:${size}px;}
  </style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const buf = await page.screenshot({ type: 'png', omitBackground: true });
  await browser.close();
  return buf;
}

async function main() {
  const svg = (await readFile(SVG_PATH, 'utf8')).trim();

  const png32  = await renderSvgToPng(svg, 32);
  const png180 = await renderSvgToPng(svg, 180);

  const ico = pngToIco(png32, 32);
  await writeFile(resolve(OUT_DIR, 'favicon.ico'), ico);
  await writeFile(resolve(OUT_DIR, 'apple-touch-icon.png'), png180);

  console.log(`wrote favicon.ico (${ico.length}B), apple-touch-icon.png (${png180.length}B)`);
}

main().catch(err => { console.error(err); process.exit(1); });
