const { spawnSync } = require('child_process');
const path = require('path');

const mode = String(process.argv[2] || 'smoke').trim().toLowerCase();
const root = path.resolve(__dirname, '..');
const env = { ...process.env };

switch (mode) {
  case 'smoke':
    env.E2E_HEADLESS = env.E2E_HEADLESS || '1';
    env.E2E_TRACE_MODE = env.E2E_TRACE_MODE || 'retain-on-failure';
    env.E2E_VIDEO = env.E2E_VIDEO || 'off';
    env.E2E_SCREENSHOT = env.E2E_SCREENSHOT || 'only-on-failure';
    break;
  case 'headed':
    env.E2E_HEADLESS = '0';
    env.E2E_TRACE_MODE = env.E2E_TRACE_MODE || 'on-first-retry';
    env.E2E_VIDEO = env.E2E_VIDEO || 'off';
    env.E2E_SCREENSHOT = env.E2E_SCREENSHOT || 'only-on-failure';
    break;
  case 'diagnostics':
    env.E2E_HEADLESS = env.E2E_HEADLESS || '1';
    env.E2E_TRACE_MODE = env.E2E_TRACE_MODE || 'on';
    env.E2E_VIDEO = env.E2E_VIDEO || 'on';
    env.E2E_SCREENSHOT = env.E2E_SCREENSHOT || 'on';
    env.E2E_REUSE_SERVER = env.E2E_REUSE_SERVER || '0';
    break;
  default:
    console.error(`Unknown Playwright mode "${mode}"`);
    process.exit(1);
}

const args = ['playwright', 'test', ...process.argv.slice(3)];
const result = spawnSync('npx', args, {
  cwd: root,
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status || 0);
