import fs from 'node:fs';

const html = fs.readFileSync('admin/index.html', 'utf8');
const js = fs.readFileSync('admin/admin.js', 'utf8');

const checks = [
  ['save bar exists', html.includes('id="save-btn"')],
  ['preview iframe exists', html.includes('id="preview-frame"')],
  ['projects editor exists', html.includes('id="projects-editor"')],
  ['api/content load', js.includes("apiFetch('/api/content')")],
  ['api/content patch', js.includes("apiFetch('/api/content',") && js.includes("method: 'PATCH'")],
  ['sticky status', js.includes('updateDirtyStatus')]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Admin smoke check failed:');
  failed.forEach(([name]) => console.error(` - ${name}`));
  process.exit(1);
}

console.log('Admin smoke check passed.');
