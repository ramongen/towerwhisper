import { SECTOR_HEADER } from '@towerwhisper/shared';

/** Bearer token of the logged-in user (set by the auth store). */
let token: string | null = null;
/** The sector a supervisor or the demo panel is looking at (an ATC always gets its own). */
let sector: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(value: string | null): void {
  token = value;
}

export function setApiSector(value: string | null): void {
  sector = value;
}

/** Called when the server no longer accepts the token (expired, account deleted). */
export function onApiUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

/** Tiny fetch wrapper for the REST commands (relative URLs: works behind Vite and nginx). */
export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (sector) headers[SECTOR_HEADER] = sector;
  const init: RequestInit = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      message = (Array.isArray(parsed.message) ? parsed.message[0] : parsed.message) ?? message;
    } catch {
      // not JSON
    }
    if (response.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized?.();
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}
