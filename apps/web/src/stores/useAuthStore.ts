import type { LoginResponse, User } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, setApiToken } from '../utils/api';

const STORAGE_KEY = 'towerwhisper.session';

interface Saved {
  token: string;
  expiresAt: string;
  user: User;
}

function load(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null;
    return saved && Date.parse(saved.expiresAt) > Date.now() ? saved : null;
  } catch {
    return null;
  }
}

function save(value: Saved | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the login lasts until the tab closes.
  }
}

/**
 * The logged-in account. The token survives a refresh (localStorage) until it expires;
 * the account itself is re-read from the server on start, so a role or sector changed by a
 * supervisor applies on the next load.
 */
export const useAuthStore = defineStore('auth', () => {
  const saved = load();
  const token = ref<string | null>(saved?.token ?? null);
  const expiresAt = ref<string | null>(saved?.expiresAt ?? null);
  const user = ref<User | null>(saved?.user ?? null);
  setApiToken(token.value);

  const loggedIn = computed(() => token.value !== null && user.value !== null);
  const isSupervisor = computed(() => user.value?.role === 'supervisor');

  async function login(email: string, password: string): Promise<User> {
    const response = await api<LoginResponse>('POST', '/auth/login', { email, password });
    token.value = response.token;
    expiresAt.value = response.expiresAt;
    user.value = response.user;
    setApiToken(response.token);
    save(response);
    return response.user;
  }

  /** Re-reads the account (role or sector may have changed); logs out if the token is gone. */
  async function refresh(): Promise<void> {
    if (!token.value) return;
    try {
      user.value = await api<User>('GET', '/auth/me');
      save({ token: token.value, expiresAt: expiresAt.value!, user: user.value });
    } catch (error) {
      if ((error as Error).message !== 'Failed to fetch') logout();
    }
  }

  function setUser(next: User): void {
    user.value = next;
    if (token.value) save({ token: token.value, expiresAt: expiresAt.value!, user: next });
  }

  function logout(): void {
    token.value = null;
    expiresAt.value = null;
    user.value = null;
    setApiToken(null);
    save(null);
  }

  return { token, user, loggedIn, isSupervisor, login, refresh, setUser, logout };
});
