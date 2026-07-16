import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('extension settings manifest', () => {
  it('contains the public Marketplace metadata', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(manifest.icon).toBe('media/icon.png');
    expect(manifest.repository.url).toBe('https://github.com/FanTuani/408-Judge.git');
    expect(manifest.homepage).toBe('https://github.com/FanTuani/408-Judge#readme');
    expect(manifest.bugs.url).toBe('https://github.com/FanTuani/408-Judge/issues');
    expect(manifest.keywords).toContain('408');
    expect(manifest.license).toBe('SEE LICENSE IN LICENSE');
  });

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

  it('uses a theme-aware 24px activity bar icon', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const iconPath = manifest.contributes.viewsContainers.activitybar[0].icon;
    const icon = readFileSync(iconPath, 'utf8');
    expect(iconPath).toBe('media/judge.svg');
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('stroke="currentColor"');
  });
});
