import { describe, expect, it } from 'vitest';
import { summarizeThinking, ThinkingSummaryTracker } from '../../src/thinkingSummary.js';

describe('thinking summary', () => {
  it.each([
    ['', 'Thinking'],
    ['先阅读题目并理解用户的作答。', '正在理解题目与作答思路'],
    ['需要检查循环不变量和返回值是否正确。', '正在核对算法逻辑'],
    ['接下来检查空指针、数组越界和边界输入。', '正在检查边界条件与内存安全'],
    ['计算时间复杂度 O(n) 与空间复杂度。', '正在评估时间和空间复杂度'],
    ['最后给出最小 replacement patch。', '正在准备最小修复']
  ])('summarizes the current phase', (reasoning, expected) => {
    expect(summarizeThinking(reasoning)).toBe(expected);
  });

  it('throttles phase changes, completes on answer content, and resets on retry', () => {
    const tracker = new ThinkingSummaryTracker(800, 1_000);
    expect(tracker.update('检查数组越界', '', 1, 1_500).label).toBe('Thinking');
    expect(tracker.update('检查数组越界', '', 1, 1_800).label).toBe('正在检查边界条件与内存安全');
    expect(tracker.update('准备最小修复', '', 1, 2_000).label).toBe('正在检查边界条件与内存安全');
    expect(tracker.update('准备最小修复', '', 1, 2_600).label).toBe('正在准备最小修复');
    expect(tracker.update('', '{', 1, 2_700)).toMatchObject({ label: '思考完成', complete: true, elapsedMs: 1_700 });
    expect(tracker.update('检查逻辑', '', 2, 3_000)).toMatchObject({ label: 'Thinking', complete: false, elapsedMs: 0, attempt: 2 });
  });
});
