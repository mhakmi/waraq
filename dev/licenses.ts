import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackageJson = {
  name: string;
  version: string;
  license?: string | { type: string };
  licenses?: { type: string }[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'src/settings/licenses.json');

function readPackage(folder: string): PackageJson {
  return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
}

// Node looks for a package in node_modules beside the one that asks for it, then in each folder above.
function findPackage(name: string, from: string): string | null {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = join(folder, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    if (folder === root || folder === dirname(folder)) {
      return null;
    }
  }
}

function licenseOf(pkg: PackageJson): string {
  if (typeof pkg.license === 'string') {
    return pkg.license;
  }
  if (pkg.license !== undefined) {
    return pkg.license.type;
  }
  return pkg.licenses?.map((license) => license.type).join(' OR ') ?? 'Not stated';
}

const found = new Map<string, { name: string; version: string; license: string }>();
const waiting = Object.keys(readPackage(root).dependencies ?? {}).map((name) => ({ name, from: root }));

for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
  const folder = findPackage(next.name, next.from);
  if (folder === null) {
    continue;
  }
  const pkg = readPackage(folder);
  const key = `${pkg.name}@${pkg.version}`;
  if (found.has(key)) {
    continue;
  }
  found.set(key, { name: pkg.name, version: pkg.version, license: licenseOf(pkg) });
  for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    waiting.push({ name: dependency, from: folder });
  }
}

const list = [...found.values()].sort((first, second) => first.name.localeCompare(second.name) || first.version.localeCompare(second.version));
writeFileSync(output, `${JSON.stringify(list, null, 2)}\n`);
console.log(`${list.length} packages written to ${output}`);
