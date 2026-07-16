import * as vscode from 'vscode';
import type { ThinkingLevel } from './api.js';
import { buildSuggestedDiff } from './diff.js';
import type { ThinkingStatus } from './thinkingSummary.js';
import type { JudgePreview, JudgeResult } from './types.js';

export type ViewState =
  | { kind: 'idle'; message?: string }
  | { kind: 'loading'; fileName: string; source: string; preview: JudgePreview; attempt: number; thinkingStatus?: ThinkingStatus }
  | { kind: 'result'; fileName: string; source: string; result: JudgeResult; thinkingStatus?: ThinkingStatus }
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

function resultBlock(key: string, content: string, className = ''): string {
  return `<section class="result-block result-block-enter${className ? ` ${className}` : ''}" data-result-block="${escapeHtml(key)}">${content}</section>`;
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

function previewContent(preview: JudgePreview): string {
  if (Object.keys(preview).length === 0) return resultBlock('pending', '<p class="preview-empty"><span class="typing-dot"></span>等待结构化结论…</p>', 'result-pending');
  const header = preview.verdict ? `<div class="verdict ${preview.verdict}">${verdictLabel(preview.verdict)}</div>` : '<span class="preview-pending">结论生成中…</span>';
  const summary = typeof preview.summary === 'string' ? `<p class="summary">${escapeHtml(preview.summary)}</p>` : '';
  const overview = preview.strengths !== undefined ? resultBlock('overview', `${header}${summary}`, 'result-overview') : '';
  const strengths = preview.issues !== undefined && preview.strengths !== undefined
    ? resultBlock('strengths', `<h2>正确之处</h2>${list(preview.strengths, '模型未列出明确的正确之处。')}`)
    : '';
  const issues = preview.complexity !== undefined && preview.issues !== undefined
    ? resultBlock('issues', `<h2>问题清单</h2>${preview.issues.length === 0 ? '<p class="muted">未发现需要单列的问题。</p>' : preview.issues.map(issue => `<article class="issue severity-${escapeHtml(issue.severity ?? 'info')}"><div class="issue-title"><span>${escapeHtml(issue.title ?? '未命名问题')}</span>${issue.line ? `<span class="preview-line">第 ${issue.line} 行</span>` : ''}</div>${issue.description ? `<p>${escapeHtml(issue.description)}</p>` : ''}${issue.suggestion ? `<p class="suggestion"><strong>建议：</strong>${escapeHtml(issue.suggestion)}</p>` : ''}</article>`).join('')}`)
    : '';
  const complexityComplete = preview.suggestedSnippet !== undefined || preview.suggestedFix !== undefined;
  const complexity = complexityComplete && preview.complexity
    ? resultBlock('complexity', `<h2>复杂度</h2><dl>${preview.complexity.time ? `<dt>时间</dt><dd>${escapeHtml(preview.complexity.time)}</dd>` : ''}${preview.complexity.space ? `<dt>空间</dt><dd>${escapeHtml(preview.complexity.space)}</dd>` : ''}</dl>${preview.complexity.assessment ? `<p>${escapeHtml(preview.complexity.assessment)}</p>` : ''}`)
    : '';
  return overview || strengths || issues || complexity
    ? `${overview}${strengths}${issues}${complexity}`
    : resultBlock('pending', '<p class="preview-empty"><span class="typing-dot"></span>正在整理判题结果…</p>', 'result-pending');
}

function resultContent(source: string, result: JudgeResult): string {
  const issues = result.issues.length === 0
    ? '<p class="muted">未发现需要单列的问题。</p>'
    : result.issues.map(issue => `<article class="issue severity-${escapeHtml(issue.severity)}">
        <div class="issue-title"><span>${escapeHtml(issue.title)}</span>${issue.line ? `<button class="line" data-line="${issue.line}" title="跳转到源码">第 ${issue.line} 行</button>` : ''}</div>
        <p>${escapeHtml(issue.description)}</p>
        ${issue.suggestion ? `<p class="suggestion"><strong>建议：</strong>${escapeHtml(issue.suggestion)}</p>` : ''}
      </article>`).join('');
  return `${resultBlock('overview', `<div class="verdict ${result.verdict}">${verdictLabel(result.verdict)}</div><p class="summary">${escapeHtml(result.summary)}</p>`, 'result-overview')}
    ${resultBlock('strengths', `<h2>正确之处</h2>${list(result.strengths, '模型未列出明确的正确之处。')}`)}
    ${resultBlock('issues', `<h2>问题清单</h2>${issues}`)}
    ${resultBlock('complexity', `<h2>复杂度</h2><dl><dt>时间</dt><dd>${escapeHtml(result.complexity.time)}</dd><dt>空间</dt><dd>${escapeHtml(result.complexity.space)}</dd></dl><p>${escapeHtml(result.complexity.assessment)}</p>`)}
    ${(result.suggestedFix || result.suggestedSnippet) ? resultBlock('fix', `<h2>必要的局部修正</h2>${diffContent(source, result)}`) : ''}`;
}

function thinkingLevelSelect(thinkingLevel: ThinkingLevel): string {
  return `<select id="thinking-level" class="thinking-level-select" aria-label="思考强度" title="选择下一次评审的思考强度"><option value="disabled"${thinkingLevel === 'disabled' ? ' selected' : ''}>思考：关闭</option><option value="high"${thinkingLevel === 'high' ? ' selected' : ''}>思考：高强度</option><option value="max"${thinkingLevel === 'max' ? ' selected' : ''}>思考：最大强度</option></select>`;
}

function thinkingStatusContent(status: ThinkingStatus, thinkingLevel?: ThinkingLevel, hideThinkingLevel = false): string {
  const elapsedSeconds = Math.floor(status.elapsedMs / 1000);
  const text = status.complete ? `思考完成 · ${elapsedSeconds} 秒` : `Thinking · ${elapsedSeconds} 秒`;
  const stages = status.stages.map(stage => `<li data-stage-title="${escapeHtml(stage.title)}"><strong class="thinking-stage-title">${escapeHtml(stage.title)}</strong>${stage.details.map(detail => `<p class="thinking-stage-detail">${escapeHtml(detail)}</p>`).join('')}</li>`).join('');
  const stageList = status.complete ? '' : `<ol id="thinking-stages" class="thinking-stages">${stages}</ol>`;
  const statusHtml = `<div class="thinking-block"><div class="stream-status${status.complete ? ' thinking-complete' : ''}"><span id="thinking-spinner" class="spinner"${status.complete ? ' hidden' : ''}></span><span id="thinking-check" class="thinking-check"${status.complete ? '' : ' hidden'}>✓</span><strong id="thinking-label" data-elapsed-ms="${status.elapsedMs}" data-complete="${status.complete}">${escapeHtml(text)}</strong><span id="attempt">${status.attempt > 1 ? `重试 ${status.attempt}/2` : ''}</span></div>${stageList}</div>`;
  return thinkingLevel ? `<div class="thinking-toolbar${hideThinkingLevel ? ' thinking-pending-controls' : ''}">${statusHtml}${thinkingLevelSelect(thinkingLevel)}</div>` : statusHtml;
}

function reviewControls(label: string, thinkingLevel: ThinkingLevel, secondary = false, showThinkingLevel = true): string {
  return `<div class="review-actions"><button id="review"${secondary ? ' class="secondary"' : ''}>${label}</button>${showThinkingLevel ? thinkingLevelSelect(thinkingLevel) : ''}</div>`;
}

export function renderWebview(state: ViewState, nonce: string, celebrateCorrect = false, confettiScriptUri = '', cspSource = '', thinkingLevel: ThinkingLevel = 'high'): string {
  let body: string;
  if (state.kind === 'loading') {
    const loadingActions = state.thinkingStatus
      ? '<button id="cancel" class="secondary">取消</button>'
      : `<div class="review-actions pending-review-actions"><button id="cancel" class="secondary">取消</button>${thinkingLevelSelect(thinkingLevel)}</div>`;
    body = `<header><span class="eyebrow">${escapeHtml(state.fileName)}</span><div id="header-actions">${loadingActions}</div></header>
      ${state.thinkingStatus ? thinkingStatusContent(state.thinkingStatus, thinkingLevel, true) : ''}
      ${state.thinkingStatus && !state.thinkingStatus.complete ? '' : `<section class="live-preview" aria-live="polite" aria-busy="true"><div id="structured-preview" class="result-stack">${previewContent(state.preview)}</div></section>`}`;
  } else if (state.kind === 'error') {
    body = `<div class="center"><div class="state-icon">!</div><h1>无法完成评审</h1><p>${escapeHtml(state.message)}</p>${reviewControls('重新评审', thinkingLevel)}</div>`;
  } else if (state.kind === 'result') {
    body = `<header><span class="eyebrow">${escapeHtml(state.fileName)}</span><div id="header-actions">${reviewControls('重新评审', thinkingLevel, true, !state.thinkingStatus)}</div></header>${state.thinkingStatus ? thinkingStatusContent(state.thinkingStatus, thinkingLevel) : ''}<section class="live-preview final-result result-stack">${resultContent(state.source, state.result)}</section>`;
  } else {
    body = `<div class="center"><div class="state-icon">✓</div><h1>408 Judge</h1><p>${escapeHtml(state.message ?? '打开一道 .cpp 作答，然后从编辑器右键菜单开始评审。')}</p>${reviewControls('评审当前 C++ 作答', thinkingLevel)}</div>`;
  }
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${cspSource ? `${escapeHtml(cspSource)} ` : ''}'nonce-${nonce}';">
  <style>
    :root{color-scheme:light dark}[hidden]{display:none!important}body{padding:16px;color:var(--vscode-foreground);font:13px/1.55 var(--vscode-font-family);overflow-wrap:anywhere}h1{font-size:18px;margin:10px 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:24px 0 8px;color:var(--vscode-descriptionForeground)}p{margin:6px 0 10px}.center{text-align:center;padding:42px 8px}.state-icon{display:grid;place-items:center;margin:auto;width:42px;height:42px;border:1px solid var(--vscode-focusBorder);border-radius:50%;font-size:20px;color:var(--vscode-focusBorder)}button{border:0;border-radius:3px;padding:6px 12px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary,.line{color:var(--vscode-textLink-foreground);background:transparent;padding:2px 4px}.review-actions{display:flex;min-width:120px;flex-direction:column;align-items:stretch;gap:5px}.review-actions button{white-space:nowrap}.thinking-level-select{min-height:26px;padding:3px 22px 3px 7px;color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border);border-radius:2px;font:12px var(--vscode-font-family);cursor:pointer;outline:none}.thinking-level-select:focus{border-color:var(--vscode-focusBorder)}.review-actions .thinking-level-select{width:100%}.center .review-actions{width:max-content;min-width:172px;margin:18px auto 0}header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:14px}.eyebrow{padding-top:3px;font-family:var(--vscode-editor-font-family);color:var(--vscode-descriptionForeground)}.verdict{display:inline-block;border-radius:999px;padding:4px 10px;font-weight:700}.correct{color:var(--vscode-testing-iconPassed);background:color-mix(in srgb,var(--vscode-testing-iconPassed) 14%,transparent)}.partially_correct{color:var(--vscode-editorWarning-foreground);background:color-mix(in srgb,var(--vscode-editorWarning-foreground) 14%,transparent)}.incorrect{color:var(--vscode-testing-iconFailed);background:color-mix(in srgb,var(--vscode-testing-iconFailed) 14%,transparent)}.insufficient{color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background)}.summary{font-size:14px;margin:14px 0 22px}.muted{color:var(--vscode-descriptionForeground)}ul{padding-left:20px}.issue{border-left:3px solid var(--vscode-descriptionForeground);padding:7px 10px;margin:8px 0;background:var(--vscode-editorWidget-background)}.severity-error{border-color:var(--vscode-testing-iconFailed)}.severity-warning{border-color:var(--vscode-editorWarning-foreground)}.issue-title{display:flex;justify-content:space-between;gap:8px;font-weight:700}.suggestion{color:var(--vscode-descriptionForeground)}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}dt{color:var(--vscode-descriptionForeground)}dd{margin:0;font-family:var(--vscode-editor-font-family)}pre{padding:10px;overflow:auto;background:var(--vscode-textCodeBlock-background);font-family:var(--vscode-editor-font-family)}.spinner{display:inline-block;width:12px;height:12px;border:2px solid var(--vscode-editorWidget-border);border-top-color:var(--vscode-progressBar-background);border-radius:50%;animation:spin .8s linear infinite}.stream-status{display:flex;align-items:center;gap:8px;margin:12px 0 18px;color:var(--vscode-descriptionForeground)}.thinking-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:12px 0 18px}.thinking-block{min-width:0;flex:1}.thinking-stages{max-height:148px;margin:8px 0 0;padding:0 4px 0 20px;overflow-y:auto;list-style:none;color:var(--vscode-descriptionForeground)}.thinking-stages li{position:relative;padding:2px 0 7px 12px}.thinking-stages li::before{content:'';position:absolute;left:0;top:.65em;width:5px;height:5px;border-radius:50%;background:var(--vscode-descriptionForeground)}.thinking-stages li:not(:last-child)::after{content:'';position:absolute;left:2px;top:1em;bottom:-.35em;width:1px;background:var(--vscode-editorWidget-border)}.thinking-stages li:last-child{color:var(--vscode-foreground)}.thinking-toolbar .stream-status{min-width:0;margin:0;overflow:hidden}.thinking-toolbar #thinking-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.thinking-toolbar .thinking-level-select{width:auto;max-width:142px;flex:0 0 auto}.stream-status #attempt{margin-left:auto}.thinking-complete{color:var(--vscode-descriptionForeground)}.thinking-check{color:var(--vscode-testing-iconPassed);font-weight:700}details{margin:10px 0;border:1px solid var(--vscode-editorWidget-border);border-radius:4px;background:var(--vscode-editorWidget-background)}summary{padding:7px 10px;cursor:pointer;font-weight:600}.stream{margin:0;max-height:38vh;white-space:pre-wrap;color:var(--vscode-descriptionForeground)}.live-preview{margin-top:14px;padding-top:10px;border-top:1px solid var(--vscode-editorWidget-border)}.live-preview-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-weight:700}.live-badge{font-size:10px;font-weight:600;color:var(--vscode-testing-iconPassed);letter-spacing:.08em}.preview-empty,.preview-pending{color:var(--vscode-descriptionForeground)}.typing-dot{display:inline-block;width:6px;height:6px;margin-right:8px;border-radius:50%;background:var(--vscode-progressBar-background);animation:pulse 1.2s ease-in-out infinite}.preview-line{font-weight:400;color:var(--vscode-descriptionForeground)}.diff{overflow:auto;border:1px solid var(--vscode-editorWidget-border);border-radius:4px;background:var(--vscode-editor-background);font:12px/1.65 var(--vscode-editor-font-family)}.diff-table{width:max-content;min-width:100%;border-collapse:collapse;border-spacing:0}.diff-table th{height:24px;padding:0 7px;text-align:left;font:11px var(--vscode-font-family);color:var(--vscode-descriptionForeground);background:var(--vscode-editorGroupHeader-tabsBackground);border-bottom:1px solid var(--vscode-editorWidget-border)}.diff-table th:first-child,.diff-table th:nth-child(2){width:3em;text-align:right}.diff-row td{height:21px;padding:0;border:0}.line-number{min-width:3em;padding:0 7px!important;text-align:right;color:var(--vscode-editorLineNumber-foreground);background:color-mix(in srgb,var(--vscode-editorGutter-background) 92%,transparent);border-right:1px solid var(--vscode-editorWidget-border)!important;user-select:none}.diff-marker{width:1.5em;padding-left:7px!important;font-weight:700;user-select:none}.diff-code{min-width:24em;padding:0 12px 0 2px!important;white-space:pre;overflow-wrap:normal;background:transparent!important}.diff-row.removed{color:var(--vscode-editor-foreground);background:color-mix(in srgb,var(--vscode-gitDecoration-deletedResourceForeground) 16%,var(--vscode-editor-background))}.diff-row.added{color:var(--vscode-editor-foreground);background:color-mix(in srgb,var(--vscode-gitDecoration-addedResourceForeground) 16%,var(--vscode-editor-background))}.diff-row.removed .diff-marker{color:var(--vscode-gitDecoration-deletedResourceForeground)}.diff-row.added .diff-marker{color:var(--vscode-gitDecoration-addedResourceForeground)}.diff-hunk td{height:24px;padding:0 8px;color:var(--vscode-textLink-foreground);background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-editorWidget-border);white-space:pre}.diff-row.context .diff-code{color:var(--vscode-editor-foreground)}.fireworks-layer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:1000;contain:strict}.celebration-glow{position:absolute;left:-15%;right:-15%;bottom:-18%;height:58%;background:radial-gradient(ellipse at 50% 100%,rgba(255,183,3,.34),rgba(247,37,133,.13) 37%,transparent 70%);animation:celebration-glow 2.5s ease-out both}.firework-fountain,.firework-particle,.firework-ring,.firework-comet,.firework-ember{position:absolute;left:var(--x);top:var(--y);pointer-events:none}.firework-fountain{width:var(--size);height:calc(var(--size)*3.6);border-radius:999px;background:linear-gradient(to top,transparent,var(--color) 42%,#fff);box-shadow:0 0 9px 2px var(--color);animation:firework-fountain var(--duration) cubic-bezier(.14,.68,.32,1) var(--delay) both}.firework-comet{width:4px;height:34px;border-radius:999px;background:linear-gradient(to top,transparent 4%,var(--color) 68%,#fff);filter:drop-shadow(0 0 6px var(--color));animation:firework-comet .62s cubic-bezier(.2,.72,.25,1) var(--delay) both}.firework-particle{width:var(--size);height:var(--size);border-radius:50%;background:var(--color);box-shadow:0 0 10px 2px var(--color);animation:firework-particle var(--duration) cubic-bezier(.12,.7,.24,1) var(--delay) both}.firework-ring{width:10px;height:10px;margin:-5px;border:2px solid var(--color);border-radius:50%;box-shadow:0 0 12px var(--color);animation:firework-ring .82s ease-out var(--delay) both}.firework-ember{width:3px;height:8px;border-radius:999px;background:var(--color);box-shadow:0 0 8px var(--color);animation:firework-ember 1.35s ease-in var(--delay) both}.verdict.correct.celebrating{animation:verdict-celebrate 1.15s cubic-bezier(.2,.8,.25,1) both}@keyframes celebration-glow{0%{opacity:0;transform:scale(.8)}18%{opacity:1}100%{opacity:0;transform:scale(1.18)}}@keyframes firework-fountain{0%{opacity:0;transform:translate(-50%,0) rotate(var(--rotation)) scale(.35)}8%{opacity:1}52%{opacity:1;transform:translate(calc(-50% + var(--peak-x)),var(--peak-y)) rotate(calc(var(--rotation)*-1)) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--end-x)),var(--end-y)) rotate(calc(var(--rotation)*-2.4)) scale(.25)}}@keyframes firework-comet{0%{opacity:0;transform:translate(-50%,0) scaleY(.25)}15%{opacity:1}82%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),var(--ty)) scaleY(1.25)}}@keyframes firework-particle{0%{opacity:0;transform:translate(-50%,-50%) scale(.15)}10%{opacity:1}68%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(.2)}}@keyframes firework-ring{0%{opacity:1;transform:scale(.2)}100%{opacity:0;transform:scale(10)}}@keyframes firework-ember{0%{opacity:0;transform:translate(-50%,-50%) rotate(0)}18%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) rotate(var(--spin))}}@keyframes verdict-celebrate{0%{transform:scale(1)}28%{transform:scale(1.2);box-shadow:0 0 0 7px color-mix(in srgb,var(--vscode-testing-iconPassed) 18%,transparent)}62%{transform:scale(.97)}100%{transform:scale(1)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}@media (prefers-reduced-motion:reduce){.fireworks-layer{display:none}.verdict.correct.celebrating{animation:none}}

    .result-stack{display:flex;flex-direction:column;gap:10px}
    .result-block{padding:13px 14px 12px;border:1px solid color-mix(in srgb,var(--vscode-editorWidget-border) 72%,transparent);border-radius:7px;background:color-mix(in srgb,var(--vscode-editorWidget-background) 58%,transparent)}
    .result-overview{padding-top:14px;border-color:color-mix(in srgb,var(--vscode-focusBorder) 36%,var(--vscode-editorWidget-border));background:color-mix(in srgb,var(--vscode-editorWidget-background) 78%,transparent)}
    .result-pending{padding:8px 2px;border-color:transparent;background:transparent}
    .result-block h2{margin:0 0 9px}
    .result-block .summary{margin:10px 0 0}
    .result-block ul{margin:0;padding-left:18px}
    .result-block dl{margin:0}
    .result-block>p:last-child{margin-bottom:0}
    #header-actions{display:flex;min-width:120px;justify-content:flex-end}
    .thinking-toolbar{position:relative}
    .thinking-pending-controls .thinking-level-select{position:absolute;inset-inline-end:0;top:0;visibility:hidden;pointer-events:none}
    .pending-review-actions .thinking-level-select{visibility:hidden;pointer-events:none}
    .result-block-enter{animation:result-block-reveal .52s cubic-bezier(.16,1,.3,1) both}
    .final-result .result-block:nth-child(2){animation-delay:.05s}
    .final-result .result-block:nth-child(3){animation-delay:.1s}
    .final-result .result-block:nth-child(4){animation-delay:.15s}
    .final-result .result-block:nth-child(5){animation-delay:.2s}
    @keyframes result-block-reveal{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
    .thinking-stages{max-height:none;overflow:visible;padding-left:18px}
    .thinking-stages li{padding:1px 0 18px 14px}
    .thinking-stages li::before{top:.72em}
    .thinking-stages li:not(:last-child)::after{bottom:-.15em}
    .thinking-stage-title{display:block;color:var(--vscode-foreground);font-size:14px;line-height:1.45}
    .thinking-stage-detail{margin:5px 0 0;color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.55}
    .thinking-stage-enter .thinking-stage-title{animation:thinking-title-reveal .48s cubic-bezier(.16,1,.3,1) both}
    .thinking-stage-enter::before{animation:thinking-dot-reveal .4s cubic-bezier(.16,1,.3,1) both}
    .thinking-stage-connected::after{transform-origin:top;animation:thinking-line-reveal .52s cubic-bezier(.16,1,.3,1) both}
    .thinking-summary-batch{animation:thinking-summary-reveal .58s cubic-bezier(.16,1,.3,1) .06s both}
    @keyframes thinking-title-reveal{from{opacity:0;transform:translate3d(0,7px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
    @keyframes thinking-dot-reveal{from{opacity:0;transform:scale(.35)}to{opacity:1;transform:scale(1)}}
    @keyframes thinking-line-reveal{from{opacity:0;transform:scaleY(0)}to{opacity:1;transform:scaleY(1)}}
    @keyframes thinking-summary-reveal{from{opacity:0;transform:translate3d(0,5px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
    @media (prefers-reduced-motion:reduce){.result-block-enter,.thinking-stage-enter .thinking-stage-title,.thinking-stage-enter::before,.thinking-stage-connected::after,.thinking-summary-batch{animation:none}}
  </style></head><body>${body}${confettiScriptUri ? `<script nonce="${nonce}" src="${escapeHtml(confettiScriptUri)}"></script>` : ''}<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const thinkingLabel=document.getElementById('thinking-label');let thinkingElapsed=Number(thinkingLabel?.dataset.elapsedMs||0);let thinkingAnchor=Date.now();let thinkingDone=thinkingLabel?.dataset.complete==='true';const updateThinkingTime=()=>{if(thinkingLabel&&!thinkingDone)thinkingLabel.textContent='Thinking · '+Math.floor((thinkingElapsed+Date.now()-thinkingAnchor)/1000)+' 秒'};const thinkingTimer=setInterval(updateThinkingTime,250);window.addEventListener('unload',()=>clearInterval(thinkingTimer));
    const reduceOutputMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let autoFollowOutput=true;
    let followOutputFrame=0;
    const updateOutputFollow=()=>{autoFollowOutput=window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-120};
    const followLiveOutput=()=>{
      if(!autoFollowOutput||followOutputFrame)return;
      followOutputFrame=requestAnimationFrame(()=>{
        followOutputFrame=0;
        window.scrollTo({top:document.documentElement.scrollHeight,behavior:reduceOutputMotion?'auto':'smooth'});
      });
    };
    window.addEventListener('scroll',updateOutputFollow,{passive:true});
    window.addEventListener('resize',updateOutputFollow);
    const bindControls=(root=document)=>{
      root.querySelector('#review')?.addEventListener('click',()=>vscode.postMessage({type:'review'}));
      root.querySelector('#thinking-level')?.addEventListener('change',event=>vscode.postMessage({type:'setThinkingLevel',level:event.target.value}));
      root.querySelector('#cancel')?.addEventListener('click',()=>vscode.postMessage({type:'cancel'}));
      root.querySelectorAll('[data-line]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({type:'openLine',line:Number(el.dataset.line)})));
    };
    bindControls();
    function launchConfetti(){
      const badge=document.querySelector('.verdict.correct');
      if(!badge||typeof window.launchJudgeConfetti!=='function')return;
      badge.classList.add('celebrating');setTimeout(()=>badge.classList.remove('celebrating'),1300);
      window.launchJudgeConfetti();
    }
    const syncResultBlocks=(container,html)=>{
      const template=document.createElement('template');
      template.innerHTML=html;
      const incoming=Array.from(template.content.children).filter(block=>block.dataset.resultBlock);
      const incomingKeys=new Set(incoming.map(block=>block.dataset.resultBlock));
      incoming.forEach((next,index)=>{
        const key=next.dataset.resultBlock;
        let current=Array.from(container.children).find(block=>block.dataset.resultBlock===key);
        if(current){
          if(current.className!==next.className)current.className=next.className;
          if(current.innerHTML!==next.innerHTML)current.innerHTML=next.innerHTML;
        }else current=next;
        const atIndex=container.children[index];
        if(current!==atIndex)container.insertBefore(current,atIndex??null);
      });
      Array.from(container.children).forEach(block=>{if(!incomingKeys.has(block.dataset.resultBlock))block.remove()});
    };
    window.addEventListener('message',event=>{
      if(event.data?.type!=='stream')return;
      const spinner=document.getElementById('thinking-spinner');
      const check=document.getElementById('thinking-check');
      const preview=document.getElementById('structured-preview');
      const headerActions=document.getElementById('header-actions');
      const attempt=document.getElementById('attempt');
      const stages=document.getElementById('thinking-stages');
      if(thinkingLabel&&typeof event.data.thinkingElapsedMs==='number'){
        thinkingElapsed=event.data.thinkingElapsedMs;
        thinkingAnchor=Date.now();
        thinkingDone=Boolean(event.data.thinkingComplete);
        thinkingLabel.textContent=thinkingDone?event.data.thinkingText:('Thinking · '+Math.floor(thinkingElapsed/1000)+' 秒');
      }
      if(spinner)spinner.hidden=Boolean(event.data.thinkingComplete);
      if(check)check.hidden=!event.data.thinkingComplete;
      if(event.data.thinkingComplete)stages?.remove();
      else if(stages&&Array.isArray(event.data.thinkingStages)){
        const incoming=event.data.thinkingStages;
        let index=0;
        for(;index<incoming.length;index++){
          const stage=incoming[index];
          let item=stages.children[index];
          if(item?.dataset.stageTitle!==stage.title){
            while(stages.children.length>index)stages.lastElementChild?.remove();
            stages.lastElementChild?.classList.add('thinking-stage-connected');
            item=document.createElement('li');
            item.className='thinking-stage-enter';
            item.dataset.stageTitle=stage.title;
            const title=document.createElement('strong');
            title.className='thinking-stage-title';
            item.appendChild(title);
            stages.appendChild(item);
          }
          item.querySelector('.thinking-stage-title').textContent=stage.title;
          const details=Array.isArray(stage.details)?stage.details:[];
          let detailIndex=0;
          for(;detailIndex<details.length;detailIndex++){
            const text=typeof details[detailIndex]==='string'?details[detailIndex]:'';
            const rendered=item.querySelectorAll('.thinking-stage-detail')[detailIndex];
            if(rendered&&rendered.textContent===text)continue;
            while(item.querySelectorAll('.thinking-stage-detail').length>detailIndex)item.lastElementChild?.remove();
            const paragraph=document.createElement('p');
            paragraph.className='thinking-stage-detail thinking-summary-batch';
            paragraph.textContent=text;
            item.appendChild(paragraph);
          }
          while(item.querySelectorAll('.thinking-stage-detail').length>details.length)item.lastElementChild?.remove();
        }
        while(stages.children.length>incoming.length)stages.lastElementChild?.remove();
        followLiveOutput();
      }
      if(preview&&typeof event.data.previewHtml==='string'){
        syncResultBlocks(preview,event.data.previewHtml);
        followLiveOutput();
      }
      if(event.data.final){
        if(headerActions&&typeof event.data.headerActionsHtml==='string'){
          headerActions.innerHTML=event.data.headerActionsHtml;
          bindControls(headerActions);
        }
        document.querySelector('.thinking-pending-controls')?.classList.remove('thinking-pending-controls');
        preview?.closest('.live-preview')?.setAttribute('aria-busy','false');
        if(preview)bindControls(preview);
      }
      if(attempt)attempt.textContent=event.data.attempt>1?('重试 '+event.data.attempt+'/2'):'';
      if(event.data.celebrateCorrect)launchConfetti();
    });
    if(${celebrateCorrect ? 'true' : 'false'})queueMicrotask(launchConfetti);
  </script></body></html>`;
}

export class JudgeViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private state: ViewState = { kind: 'idle' };
  private celebratedCorrect = false;
  private thinkingLevel: ThinkingLevel;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onReview: () => void,
    private readonly onCancel: () => void,
    private readonly onOpenLine: (line: number) => void,
    thinkingLevel: ThinkingLevel = 'high',
    private readonly onThinkingLevelChange: (level: ThinkingLevel) => void | Promise<void> = () => {}
  ) { this.thinkingLevel = thinkingLevel; }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    this.disposables.push(view.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const data = message as { type?: string; line?: number; level?: string };
      if (data.type === 'review') this.onReview();
      else if (data.type === 'cancel') this.onCancel();
      else if (data.type === 'openLine' && Number.isInteger(data.line) && (data.line ?? 0) > 0) this.onOpenLine(data.line!);
      else if (data.type === 'setThinkingLevel' && (data.level === 'disabled' || data.level === 'high' || data.level === 'max')) {
        const previousLevel = this.thinkingLevel;
        this.thinkingLevel = data.level;
        void Promise.resolve(this.onThinkingLevelChange(data.level)).catch(() => {
          this.thinkingLevel = previousLevel;
          this.render();
        });
      }
    }));
    this.render();
  }

  setState(state: ViewState): void {
    const previous = this.state;
    this.state = state;
    if (state.kind === 'loading' && state.attempt === 1 && Object.keys(state.preview).length === 0) this.celebratedCorrect = false;
    const thinkingJustCompleted = previous.kind === 'loading' && state.kind === 'loading'
      && previous.thinkingStatus?.complete === false && state.thinkingStatus?.complete === true;
    if (this.view && previous.kind === 'loading' && state.kind === 'result') {
      const celebrateCorrect = this.consumeCorrectCelebration();
      void this.view.webview.postMessage({
        type: 'stream', final: true,
        thinkingText: state.thinkingStatus ? `思考完成 · ${Math.floor(state.thinkingStatus.elapsedMs / 1000)} 秒` : undefined,
        thinkingStages: state.thinkingStatus?.stages ?? [], thinkingElapsedMs: state.thinkingStatus?.elapsedMs,
        thinkingComplete: true, previewHtml: resultContent(state.source, state.result),
        headerActionsHtml: reviewControls('重新评审', this.thinkingLevel, true, !state.thinkingStatus),
        attempt: previous.attempt, celebrateCorrect
      });
      return;
    }
    if (this.view && previous.kind === 'loading' && state.kind === 'loading' && !thinkingJustCompleted) {
      const thinkingText = state.thinkingStatus
        ? state.thinkingStatus.complete
          ? `思考完成 · ${Math.floor(state.thinkingStatus.elapsedMs / 1000)} 秒`
          : `Thinking · ${Math.floor(state.thinkingStatus.elapsedMs / 1000)} 秒`
        : undefined;
      const celebrateCorrect = state.preview.strengths !== undefined && this.consumeCorrectCelebration();
      void this.view.webview.postMessage({
        type: 'stream', thinkingText, thinkingStages: state.thinkingStatus?.stages ?? [], thinkingElapsedMs: state.thinkingStatus?.elapsedMs,
        thinkingComplete: state.thinkingStatus?.complete ?? false,
        previewHtml: previewContent(state.preview), attempt: state.attempt, celebrateCorrect
      });
      return;
    }
    this.render();
  }

  getState(): ViewState { return this.state; }

  setThinkingLevel(level: ThinkingLevel): void {
    if (this.thinkingLevel === level) return;
    this.thinkingLevel = level;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
    const confettiScriptUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'confetti.js')).toString();
    this.view.webview.html = renderWebview(this.state, nonce, this.consumeCorrectCelebration(), confettiScriptUri, this.view.webview.cspSource, this.thinkingLevel);
  }

  private consumeCorrectCelebration(): boolean {
    const verdict = this.state.kind === 'loading' ? this.state.preview.verdict : this.state.kind === 'result' ? this.state.result.verdict : undefined;
    if (verdict !== 'correct' || this.celebratedCorrect) return false;
    this.celebratedCorrect = true;
    return true;
  }

  dispose(): void { this.disposables.forEach(item => item.dispose()); }
}
