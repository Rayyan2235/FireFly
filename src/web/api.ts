/** Preserve the server's refusal verbatim; a 2xx acknowledges only the request. */
export async function checkResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const text = await response.text();
  let message = text;
  try { const body = JSON.parse(text); message = body.message ?? body.error ?? text; } catch { /* plain text errors are valid */ }
  throw new Error(message || `Server answered ${response.status}`);
}
export async function postAction(path: string, body?: unknown): Promise<void> {
  await checkResponse(await fetch(path, {
    method: 'POST',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }));
}
