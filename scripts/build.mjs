// Minimal build/dev script on top of esbuild (no other build tooling required).
//   node scripts/build.mjs           -> production build into dist/
//   node scripts/build.mjs --serve   -> dev server with rebuild on change (http://localhost:5173)
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const serve = args.has('--serve');
const prod = !serve || args.has('--prod');
const outdir = 'dist';

const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  outdir: `${outdir}/assets`,
  entryNames: prod && !serve ? 'app-[hash]' : 'app',
  sourcemap: prod ? false : 'inline',
  minify: prod,
  jsx: 'automatic',
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'), __PROD__: JSON.stringify(prod && !serve) },
  metafile: true,
  logLevel: 'info',
};

async function writeHtml(jsFile, cssFile) {
  const tpl = await readFile('public/index.html', 'utf8');
  const html = tpl
    .replace('%CSS%', cssFile ? `<link rel="stylesheet" href="./assets/${cssFile}">` : '')
    .replace('%JS%', `<script type="module" src="./assets/${jsFile}"></script>`);
  await writeFile(`${outdir}/index.html`, html);
}

async function copyStatic() {
  await cp('public', outdir, { recursive: true, filter: (src) => !src.endsWith('index.html') });
  await cp('sample-data', `${outdir}/sample-data`, { recursive: true });
}

function outputNames(metafile) {
  const outs = Object.keys(metafile.outputs).map((p) => p.split('/').pop());
  return { js: outs.find((f) => f.endsWith('.js')), css: outs.find((f) => f.endsWith('.css')) };
}

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });
await copyStatic();

if (serve) {
  const htmlPlugin = {
    name: 'html',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.metafile) {
          const { js, css } = outputNames(result.metafile);
          await writeHtml(js, css);
        }
      });
    },
  };
  const ctx = await esbuild.context({ ...options, plugins: [htmlPlugin] });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: 5173 });
  console.log(`\n  TTSuite läuft auf http://localhost:${port}\n`);
} else {
  const result = await esbuild.build(options);
  const { js, css } = outputNames(result.metafile);
  await writeHtml(js, css);
  // Service worker for offline use: cache list includes hashed bundle names.
  const sw = (await readFile('src/storage/sw-template.js', 'utf8'))
    .replace('__ASSETS__', JSON.stringify(['./', './index.html', `./assets/${js}`, css ? `./assets/${css}` : null, './favicon.svg', './manifest.webmanifest'].filter(Boolean)))
    .replace('__VERSION__', createHash('sha1').update(js + (css ?? '')).digest('hex').slice(0, 10));
  await writeFile(`${outdir}/sw.js`, sw);
  console.log(`Build fertig: ${outdir}/ (${js}${css ? ', ' + css : ''})`);
}
