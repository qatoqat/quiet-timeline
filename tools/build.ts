#!/usr/bin/env bun
import { rmSync, statSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}build`;
const release = process.argv.includes('--release'); // no source maps
const entries: [string, string][] = [
  ['src/hook/index.ts', 'hook.js'],
  ['src/content/index.ts', 'content.js'],
  ['src/background.ts', 'background.js'],
  ['src/popup/popup.ts', 'popup.js'],
  ['src/css/index.css', 'content.css'],
];

rmSync(out, { recursive: true, force: true });
let failed = false;
for (const [src, name] of entries) {
  const js = name.endsWith('.js');
  const r = await Bun.build({
    entrypoints: [`${root}${src}`],
    outdir: out,
    naming: name,
    target: 'browser',
    minify: true,
    ...(js ? { format: 'iife' as const, sourcemap: release ? ('none' as const) : ('linked' as const) } : {}),
  });
  if (!r.success) {
    failed = true;
    console.error(`${src}:`, ...r.logs);
    continue;
  }
  console.log(`${name.padEnd(14)} ${(statSync(`${out}/${name}`).size / 1024).toFixed(1)} KB`);
}
process.exit(failed ? 1 : 0);
