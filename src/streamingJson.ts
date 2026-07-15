import { JSONParser } from '@streamparser/json';
import { normalizeJudgePreview, type JudgePreview } from './types.js';

interface ParserValueInfo {
  value?: unknown;
  parent?: unknown;
  key?: string | number;
  stack: Array<{ key?: string | number; value: unknown }>;
  partial?: boolean;
}

/** Incrementally parses one model JSON object, including unfinished string tokens. */
export class StreamingJudgeParser {
  private readonly parser: JSONParser;
  private preview: JudgePreview = {};

  constructor() {
    this.parser = new JSONParser({ emitPartialTokens: true, emitPartialValues: true, keepStack: true });
    this.parser.onValue = info => {
      const root = this.snapshotRoot(info);
      this.preview = normalizeJudgePreview(root);
    };
    this.parser.onError = () => {
      // The strict final JSON parser owns error reporting and retry behavior.
    };
  }

  write(chunk: string): JudgePreview {
    if (!chunk || this.parser.isEnded) return this.preview;
    try { this.parser.write(chunk); } catch { /* handled strictly after the stream ends */ }
    return this.preview;
  }

  private snapshotRoot(info: ParserValueInfo): unknown {
    const root = info.stack.length > 1
      ? info.stack[1]?.value
      : info.stack.length === 0
        ? info.value
        : info.parent;
    if (!root || typeof root !== 'object') return root;
    const snapshot = structuredClone(root);
    if (!info.partial || info.key === undefined) return snapshot;
    const path = [...info.stack.slice(1).map(item => item.key), info.key];
    let target: unknown = snapshot;
    for (const key of path.slice(0, -1)) {
      if ((typeof key !== 'string' && typeof key !== 'number') || !target || typeof target !== 'object') return snapshot;
      target = (target as Record<string | number, unknown>)[key];
    }
    const last = path.at(-1);
    if ((typeof last === 'string' || typeof last === 'number') && target && typeof target === 'object') {
      (target as Record<string | number, unknown>)[last] = info.value;
    }
    return snapshot;
  }

}
