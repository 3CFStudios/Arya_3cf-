import fs from 'node:fs';

const html = fs.readFileSync('admin/index.html', 'utf8');
const js = fs.readFileSync('admin/admin.js', 'utf8');

const checks = [
  ['login form exists', html.includes('id="login-form"')],
  ['tab buttons exist', html.includes('data-tab="overview"') && html.includes('data-tab="users"')],
  ['logout button exists', html.includes('id="logout-btn"')],
  ['DOMContentLoaded init exists', js.includes("document.addEventListener('DOMContentLoaded', init)")],
  ['users refresh handler exists', js.includes("getElementById('refresh-users-btn')")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Admin smoke check failed:');
  failed.forEach(([name]) => console.error(` - ${name}`));
  process.exit(1);
}

console.log('Admin smoke check passed.');
