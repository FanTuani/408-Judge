import * as vscode from 'vscode';
import { buildSuggestedDiff } from './diff.js';
import type { JudgePreview, JudgeResult } from './types.js';

export type ViewState =
  | { kind: 'idle'; message?: string }
  | { kind: 'loading'; fileName: string; source: string; reasoning: string; content: string; preview: JudgePreview; attempt: number; thinkingEnabled: boolean }
  | { kind: 'result'; fileName: string; source: string; result: JudgeResult }
  | { kind: 'error'; message: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]!);
}

function verdictLabel(verdict: JudgeResult['verdict']): string {
  return ({
    correct: '正确', partially_correct: '部分正确', incorrect: '错误', insufficient: '信息不足'
  })[verdict];
}

function list(items: string[], empty: string): string {
  if (items.length === 0) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function diffContent(source: string, result: JudgeResult): string {
  if (!result.suggestedFix) {
    return result.suggestedSnippet ? `<pre><code>${escapeHtml(result.suggestedSnippet)}</code></pre>` : '';
  }
  const rows = buildSuggestedDiff(source, result.suggestedFix).map(line => {
    if (line.kind === 'separator') return `<tr class="diff-hunk"><td colspan="4">${escapeHtml(line.text)}</td></tr>`;
    const prefix = line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : '';
    return `<tr class="diff-row ${line.kind}"><td class="line-number">${line.oldLine ?? ''}</td><td class="line-number">${line.newLine ?? ''}</td><td class="diff-marker">${prefix}</td><td class="diff-code">${escapeHtml(line.text)}</td></tr>`;
  }).join('');
  return `${result.suggestedFix.explanation ? `<p>${escapeHtml(result.suggestedFix.explanation)}</p>` : ''}<div class="diff" role="region" aria-label="最小修复 diff"><table class="diff-table"><thead><tr><th>旧</th><th>新</th><th></th><th>最小修复</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function previewContent(source: string, preview: JudgePreview): string {
  if (Object.keys(preview).length === 0) return '<p class="preview-empty"><span class="typing-dot"></span>等待结构化结论…</p>';
  const header = `${preview.verdict ? `<div class="verdict ${preview.verdict}">${verdictLabel(preview.verdict)}</div>` : '<span class="preview-pending">结论生成中…</span>'}${typeof preview.confidence === 'number' ? `<div class="confidence">置信度 ${Math.round(preview.confidence * 100)}%</div>` : ''}`;
  const summary = typeof preview.summary === 'string' ? `<p class="summary live-value">${escapeHtml(preview.summary)}<span class="caret"></span></p>` : '';
  const strengths = preview.strengths ? `<h2>正确之处</h2>${list(preview.strengths, '正在生成…')}` : '';
  const issues = preview.issues ? `<h2>问题清单</h2>${preview.issues.length === 0 ? '<p class="muted">暂未生成问题。</p>' : preview.issues.map(issue => `<article class="issue severity-${escapeHtml(issue.severity ?? 'info')}"><div class="issue-title"><span>${escapeHtml(issue.title ?? '问题生成中…')}</span>${issue.line ? `<span class="preview-line">第 ${issue.line} 行</span>` : ''}</div>${issue.description ? `<p>${escapeHtml(issue.description)}</p>` : ''}${issue.suggestion ? `<p class="suggestion"><strong>建议：</strong>${escapeHtml(issue.suggestion)}</p>` : ''}</article>`).join('')}` : '';
  const complexity = preview.complexity ? `<h2>复杂度</h2><dl>${preview.complexity.time ? `<dt>时间</dt><dd>${escapeHtml(preview.complexity.time)}</dd>` : ''}${preview.complexity.space ? `<dt>空间</dt><dd>${escapeHtml(preview.complexity.space)}</dd>` : ''}</dl>${preview.complexity.assessment ? `<p>${escapeHtml(preview.complexity.assessment)}</p>` : ''}` : '';
  let fix = '';
  const streamedFix = preview.suggestedFix;
  if (streamedFix || preview.suggestedSnippet) {
    const ready = streamedFix && typeof streamedFix.startLine === 'number' && typeof streamedFix.endLine === 'number' && typeof streamedFix.replacement === 'string' && streamedFix.replacement.length > 0;
    if (ready) {
      const resultLike: JudgeResult = {
        verdict: preview.verdict ?? 'insufficient', summary: '', confidence: 0, strengths: [], issues: [],
        complexity: { time: '', space: '', assessment: '' }, suggestedSnippet: streamedFix.replacement!,
        suggestedFix: {
          startLine: streamedFix.startLine!, endLine: streamedFix.endLine!, original: streamedFix.original ?? '',
          replacement: streamedFix.replacement!, explanation: streamedFix.explanation ?? ''
        }
      };
      fix = `<h2>必要的局部修正</h2>${diffContent(source, resultLike)}`;
    } else {
      fix = `<h2>必要的局部修正</h2><p class="muted">正在生成并定位最小修复…</p>`;
    }
  }
  return `${header}${summary}${strengths}${issues}${complexity}${fix}`;
}

function resultContent(source: string, result: JudgeResult): string {
  const issues = result.issues.length === 0
    ? '<p class="muted">未发现需要单列的问题。</p>'
    : result.issues.map(issue => `<article class="issue severity-${escapeHtml(issue.severity)}">
        <div class="issue-title"><span>${escapeHtml(issue.title)}</span>${issue.line ? `<button class="line" data-line="${issue.line}" title="跳转到源码">第 ${issue.line} 行</button>` : ''}</div>
        <p>${escapeHtml(issue.description)}</p>
        ${issue.suggestion ? `<p class="suggestion"><strong>建议：</strong>${escapeHtml(issue.suggestion)}</p>` : ''}
      </article>`).join('');
  return `<div class="verdict ${result.verdict}">${verdictLabel(result.verdict)}</div>
    <div class="confidence">置信度 ${Math.round(result.confidence * 100)}%</div>
    <p class="summary">${escapeHtml(result.summary)}</p>
    <h2>正确之处</h2>${list(result.strengths, '模型未列出明确的正确之处。')}
    <h2>问题清单</h2>${issues}
    <h2>复杂度</h2>
    <dl><dt>时间</dt><dd>${escapeHtml(result.complexity.time)}</dd><dt>空间</dt><dd>${escapeHtml(result.complexity.space)}</dd></dl>
    <p>${escapeHtml(result.complexity.assessment)}</p>
    ${(result.suggestedFix || result.suggestedSnippet) ? `<h2>必要的局部修正</h2>${diffContent(source, result)}` : ''}`;
}

export function renderWebview(state: ViewState, nonce: string): string {
  let body: string;
  if (state.kind === 'loading') {
    body = `<header><span class="eyebrow">${escapeHtml(state.fileName)}</span><button id="cancel" class="secondary">取消</button></header>
      <div class="stream-status"><span class="spinner"></span><strong>正在流式评审</strong><span id="attempt">${state.attempt > 1 ? `重试 ${state.attempt}/2` : ''}</span></div>
      ${state.thinkingEnabled ? `<details open><summary>思考过程</summary><pre id="reasoning" class="stream">${escapeHtml(state.reasoning || '等待模型开始思考…')}</pre></details>` : ''}
      <section class="live-preview" aria-live="polite"><div class="live-preview-title"><span>判题结论</span><span class="live-badge">实时</span></div><div id="structured-preview">${previewContent(state.source, state.preview)}</div></section>`;
  } else if (state.kind === 'error') {
    body = `<div class="center"><div class="state-icon">!</div><h1>无法完成评审</h1><p>${escapeHtml(state.message)}</p><button id="review">重新评审</button></div>`;
  } else if (state.kind === 'result') {
    body = `<header><span class="eyebrow">${escapeHtml(state.fileName)}</span><button id="review" class="secondary">重新评审</button></header>${resultContent(state.source, state.result)}`;
  } else {
    body = `<div class="center"><div class="state-icon">✓</div><h1>408 Judge</h1><p>${escapeHtml(state.message ?? '打开一道 .cpp 作答，然后从编辑器右键菜单开始评审。')}</p><button id="review">评审当前 C++ 作答</button></div>`;
  }
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    :root{color-scheme:light dark}body{padding:16px;color:var(--vscode-foreground);font:13px/1.55 var(--vscode-font-family);overflow-wrap:anywhere}h1{font-size:18px;margin:10px 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:24px 0 8px;color:var(--vscode-descriptionForeground)}p{margin:6px 0 10px}.center{text-align:center;padding:42px 8px}.state-icon{display:grid;place-items:center;margin:auto;width:42px;height:42px;border:1px solid var(--vscode-focusBorder);border-radius:50%;font-size:20px;color:var(--vscode-focusBorder)}button{border:0;border-radius:3px;padding:6px 12px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary,.line{color:var(--vscode-textLink-foreground);background:transparent;padding:2px 4px}header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}.eyebrow{font-family:var(--vscode-editor-font-family);color:var(--vscode-descriptionForeground)}.verdict{display:inline-block;border-radius:999px;padding:4px 10px;font-weight:700}.correct{color:var(--vscode-testing-iconPassed);background:color-mix(in srgb,var(--vscode-testing-iconPassed) 14%,transparent)}.partially_correct{color:var(--vscode-editorWarning-foreground);background:color-mix(in srgb,var(--vscode-editorWarning-foreground) 14%,transparent)}.incorrect{color:var(--vscode-testing-iconFailed);background:color-mix(in srgb,var(--vscode-testing-iconFailed) 14%,transparent)}.insufficient{color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background)}.confidence{float:right;color:var(--vscode-descriptionForeground);padding-top:4px}.summary{font-size:14px;margin:14px 0 22px}.muted{color:var(--vscode-descriptionForeground)}ul{padding-left:20px}.issue{border-left:3px solid var(--vscode-descriptionForeground);padding:7px 10px;margin:8px 0;background:var(--vscode-editorWidget-background)}.severity-error{border-color:var(--vscode-testing-iconFailed)}.severity-warning{border-color:var(--vscode-editorWarning-foreground)}.issue-title{display:flex;justify-content:space-between;gap:8px;font-weight:700}.suggestion{color:var(--vscode-descriptionForeground)}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}dt{color:var(--vscode-descriptionForeground)}dd{margin:0;font-family:var(--vscode-editor-font-family)}pre{padding:10px;overflow:auto;background:var(--vscode-textCodeBlock-background);font-family:var(--vscode-editor-font-family)}.spinner{display:inline-block;width:12px;height:12px;border:2px solid var(--vscode-editorWidget-border);border-top-color:var(--vscode-progressBar-background);border-radius:50%;animation:spin .8s linear infinite}.stream-status{display:flex;align-items:center;gap:8px;margin:12px 0 18px;color:var(--vscode-descriptionForeground)}.stream-status #attempt{margin-left:auto}details{margin:10px 0;border:1px solid var(--vscode-editorWidget-border);border-radius:4px;background:var(--vscode-editorWidget-background)}summary{padding:7px 10px;cursor:pointer;font-weight:600}.stream{margin:0;max-height:38vh;white-space:pre-wrap;color:var(--vscode-descriptionForeground)}.live-preview{margin-top:14px;padding-top:10px;border-top:1px solid var(--vscode-editorWidget-border)}.live-preview-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-weight:700}.live-badge{font-size:10px;font-weight:600;color:var(--vscode-testing-iconPassed);letter-spacing:.08em}.preview-empty,.preview-pending{color:var(--vscode-descriptionForeground)}.typing-dot{display:inline-block;width:6px;height:6px;margin-right:8px;border-radius:50%;background:var(--vscode-progressBar-background);animation:pulse 1.2s ease-in-out infinite}.live-value{animation:fadein .18s ease-out}.caret{display:inline-block;width:1px;height:1em;margin-left:2px;vertical-align:-.12em;background:var(--vscode-editorCursor-foreground);animation:blink .9s step-end infinite}.preview-line{font-weight:400;color:var(--vscode-descriptionForeground)}.diff{overflow:auto;border:1px solid var(--vscode-editorWidget-border);border-radius:4px;background:var(--vscode-editor-background);font:12px/1.65 var(--vscode-editor-font-family)}.diff-table{width:max-content;min-width:100%;border-collapse:collapse;border-spacing:0}.diff-table th{height:24px;padding:0 7px;text-align:left;font:11px var(--vscode-font-family);color:var(--vscode-descriptionForeground);background:var(--vscode-editorGroupHeader-tabsBackground);border-bottom:1px solid var(--vscode-editorWidget-border)}.diff-table th:first-child,.diff-table th:nth-child(2){width:3em;text-align:right}.diff-row td{height:21px;padding:0;border:0}.line-number{min-width:3em;padding:0 7px!important;text-align:right;color:var(--vscode-editorLineNumber-foreground);background:color-mix(in srgb,var(--vscode-editorGutter-background) 92%,transparent);border-right:1px solid var(--vscode-editorWidget-border)!important;user-select:none}.diff-marker{width:1.5em;padding-left:7px!important;font-weight:700;user-select:none}.diff-code{min-width:24em;padding:0 12px 0 2px!important;white-space:pre;overflow-wrap:normal;background:transparent!important}.diff-row.removed{color:var(--vscode-editor-foreground);background:color-mix(in srgb,var(--vscode-gitDecoration-deletedResourceForeground) 16%,var(--vscode-editor-background))}.diff-row.added{color:var(--vscode-editor-foreground);background:color-mix(in srgb,var(--vscode-gitDecoration-addedResourceForeground) 16%,var(--vscode-editor-background))}.diff-row.removed .diff-marker{color:var(--vscode-gitDecoration-deletedResourceForeground)}.diff-row.added .diff-marker{color:var(--vscode-gitDecoration-addedResourceForeground)}.diff-hunk td{height:24px;padding:0 8px;color:var(--vscode-textLink-foreground);background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-editorWidget-border);white-space:pre}.diff-row.context .diff-code{color:var(--vscode-editor-foreground)}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}@keyframes fadein{from{opacity:.55;transform:translateY(2px)}to{opacity:1;transform:none}}@keyframes blink{50%{opacity:0}}
  </style></head><body>${body}<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('review')?.addEventListener('click',()=>vscode.postMessage({type:'review'}));
    document.getElementById('cancel')?.addEventListener('click',()=>vscode.postMessage({type:'cancel'}));
    document.querySelectorAll('[data-line]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({type:'openLine',line:Number(el.dataset.line)})));
    window.addEventListener('message',event=>{if(event.data?.type!=='stream')return;const reasoning=document.getElementById('reasoning');const preview=document.getElementById('structured-preview');const attempt=document.getElementById('attempt');if(reasoning)reasoning.textContent=event.data.reasoning||'等待模型开始思考…';if(preview)preview.innerHTML=event.data.previewHtml;if(attempt)attempt.textContent=event.data.attempt>1?('重试 '+event.data.attempt+'/2'):'';});
  </script></body></html>`;
}

export class JudgeViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private state: ViewState = { kind: 'idle' };
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onReview: () => void,
    private readonly onCancel: () => void,
    private readonly onOpenLine: (line: number) => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    this.disposables.push(view.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const data = message as { type?: string; line?: number };
      if (data.type === 'review') this.onReview();
      else if (data.type === 'cancel') this.onCancel();
      else if (data.type === 'openLine' && Number.isInteger(data.line) && (data.line ?? 0) > 0) this.onOpenLine(data.line!);
    }));
    this.render();
  }

  setState(state: ViewState): void {
    const previous = this.state;
    this.state = state;
    if (this.view && previous.kind === 'loading' && state.kind === 'loading') {
      void this.view.webview.postMessage({ type: 'stream', reasoning: state.reasoning, previewHtml: previewContent(state.source, state.preview), attempt: state.attempt });
      return;
    }
    this.render();
  }

  getState(): ViewState { return this.state; }

  private render(): void {
    if (!this.view) return;
    const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
    this.view.webview.html = renderWebview(this.state, nonce);
  }

  dispose(): void { this.disposables.forEach(item => item.dispose()); }
}
