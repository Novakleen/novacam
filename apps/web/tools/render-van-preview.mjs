// Renders tools/render-van-preview.jsx to HTML (esbuild) then to PNG with headless Chrome.
// node tools/render-van-preview.mjs [out.png]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || '/workspace/fleet-van-preview.png');
const dir = mkdtempSync(path.join(tmpdir(), 'van-'));
const bundle = path.join(dir, 'render.cjs');
await build({
  entryPoints: [path.join(here, 'render-van-preview.jsx')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundle,
  jsx: 'automatic',
  logLevel: 'error',
});
const html = execFileSync(process.execPath, [bundle]).toString();
const htmlFile = path.join(dir, 'van.html');
writeFileSync(htmlFile, html);
const chrome = process.env.CHROME || 'google-chrome';
execFileSync(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--screenshot=${out}`, '--window-size=1200,1120', `file://${htmlFile}`,
], { stdio: 'ignore' });
console.log(out);
