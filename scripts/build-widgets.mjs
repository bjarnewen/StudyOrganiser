// Inlines the shared agenda logic into both widget files.
//
// Scriptable and Übersicht each need one self-contained file — neither can
// import a module the way the web app does. Rather than keep two copies of the
// logic in step by hand, it lives once in widgets/src/agenda-core.js and is
// pasted in here, so the two widgets cannot drift apart.
//
// Usage:  node scripts/build-widgets.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'widgets', 'src');
const OUT = join(ROOT, 'widgets');

const MARKER = '//__AGENDA_CORE__';

const TARGETS = [
  { template: 'scriptable.template.js', output: 'StudyOrganiser.scriptable.js' },
  { template: 'ubersicht.template.jsx', output: 'study-organiser.jsx' },
];

async function main() {
  const core = await readFile(join(SRC, 'agenda-core.js'), 'utf8');
  // The export line is for the tests; neither widget runtime accepts it.
  const inlined = core.replace(/^export \{[^}]*\};\s*$/m, '').trimEnd();

  await mkdir(OUT, { recursive: true });
  for (const { template, output } of TARGETS) {
    const source = await readFile(join(SRC, template), 'utf8');
    if (!source.includes(MARKER)) throw new Error(`${template} is missing ${MARKER}`);
    const built = source.replace(
      MARKER,
      `// --- shared agenda logic, generated from widgets/src/agenda-core.js ---\n// Do not edit here; edit the source and run: node scripts/build-widgets.mjs\n${inlined}\n// --- end shared agenda logic ---`,
    );
    await writeFile(join(OUT, output), built);
    console.log(`wrote widgets/${output}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
