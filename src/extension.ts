import * as path from 'node:path';
import * as vscode from 'vscode';
import { ApiError, reviewWithDeepSeek, type FetchLike, type ThinkingLevel } from './api.js';
import { pairSource, PairingError } from './pairing.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import { JudgeViewProvider, type ViewState } from './webview.js';

const SECRET_KEY = 'deepseekJudge.apiKey';

export interface ExtensionTestApi {
  getState(): ViewState;
  getActiveRequestId(): number;
  openLine(line: number): Promise<void>;
  storeApiKeyForTest(value: string): Promise<void>;
  getApiKeyForTest(): Promise<string | undefined>;
}

class JudgeController implements vscode.Disposable {
  private requestId = 0;
  private activeAbort?: AbortController;
  private sourceUri?: vscode.Uri;
  readonly view: JudgeViewProvider;

  constructor(private readonly context: vscode.ExtensionContext, private readonly fetcher: FetchLike = (input, init) => fetch(input, init)) {
    this.view = new JudgeViewProvider(
      context.extensionUri,
      () => void vscode.commands.executeCommand('deepseekJudge.reviewCurrent'),
      () => this.cancel(),
      line => void this.openLine(line)
    );
  }

  async setApiKey(): Promise<boolean> {
    const value = await vscode.window.showInputBox({
      title: '设置 DeepSeek API Key',
      prompt: 'API Key 将安全保存在 VS Code SecretStorage 中',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sk-…'
    });
    if (!value?.trim()) return false;
    await this.context.secrets.store(SECRET_KEY, value.trim());
    void vscode.window.showInformationMessage('DeepSeek API Key 已安全保存。');
    return true;
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    void vscode.window.showInformationMessage('DeepSeek API Key 已清除。');
  }

  cancel(): void {
    this.activeAbort?.abort();
  }

  getActiveRequestId(): number { return this.requestId; }

  async reviewCurrent(): Promise<void> {
    const id = ++this.requestId;
    this.activeAbort?.abort();
    const abort = new AbortController();
    this.activeAbort = abort;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return this.fail(id, '请先打开一道 .cpp 作答文件。');

    let pair;
    try {
      pair = await pairSource(editor.document.uri.fsPath, editor.document.getText(), {
        readFile: async filePath => new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath)))
      });
    } catch (error) {
      return this.fail(id, error instanceof PairingError ? error.message : '读取题目文件时发生错误。');
    }
    if (id !== this.requestId) return;

    this.sourceUri = editor.document.uri;
    const fileName = path.basename(pair.cppPath);
    let apiKey = await this.context.secrets.get(SECRET_KEY);
    if (!apiKey) {
      const stored = await this.setApiKey();
      if (!stored) return this.fail(id, '未设置 DeepSeek API Key，评审未发送。');
      apiKey = await this.context.secrets.get(SECRET_KEY);
    }
    if (!apiKey || id !== this.requestId) return;
    const confirmedApiKey = apiKey;

    const config = vscode.workspace.getConfiguration('deepseekJudge');
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const relativePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, pair.cppPath)
      : path.basename(pair.cppPath);
    const configuredLevel = config.get<string>('thinkingLevel', 'high');
    const thinkingLevel: ThinkingLevel = configuredLevel === 'disabled' || configuredLevel === 'high' || configuredLevel === 'max'
      ? configuredLevel
      : 'high';
    const thinkingEnabled = thinkingLevel !== 'disabled';
    this.view.setState({ kind: 'loading', fileName, reasoning: '', content: '', attempt: 1, thinkingEnabled });
    void vscode.commands.executeCommand('deepseekJudge.resultsView.focus');

    try {
      const result = await reviewWithDeepSeek({
        apiKey: confirmedApiKey,
        baseUrl: config.get('apiBaseUrl', 'https://api.deepseek.com'),
        model: config.get('model', 'deepseek-v4-pro'),
        thinkingLevel,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(pair, relativePath, config.get('additionalPrompt', '')),
        timeoutSeconds: config.get('requestTimeoutSeconds', 90),
        signal: abort.signal,
        onStream: progress => {
          if (id === this.requestId) this.view.setState({
            kind: 'loading', fileName, reasoning: progress.reasoning, content: progress.content, attempt: progress.attempt, thinkingEnabled
          });
        }
      }, this.fetcher);
      if (id === this.requestId) this.view.setState({ kind: 'result', fileName, source: pair.cppContent, result });
    } catch (error) {
      if (id !== this.requestId) return;
      const message = error instanceof ApiError ? error.message : '评审过程中发生未知错误。';
      this.view.setState({ kind: 'error', message });
    } finally {
      if (id === this.requestId) this.activeAbort = undefined;
    }
  }

  async openLine(line: number): Promise<void> {
    if (!this.sourceUri) return;
    const document = await vscode.workspace.openTextDocument(this.sourceUri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const safeLine = Math.min(Math.max(0, line - 1), Math.max(0, document.lineCount - 1));
    const position = new vscode.Position(safeLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private fail(id: number, message: string): void {
    if (id === this.requestId) {
      this.activeAbort = undefined;
      this.view.setState({ kind: 'error', message });
      void vscode.commands.executeCommand('deepseekJudge.resultsView.focus');
    }
  }

  dispose(): void { this.activeAbort?.abort(); this.view.dispose(); }
}

export function activate(context: vscode.ExtensionContext): ExtensionTestApi {
  const controller = new JudgeController(context);
  context.subscriptions.push(
    controller,
    vscode.window.registerWebviewViewProvider('deepseekJudge.resultsView', controller.view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('deepseekJudge.reviewCurrent', () => controller.reviewCurrent()),
    vscode.commands.registerCommand('deepseekJudge.setApiKey', () => controller.setApiKey()),
    vscode.commands.registerCommand('deepseekJudge.clearApiKey', () => controller.clearApiKey())
  );
  return {
    getState: () => controller.view.getState(),
    getActiveRequestId: () => controller.getActiveRequestId(),
    openLine: line => controller.openLine(line),
    storeApiKeyForTest: async value => { await context.secrets.store(SECRET_KEY, value); },
    getApiKeyForTest: async () => context.secrets.get(SECRET_KEY)
  };
}

export function deactivate(): void {}
