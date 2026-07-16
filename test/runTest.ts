import * as fs from 'node:fs';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const testDataPath = path.join(extensionDevelopmentPath, '.vscode-test');
  const launchArgs = [
    path.join(extensionDevelopmentPath, 'fixtures', 'correct'),
    '--disable-extensions',
    `--user-data-dir=${path.join(testDataPath, 'user-data')}`,
    `--extensions-dir=${path.join(testDataPath, 'extensions')}`
  ];
  const candidates = [
    '/Applications/Code.app/Contents/MacOS/Electron',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron'
  ];
  const vscodeExecutablePath = candidates.find(candidate => fs.existsSync(candidate));
  await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs, ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}) });
}

main().catch(error => {
  console.error('VS Code integration tests failed:', error);
  process.exit(1);
});
