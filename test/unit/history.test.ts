import { describe, expect, it, vi } from 'vitest';
import type { ReviewHistoryEntry } from '../../src/history.js';

vi.mock('vscode', () => ({}));

function entry(index: number, fileUri = `file:///answer-${index}.cpp`): ReviewHistoryEntry {
  return {
    id: String(index), fileUri, fileName: `answer-${index}.cpp`, displayPath: `src/answer-${index}.cpp`,
    reviewedAt: new Date(1_700_000_000_000 + index).toISOString(), source: 'return 0;',
    result: {
      verdict: 'correct', summary: `result ${index}`, strengths: [], issues: [],
      complexity: { time: 'O(1)', space: 'O(1)', assessment: '合理' }, suggestedSnippet: ''
    }
  };
}

describe('review history retention', () => {
  it('uses a CPH-style hidden file name tied to the cpp path', async () => {
    const { historyFileName, isHistoryFileName } = await import('../../src/history.js');
    const fileName = historyFileName('/workspace/src/tree.cpp');
    expect(fileName).toMatch(/^\.tree\.cpp_[a-f0-9]{32}\.json$/);
    expect(isHistoryFileName(fileName)).toBe(true);
    expect(isHistoryFileName('tree.cpp.json')).toBe(false);
    expect(historyFileName('/workspace/src/tree.cpp')).toBe(fileName);
    expect(historyFileName('/another/src/tree.cpp')).not.toBe(fileName);
  });

  it('keeps the newest twenty reviews for each file', async () => {
    const { addToHistory, MAX_HISTORY_PER_FILE } = await import('../../src/history.js');
    const fileUri = 'file:///same.cpp';
    const entries = Array.from({ length: 27 }, (_, index) => entry(index, fileUri))
      .reduce<ReviewHistoryEntry[]>((history, value) => addToHistory(history, value), []);
    expect(entries).toHaveLength(MAX_HISTORY_PER_FILE);
    expect(entries[0]?.id).toBe('26');
    expect(entries.at(-1)?.id).toBe('7');
  });

  it('keeps each history document scoped to one cpp file', async () => {
    const { addToHistory } = await import('../../src/history.js');
    const original = entry(1, 'file:///first.cpp');
    const replacement = entry(2, 'file:///second.cpp');
    expect(addToHistory([original], replacement)).toEqual([replacement]);
  });
});
