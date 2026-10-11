import { describe, expect, it, vi, afterEach } from 'vitest';
import { checkResponse, postAction } from './api.ts';
afterEach(() => vi.unstubAllGlobals());
describe('human actions', () => {
  it('preserves the resume gate refusal exactly', async () => {
    await expect(checkResponse(new Response(JSON.stringify({ ok: false, message: 'Resume rejected: People are not clear.' }), { status: 409 }))).rejects.toThrow('Resume rejected: People are not clear.');
  });
  it('preserves plain server errors', async () => {
    await expect(checkResponse(new Response('Offer withdrawn', { status: 409 }))).rejects.toThrow('Offer withdrawn');
  });
  it('posts the worker report without returning pretend world state', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    expect(await postAction('/api/tasks/task-1/report', { worker: 'noor', what: 'cleared' })).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/api/tasks/task-1/report', expect.objectContaining({ method: 'POST', body: '{"worker":"noor","what":"cleared"}' }));
  });
});
