// Bundles the PWA into one self-contained HTML file running on demo data (no server).
// Usage: node scripts/build-demo.mjs [out.html]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ORDER = ['shared/money.js', 'shared/portfolio.js', 'shared/rules.js', 'shared/cashflow.js', 'shared/importers.js', 'shared/state.js', 'shared/demo-data.js', 'api.js', 'app.js'];
const varName = p => '__m_' + p.replace(/^shared\//, '').replace(/\W/g, '_');

let js = '';
for (const p of ORDER) {
  let src = readFileSync(join(ROOT, p), 'utf8');
  const exports = [];
  src = src.replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\/(?:shared\/)?([\w-]+)\.js';?/gm, (_, names, mod) => {
    const from = ORDER.find(o => o.endsWith('/' + mod + '.js') || o === mod + '.js');
    return `const {${names}} = ${varName(from)};`;
  });
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => { exports.push(name); return `${kw} ${name}`; });
  js += `const ${varName(p)} = (() => {\n${src}\nreturn { ${exports.join(', ')} };\n})();\n`;
}

const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const html = `<title>Asset Hub</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="app" class="app" aria-live="polite"></div>
<script>window.ASSET_HUB_DEMO = true;</script>
<script type="module">
${js}
</script>
`;
const out = process.argv[2] || join(ROOT, '..', 'dist', 'asset-hub-demo.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('Wrote', out, (html.length / 1024).toFixed(0) + ' KB');
