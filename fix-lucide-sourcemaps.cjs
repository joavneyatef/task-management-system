const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'node_modules', 'lucide-react', 'dist');
let repairedMaps = 0;
let strippedReferences = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) {
      try {
        const text = fs.readFileSync(full, 'utf8');
        const next = text.replace(/\n?\/\/#[ \t]*sourceMappingURL=[^\r\n]+/g, '');
        if (next !== text) {
          fs.writeFileSync(full, next, 'utf8');
          strippedReferences++;
        }
      } catch {}
    } else if (entry.name.endsWith('.js.map')) {
      try {
        const text = fs.readFileSync(full, 'utf8').trim();
        try { JSON.parse(text); }
        catch {
          fs.writeFileSync(full, JSON.stringify({ version: 3, sources: [], names: [], mappings: '' }) + '\n', 'utf8');
          repairedMaps++;
        }
      } catch {}
    }
  }
}

walk(root);
console.log(`lucide repair: stripped ${strippedReferences} source-map references; repaired ${repairedMaps} invalid maps.`);
