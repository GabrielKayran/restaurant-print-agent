/**
 * Reads the version from package.json and writes it into src/version.ts.
 * Called automatically by the CI pipeline before `tsc`.
 *
 * Usage:  node scripts/inject-version.js          — uses package.json version
 *         node scripts/inject-version.js v1.2.3   — uses the supplied tag
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = join(root, 'src', 'version.ts');

// Prefer CLI arg (the git tag), fall back to package.json
let version = process.argv[2];
if (version) {
  version = version.replace(/^v/, '');
} else {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  version = pkg.version;
}

const content = `// This value is replaced at build time by the inject-version script.
// Do NOT edit manually — it is overwritten on every tagged release.
export const CURRENT_VERSION: string = '${version}';
`;

writeFileSync(versionFile, content, 'utf-8');
console.log(`Injected version: ${version}`);
