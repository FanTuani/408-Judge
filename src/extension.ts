import * as path from 'node:path';
import * as vscode from 'vscode';
import { ApiError, reviewWithDeepSeek, type FetchLike, type ThinkingLevel } from './api.js';
import { API_KEY_SECRET, ApiKeyStore } from './apiKey.js';
import { historyRelativeFilePath, ReviewHistoryStore, type ReviewHistoryEntry } from './history.js';
import { ReviewShortcutTracker } from './keybinding.js';
import { pairSource, PairingError } from './pairing.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import { requestThinkingSummary, ThinkingSummaryScheduler, ThinkingSummaryTracker } from './thinkingSummary.js';
import { JudgeViewProvider, type ViewState } from './webview.js';

export interface ExtensionTestApi {
  getState(): ViewState;
  getActiveRequestId(): number;
  openLine(line: number): Promise<void>;
  storeApiKeyForTest(value: string): Promise<void>;
  getApiKeyForTest(): Promise<string | undefined>;
  getHistoryForTest(): Promise<readonly ReviewHistoryEntry[]>;
}

class JudgeController implements vscode.Disposable {
  private requestId = 0;
  private activeAbort?: AbortController;
  private sourceUri?: vscode.Uri;
  private readonly apiKeys: ApiKeyStore;
  private readonly histories = new Map<string, ReviewHistoryStore>();
  private visibleHistory: readonly ReviewHistoryEntry[] = [];
  private readonly shortcutTracker: ReviewShortcutTracker;
  private readonly disposables: vscode.Disposable[] = [];
  readonly view: JudgeViewProvider;

  constructor(private readonly context: vscode.ExtensionContext, private readonly fetcher: FetchLike = (input, init) => fetch(input, init)) {
    this.apiKeys = new ApiKeyStore(context.secrets, options => vscode.window.showInputBox(options));
    this.shortcutTracker = new ReviewShortcutTracker(context.globalStorageUri);
    this.view = new JudgeViewProvider(
      context.extensionUri,
      () => void vscode.commands.executeCommand('deepseekJudge.reviewCurrent'),
      () => this.cancel(),
      (line, fileUri) => void this.openLine(line, fileUri),
      this.getThinkingLevel(),
      level => this.updateThinkingLevel(level),
      this.shortcutTracker.current,
      () => this.showHistory(),
      id => this.openHistory(id)
    );
    this.disposables.push(
      this.shortcutTracker,
      this.shortcutTracker.onDidChange(shortcut => this.view.setReviewShortcut(shortcut))
    );
    void this.shortcutTracker.refresh();
  }

  async setApiKey(): Promise<boolean> {
    const value = await this.apiKeys.promptAndStore();
    if (!value) return false;
    void vscode.window.showInformationMessage('DeepSeek API Key 已安全保存。');
    return true;
  }

  async clearApiKey(): Promise<void> {
    await this.apiKeys.clear();
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
    if (abort.signal.aborted) return this.fail(id, '本次评审已取消。');

    this.sourceUri = editor.document.uri;
    const fileName = path.basename(pair.cppPath);
    const apiKey = await this.apiKeys.getOrPromptForReview();
    if (!apiKey) return this.fail(id, '未设置 DeepSeek API Key，评审未发送。');
    if (id !== this.requestId) return;
    if (abort.signal.aborted) return this.fail(id, '本次评审已取消。');
    const confirmedApiKey = apiKey;

    const config = vscode.workspace.getConfiguration('deepseekJudge');
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const relativePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, pair.cppPath)
      : path.basename(pair.cppPath);
    const thinkingLevel = this.getThinkingLevel();
    const thinkingEnabled = thinkingLevel !== 'disabled';
    const thinkingStartedAt = Date.now();
    const thinkingTracker = new ThinkingSummaryTracker(thinkingStartedAt);
    const initialThinkingStatus = thinkingEnabled ? thinkingTracker.update('', 1, thinkingStartedAt) : undefined;
    let latestProgress = { reasoning: '', content: '', preview: {}, attempt: 1 };
    const thinkingSummaryScheduler = thinkingEnabled
      ? new ThinkingSummaryScheduler(
        (reasoning, previousSummary, signal) => requestThinkingSummary({
          apiKey: confirmedApiKey,
          baseUrl: config.get('apiBaseUrl', 'https://api.deepseek.com'),
          model: config.get('thinkingSummaryModel', 'deepseek-v4-flash'),
          reasoning,
          previousSummary,
          timeoutSeconds: Math.min(15, config.get('requestTimeoutSeconds', 600)),
          signal
        }, this.fetcher),
        (stage, attempt) => {
          if (id !== this.requestId || latestProgress.content.length > 0 || attempt !== latestProgress.attempt) return;
          const thinkingStatus = thinkingTracker.applySummary(stage, attempt);
          this.view.setState({
            kind: 'loading', fileName, source: pair.cppContent, preview: latestProgress.preview, attempt,
            thinkingStatus
          });
        },
        { signal: abort.signal }
      )
      : undefined;
    this.view.setState({ kind: 'loading', fileName, source: pair.cppContent, preview: {}, attempt: 1, ...(initialThinkingStatus ? { thinkingStatus: initialThinkingStatus } : {}) });
    void vscode.commands.executeCommand('deepseekJudge.resultsView.focus');

