import type { JudgeResult } from './types.js';

export type DiffLineKind = 'context' | 'removed' | 'added' | 'separator';

export interface DiffLine {
  kind: DiffLineKind;
  oldLine?: number;
  newLine?: number;
  text: string;
}

/** Build a focused unified-style diff for the model's minimum contiguous replacement. */
export function buildSuggestedDiff(source: string, fix: NonNullable<JudgeResult['suggestedFix']>, context = 2): DiffLine[] {
  const original = source.split(/\r?\n/);
  const blockLines = (value: string): string[] => {
    const lines = value.replace(/\r\n/g, '\n').split('\n');
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    return lines;
  };
  let start = Math.max(1, Math.min(fix.startLine, original.length));
  let end = Math.max(start, Math.min(fix.endLine, original.length));
  const suppliedOriginal = fix.original ? blockLines(fix.original) : [];
  if (suppliedOriginal.length > 0) {
    const claimed = original.slice(start - 1, end);
    const claimedMatches = claimed.length === suppliedOriginal.length && claimed.every((line, index) => line === suppliedOriginal[index]);
    if (!claimedMatches) {
      const matches: number[] = [];
      for (let index = 0; index <= original.length - suppliedOriginal.length; index += 1) {
        if (suppliedOriginal.every((line, offset) => original[index + offset] === line)) matches.push(index + 1);
      }
      if (matches.length === 1) {
        start = matches[0]!;
        end = start + suppliedOriginal.length - 1;
      }
    }
  }
  const oldBlock = original.slice(start - 1, end);
  const replacement = blockLines(fix.replacement);
  let samePrefix = 0;
  while (samePrefix < oldBlock.length && samePrefix < replacement.length && oldBlock[samePrefix] === replacement[samePrefix]) samePrefix += 1;
  let sameSuffix = 0;
  while (
    sameSuffix < oldBlock.length - samePrefix &&
    sameSuffix < replacement.length - samePrefix &&
    oldBlock[oldBlock.length - 1 - sameSuffix] === replacement[replacement.length - 1 - sameSuffix]
  ) sameSuffix += 1;
  const removed = oldBlock.slice(samePrefix, oldBlock.length - sameSuffix);
  const added = replacement.slice(samePrefix, replacement.length - sameSuffix);
  const changeStart = start + samePrefix;
  const unchangedSuffixStart = start + oldBlock.length - sameSuffix;
  const beforeStart = Math.max(1, changeStart - context);
  const afterEnd = Math.min(original.length, unchangedSuffixStart + context - 1);
  const delta = added.length - removed.length;
  const lines: DiffLine[] = [{
    kind: 'separator',
    text: `@@ -${changeStart},${removed.length} +${changeStart},${added.length} @@`
  }];
  for (let line = beforeStart; line < changeStart; line += 1) {
    lines.push({ kind: 'context', oldLine: line, newLine: line, text: original[line - 1] ?? '' });
  }
  removed.forEach((text, index) => {
    lines.push({ kind: 'removed', oldLine: changeStart + index, text });
  });
  added.forEach((text, index) => {
    lines.push({ kind: 'added', newLine: changeStart + index, text });
  });
  for (let line = unchangedSuffixStart; line <= afterEnd; line += 1) {
    lines.push({ kind: 'context', oldLine: line, newLine: line + delta, text: original[line - 1] ?? '' });
  }
  return lines;
}
