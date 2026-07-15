import { describe, expect, it, vi } from 'vitest';
import { ApiError, mapHttpError, reviewWithDeepSeek, type DeepSeekRequest } from '../../src/api.js';

const request: DeepSeekRequest = {
  apiKey: 'secret', baseUrl: 'https://example.test/', model: 'model',
  thinkingLevel: 'high', systemPrompt: 'system', userPrompt: 'user', timeoutSeconds: 1
};

function response(content: string | undefined, finishReason = 'stop'): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

describe('DeepSeek client', () => {
  it.each([
    ['disabled', 'disabled', undefined],
    ['high', 'enabled', 'high'],
    ['max', 'enabled', 'max']
  ] as const)('maps %s to the official DeepSeek parameters', async (thinkingLevel, thinkingType, reasoningEffort) => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.thinking.type).toBe(thinkingType);
      expect(body.reasoning_effort).toBe(reasoningEffort);
      return response('{"verdict":"correct"}');
    });
    await reviewWithDeepSeek({ ...request, thinkingLevel }, fetcher);
  });

  it('sends locked request parameters without exposing key in the body', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ model: 'model', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, stream: true });
      expect(init.body).not.toContain('secret');
      return response('{"verdict":"correct","summary":"好"}');
    });
    expect((await reviewWithDeepSeek(request, fetcher)).verdict).toBe('correct');
    expect(fetcher).toHaveBeenCalledWith('https://example.test/chat/completions', expect.anything());
  });

  it('streams reasoning and conclusion across arbitrary SSE chunks', async () => {
    const encoder = new TextEncoder();
    const events = [
      'data: {"choices":[{"delta":{"reasoning_content":"先检查"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"边界","content":"{\\"verdict\\":\\"correct\\""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":",\\"summary\\":\\"通过\\"}"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n'
    ].join('');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(events.slice(0, 37)));
        controller.enqueue(encoder.encode(events.slice(37, 91)));
        controller.enqueue(encoder.encode(events.slice(91)));
        controller.close();
      }
    });
    const progress: Array<{ reasoning: string; content: string }> = [];
    const fetcher = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const result = await reviewWithDeepSeek({ ...request, onStream: value => progress.push(value) }, fetcher);
    expect(result.verdict).toBe('correct');
    expect(progress.at(-1)).toMatchObject({ reasoning: '先检查边界', content: '{"verdict":"correct","summary":"通过"}' });
  });

  it.each([['', 'empty'], ['not json', 'invalid_json']])('retries %s once', async (content, expectedCode) => {
    const fetcher = vi.fn(async () => response(content));
    await expect(reviewWithDeepSeek(request, fetcher)).rejects.toMatchObject({ code: expectedCode });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries an empty HTTP response body once', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 200 }));
    await expect(reviewWithDeepSeek(request, fetcher)).rejects.toMatchObject({ code: 'empty' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry a truncated response', async () => {
    const fetcher = vi.fn(async () => response('{}', 'length'));
    await expect(reviewWithDeepSeek(request, fetcher)).rejects.toMatchObject({ code: 'truncated' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([[401, 'auth'], [403, 'auth'], [429, 'rate_limit'], [500, 'http']])('maps HTTP %s', (status, code) => {
    expect(mapHttpError(status)).toMatchObject<ApiError>({ code });
  });

  it('maps timeout and user cancellation separately', async () => {
    const hanging = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await expect(reviewWithDeepSeek({ ...request, timeoutSeconds: 0.01 }, hanging)).rejects.toMatchObject({ code: 'timeout' });
    const controller = new AbortController();
    const promise = reviewWithDeepSeek({ ...request, signal: controller.signal }, hanging);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'cancelled' });
  });
});
