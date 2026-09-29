// Builds the React/Vue test bundles and serves test-pages/ on http://localhost:5174
//   npm run serve:test-pages [-- --port 5174]
import * as esbuild from 'esbuild';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = path.join(root, 'test-pages');

export async function buildTestPages() {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: {
      'react-form': 'test-pages/src/react-form.tsx',
      'vue-form': 'test-pages/src/vue-form.ts',
    },
    outdir: path.join(pagesDir, 'dist'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    logLevel: 'warning',
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

export function serveTestPages(port = 5174) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = path.normalize(path.join(pagesDir, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(pagesDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 5174;
  await buildTestPages();
  await serveTestPages(port);
  console.log(`[test-pages] serving http://localhost:${port}/`);
}
