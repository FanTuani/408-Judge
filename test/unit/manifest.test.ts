import { readdirSync, readFileSync } from 'node:fs';
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

  it('allows the default review request to run for up to ten minutes', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const setting = manifest.contributes.configuration.properties['deepseekJudge.requestTimeoutSeconds'];
    expect(setting.default).toBe(600);
    expect(setting.maximum).toBe(600);
  });

  it('uses a publish-safe 24px PNG activity bar icon', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const iconPath = manifest.contributes.viewsContainers.activitybar[0].icon;
    const icon = readFileSync(iconPath);
    expect(iconPath).toBe('media/judge.png');
    expect(icon.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(icon.readUInt32BE(16)).toBe(24);
    expect(icon.readUInt32BE(20)).toBe(24);
    expect(readdirSync('media').filter((file) => file.endsWith('.svg'))).toEqual([]);
  });
});
