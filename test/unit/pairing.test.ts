import { describe, expect, it } from 'vitest';
import { hasAnswerCode, pairSource } from '../../src/pairing.js';

describe('source pairing', () => {
  it.each([
    ['/repo/1.cpp', '/repo/1.md'],
    ['/repo/tree_exam_2024.cpp', '/repo/tree_exam_2024.md']
  ])('pairs %s with its exact same-stem markdown', async (cppPath, expectedMd) => {
    let readPath = '';
    const pair = await pairSource(cppPath, '// question\nint answer(){ return 1; }', {
      readFile: async path => { readPath = path; return '# reference'; }
    });
    expect(readPath).toBe(expectedMd);
    expect(pair.mdPath).toBe(expectedMd);
  });

  it('always uses the unsaved editor content', async () => {
    const pair = await pairSource('/repo/a.cpp', 'int unsaved(){return 42;}', { readFile: async () => 'ref' });
    expect(pair.cppContent).toContain('unsaved');
  });

  it.each([
    ['wrong extension', '/repo/a.c', 'int main(){}', 'wrong_extension'],
    ['comments only', '/repo/a.cpp', '// int fake() {}\n/* return 1; */\n#include <x>', 'no_answer']
  ])('rejects %s', async (_name, file, source, code) => {
    await expect(pairSource(file, source, { readFile: async () => 'ref' }))
      .rejects.toMatchObject({ code });
  });

  it('continues without reference data when markdown is missing', async () => {
    const pair = await pairSource('/repo/a.cpp', 'int main(){}', {
      readFile: async () => { throw new Error('ENOENT'); }
    });
    expect(pair.cppContent).toBe('int main(){}');
    expect(pair.mdPath).toBeUndefined();
    expect(pair.mdContent).toBeUndefined();
  });

  it('distinguishes code from comment markers inside strings', () => {
    expect(hasAnswerCode('const char* s = "// not a comment";')).toBe(true);
  });
});
