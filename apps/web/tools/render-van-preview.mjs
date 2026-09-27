// Renders tools/render-van-preview.jsx to HTML (esbuild) then to PNG with headless Chrome.
// node tools/render-van-preview.mjs [view.png] [edit.png]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outs = {
  view: path.resolve(process.argv[2] || '/workspace/fleet-van-preview.png'),
  edit: path.resolve(process.argv[3] || '/workspace/fleet-van-edit-preview.png'),
};
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
const chrome = process.env.CHROME || 'google-chrome';
for (const [mode, out] of Object.entries(outs)) {
  const html = execFileSync(process.execPath, [bundle, mode]).toString();
  const htmlFile = path.join(dir, `van-${mode}.html`);
  writeFileSync(htmlFile, html);
  execFileSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${out}`, '--window-size=1200,1120', `file://${htmlFile}`,
  ], { stdio: 'ignore' });
  console.log(out);
}
