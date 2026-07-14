import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const angularCli = fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url));
const apiServer = fileURLToPath(new URL('../server/dev-api.mjs', import.meta.url));
const forwardedArguments = process.argv.slice(2);

const api = spawn(process.execPath, [apiServer], { stdio: 'inherit' });
const angular = spawn(process.execPath, [angularCli, 'serve', '--proxy-config', 'proxy.conf.json', ...forwardedArguments], {
  stdio: 'inherit',
});

let closing = false;
function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  api.kill('SIGTERM');
  angular.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 200);
}

api.on('exit', (code) => close(code || 0));
angular.on('exit', (code) => close(code || 0));
process.on('SIGINT', () => close(0));
process.on('SIGTERM', () => close(0));
