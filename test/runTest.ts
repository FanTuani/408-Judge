import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const testDataPath = path.join(extensionDevelopmentPath, '.vscode-test');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), '408-judge-integration-'));
  const workspacePath = path.join(temporaryRoot, 'workspace');
  fs.cpSync(path.join(extensionDevelopmentPath, 'fixtures', 'correct'), workspacePath, { recursive: true });
  const launchArgs = [
    workspacePath,
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
  try {
    await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs, ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}) });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('VS Code integration tests failed:', error);
  process.exit(1);
});
