// Renders tools/render-catalog-preview.jsx (Flotte › Articles) to PNG with headless Chrome,
// using the Tailwind CSS of the last build (run `npm run build` first).
// node tools/render-catalog-preview.mjs [out.png]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../src');
const out = path.resolve(process.argv[2] || '/workspace/fleet-articles-preview.png');
const assets = path.resolve(here, '../../../dist/apps/web/assets');
const css = readdirSync(assets)
  .filter((f) => /^index-.*\.css$/.test(f))
  .sort((a, b) => statSync(path.join(assets, b)).mtimeMs - statSync(path.join(assets, a)).mtimeMs)[0];
if (!css) throw new Error('Run npm run build first (no dist CSS found)');
const dir = mkdtempSync(path.join(tmpdir(), 'catalog-'));
const bundle = path.join(dir, 'render.cjs');
const aliasPlugin = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/customSupabaseClient/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};', loader: 'js' }));
    b.onResolve({ filter: /^@\// }, async (args) =>
      b.resolve(`./${args.path.slice(2)}`, { resolveDir: src, kind: args.kind })
    );
  },
};
await build({
  entryPoints: [path.join(here, 'render-catalog-preview.jsx')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundle,
  jsx: 'automatic',
  logLevel: 'error',
  plugins: [aliasPlugin],
});
// CSS is inlined (external font/url() lookups can stall headless Chrome on file://).
const cssText = readFileSync(path.join(assets, css), 'utf8').replace(/url\([^)]*\)/g, 'none');
const html = execFileSync(process.execPath, [bundle]).toString().replace('<!--CSS-->', `<style>${cssText}</style>`);
const htmlFile = path.join(dir, 'catalog.html');
writeFileSync(htmlFile, html);
execFileSync(process.env.CHROME || 'google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--virtual-time-budget=3000', `--screenshot=${out}`, '--window-size=1150,1180', `file://${htmlFile}`,
], { stdio: 'ignore', timeout: 60000 });
console.log(out);
