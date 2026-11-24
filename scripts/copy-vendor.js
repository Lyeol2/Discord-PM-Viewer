// npm postinstall: put sql.js (SQLite compiled to WebAssembly) where the page loads it from, app/vendor/.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'node_modules', 'sql.js', 'dist');
const out = path.join(root, 'app', 'vendor');

fs.mkdirSync(out, { recursive: true });
for (const file of ['sql-wasm.js', 'sql-wasm.wasm']) {
  fs.copyFileSync(path.join(dist, file), path.join(out, file));
}
console.log('sql.js copied to app/vendor');
