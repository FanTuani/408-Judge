import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

describe('diff webview markup', () => {
  it('uses a unified table with full-row diff classes and no per-line code blocks', async () => {
    const { renderWebview } = await import('../../src/webview.js');
    const html = renderWebview({
      kind: 'result',
      fileName: 'answer.cpp',
      source: 'int x = 0;\nreturn x;',
      result: {
        verdict: 'incorrect', summary: '需修复', confidence: 0.9, strengths: [], issues: [],
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
});
