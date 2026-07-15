import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('extension settings manifest', () => {
  it('offers exactly three reasoning levels and defaults to high', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const setting = manifest.contributes.configuration.properties['deepseekJudge.thinkingLevel'];
    expect(setting.enum).toEqual(['disabled', 'high', 'max']);
    expect(setting.enumDescriptions).toHaveLength(3);
    expect(setting.default).toBe('high');
  });

  it('uses the official Flash model for sidecar thinking summaries', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(manifest.contributes.configuration.properties['deepseekJudge.thinkingSummaryModel'].default).toBe('deepseek-v4-flash');
  });
});