    try {
      const result = await reviewWithDeepSeek({
        apiKey: confirmedApiKey,
        baseUrl: config.get('apiBaseUrl', 'https://api.deepseek.com'),
        model: config.get('model', 'deepseek-v4-pro'),
        thinkingLevel,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(pair, relativePath, config.get('additionalPrompt', '')),
        timeoutSeconds: config.get('requestTimeoutSeconds', 600),
        signal: abort.signal,
        onStream: progress => {
          if (id === this.requestId) {
            latestProgress = progress;
            if (progress.content.length > 0) thinkingSummaryScheduler?.dispose();
            else thinkingSummaryScheduler?.update(progress.reasoning, progress.attempt);
            const thinkingStatus = thinkingEnabled
              ? thinkingTracker.update(progress.content, progress.attempt)
              : undefined;
            this.view.setState({
              kind: 'loading', fileName, source: pair.cppContent, preview: progress.preview, attempt: progress.attempt,
              ...(thinkingStatus ? { thinkingStatus } : {})
            });
          }
        }
      }, this.fetcher);
      if (id === this.requestId) {
        thinkingSummaryScheduler?.dispose();
        const thinkingStatus = thinkingEnabled ? thinkingTracker.finish() : undefined;
        this.view.setState({ kind: 'result', fileName, source: pair.cppContent, result, ...(thinkingStatus ? { thinkingStatus } : {}) });
        try {
          await this.historyForSource(editor.document.uri).add({
            fileUri: editor.document.uri.toString(),
            fileName,
            displayPath: relativePath,
            source: pair.cppContent,
            result
          });
        } catch (error) {
          console.error('408 Judge: failed to save review history', error);
        }
      }
    } catch (error) {
      thinkingSummaryScheduler?.dispose();
      if (id !== this.requestId) return;
      const message = error instanceof ApiError ? error.message : '评审过程中发生未知错误。';
      this.view.setState({ kind: 'error', message });
    } finally {
      thinkingSummaryScheduler?.dispose();
      if (id === this.requestId) this.activeAbort = undefined;
    }
  }

  async openLine(line: number, fileUri?: string): Promise<void> {
    const sourceUri = fileUri ? vscode.Uri.parse(fileUri) : this.sourceUri;
    if (!sourceUri) return;
    const document = await vscode.workspace.openTextDocument(sourceUri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const safeLine = Math.min(Math.max(0, line - 1), Math.max(0, document.lineCount - 1));
    const position = new vscode.Position(safeLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  async showHistory(): Promise<void> {
    this.visibleHistory = await this.listHistory();
    this.view.showHistory(this.visibleHistory);
  }

  async openHistory(id: string): Promise<void> {
    const entry = this.visibleHistory.find(item => item.id === id)
      ?? (await this.listHistory()).find(item => item.id === id);
    if (!entry) return;
    this.view.showHistoryEntry(entry);
  }

  getHistoryForTest(): Promise<readonly ReviewHistoryEntry[]> { return this.listHistory(); }

  private historyForSource(sourceUri: vscode.Uri): ReviewHistoryStore {
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(sourceUri)?.uri ?? vscode.Uri.joinPath(sourceUri, '..');
    const fileUri = vscode.Uri.joinPath(workspaceRoot, ...historyRelativeFilePath(workspaceRoot.path, sourceUri.path).split('/'));
    return this.historyForFile(fileUri);
  }

  private historyForFile(fileUri: vscode.Uri): ReviewHistoryStore {
    const key = fileUri.toString();
    let history = this.histories.get(key);
    if (!history) {
      history = new ReviewHistoryStore(fileUri);
      this.histories.set(key, history);
    }
    return history;
  }

  private async listHistory(): Promise<readonly ReviewHistoryEntry[]> {
    const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri) ?? [];
    const sourceUri = vscode.window.activeTextEditor?.document.uri ?? this.sourceUri;
    const roots = workspaceRoots.length > 0
      ? workspaceRoots
      : sourceUri
        ? [vscode.Uri.joinPath(sourceUri, '..')]
        : [];
    const historyFiles = (await Promise.all(roots.map(root => this.findHistoryFiles(vscode.Uri.joinPath(root, '.408judge'))))).flat();
    const entries = (await Promise.all(historyFiles.map(fileUri => this.historyForFile(fileUri).list()))).flat();
    return entries.sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
  }

  private async findHistoryFiles(directoryUri: vscode.Uri): Promise<vscode.Uri[]> {
    let children: [string, vscode.FileType][];
    try {
      children = await vscode.workspace.fs.readDirectory(directoryUri);
    } catch {
      return [];
    }
    const files: vscode.Uri[] = [];
    for (const [name, type] of children) {
      const childUri = vscode.Uri.joinPath(directoryUri, name);
      if (type === vscode.FileType.Directory) files.push(...await this.findHistoryFiles(childUri));
      else if (type === vscode.FileType.File && name.endsWith('.json')) files.push(childUri);
    }
    return files;
  }

  syncThinkingLevel(): void {
    this.view.setThinkingLevel(this.getThinkingLevel());
  }

  private getThinkingLevel(): ThinkingLevel {
    const configured = vscode.workspace.getConfiguration('deepseekJudge').get<string>('thinkingLevel', 'high');
    return configured === 'disabled' || configured === 'high' || configured === 'max' ? configured : 'high';
  }

  private async updateThinkingLevel(level: ThinkingLevel): Promise<void> {
    const config = vscode.workspace.getConfiguration('deepseekJudge');
    const inspected = config.inspect<string>('thinkingLevel');
    const target = inspected?.workspaceFolderValue !== undefined
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : inspected?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await config.update('thinkingLevel', level, target);
  }

  private fail(id: number, message: string): void {
    if (id === this.requestId) {
      this.activeAbort = undefined;
      this.view.setState({ kind: 'error', message });
      void vscode.commands.executeCommand('deepseekJudge.resultsView.focus');
    }
  }

  dispose(): void {
    this.activeAbort?.abort();
    this.disposables.forEach(disposable => disposable.dispose());
    this.view.dispose();
  }
}

export function activate(context: vscode.ExtensionContext): ExtensionTestApi {
  const controller = new JudgeController(context);
  context.subscriptions.push(
    controller,
    vscode.window.registerWebviewViewProvider('deepseekJudge.resultsView', controller.view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('deepseekJudge.thinkingLevel')) controller.syncThinkingLevel();
    }),
    vscode.commands.registerCommand('deepseekJudge.reviewCurrent', () => controller.reviewCurrent()),
    vscode.commands.registerCommand('deepseekJudge.setApiKey', () => controller.setApiKey()),
    vscode.commands.registerCommand('deepseekJudge.clearApiKey', () => controller.clearApiKey())
  );
  return {
    getState: () => controller.view.getState(),
    getActiveRequestId: () => controller.getActiveRequestId(),
    openLine: line => controller.openLine(line),
    storeApiKeyForTest: async value => { await context.secrets.store(API_KEY_SECRET, value); },
    getApiKeyForTest: async () => context.secrets.get(API_KEY_SECRET),
    getHistoryForTest: () => controller.getHistoryForTest()
  };
}

export function deactivate(): void {}
