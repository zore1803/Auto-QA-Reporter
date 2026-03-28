const { spawn } = require('child_process');
const path = require('path');

console.log('===========================================');
console.log('  Starting Auto-QA-Reporter (Local Dev)    ');
console.log('===========================================');

const isWindows = process.platform === 'win32';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';

function startService(name, cwd, cmdArgs, colorPrefix) {
  const p = spawn(npxCommand, cmdArgs, {
    cwd: path.resolve(__dirname, '..', cwd),
    stdio: 'pipe',
    shell: true,
  });

  p.stdout.on('data', (data) => {
    process.stdout.write(`${colorPrefix}[${name}] ${data.toString()}\x1b[0m`);
  });

  p.stderr.on('data', (data) => {
    process.stderr.write(`\x1b[31m[${name}] ${data.toString()}\x1b[0m`);
  });

  p.on('close', (code) => {
    console.log(`[${name}] process exited with code ${code}`);
  });

  return p;
}

startService('API', 'artifacts/api-server', ['tsx', 'src/index.ts'], '\x1b[36m');
startService('FRONTEND', 'artifacts/qa-inspector', ['vite', '--config', 'vite.config.ts', '--host', '0.0.0.0'], '\x1b[35m');

console.log('\x1b[32mBoth services are booting up...\x1b[0m');
console.log('- API Server usually runs on http://localhost:3001');
console.log('- QA Inspector UI usually runs on http://localhost:5173\n');
