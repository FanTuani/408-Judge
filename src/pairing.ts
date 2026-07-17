import * as path from 'node:path';

export interface SourcePair {
  cppPath: string;
  mdPath?: string;
  cppContent: string;
  mdContent?: string;
}

export type PairingErrorCode = 'wrong_extension' | 'no_answer';

export class PairingError extends Error {
  constructor(public readonly code: PairingErrorCode, message: string) {
    super(message);
    this.name = 'PairingError';
  }
}

export interface PairingFileSystem {
  readFile(path: string): Promise<string>;
}

/** True when the document contains something beyond comments and preprocessor scaffolding. */
export function hasAnswerCode(source: string): boolean {
  let state: 'code' | 'line' | 'block' | 'string' | 'char' = 'code';
  let stripped = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    const next = source[i + 1];
    if (state === 'line') {
      if (char === '\n') { state = 'code'; stripped += '\n'; }
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; i += 1; }
      else if (char === '\n') stripped += '\n';
      continue;
    }
    if (state === 'string' || state === 'char') {
      stripped += char;
      if (char === '\\') { stripped += next ?? ''; i += 1; }
      else if ((state === 'string' && char === '"') || (state === 'char' && char === "'")) state = 'code';
      continue;
    }
    if (char === '/' && next === '/') { state = 'line'; i += 1; continue; }
    if (char === '/' && next === '*') { state = 'block'; i += 1; continue; }
    if (char === '"') state = 'string';
    if (char === "'") state = 'char';
    stripped += char;
  }
  const withoutDirectives = stripped.replace(/^\s*#.*$/gm, '').trim();
  return /[;{}]/.test(withoutDirectives) || /\b(return|if|for|while|switch|class|struct)\b/.test(withoutDirectives);
}

export async function pairSource(
  cppPath: string,
  unsavedCppContent: string,
  fileSystem: PairingFileSystem
): Promise<SourcePair> {
  const extension = path.extname(cppPath).toLowerCase();
  if (extension !== '.c' && extension !== '.cpp') {
    throw new PairingError('wrong_extension', '只能评审当前打开的 .c 或 .cpp 文件。');
  }
  if (!hasAnswerCode(unsavedCppContent)) {
    throw new PairingError('no_answer', '当前文件只有题干注释或工程样板，没有检测到作答代码。');
  }
  const mdPath = cppPath.slice(0, -extension.length) + '.md';
  try {
    const mdContent = await fileSystem.readFile(mdPath);
    return { cppPath, mdPath, cppContent: unsavedCppContent, mdContent };
  } catch {
    return { cppPath, cppContent: unsavedCppContent };
  }
}
