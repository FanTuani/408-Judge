import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface TestState {
  kind: 'idle' | 'loading' | 'result' | 'error' | 'history' | 'history-detail';
  content?: string;
  preview?: { summary?: string };
  thinkingStatus?: { label: string; complete: boolean };
  result?: { verdict: string };
}
interface ExtensionTestApi {
  getState(): TestState;
  getActiveRequestId(): number;
  openLine(line: number): Promise<void>;
  storeApiKeyForTest(value: string): Promise<void>;
  getApiKeyForTest(): Promise<string | undefined>;
  getHistoryForTest(): Promise<ReadonlyArray<{ fileUri: string; result: { verdict: string } }>>;
}

const extensionId = 'ricequakes.408-judge';

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

suite('408 Judge extension', () => {
  let api: ExtensionTestApi;
  let originalFetch: typeof fetch;

  suiteSetup(async () => {
    originalFetch = globalThis.fetch;
    const extension = vscode.extensions.getExtension<ExtensionTestApi>(extensionId);
    assert.ok(extension, `Missing extension ${extensionId}`);
    api = await extension.activate();
  });

  suiteTeardown(() => { globalThis.fetch = originalFetch; });

  test('registers commands and contributes editor menu', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of ['deepseekJudge.reviewCurrent', 'deepseekJudge.setApiKey', 'deepseekJudge.clearApiKey']) {
      assert.ok(commands.includes(command), `${command} should be registered`);
    }
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
    assert.ok(packageJson.contributes.menus['editor/context'].some((item: { command: string }) => item.command === 'deepseekJudge.reviewCurrent'));
  });

  test('stores and clears the API key using SecretStorage', async () => {
    await api.storeApiKeyForTest('integration-secret');
    assert.equal(await api.getApiKeyForTest(), 'integration-secret');
    await vscode.commands.executeCommand('deepseekJudge.clearApiKey');
    assert.equal(await api.getApiKeyForTest(), undefined);
  });

  test('renders result, jumps to an issue line, and cancels the superseded request', async () => {
    await api.storeApiKeyForTest('integration-secret');
    const fixture = vscode.Uri.file(path.resolve(__dirname, '..', '..', 'fixtures', 'correct', 'simple.cpp'));
    const document = await vscode.workspace.openTextDocument(fixture);
    await vscode.window.showTextDocument(document);

    let mainCall = 0;
    globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { model?: string; thinking?: { type?: string } };
      if (requestBody.model === 'deepseek-v4-flash' && requestBody.thinking?.type === 'disabled') {
        return Promise.resolve(new Response(JSON.stringify({
          choices: [{ message: { content: '{"title":"检查边界条件与内存安全","detail":"核对边界输入、数组访问和资源释放是否安全。"}' }, finish_reason: 'stop' }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      mainCall += 1;
      if (mainCall === 1) {
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
      }
      const encoder = new TextEncoder();
      const resultJson = JSON.stringify({
        verdict: 'partially_correct', summary: '整体可行，但需检查边界。',
        strengths: ['线性扫描正确'], issues: [{ severity: 'warning', title: '前置条件', description: '空数组未处理', line: 2, suggestion: '明确 n > 0' }],
        complexity: { time: 'O(n)', space: 'O(1)', assessment: '符合要求' }, suggestedSnippet: ''
      });
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            choices: [{ delta: { reasoning_content: '正在检查边界、数组访问和内存安全。'.repeat(16) } }]
          })}\n\n`));
          setTimeout(() => {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"条件、数组越界和内存安全"}}]}\n\n'));
            setTimeout(() => {
              const split = resultJson.indexOf('整体可行') + 2;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: resultJson.slice(0, split) }, finish_reason: null }] })}\n\n`));
              setTimeout(() => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: resultJson.slice(split) }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`));
                controller.close();
              }, 100);
            }, 1_250);
          }, 850);
        }
      });
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }) as typeof fetch;

    const first = vscode.commands.executeCommand('deepseekJudge.reviewCurrent');
    await waitFor(() => api.getState().kind === 'loading', 'first request did not start');
    await waitFor(() => mainCall === 1, 'first network request did not start');
    const firstId = api.getActiveRequestId();
    const second = vscode.commands.executeCommand('deepseekJudge.reviewCurrent');
    await waitFor(() => api.getState().kind === 'loading' && api.getState().thinkingStatus?.label === '检查边界条件与内存安全', 'thinking summary was not updated');
    await waitFor(() => api.getState().kind === 'loading' && api.getState().preview?.summary === '整体', 'structured conclusion was not rendered incrementally');
    await Promise.all([first, second]);

    assert.equal(api.getActiveRequestId(), firstId + 1);
    const state = api.getState();
    assert.equal(state.kind, 'result');
    if (state.kind === 'result') assert.equal(state.result?.verdict, 'partially_correct');

    const history = await api.getHistoryForTest();
    assert.ok(history.some(entry => entry.fileUri === fixture.toString() && entry.result.verdict === 'partially_correct'));

    await api.openLine(2);
    assert.equal(vscode.window.activeTextEditor?.selection.active.line, 1);
  });
});
