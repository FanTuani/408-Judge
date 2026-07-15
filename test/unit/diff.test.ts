import { describe, expect, it } from 'vitest';
import { buildSuggestedDiff } from '../../src/diff.js';

describe('minimum fix diff', () => {
  it('renders focused old/new line numbers around a contiguous replacement', () => {
    const source = ['int f() {', '  int x = 0;', '  return x;', '}'].join('\n');
    const diff = buildSuggestedDiff(source, {
      startLine: 2, endLine: 3, original: '  int x = 0;\n  return x;', replacement: '  return 1;', explanation: '移除无用变量'
    }, 1);
    expect(diff[0]).toMatchObject({ kind: 'separator', text: '@@ -2,2 +2,1 @@' });
    expect(diff.filter(line => line.kind === 'removed').map(line => line.text)).toEqual(['  int x = 0;', '  return x;']);
    expect(diff.filter(line => line.kind === 'added').map(line => line.text)).toEqual(['  return 1;']);
    expect(diff.at(-1)).toMatchObject({ kind: 'context', oldLine: 4, newLine: 3, text: '}' });
  });

  it('clamps a model range to the source', () => {
    const diff = buildSuggestedDiff('a\nb', { startLine: 99, endLine: 100, original: '', replacement: 'c', explanation: '' });
    expect(diff.some(line => line.kind === 'removed' && line.oldLine === 2)).toBe(true);
  });

  it('relocates an exact original block and removes unchanged prefix and suffix lines', () => {
    const source = ['head', 'same', 'wrong', 'tail', 'end'].join('\n');
    const diff = buildSuggestedDiff(source, {
      startLine: 1, endLine: 2,
      original: 'same\nwrong\ntail',
      replacement: 'same\nfixed\ntail',
      explanation: ''
    }, 1);
    expect(diff[0]).toMatchObject({ text: '@@ -3,1 +3,1 @@' });
    expect(diff.filter(line => line.kind === 'removed')).toEqual([expect.objectContaining({ oldLine: 3, text: 'wrong' })]);
    expect(diff.filter(line => line.kind === 'added')).toEqual([expect.objectContaining({ newLine: 3, text: 'fixed' })]);
  });
});
