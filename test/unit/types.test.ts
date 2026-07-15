import { describe, expect, it } from 'vitest';
import { normalizeJudgeResult } from '../../src/types.js';

describe('model JSON validation', () => {
  it('accepts valid fields and clamps confidence', () => {
    const value = normalizeJudgeResult({ verdict: 'correct', confidence: 2, strengths: ['ok'], suggestedFix: { startLine: 3, endLine: 4, original: 'return 1;', replacement: 'return 0;', explanation: '最小替换' } });
    expect(value.verdict).toBe('correct');
    expect(value.confidence).toBe(1);
    expect(value.strengths).toEqual(['ok']);
    expect(value.suggestedFix).toMatchObject({ startLine: 3, endLine: 4, replacement: 'return 0;' });
  });

  it('degrades missing and malformed fields safely', () => {
    const value = normalizeJudgeResult({ verdict: 'yes', issues: [null, { title: 3, line: -1 }] });
    expect(value.verdict).toBe('insufficient');
    expect(value.summary).toContain('未提供');
    expect(value.issues[0]).toMatchObject({ title: '未命名问题' });
    expect(value.issues[0]).not.toHaveProperty('line');
    expect(value).not.toHaveProperty('suggestedFix');
  });
});
