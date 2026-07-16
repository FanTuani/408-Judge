import { StreamingJudgeParser } from './streamingJson.js';
import { normalizeJudgePreview, normalizeJudgeResult, type JudgePreview, type JudgeResult } from './types.js';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type ThinkingLevel = 'disabled' | 'high' | 'max';

export interface DeepSeekRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;
  userPrompt: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
  onStream?: (progress: StreamProgress) => void;
}

export interface StreamProgress {
  reasoning: string;
  content: string;
  attempt: number;
  preview: JudgePreview;
}

export type ApiErrorCode = 'auth' | 'rate_limit' | 'timeout' | 'cancelled' | 'empty' | 'truncated' | 'invalid_json' | 'http' | 'network';

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly retryable = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export function mapHttpError(status: number): ApiError {
  if (status === 401 || status === 403) return new ApiError('auth', 'API Key 无效或没有访问该模型的权限。');
  if (status === 429) return new ApiError('rate_limit', '请求过于频繁或额度不足，请稍后再试。');
  return new ApiError('http', `DeepSeek 服务请求失败（HTTP ${status}）。`);
}

function linkedSignal(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timeout = false;
  const onAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timeout = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeout,
    dispose: () => { clearTimeout(timer); external?.removeEventListener('abort', onAbort); }
  };
}

interface StreamAccumulator {
  reasoning: string;
  content: string;
  preview: JudgePreview;
  finishReason?: string;
}

function consumeSseEvent(rawEvent: string, accumulator: StreamAccumulator, previewParser: StreamingJudgeParser, request: DeepSeekRequest, attempt: number): boolean {
  const data = rawEvent.split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!data) return false;
  if (data === '[DONE]') return true;
  let envelope: { choices?: Array<{ delta?: { reasoning_content?: string; content?: string }; finish_reason?: string | null }> };
  try {
    envelope = JSON.parse(data) as typeof envelope;
  } catch {
    throw new ApiError('invalid_json', 'DeepSeek 流中包含无效 JSON，已无法展示结果。', true);
  }
  const choice = envelope.choices?.[0];
  if (typeof choice?.delta?.reasoning_content === 'string') accumulator.reasoning += choice.delta.reasoning_content;
  if (typeof choice?.delta?.content === 'string') {
    accumulator.content += choice.delta.content;
    accumulator.preview = previewParser.write(choice.delta.content);
  }
  if (choice?.finish_reason) accumulator.finishReason = choice.finish_reason;
  request.onStream?.({ reasoning: accumulator.reasoning, content: accumulator.content, attempt, preview: accumulator.preview });
  return false;
}

async function readSse(response: Response, request: DeepSeekRequest, attempt: number): Promise<StreamAccumulator> {
  if (!response.body) throw new ApiError('empty', 'DeepSeek 返回了空响应流，已无法完成评审。', true);
  const accumulator: StreamAccumulator = { reasoning: '', content: '', preview: {} };
  const previewParser = new StreamingJudgeParser();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent = false;
  while (!doneEvent) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const event of events) {
      if (consumeSseEvent(event, accumulator, previewParser, request, attempt)) { doneEvent = true; break; }
    }
    if (chunk.done) break;
  }
  if (!doneEvent && buffer.trim()) consumeSseEvent(buffer, accumulator, previewParser, request, attempt);
  return accumulator;
}

async function readJsonResponse(response: Response, request: DeepSeekRequest, attempt: number): Promise<StreamAccumulator> {
  const responseText = (await response.text()).trim();
  if (!responseText) throw new ApiError('empty', 'DeepSeek 返回了空响应，已无法完成评审。', true);
  let envelope: { choices?: Array<{ message?: { reasoning_content?: string; content?: string }; finish_reason?: string }> };
  try {
    envelope = JSON.parse(responseText) as typeof envelope;
  } catch {
    throw new ApiError('invalid_json', 'DeepSeek 返回的响应不是有效 JSON，已无法展示结果。', true);
  }
  const choice = envelope.choices?.[0];
  const accumulator = {
    reasoning: choice?.message?.reasoning_content ?? '',
    content: choice?.message?.content ?? '',
    preview: {} as JudgePreview,
    finishReason: choice?.finish_reason
  };
  try { accumulator.preview = normalizeJudgePreview(JSON.parse(accumulator.content)); } catch { /* strict parse below owns the error */ }
  request.onStream?.({ reasoning: accumulator.reasoning, content: accumulator.content, attempt, preview: accumulator.preview });
  return accumulator;
}

async function requestOnce(request: DeepSeekRequest, fetcher: FetchLike, attempt: number): Promise<JudgeResult> {
  const url = `${request.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const abort = linkedSignal(request.signal, request.timeoutSeconds * 1000);
  try {
    if (abort.signal.aborted) throw new ApiError('cancelled', '本次评审已取消。');
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${request.apiKey}` },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt }
        ],
        thinking: { type: request.thinkingLevel === 'disabled' ? 'disabled' : 'enabled' },
        ...(request.thinkingLevel === 'disabled' ? {} : { reasoning_effort: request.thinkingLevel }),
        response_format: { type: 'json_object' },
        stream: true
      }),
      signal: abort.signal
    });
    if (!response.ok) throw mapHttpError(response.status);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const streamed = contentType.includes('text/event-stream')
      ? await readSse(response, request, attempt)
      : await readJsonResponse(response, request, attempt);
    if (streamed.finishReason === 'length') throw new ApiError('truncated', '模型响应被截断，请缩短附加要求后重试。');
    const content = streamed.content.trim();
    if (!content) throw new ApiError('empty', '模型返回了空响应，已无法完成评审。', true);
    try {
      return normalizeJudgeResult(JSON.parse(content));
    } catch {
      throw new ApiError('invalid_json', '模型返回的内容不是有效 JSON，已无法展示结果。', true);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (abort.signal.aborted) {
      if (abort.timedOut()) throw new ApiError('timeout', `请求超过 ${request.timeoutSeconds} 秒，已超时取消。`);
      throw new ApiError('cancelled', '本次评审已取消。');
    }
    throw new ApiError('network', '无法连接 DeepSeek 服务，请检查网络和 API 地址。');
  } finally {
    abort.dispose();
  }
}

/** Empty or invalid JSON responses are retried exactly once. */
export async function reviewWithDeepSeek(request: DeepSeekRequest, fetcher: FetchLike = fetch): Promise<JudgeResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    request.onStream?.({ reasoning: '', content: '', attempt: attempt + 1, preview: {} });
    try {
      return await requestOnce(request, fetcher, attempt + 1);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retryable || attempt === 1 || request.signal?.aborted) throw error;
    }
  }
  throw new ApiError('invalid_json', '模型响应无效。');
}
