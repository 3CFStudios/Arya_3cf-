import fs from 'node:fs';

const html = fs.readFileSync('admin/index.html', 'utf8');
const js = fs.readFileSync('admin/admin.js', 'utf8');

const checks = [
  ['connect button exists', html.includes('id="connect-btn"')],
  ['save draft button exists', html.includes('id="save-draft-btn"')],
  ['publish button exists', html.includes('id="publish-btn"')],
  ['uses draft endpoint', js.includes("/api/site/draft")],
  ['uses publish endpoint', js.includes("/api/site/publish")],
  ['history endpoint wired', js.includes("/api/site/history")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Admin smoke check failed:');
  failed.forEach(([name]) => console.error(` - ${name}`));
  process.exit(1);
}

console.log('Admin smoke check passed.');
