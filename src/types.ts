export type Verdict = 'correct' | 'partially_correct' | 'incorrect' | 'insufficient';

export interface JudgeIssue {
  severity: string;
  title: string;
  description: string;
  line?: number;
  suggestion: string;
}

export interface JudgeResult {
  verdict: Verdict;
  summary: string;
  confidence: number;
  strengths: string[];
  issues: JudgeIssue[];
  complexity: {
    time: string;
    space: string;
    assessment: string;
  };
  suggestedSnippet: string;
  suggestedFix?: {
    startLine: number;
    endLine: number;
    original: string;
    replacement: string;
    explanation: string;
  };
}

const verdicts = new Set<Verdict>(['correct', 'partially_correct', 'incorrect', 'insufficient']);

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Convert loosely valid model JSON into a safe, complete object for rendering. */
export function normalizeJudgeResult(value: unknown): JudgeResult {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawVerdict = root.verdict;
  const rawConfidence = typeof root.confidence === 'number' && Number.isFinite(root.confidence)
    ? root.confidence
    : 0;
  const rawIssues = Array.isArray(root.issues) ? root.issues : [];
  const rawComplexity = root.complexity && typeof root.complexity === 'object'
    ? root.complexity as Record<string, unknown>
    : {};
  const rawFix = root.suggestedFix && typeof root.suggestedFix === 'object'
    ? root.suggestedFix as Record<string, unknown>
    : undefined;
  const startLine = rawFix && typeof rawFix.startLine === 'number' && Number.isInteger(rawFix.startLine) && rawFix.startLine > 0
    ? rawFix.startLine
    : undefined;
  const endLine = rawFix && typeof rawFix.endLine === 'number' && Number.isInteger(rawFix.endLine) && rawFix.endLine >= (startLine ?? 1)
    ? rawFix.endLine
    : undefined;
  const replacement = rawFix ? text(rawFix.replacement) : '';
  const original = rawFix ? text(rawFix.original) : '';

  return {
    verdict: typeof rawVerdict === 'string' && verdicts.has(rawVerdict as Verdict)
      ? rawVerdict as Verdict
      : 'insufficient',
    summary: text(root.summary, '模型未提供总体评价。'),
    confidence: Math.max(0, Math.min(1, rawConfidence)),
    strengths: texts(root.strengths),
    issues: rawIssues.flatMap((item): JudgeIssue[] => {
      if (!item || typeof item !== 'object') return [];
      const issue = item as Record<string, unknown>;
      const line = typeof issue.line === 'number' && Number.isInteger(issue.line) && issue.line > 0
        ? issue.line
        : undefined;
      return [{
        severity: text(issue.severity, 'info'),
        title: text(issue.title, '未命名问题'),
        description: text(issue.description),
        ...(line ? { line } : {}),
        suggestion: text(issue.suggestion)
      }];
    }),
    complexity: {
      time: text(rawComplexity.time, '未说明'),
      space: text(rawComplexity.space, '未说明'),
      assessment: text(rawComplexity.assessment, '模型未提供复杂度评价。')
    },
    suggestedSnippet: text(root.suggestedSnippet),
    ...(startLine && endLine && replacement ? {
      suggestedFix: { startLine, endLine, original, replacement, explanation: text(rawFix?.explanation) }
    } : {})
  };
}
