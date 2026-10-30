/** Tiny fetch wrapper for the REST commands (relative URLs: works behind Vite and nginx). */
export async function api<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}
