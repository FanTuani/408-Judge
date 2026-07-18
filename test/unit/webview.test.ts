import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { joinPath: (_base: unknown, ...parts: string[]) => ({ toString: () => parts.join('/') }) }
}));

describe('diff webview markup', () => {
  it('shows the current shortcut after review buttons and updates the hint in place', async () => {
    const { JudgeViewProvider, renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({ kind: 'idle' }, 'nonce', false, '', '', 'high', "⌘'");
    expect(html).toContain('打开一道 .c 或 .cpp 作答，然后点击开始评审。');
    expect(html).not.toContain('然后从编辑器右键菜单开始评审。');
    expect(html).toContain('<button id="review" class="review-button"><span>评审当前 C/C++ 作答</span><kbd class="shortcut-hint" data-shortcut-hint>⌘&#39;</kbd></button>');
    expect(html).toContain('<main id="view-content" class="view-content">');
    expect(html).toContain('<footer class="app-footer" role="toolbar" aria-label="插件功能">');
    expect(html).toContain('<button id="home" class="app-footer-button active" title="返回插件首页" aria-label="返回插件首页" aria-current="page">');
    expect(html).toContain('<button id="history" class="app-footer-button" title="查看评测历史" aria-label="查看评测历史">');
    expect(html).toContain('<button id="settings" class="app-footer-button" title="打开 408 Judge 设置" aria-label="打开 408 Judge 设置">');
    expect(html.indexOf('id="history"')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html.indexOf('id="home"')).toBeLessThan(html.indexOf('id="history"'));
    expect(html.indexOf('id="history"')).toBeLessThan(html.indexOf('id="settings"'));
    expect(html.indexOf('id="settings"')).toBeLessThan(html.indexOf('id="review-profile"'));
    expect(html).toContain('.app-footer{box-sizing:border-box;display:flex;height:40px;min-height:40px');
    expect(html).toContain('@media (max-width:360px)');
    expect(html).toContain('.app-footer-button-label{display:none}');
    expect(html).toContain("vscode.postMessage({type:'home'})");
    expect(html).toContain("vscode.postMessage({type:'settings'})");
    expect(html).toContain('var(--vscode-keybindingLabel-background)');
    expect(html).toContain("if(event.data?.type==='shortcut')");

    const messages: Array<{ type?: string; shortcut?: string }> = [];
    const webview = {
      options: {}, html: '', cspSource: 'vscode-webview://unit-test',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: () => ({ dispose() {} }),
      postMessage: async (message: { type?: string; shortcut?: string }) => { messages.push(message); return true; }
    };
    const provider = new JudgeViewProvider({} as never, () => {}, () => {}, () => {});
    provider.resolveWebviewView({ webview } as never);
    const htmlBeforeUpdate = webview.html;
    provider.setReviewShortcut('⌘K');
    expect(webview.html).toBe(htmlBeforeUpdate);
    expect(messages.at(-1)).toEqual({ type: 'shortcut', shortcut: '⌘K' });
    provider.dispose();
  });

  it('renders review history as a navigable list and detail view', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const entry = {
      id: 'history-1', fileUri: 'file:///workspace/answer.cpp', fileName: 'answer.cpp', displayPath: 'src/answer.cpp',
      reviewedAt: '2026-07-17T02:00:00.000Z', source: 'return 0;',
      result: {
        verdict: 'incorrect' as const, summary: '边界条件仍需修复', strengths: [],
        issues: [{ severity: 'warning', title: '边界', description: '需修复', suggestion: '补充分支', line: 2 }],
        complexity: { time: 'O(1)', space: 'O(1)', assessment: '合理' }, suggestedSnippet: ''
      }
    };
    const listHtml = renderWebview({ kind: 'history', entries: [entry] }, 'nonce');
    expect(listHtml).toContain('<header><h1>评测历史</h1></header>');
    expect(listHtml).not.toContain('<span class="eyebrow">评测历史</span>');
    expect(listHtml).not.toContain('id="history-close"');
    expect(listHtml).toContain('data-history-id="history-1"');
    expect(listHtml).toContain('src/answer.cpp');
    expect(listHtml).toContain('边界条件仍需修复');
    expect(listHtml).toContain("vscode.postMessage({type:'historyEntry',id:el.dataset.historyId})");
    expect(listHtml).toContain('class="app-footer-button active"');
    expect(listHtml).toContain('aria-current="page"');
    expect(listHtml).toContain('.history-item-top>strong{min-width:0;flex:1;overflow-wrap:anywhere}');
    expect(listHtml).toContain('.history-item .verdict{flex:0 0 auto;');
    expect(listHtml).toContain('white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb');

    const detailHtml = renderWebview({ kind: 'history-detail', entry }, 'nonce');
    expect(detailHtml).toContain('<div class="history-detail-heading">');
    expect(detailHtml).toContain('<button id="history-back" class="secondary">返回</button>');
    expect(detailHtml).not.toContain('id="history-close"');
    expect(detailHtml).not.toContain('>全部记录</button>');
    expect(detailHtml).toContain('.history-detail-heading{min-width:0;flex:1}');
    expect(detailHtml).toContain('.history-detail-actions{display:flex;flex:0 0 auto;');
    expect(detailHtml).toContain('.history-detail-actions button{white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb}');
    expect(detailHtml).toContain('<section class="live-preview final-result result-stack">');
    expect(detailHtml).toContain('边界条件仍需修复');
    expect(detailHtml).toContain('data-file-uri="file:///workspace/answer.cpp"');

    let receiver: ((message: unknown) => void) | undefined;
    const showHistory = vi.fn();
    const openHistory = vi.fn();
    const openSettings = vi.fn();
    const webview = {
      options: {}, html: '', cspSource: 'vscode-webview://unit-test',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: (listener: (message: unknown) => void) => { receiver = listener; return { dispose() {} }; },
      postMessage: async () => true
    };
    const provider = new (await import('../../src/webview.js')).JudgeViewProvider(
      {} as never, () => {}, () => {}, () => {}, 'high', 'deepseek-v4-pro', () => {}, undefined, showHistory, openHistory, openSettings
    );
    provider.resolveWebviewView({ webview } as never);
    receiver?.({ type: 'history' });
    receiver?.({ type: 'historyEntry', id: 'history-1' });
    expect(showHistory).toHaveBeenCalledOnce();
    expect(openHistory).toHaveBeenCalledWith('history-1');
    provider.showHistory([entry]);
    provider.showHistoryEntry(entry);
    receiver?.({ type: 'historyBack' });
    expect(showHistory).toHaveBeenCalledTimes(2);
    receiver?.({ type: 'settings' });
    expect(openSettings).toHaveBeenCalledOnce();
    receiver?.({ type: 'home' });
    expect(provider.getState().kind).toBe('idle');
    provider.showHistory([entry]);
    provider.showHistoryEntry(entry);
    receiver?.({ type: 'historyClose' });
    expect(provider.getState().kind).toBe('idle');
    provider.dispose();
  });

  it('uses a unified table with full-row diff classes and no per-line code blocks', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'result',
      fileName: 'answer.cpp',
      source: 'int x = 0;\nreturn x;',
      result: {
        verdict: 'incorrect', summary: '需修复', strengths: [], issues: [],
        complexity: { time: 'O(1)', space: 'O(1)', assessment: '不变' },
        suggestedSnippet: 'return 1;',
        suggestedFix: {
          startLine: 1, endLine: 2, original: 'int x = 0;\nreturn x;', replacement: 'return 1;', explanation: '最小修复'
        }
      }
    }, 'nonce');
    expect(html).toContain('<table class="diff-table">');
    expect(html).toContain('<tr class="diff-row removed">');
    expect(html).toContain('<tr class="diff-row added">');
    expect(html).toContain('<tr class="diff-hunk"><td colspan="2">');
    expect(html).not.toContain('class="line-number"');
    expect(html).not.toContain('<th>旧</th>');
    expect(html).not.toContain('<th>新</th>');
    expect(html).not.toContain('<div class="diff-line');
    expect(html).not.toContain('<code>−');
    expect(html).toContain('<section class="live-preview final-result result-stack">');
    expect(html).toContain('data-result-block="overview"');
    expect(html).toContain('data-result-block="strengths"');
    expect(html).toContain('data-result-block="issues"');
    expect(html).toContain('data-result-block="complexity"');
    expect(html).toContain('data-result-block="fix"');
    expect(html).toContain('.result-block-enter{animation:result-block-reveal .52s cubic-bezier(.16,1,.3,1) both}');
    expect(html).toContain('@keyframes result-block-reveal{from{opacity:0;transform:translate3d(0,8px,0)}');
    expect(html).toContain('const syncResultBlocks=(container,html)=>');
    expect(html).toContain("if(current.innerHTML!==next.innerHTML)current.innerHTML=next.innerHTML");
    expect(html).not.toContain('preview.innerHTML=event.data.previewHtml');
  });

  it('shows only the naturally growing thinking timeline while reasoning', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: 'return 0;',
      preview: { verdict: 'incorrect', summary: '返回值仍在生成' }, attempt: 1,
      thinkingStatus: {
        label: '核对算法逻辑',
        stages: [{ title: '核对算法逻辑', details: ['检查主要控制流和关键边界条件。', '继续确认异常输入的处理路径。'] }],
        phase: 'thinking', complete: false, elapsedMs: 1200, attempt: 1
      }
    }, 'nonce');
    expect(html).not.toContain('id="structured-preview"');
    expect(html).not.toContain('返回值仍在生成');
    expect(html).toContain('<strong class="thinking-stage-title">核对算法逻辑</strong>');
    expect(html).toContain('<p class="thinking-stage-detail">检查主要控制流和关键边界条件。</p>');
    expect(html).toContain('<p class="thinking-stage-detail">继续确认异常输入的处理路径。</p>');
    expect(html).toContain('.thinking-stages{max-height:none;overflow:visible');
    expect(html).toContain('class="thinking-toolbar"');
    expect(html).not.toContain('thinking-pending-controls');
    expect(html.indexOf('id="review-profile"')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html).toContain("document.createElement('li')");
    expect(html).toContain("viewContent?.addEventListener('scroll',updateOutputFollow,{passive:true})");
    expect(html).toContain("viewContent.scrollTo({top:viewContent.scrollHeight,behavior:reduceOutputMotion?'auto':'smooth'})");
    expect(html).toContain('followLiveOutput()');
    expect(html).toContain('if(finalOutput)cancelLiveOutputFollow()');
    expect(html).toContain('if(!finalOutput)followLiveOutput()');
    expect(html).toContain('.thinking-stage-enter .thinking-stage-title{animation:thinking-title-reveal .48s cubic-bezier(.16,1,.3,1) both}');
    expect(html).toContain('.thinking-stage-enter::before{animation:thinking-dot-reveal .4s cubic-bezier(.16,1,.3,1) both}');
    expect(html).toContain('.thinking-stage-connected::after{transform-origin:top;animation:thinking-line-reveal .52s cubic-bezier(.16,1,.3,1) both}');
    expect(html).toContain('.thinking-summary-batch{animation:thinking-summary-reveal .58s cubic-bezier(.16,1,.3,1) .06s both}');
    expect(html).toContain('@keyframes thinking-summary-reveal{from{opacity:0;transform:translate3d(0,5px,0)}');
    expect(html).not.toContain('filter:blur');
    expect(html).toContain("stages.lastElementChild?.classList.add('thinking-stage-connected')");
    expect(html).toContain("item.className='thinking-stage-enter'");
    expect(html).toContain("paragraph.className='thinking-stage-detail thinking-summary-batch'");
    expect(html).not.toContain('thinking-stream-fragment');
    expect(html).toContain('@media (prefers-reduced-motion:reduce){.result-block-enter,.thinking-stage-enter .thinking-stage-title,.thinking-stage-enter::before,.thinking-stage-connected::after,.thinking-summary-batch{animation:none}}');
    expect(html).not.toContain('class="caret"');
    expect(html).not.toContain('live-value');
    expect(html).not.toContain('id="conclusion"');
    expect(html).not.toContain('{&quot;verdict&quot;');
  });

  it('publishes only completed result blocks and finalizes without rerendering the page', async () => {
    const { JudgeViewProvider } = await import('../../src/webview.js');
    const messages: Array<{ final?: boolean; previewHtml?: string; headerActionsHtml?: string; thinkingPhase?: string; thinkingText?: string }> = [];
    const webview = {
      options: {}, html: '', cspSource: 'vscode-webview://unit-test',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: () => ({ dispose() {} }),
      postMessage: async (message: { final?: boolean; previewHtml?: string; headerActionsHtml?: string }) => { messages.push(message); return true; }
    };
    const provider = new JudgeViewProvider({} as never, () => {}, () => {}, () => {});
    provider.resolveWebviewView({ webview } as never);
    provider.setState({
      kind: 'loading', fileName: 'answer.cpp', source: '', preview: {}, attempt: 1,
      thinkingStatus: { label: 'Pending', stages: [], phase: 'pending', complete: false, elapsedMs: 800, attempt: 1 }
    });
    expect(webview.html).toContain('Pending · 0 秒');
    const pendingHtml = webview.html;

    provider.setState({
      kind: 'loading', fileName: 'answer.cpp', source: '', preview: {}, attempt: 1,
      thinkingStatus: {
        label: '检查算法逻辑', stages: [{ title: '检查算法逻辑', details: ['核对主要控制流。'] }],
        phase: 'thinking', complete: false, elapsedMs: 1200, attempt: 1
      }
    });
    expect(webview.html).toBe(pendingHtml);
    expect(messages.at(-1)).toMatchObject({ thinkingPhase: 'thinking', thinkingText: 'Thinking · 1 秒' });
    expect(webview.html).not.toContain('id="structured-preview"');

    provider.setState({
      kind: 'loading', fileName: 'answer.cpp', source: '', preview: { summary: '结论开始生成' }, attempt: 1,
      thinkingStatus: { label: '思考完成', stages: [], phase: 'complete', complete: true, elapsedMs: 1800, attempt: 1 }
    });
    expect(webview.html).toContain('id="structured-preview"');
    expect(webview.html).not.toContain('结论开始生成');
    expect(webview.html).toContain('正在整理判题结果');

    provider.setState({
      kind: 'loading', fileName: 'answer.cpp', source: '',
      preview: { verdict: 'correct', summary: '结论已生成', strengths: [] }, attempt: 1,
      thinkingStatus: { label: '思考完成', stages: [], phase: 'complete', complete: true, elapsedMs: 1900, attempt: 1 }
    });
    expect(messages.at(-1)?.previewHtml).toContain('data-result-block="overview"');
    expect(messages.at(-1)?.previewHtml).not.toContain('data-result-block="strengths"');

    const htmlBeforeFinal = webview.html;
    provider.setState({
      kind: 'result', fileName: 'answer.cpp', source: '',
      thinkingStatus: { label: '思考完成', stages: [], phase: 'complete', complete: true, elapsedMs: 2000, attempt: 1 },
      result: {
        verdict: 'correct', summary: '结论已生成', strengths: [], issues: [],
        complexity: { time: 'O(1)', space: 'O(1)', assessment: '合理' }, suggestedSnippet: ''
      }
    });
    expect(webview.html).toBe(htmlBeforeFinal);
    expect(messages.at(-1)).toMatchObject({ final: true });
    expect(messages.at(-1)?.previewHtml).toContain('data-result-block="complexity"');
    expect(messages.at(-1)?.headerActionsHtml).toContain('id="review"');
    provider.dispose();
  });

  it('buffers partial result fields until the next block starts', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const partialOverview = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: '', attempt: 1,
      preview: { verdict: 'incorrect', summary: '尚未完成的总评' }
    }, 'nonce');
    expect(partialOverview).not.toContain('尚未完成的总评');
    expect(partialOverview).toContain('正在整理判题结果');

    const partialStrengths = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: '', attempt: 1,
      preview: { verdict: 'incorrect', summary: '完整总评', strengths: ['尚未完成的优点'] }
    }, 'nonce');
    expect(partialStrengths).toContain('完整总评');
    expect(partialStrengths).not.toContain('尚未完成的优点');
    expect(partialStrengths).not.toContain('data-result-block="strengths"');

    const completedStrengths = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: '', attempt: 1,
      preview: { verdict: 'incorrect', summary: '完整总评', strengths: ['完整优点'], issues: [] }
    }, 'nonce');
    expect(completedStrengths).toContain('data-result-block="strengths"');
    expect(completedStrengths).toContain('完整优点');
    expect(completedStrengths).not.toContain('data-result-block="issues"');
  });

  it('does not show an explanatory banner when thinking is disabled', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: 'return 0;', preview: {}, attempt: 1
    }, 'nonce');
    expect(html).not.toContain('当前为关闭思考模式');
    expect(html).not.toContain('思考过程');
    expect(html).not.toContain('判题结论');
    expect(html).not.toContain('class="live-badge"');
    expect(html).toContain('<section class="live-preview" aria-live="polite" aria-busy="true">');
    expect(html).toContain('<button id="cancel" class="secondary">取消</button>');
    expect(html.indexOf('id="review-profile"')).toBeGreaterThan(html.indexOf('</main>'));
  });

  it('shows pending before the first API information and updates the phase timer in place', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: 'return 0;', preview: {}, attempt: 1,
      thinkingStatus: { label: 'Pending', stages: [], phase: 'pending', complete: false, elapsedMs: 0, attempt: 1 }
    }, 'nonce');
    expect(html).toContain('data-phase="pending" data-complete="false">Pending · 0 秒');
    expect(html).not.toContain('思考过程');
    expect(html).not.toContain('id="reasoning"');
    expect(html).toContain('Math.floor((thinkingElapsed+Date.now()-thinkingAnchor)/1000)');
    expect(html).toContain("thinkingPhase==='pending'?'Pending · ':'Thinking · '");
    expect(html).toContain('if(event.data.thinkingComplete)stages?.remove()');
  });

  it('forces hidden streaming indicators out of layout after thinking completes', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'result', fileName: 'answer.cpp', source: 'return 0;',
      thinkingStatus: {
        label: '思考完成',
        stages: [
          { title: '核对算法逻辑', details: ['检查主要控制流。'] },
          { title: '验证边界条件', details: ['确认边界输入的行为。'] }
        ],
        phase: 'complete', complete: true, elapsedMs: 21000, attempt: 1
      },
      result: {
        verdict: 'correct', summary: '正确', strengths: [], issues: [],
        complexity: { time: 'O(1)', space: 'O(1)', assessment: '合理' }, suggestedSnippet: ''
      }
    }, 'nonce');
    expect(html).toContain('id="thinking-spinner" class="spinner" hidden');
    expect(html).toContain('[hidden]{display:none!important}');
    expect(html).toContain('<section class="live-preview final-result result-stack">');
    expect(html).toContain('<div class="thinking-toolbar"><div class="thinking-block"><div class="stream-status thinking-complete">');
    expect(html.indexOf('id="thinking-label"')).toBeLessThan(html.indexOf('id="review-profile"'));
    expect(html.indexOf('id="review-profile"')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html).toContain('思考完成 · 21 秒');
    expect(html).not.toContain('id="thinking-stages"');
    expect(html).not.toContain('置信度');
  });

  it('loads the Basic Cannon bundle and can launch it during streaming', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: 'return 0;', attempt: 1,
      preview: { verdict: 'correct', summary: '答案正确' }
    }, 'nonce', true, 'vscode-resource:/dist/confetti.js', 'vscode-webview://unit-test');
    expect(html).toContain('src="vscode-resource:/dist/confetti.js"');
    expect(html).toContain("script-src vscode-webview://unit-test 'nonce-nonce'");
    expect(html).toContain('function launchConfetti()');
    expect(html).toContain("event.data.celebrateCorrect)launchConfetti()");
    expect(html).toContain("if(true)queueMicrotask(launchConfetti)");
    expect(html).toContain("typeof window.launchJudgeConfetti!=='function'");
    expect(html).not.toContain("document.createElement('i')");
  });

  it('emits the celebration exactly once when the streamed verdict first becomes correct', async () => {
    const { JudgeViewProvider } = await import('../../src/webview.js');
    const messages: Array<{ celebrateCorrect?: boolean }> = [];
    const webview = {
      options: {}, html: '', cspSource: 'vscode-webview://unit-test',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: () => ({ dispose() {} }),
      postMessage: async (message: { celebrateCorrect?: boolean }) => { messages.push(message); return true; }
    };
    const provider = new JudgeViewProvider({} as never, () => {}, () => {}, () => {});
    provider.resolveWebviewView({ webview } as never);
    provider.setState({ kind: 'loading', fileName: 'answer.cpp', source: '', preview: {}, attempt: 1 });
    provider.setState({ kind: 'loading', fileName: 'answer.cpp', source: '', preview: { verdict: 'correct' }, attempt: 1 });
    provider.setState({ kind: 'loading', fileName: 'answer.cpp', source: '', preview: { verdict: 'correct', summary: '仍在输出' }, attempt: 1 });
    provider.setState({ kind: 'loading', fileName: 'answer.cpp', source: '', preview: { verdict: 'correct', summary: '完整总评', strengths: [] }, attempt: 1 });
    provider.setState({ kind: 'loading', fileName: 'answer.cpp', source: '', preview: { verdict: 'correct', summary: '完整总评', strengths: ['优点'] }, attempt: 1 });
    expect(messages.map(message => message.celebrateCorrect)).toEqual([false, false, true, false]);
    provider.dispose();
  });

  it('offers six model and thinking combinations at the footer right and persists valid changes', async () => {
    const { JudgeViewProvider, renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({ kind: 'error', message: '网络错误' }, 'nonce', false, '', '', 'max');
    expect(html.indexOf('id="review"')).toBeLessThan(html.indexOf('id="review-profile"'));
    expect(html.indexOf('id="settings"')).toBeLessThan(html.indexOf('id="review-profile"'));
    expect(html.indexOf('id="review-profile"')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html).toContain('.app-footer>.review-profile-select{height:28px;min-width:0;min-height:28px;max-width:166px;margin-inline-start:auto');
    expect(html).toContain('<optgroup label="Flash">');
    expect(html).toContain('<optgroup label="Pro">');
    expect(html.match(/<option value="deepseek-v4-(?:flash|pro)\|(?:disabled|high|max)"/g)).toHaveLength(6);
    expect(html).toContain('<option value="deepseek-v4-pro|max" selected>Pro · 最大强度</option>');
    const customHtml = renderWebview({ kind: 'idle' }, 'nonce', false, '', '', 'high', undefined, 'custom-review-model');
    expect(customHtml).toContain('<option value="" selected disabled>自定义模型 · 高强度</option>');
    expect(customHtml.match(/<option value="deepseek-v4-(?:flash|pro)\|(?:disabled|high|max)"/g)).toHaveLength(6);

    let receiver: ((message: unknown) => void) | undefined;
    const changed = vi.fn();
    const webview = {
      options: {}, html: '', cspSource: 'vscode-webview://unit-test',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: (listener: (message: unknown) => void) => { receiver = listener; return { dispose() {} }; },
      postMessage: async () => true
    };
    const provider = new JudgeViewProvider({} as never, () => {}, () => {}, () => {}, 'high', 'deepseek-v4-pro', changed);
    provider.resolveWebviewView({ webview } as never);
    receiver?.({ type: 'setReviewProfile', model: 'deepseek-v4-flash', level: 'disabled' });
    receiver?.({ type: 'setReviewProfile', model: 'unsupported', level: 'high' });
    receiver?.({ type: 'setReviewProfile', model: 'deepseek-v4-pro', level: 'invalid' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith('deepseek-v4-flash', 'disabled');
    provider.dispose();
  });
});
