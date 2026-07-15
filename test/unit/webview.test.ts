import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { joinPath: (_base: unknown, ...parts: string[]) => ({ toString: () => parts.join('/') }) }
}));

describe('diff webview markup', () => {
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
    expect(html).not.toContain('<div class="diff-line');
    expect(html).not.toContain('<code>−');
  });

  it('renders a structured partial result instead of raw streaming JSON', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: 'return 0;',
      preview: { verdict: 'incorrect', summary: '返回值仍在生成' }, attempt: 1,
      thinkingStatus: { label: '核对算法逻辑', stages: ['核对算法逻辑'], complete: false, elapsedMs: 1200, attempt: 1 }
    }, 'nonce');
    expect(html).toContain('id="structured-preview"');
    expect(html).toContain('返回值仍在生成');
    expect(html).toContain('错误');
    expect(html).toContain('<ol id="thinking-stages" class="thinking-stages"><li>核对算法逻辑</li></ol>');
    expect(html).toContain("document.createElement('li')");
    expect(html).not.toContain('class="caret"');
    expect(html).not.toContain('live-value');
    expect(html).not.toContain('id="conclusion"');
    expect(html).not.toContain('{&quot;verdict&quot;');
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
    expect(html).toContain('<section class="live-preview" aria-live="polite">');
  });

  it('shows a compact thinking summary instead of raw reasoning', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'loading', fileName: 'answer.cpp', source: 'return 0;', preview: {}, attempt: 1,
      thinkingStatus: { label: 'Thinking', stages: [], complete: false, elapsedMs: 0, attempt: 1 }
    }, 'nonce');
    expect(html).toContain('data-complete="false">Thinking · 0 秒');
    expect(html).not.toContain('思考过程');
    expect(html).not.toContain('id="reasoning"');
    expect(html).toContain('Math.floor((thinkingElapsed+Date.now()-thinkingAnchor)/1000)');
    expect(html).toContain('if(event.data.thinkingComplete)stages?.remove()');
  });

  it('forces hidden streaming indicators out of layout after thinking completes', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'result', fileName: 'answer.cpp', source: 'return 0;',
      thinkingStatus: { label: '思考完成', stages: ['核对算法逻辑', '验证边界条件'], complete: true, elapsedMs: 21000, attempt: 1 },
      result: {
        verdict: 'correct', summary: '正确', strengths: [], issues: [],
        complexity: { time: 'O(1)', space: 'O(1)', assessment: '合理' }, suggestedSnippet: ''
      }
    }, 'nonce');
    expect(html).toContain('id="thinking-spinner" class="spinner" hidden');
    expect(html).toContain('[hidden]{display:none!important}');
    expect(html).toContain('<section class="live-preview final-result">');
    expect(html).toContain('<div class="thinking-toolbar"><div class="thinking-block"><div class="stream-status thinking-complete">');
    expect(html.indexOf('id="thinking-label"')).toBeLessThan(html.indexOf('id="thinking-level"'));
    expect(html.indexOf('id="thinking-level"')).toBeGreaterThan(html.indexOf('</header>'));
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
    expect(messages.map(message => message.celebrateCorrect)).toEqual([true, false]);
    provider.dispose();
  });

  it('places the thinking-level selector below review and persists valid changes', async () => {
    const { JudgeViewProvider, renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({ kind: 'error', message: '网络错误' }, 'nonce', false, '', '', 'max');
    expect(html.indexOf('id="review"')).toBeLessThan(html.indexOf('id="thinking-level"'));
    expect(html).toContain('<option value="max" selected>思考：最大强度</option>');

    let receiver: ((message: unknown) => void) | undefined;
    const changed = vi.fn();
    const webview = {
      options: {}, html: '', cspSource: 'vscode-webview://unit-test',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: (listener: (message: unknown) => void) => { receiver = listener; return { dispose() {} }; },
      postMessage: async () => true
    };
    const provider = new JudgeViewProvider({} as never, () => {}, () => {}, () => {}, 'high', changed);
    provider.resolveWebviewView({ webview } as never);
    receiver?.({ type: 'setThinkingLevel', level: 'disabled' });
    receiver?.({ type: 'setThinkingLevel', level: 'invalid' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith('disabled');
    provider.dispose();
  });
});
