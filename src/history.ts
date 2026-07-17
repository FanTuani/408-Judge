import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { normalizeJudgeResult, type JudgeResult } from './types.js';

const HISTORY_VERSION = 1;
export const MAX_HISTORY_PER_FILE = 20;
export const MAX_HISTORY_TOTAL = 300;

export interface ReviewHistoryEntry {
  id: string;
  fileUri: string;
  fileName: string;
  displayPath: string;
  reviewedAt: string;
  source: string;
  result: JudgeResult;
}

interface HistoryDocument {
  version: number;
  entries: ReviewHistoryEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeEntry(value: unknown): ReviewHistoryEntry | undefined {
  if (!isRecord(value)) return undefined;
  const { id, fileUri, fileName, displayPath, reviewedAt, source, result } = value;
  if (![id, fileUri, fileName, displayPath, reviewedAt, source].every(item => typeof item === 'string') || !isRecord(result)) return undefined;
  return {
    id: id as string,
    fileUri: fileUri as string,
    fileName: fileName as string,
    displayPath: displayPath as string,
    reviewedAt: reviewedAt as string,
    source: source as string,
    result: normalizeJudgeResult(result)
  };
}

export function addToHistory(entries: readonly ReviewHistoryEntry[], entry: ReviewHistoryEntry): ReviewHistoryEntry[] {
  let sameFileCount = 0;
  const next = [entry, ...entries].filter(item => {
    if (item.fileUri !== entry.fileUri) return true;
    sameFileCount += 1;
    return sameFileCount <= MAX_HISTORY_PER_FILE;
  });
  return next.slice(0, MAX_HISTORY_TOTAL);
}

export class ReviewHistoryStore {
  private readonly fileUri: vscode.Uri;
  private entries?: ReviewHistoryEntry[];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storageUri: vscode.Uri) {
    this.fileUri = vscode.Uri.joinPath(storageUri, 'review-history.json');
  }

  async add(input: Omit<ReviewHistoryEntry, 'id' | 'reviewedAt'>): Promise<ReviewHistoryEntry> {
    const entry: ReviewHistoryEntry = {
      ...input,
      id: randomUUID(),
      reviewedAt: new Date().toISOString()
    };
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      const entries = await this.load();
      this.entries = addToHistory(entries, entry);
      await this.persist(this.entries);
    });
    await this.writeQueue;
    return entry;
  }

  async list(): Promise<readonly ReviewHistoryEntry[]> {
    await this.writeQueue.catch(() => {});
    return [...await this.load()];
  }

  async get(id: string): Promise<ReviewHistoryEntry | undefined> {
    return (await this.list()).find(entry => entry.id === id);
  }

  private async load(): Promise<ReviewHistoryEntry[]> {
    if (this.entries) return this.entries;
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.fileUri));
      const document = JSON.parse(text) as unknown;
      const rawEntries = isRecord(document) && document.version === HISTORY_VERSION && Array.isArray(document.entries)
        ? document.entries
        : [];
      this.entries = rawEntries.flatMap(value => {
        const entry = normalizeEntry(value);
        return entry ? [entry] : [];
      }).slice(0, MAX_HISTORY_TOTAL);
    } catch {
      this.entries = [];
    }
    return this.entries;
  }

  private async persist(entries: readonly ReviewHistoryEntry[]): Promise<void> {
    const document: HistoryDocument = { version: HISTORY_VERSION, entries: [...entries] };
    const temporaryUri = vscode.Uri.joinPath(this.storageUri, 'review-history.tmp.json');
    await vscode.workspace.fs.createDirectory(this.storageUri);
    await vscode.workspace.fs.writeFile(temporaryUri, new TextEncoder().encode(JSON.stringify(document)));
    await vscode.workspace.fs.rename(temporaryUri, this.fileUri, { overwrite: true });
  }
}
