export interface ThinkingStatus {
  label: string;
  complete: boolean;
  elapsedMs: number;
  attempt: number;
}

const phases: Array<{ label: string; pattern: RegExp }> = [
  { label: '正在准备最小修复', pattern: /修复|修改|替换|补丁|代码片段|replacement|patch|snippet|fix\b/i },
  { label: '正在评估时间和空间复杂度', pattern: /复杂度|时间复杂度|空间复杂度|time complexity|space complexity|\bO\s*\(/i },
  { label: '正在检查边界条件与内存安全', pattern: /边界|越界|空指针|野指针|内存|数组安全|溢出|boundary|null pointer|memory|out[- ]of[- ]bounds|overflow/i },
  { label: '正在定位关键问题', pattern: /关键问题|错误原因|缺陷|漏洞|反例|bug|root cause|counterexample/i },
  { label: '正在核对算法逻辑', pattern: /算法|逻辑|循环|条件|不变量|返回值|正确性|algorithm|logic|loop|condition|invariant|correctness|return value/i },
  { label: '正在比较作答与参考思路', pattern: /参考|讲解|标准解|其他解法|对比|compare|reference|alternative approach/i }
];

export function summarizeThinking(reasoning: string): string {
  if (!reasoning.trim()) return 'Thinking';
  const recent = reasoning.slice(-600);
  return phases.find(phase => phase.pattern.test(recent))?.label ?? '正在理解题目与作答思路';
}

/** Stabilizes phase labels so token-level updates do not make the UI jump. */
export class ThinkingSummaryTracker {
  private attempt: number;
  private startedAt: number;
  private lastLabelAt: number;
  private label = 'Thinking';
  private complete = false;

  constructor(private readonly minimumLabelIntervalMs = 800, now = Date.now(), attempt = 1) {
    this.attempt = attempt;
    this.startedAt = now;
    this.lastLabelAt = now;
  }

  update(reasoning: string, content: string, attempt: number, now = Date.now()): ThinkingStatus {
    if (attempt !== this.attempt) this.reset(attempt, now);
    if (content.length > 0) return this.finish(now);
    const candidate = summarizeThinking(reasoning);
    if (candidate !== this.label && now - this.lastLabelAt >= this.minimumLabelIntervalMs) {
      this.label = candidate;
      this.lastLabelAt = now;
    }
    return this.status(now);
  }

  finish(now = Date.now()): ThinkingStatus {
    this.complete = true;
    this.label = '思考完成';
    return this.status(now);
  }

  private reset(attempt: number, now: number): void {
    this.attempt = attempt;
    this.startedAt = now;
    this.lastLabelAt = now;
    this.label = 'Thinking';
    this.complete = false;
  }

  private status(now: number): ThinkingStatus {
    return { label: this.label, complete: this.complete, elapsedMs: Math.max(0, now - this.startedAt), attempt: this.attempt };
  }
}
