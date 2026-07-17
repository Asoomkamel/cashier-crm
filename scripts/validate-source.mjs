import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', '.next', 'node_modules', '.vercel', 'coverage']);
const ignoredFiles = new Set(['package-lock.json']);
const conflictPattern = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m;
const forbiddenNames = new Set(['.env.local', '.env.production', '.env.development']);
const findings = [];

async function walk(dir) {
  for (const name of await readdir(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = path.join(dir, name);
    const relative = path.relative(root, full).replaceAll('\\', '/');
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full);
      continue;
    }
    if (forbiddenNames.has(name)) findings.push(`Forbidden local environment file: ${relative}`);
    if (ignoredFiles.has(name) || info.size > 2_000_000) continue;
    const content = await readFile(full, 'utf8').catch(() => null);
    if (content && conflictPattern.test(content)) findings.push(`Git conflict marker: ${relative}`);
  }
}

await walk(root);

if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}

console.log('Source validation passed: no Git conflict markers or committed local environment files.');
