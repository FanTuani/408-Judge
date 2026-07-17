import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

describe('review shortcut resolution', () => {
  it('uses platform defaults and formats native labels', async () => {
    const { formatShortcut, resolveReviewShortcut } = await import('../../src/keybinding.js');
    expect(formatShortcut(resolveReviewShortcut([], 'darwin'), 'darwin')).toBe("⌘'");
    expect(formatShortcut(resolveReviewShortcut([], 'win32'), 'win32')).toBe("Ctrl+'");
  });

  it('follows a user replacement and supports JSONC keybinding files', async () => {
    const { parseReviewShortcut } = await import('../../src/keybinding.js');
    const content = `[
      // Remove the extension default before assigning a new chord.
      { "key": "cmd+'", "command": "-deepseekJudge.reviewCurrent" },
      { "key": "cmd+k cmd+j", "command": "deepseekJudge.reviewCurrent" },
    ]`;
    expect(parseReviewShortcut(content, 'darwin')).toEqual({ valid: true, shortcut: '⌘K ⌘J' });
  });

  it('hides the hint when the user removes the shortcut', async () => {
    const { parseReviewShortcut } = await import('../../src/keybinding.js');
    const content = `[{ "key": "ctrl+'", "command": "-deepseekJudge.reviewCurrent" }]`;
    expect(parseReviewShortcut(content, 'linux')).toEqual({ valid: true, shortcut: undefined });
  });

  it('keeps the current hint while a keybindings edit is incomplete', async () => {
    const { parseReviewShortcut } = await import('../../src/keybinding.js');
    expect(parseReviewShortcut('[{ "key":', 'darwin')).toEqual({ valid: false });
  });
});
