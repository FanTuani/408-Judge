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

export interface JudgePreview {
  verdict?: Verdict;
  summary?: string;
  strengths?: string[];
  issues?: Array<Partial<JudgeIssue>>;
  complexity?: Partial<JudgeResult['complexity']>;
  suggestedSnippet?: string;
  suggestedFix?: Partial<NonNullable<JudgeResult['suggestedFix']>>;
}

const verdicts = new Set<Verdict>(['correct', 'partially_correct', 'incorrect', 'insufficient']);

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Sanitize an incomplete streaming object without inventing missing fields. */
export function normalizeJudgePreview(value: unknown): JudgePreview {
  if (!value || typeof value !== 'object') return {};
  const root = value as Record<string, unknown>;
  const preview: JudgePreview = {};
  if (typeof root.verdict === 'string' && verdicts.has(root.verdict as Verdict)) preview.verdict = root.verdict as Verdict;
  if (typeof root.summary === 'string') preview.summary = root.summary;
  if (Array.isArray(root.strengths)) preview.strengths = texts(root.strengths);
  if (Array.isArray(root.issues)) {
    preview.issues = root.issues.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      const issue: Partial<JudgeIssue> = {};
      for (const key of ['severity', 'title', 'description', 'suggestion'] as const) {
        if (typeof raw[key] === 'string') issue[key] = raw[key];
      }
      if (typeof raw.line === 'number' && Number.isInteger(raw.line) && raw.line > 0) issue.line = raw.line;
      return [issue];
    });
  }
  if (root.complexity && typeof root.complexity === 'object') {
    const raw = root.complexity as Record<string, unknown>;
    preview.complexity = {};
    for (const key of ['time', 'space', 'assessment'] as const) {
      if (typeof raw[key] === 'string') preview.complexity[key] = raw[key];
    }
  }
  if (typeof root.suggestedSnippet === 'string') preview.suggestedSnippet = root.suggestedSnippet;
  if (root.suggestedFix && typeof root.suggestedFix === 'object') {
    const raw = root.suggestedFix as Record<string, unknown>;
    const fix: NonNullable<JudgePreview['suggestedFix']> = {};
    for (const key of ['original', 'replacement', 'explanation'] as const) {
      if (typeof raw[key] === 'string') fix[key] = raw[key];
    }
    for (const key of ['startLine', 'endLine'] as const) {
      if (typeof raw[key] === 'number' && Number.isInteger(raw[key]) && raw[key] > 0) fix[key] = raw[key];
    }
    preview.suggestedFix = fix;
  }
  return preview;
}

/** Convert loosely valid model JSON into a safe, complete object for rendering. */
export function normalizeJudgeResult(value: unknown): JudgeResult {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawVerdict = root.verdict;
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
