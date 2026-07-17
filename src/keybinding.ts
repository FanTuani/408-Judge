import * as vscode from 'vscode';
import { parse, type ParseError } from 'jsonc-parser/lib/esm/main.js';

export const REVIEW_COMMAND = 'deepseekJudge.reviewCurrent';

interface KeybindingRule {
  command?: unknown;
  key?: unknown;
  mac?: unknown;
  linux?: unknown;
  win?: unknown;
}

function platformKey(rule: KeybindingRule, platform: NodeJS.Platform): string | undefined {
  const override = platform === 'darwin' ? rule.mac : platform === 'linux' ? rule.linux : platform === 'win32' ? rule.win : undefined;
  const value = typeof override === 'string' ? override : rule.key;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function defaultReviewShortcut(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? "cmd+'" : "ctrl+'";
}

export function resolveReviewShortcut(rules: unknown, platform: NodeJS.Platform): string | undefined {
  const bindings = [defaultReviewShortcut(platform)];
  if (!Array.isArray(rules)) return bindings[0];

  for (const value of rules) {
    if (!value || typeof value !== 'object') continue;
    const rule = value as KeybindingRule;
    const key = platformKey(rule, platform);
    if (!key) continue;
    if (rule.command === REVIEW_COMMAND) bindings.push(key);
    else if (rule.command === `-${REVIEW_COMMAND}`) {
      const removed = normalizedKey(key);
      for (let index = bindings.length - 1; index >= 0; index -= 1) {
        if (normalizedKey(bindings[index]!) === removed) bindings.splice(index, 1);
      }
    }
  }

  return bindings.at(-1);
}

const keyNames: Record<string, string> = {
  escape: 'Esc', esc: 'Esc', enter: 'Enter', return: 'Enter', space: 'Space', tab: 'Tab',
  backspace: 'Backspace', delete: 'Delete', insert: 'Insert', home: 'Home', end: 'End',
  pageup: 'PageUp', pagedown: 'PageDown', left: '←', right: '→', up: '↑', down: '↓'
};

function displayKey(value: string): string {
  const normalized = value.toLowerCase();
  return keyNames[normalized] ?? (value.length === 1 ? value.toUpperCase() : value);
}

function formatChord(chord: string, platform: NodeJS.Platform): string {
  const parts = chord.split('+').filter(Boolean);
  if (parts.length === 0) return chord;
  const key = displayKey(parts.at(-1)!);
  const modifiers = parts.slice(0, -1).map(part => part.toLowerCase());
  if (platform === 'darwin') {
    const symbols: Record<string, string> = { ctrl: '⌃', control: '⌃', shift: '⇧', alt: '⌥', option: '⌥', cmd: '⌘', meta: '⌘', win: '⌘' };
    return `${modifiers.map(modifier => symbols[modifier] ?? displayKey(modifier)).join('')}${key}`;
  }
  const labels: Record<string, string> = { ctrl: 'Ctrl', control: 'Ctrl', shift: 'Shift', alt: 'Alt', option: 'Alt', cmd: 'Cmd', meta: 'Meta', win: 'Win' };
  return [...modifiers.map(modifier => labels[modifier] ?? displayKey(modifier)), key].join('+');
}

export function formatShortcut(shortcut: string | undefined, platform: NodeJS.Platform): string | undefined {
  if (!shortcut) return undefined;
  return shortcut.split(/\s+/).filter(Boolean).map(chord => formatChord(chord, platform)).join(' ');
}

export function parseReviewShortcut(content: string, platform: NodeJS.Platform): { valid: boolean; shortcut?: string } {
  const errors: ParseError[] = [];
  const rules = parse(content, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) return { valid: false };
  return { valid: true, shortcut: formatShortcut(resolveReviewShortcut(rules, platform), platform) };
}

export class ReviewShortcutTracker implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<string | undefined>();
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly keybindingsUri: vscode.Uri;
  private refreshVersion = 0;
  private shortcut: string | undefined;
  readonly onDidChange = this.emitter.event;

  constructor(globalStorageUri: vscode.Uri, private readonly platform: NodeJS.Platform = process.platform) {
    const profileUri = vscode.Uri.joinPath(globalStorageUri, '..', '..');
    this.keybindingsUri = vscode.Uri.joinPath(profileUri, 'keybindings.json');
    this.shortcut = formatShortcut(defaultReviewShortcut(platform), platform);
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(profileUri, 'keybindings.json'));
    this.watcher.onDidCreate(() => void this.refresh());
    this.watcher.onDidChange(() => void this.refresh());
    this.watcher.onDidDelete(() => {
      this.refreshVersion += 1;
      this.update(formatShortcut(defaultReviewShortcut(this.platform), this.platform));
    });
  }

  get current(): string | undefined { return this.shortcut; }

  async refresh(): Promise<void> {
    const version = ++this.refreshVersion;
    try {
      const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.keybindingsUri));
      const parsed = parseReviewShortcut(content, this.platform);
      if (!parsed.valid || version !== this.refreshVersion) return;
      this.update(parsed.shortcut);
    } catch {
      if (version === this.refreshVersion) this.update(formatShortcut(defaultReviewShortcut(this.platform), this.platform));
    }
  }

  private update(shortcut: string | undefined): void {
    if (shortcut === this.shortcut) return;
    this.shortcut = shortcut;
    this.emitter.fire(shortcut);
  }

  dispose(): void {
    this.watcher.dispose();
    this.emitter.dispose();
  }
}
