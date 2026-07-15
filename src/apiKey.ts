export const API_KEY_SECRET = 'deepseekJudge.apiKey';

export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export interface ApiKeyPromptOptions {
  title: string;
  prompt: string;
  password: true;
  ignoreFocusOut: true;
  placeHolder: string;
  validateInput(value: string): string | undefined;
}

export type ApiKeyPrompt = (options: ApiKeyPromptOptions) => PromiseLike<string | undefined>;

export class ApiKeyStore {
  private pendingFirstUsePrompt?: Promise<string | undefined>;

  constructor(
    private readonly secrets: SecretStorageLike,
    private readonly prompt: ApiKeyPrompt
  ) {}

  async get(): Promise<string | undefined> {
    const value = await this.secrets.get(API_KEY_SECRET);
    return value?.trim() || undefined;
  }

  async promptAndStore(firstUse = false): Promise<string | undefined> {
    const value = await this.prompt({
      title: firstUse ? '首次评测需要 DeepSeek API Key' : '设置 DeepSeek API Key',
      prompt: firstUse
        ? '输入后将安全保存，并自动继续本次评测'
        : 'API Key 将安全保存在 VS Code SecretStorage 中',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sk-…',
      validateInput: value => value.trim() ? undefined : '请输入 DeepSeek API Key'
    });
    const normalized = value?.trim();
    if (!normalized) return undefined;
    await this.secrets.store(API_KEY_SECRET, normalized);
    return normalized;
  }

  async getOrPromptForReview(): Promise<string | undefined> {
    const stored = await this.get();
    if (stored) return stored;

    if (!this.pendingFirstUsePrompt) {
      this.pendingFirstUsePrompt = this.promptAndStore(true).finally(() => {
        this.pendingFirstUsePrompt = undefined;
      });
    }
    return this.pendingFirstUsePrompt;
  }

  async clear(): Promise<void> {
    await this.secrets.delete(API_KEY_SECRET);
  }
}
