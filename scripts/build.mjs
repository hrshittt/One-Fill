// One-Fill build script.
//   node scripts/build.mjs               → development build into dist/
//   node scripts/build.mjs --watch       → development build + rebuild on change
//   node scripts/build.mjs --production  → minified build without source maps
//   node scripts/build.mjs --e2e         → test build in dist-e2e/ (host access + test hooks; never ship this)
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const isWatch = args.has('--watch');
const isProduction = args.has('--production');
const isE2E = args.has('--e2e');
const dist = path.join(root, isE2E ? 'dist-e2e' : 'dist');

/** Entry points: source → output path inside dist (without extension; .js/.css is added). */
const entryPoints = [
  { in: 'src/background/service-worker.ts', out: 'background' },
  { in: 'src/content/content.ts', out: 'content' },
  { in: 'src/popup/popup.ts', out: 'popup/popup' },
  { in: 'src/popup/popup.css', out: 'popup/popup' },
  { in: 'src/options/options.ts', out: 'options/options' },
  { in: 'src/options/options.css', out: 'options/options' },
  { in: 'src/privacy/privacy.ts', out: 'privacy/privacy' },
  { in: 'src/privacy/privacy.css', out: 'privacy/privacy' },
];

/** Static files copied verbatim: source → destination inside dist. */
const staticFiles = [
  ['src/popup/popup.html', 'popup/popup.html'],
  ['src/options/options.html', 'options/options.html'],
  ['src/privacy/privacy.html', 'privacy/privacy.html'],
  ['assets/icons', 'icons'],
];

async function copyStatic() {
  for (const [from, to] of staticFiles) {
    const src = path.join(root, from);
    if (!existsSync(src)) {
      console.warn(`[build] missing static file: ${from}`);
      continue;
    }
    const dest = path.join(dist, to);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
  }
  await writeManifest();
}

async function writeManifest() {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  if (!isProduction) manifest.name = `${manifest.name} (dev)`;
  // The end-to-end harness drives tabs without a user click, which activeTab can't grant.
  if (isE2E) manifest.host_permissions = ['<all_urls>'];
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

const copyStaticPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await copyStatic();
      const time = new Date().toLocaleTimeString();
      console.log(`[build] ${isProduction ? 'production' : 'development'} build ready (${time})`);
    });
  },
};

/** @type {esbuild.BuildOptions} */
const options = {
  absWorkingDir: root,
  entryPoints,
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: ['chrome116'],
  platform: 'browser',
  minify: isProduction,
  sourcemap: isProduction ? false : 'linked',
  legalComments: 'none',
  logLevel: 'warning',
  define: {
    __DEV__: JSON.stringify(!isProduction),
    __E2E__: JSON.stringify(isE2E),
  },
  loader: { '.svg': 'text' },
  plugins: [copyStaticPlugin],
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // esbuild only watches files in the module graph; HTML, icons and the manifest are copied separately.
  const rewatch = debounce(() => copyStatic().catch((e) => console.error('[build] copy failed', e)), 100);
  for (const dir of ['src', 'assets']) {
    watch(path.join(root, dir), { recursive: true }, (_event, file) => {
      if (file && /\.(html|png|svg)$/.test(file)) rewatch();
    });
  }
  watch(path.join(root, 'manifest.json'), rewatch);
  console.log('[build] watching for changes… (reload the extension in chrome://extensions after edits)');
} else {
  await esbuild.build(options);
}

function debounce(fn, ms) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
