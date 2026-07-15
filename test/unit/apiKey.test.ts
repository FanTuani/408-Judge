import { describe, expect, it, vi } from 'vitest';
import { API_KEY_SECRET, ApiKeyStore, type SecretStorageLike } from '../../src/apiKey.js';

function createSecrets(initial?: string): SecretStorageLike & { value?: string } {
  return {
    value: initial,
    async get(key) {
      expect(key).toBe(API_KEY_SECRET);
      return this.value;
    },
    async store(key, value) {
      expect(key).toBe(API_KEY_SECRET);
      this.value = value;
    },
    async delete(key) {
      expect(key).toBe(API_KEY_SECRET);
      this.value = undefined;
    }
  };
}

describe('API Key first-use flow', () => {
  it('uses an existing SecretStorage value without prompting', async () => {
    const secrets = createSecrets(' stored-key ');
    const prompt = vi.fn();
    const store = new ApiKeyStore(secrets, prompt);

    await expect(store.getOrPromptForReview()).resolves.toBe('stored-key');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prompts on first review, stores the trimmed key, and returns it', async () => {
    const secrets = createSecrets();
    const prompt = vi.fn().mockResolvedValue('  sk-first-use  ');
    const store = new ApiKeyStore(secrets, prompt);

    await expect(store.getOrPromptForReview()).resolves.toBe('sk-first-use');
    expect(secrets.value).toBe('sk-first-use');
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      title: '首次评测需要 DeepSeek API Key',
      password: true,
      ignoreFocusOut: true
    }));
    const options = prompt.mock.calls[0][0];
    expect(options.validateInput('   ')).toBe('请输入 DeepSeek API Key');
    expect(options.validateInput('sk-valid')).toBeUndefined();
  });

  it('does not store an empty or cancelled prompt', async () => {
    const secrets = createSecrets();
    const store = new ApiKeyStore(secrets, vi.fn().mockResolvedValue(undefined));

    await expect(store.getOrPromptForReview()).resolves.toBeUndefined();
    expect(secrets.value).toBeUndefined();
  });

  it('shares one first-use prompt across overlapping reviews', async () => {
    const secrets = createSecrets();
    let resolvePrompt!: (value: string) => void;
    const prompt = vi.fn(() => new Promise<string>(resolve => { resolvePrompt = resolve; }));
    const store = new ApiKeyStore(secrets, prompt);

    const first = store.getOrPromptForReview();
    const second = store.getOrPromptForReview();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    resolvePrompt('sk-shared');

    await expect(Promise.all([first, second])).resolves.toEqual(['sk-shared', 'sk-shared']);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
