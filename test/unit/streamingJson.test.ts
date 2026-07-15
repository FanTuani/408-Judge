import { describe, expect, it } from 'vitest';
import { StreamingJudgeParser } from '../../src/streamingJson.js';

describe('incremental judge JSON parser', () => {
  it('exposes unfinished strings and completed fields without repairing the final JSON', () => {
    const parser = new StreamingJudgeParser();
    expect(parser.write('{"verdict":"incorrect","summary":"正在分析')).toMatchObject({
      verdict: 'incorrect', summary: '正在分析'
    });
    expect(parser.write('边界","strengths":["识别了循环')).toMatchObject({
      summary: '正在分析边界', strengths: ['识别了循环']
    });
    expect(parser.write('"]}')).toMatchObject({
      verdict: 'incorrect', summary: '正在分析边界', strengths: ['识别了循环']
    });
  });

  it('tracks partial nested issue and suggested-fix fields', () => {
    const parser = new StreamingJudgeParser();
    const preview = parser.write('{"issues":[{"title":"越界","description":"当 n 为 0 时"}],"suggestedFix":{"startLine":3,"endLine":3,"original":"x","replacement":"if (n == 0)');
    expect(preview.issues?.[0]).toMatchObject({ title: '越界', description: '当 n 为 0 时' });
    expect(preview.suggestedFix).toMatchObject({ startLine: 3, endLine: 3, original: 'x', replacement: 'if (n == 0)' });
  });
});
