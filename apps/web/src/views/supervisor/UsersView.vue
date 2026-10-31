<script setup lang="ts">
import type {
  CreateUserRequest,
  UpdateUserRequest,
  User,
  UserListItem,
  UserRole,
} from '@towerwhisper/shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import AccountDialog from '../../components/supervisor/AccountDialog.vue';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSectorStore } from '../../stores/useSectorStore';
import { api } from '../../utils/api';
import { utcDateTime } from '../../utils/format';

/** Who is online changes as people sign in. */
const REFRESH_MS = 10_000;
const NOTICE_MS = 3500;

const auth = useAuthStore();
const sectors = useSectorStore();
const users = ref<UserListItem[]>([]);
const loadError = ref<string | null>(null);
const notice = ref<{ text: string; bad: boolean } | null>(null);
const query = ref('');
const dialog = ref<{ mode: 'create' } | { mode: 'password'; user: UserListItem } | null>(null);
const deleting = ref<UserListItem | null>(null);
const busy = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

async function load(): Promise<void> {
  try {
    users.value = await api<UserListItem[]>('GET', '/users');
    loadError.value = null;
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}

function tell(text: string, bad = false): void {
  notice.value = { text, bad };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = null), NOTICE_MS);
}

onMounted(() => {
  void sectors.loadAll().catch(() => undefined);
  void load();
  timer = setInterval(() => void load(), REFRESH_MS);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(noticeTimer);
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter((u) =>
    [u.name, u.email, sectors.byId(u.sectorId)?.name ?? ''].some((v) =>
      v.toLowerCase().includes(q),
    ),
  );
});

const counts = computed(() => ({
  atc: users.value.filter((u) => u.role === 'atc').length,
  supervisors: users.value.filter((u) => u.role === 'supervisor').length,
  online: users.value.filter((u) => u.online).length,
}));

/** Controllers per sector, to show which sectors are staffed. */
const staffing = computed(() =>
  sectors.all.map((s) => ({
    sector: s,
    assigned: users.value.filter((u) => u.role === 'atc' && u.sectorId === s.id),
  })),
);

async function patch(user: UserListItem, body: UpdateUserRequest, done: string): Promise<void> {
  try {
    const updated = await api<User>('PATCH', `/users/${user.id}`, body);
    Object.assign(user, updated);
    if (updated.id === auth.user?.id) auth.setUser(updated);
    tell(done);
  } catch (e) {
    tell((e as Error).message, true);
    void load(); // show what the server kept
  }
}

function setRole(user: UserListItem, event: Event): void {
  const role = (event.target as HTMLSelectElement).value as UserRole;
  const sectorId = role === 'atc' ? (user.sectorId ?? sectors.all[0]?.id ?? null) : null;
  void patch(
    user,
    { role, sectorId },
    `${user.name} is now ${role === 'atc' ? 'an ATC' : 'a supervisor'}`,
  );
}

function setSector(user: UserListItem, event: Event): void {
  const sectorId = (event.target as HTMLSelectElement).value || null;
  const name = sectors.byId(sectorId)?.name ?? 'no sector';
  void patch(user, { sectorId }, `${user.name} works ${name}`);
}

async function create(body: CreateUserRequest): Promise<void> {
  busy.value = true;
  try {
    const user = await api<User>('POST', '/users', body);
    tell(`Account created for ${user.name}`);
    dialog.value = null;
    await load();
  } catch (e) {
    tell((e as Error).message, true);
  } finally {
    busy.value = false;
  }
}

async function setPassword(user: UserListItem, password: string): Promise<void> {
  busy.value = true;
  await patch(user, { password }, `New password set for ${user.name}`);
  busy.value = false;
  dialog.value = null;
}

async function remove(): Promise<void> {
  const user = deleting.value;
  if (!user) return;
  busy.value = true;
  try {
    await api<void>('DELETE', `/users/${user.id}`);
    tell(`${user.name}'s account deleted`);
    await load();
  } catch (e) {
    tell((e as Error).message, true);
  } finally {
    busy.value = false;
    deleting.value = null;
  }
}
</script>

<template>
  <div class="users">
    <div class="head">
      <div>
        <h2 class="h2">Accounts</h2>
        <p class="hint">
          {{ counts.atc }} controllers · {{ counts.supervisors }} supervisors ·
          <span class="online-count">{{ counts.online }} online</span>. A controller works the
          sector set here; a change applies to an open screen at once.
        </p>
      </div>
      <div class="tools">
        <label class="search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" stroke-linecap="round" />
          </svg>
          <span class="visually-hidden">Search accounts</span>
          <input v-model="query" type="search" placeholder="Search name, email, sector" />
        </label>
        <button type="button" class="primary" @click="dialog = { mode: 'create' }">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          New account
        </button>
      </div>
    </div>

    <div class="staffing">
      <div
        v-for="s in staffing"
        :key="s.sector.id"
        class="staff-card"
        :class="{ empty: !s.assigned.length }"
      >
        <span class="staff-name">{{ s.sector.name }}</span>
        <span class="staff-icao mono">{{ s.sector.airportIcao }}</span>
        <span class="staff-count mono">
          {{ s.assigned.length }} ATC<template v-if="s.assigned.some((u) => u.online)">
            · {{ s.assigned.filter((u) => u.online).length }} ONLINE</template
          >
        </span>
      </div>
    </div>

    <p v-if="loadError" class="error" role="alert">Accounts unavailable: {{ loadError }}</p>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Role</th>
            <th scope="col">Sector</th>
            <th scope="col">Status</th>
            <th scope="col">Last sign-in (UTC)</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id">
            <td>
              <span class="name">
                {{ u.name }}
                <span v-if="u.id === auth.user?.id" class="you mono">YOU</span>
              </span>
              <span class="email mono">{{ u.email }}</span>
            </td>
            <td>
              <label>
                <span class="visually-hidden">Role of {{ u.name }}</span>
                <select
                  :value="u.role"
                  :disabled="u.id === auth.user?.id"
                  @change="setRole(u, $event)"
                >
                  <option value="atc">ATC</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </label>
            </td>
            <td>
              <label v-if="u.role === 'atc'">
                <span class="visually-hidden">Sector of {{ u.name }}</span>
                <select
                  :value="u.sectorId ?? ''"
                  :class="{ missing: !u.sectorId }"
                  @change="setSector(u, $event)"
                >
                  <option value="">No sector</option>
                  <option v-for="s in sectors.all" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </label>
              <span v-else class="muted mono">ALL SECTORS</span>
            </td>
            <td>
              <span class="status" :class="{ online: u.online }">
                <span class="dot" aria-hidden="true" />
                {{ u.online ? 'Online' : 'Offline' }}
              </span>
            </td>
            <td class="mono muted">{{ u.lastLoginAt ? utcDateTime(u.lastLoginAt) : 'never' }}</td>
            <td class="actions">
              <button type="button" class="ghost" @click="dialog = { mode: 'password', user: u }">
                Set password
              </button>
              <button
                type="button"
                class="ghost danger"
                :disabled="u.id === auth.user?.id"
                :title="u.id === auth.user?.id ? 'You cannot delete your own account' : undefined"
                @click="deleting = u"
              >
                Delete
              </button>
            </td>
          </tr>
          <tr v-if="!filtered.length && users.length">
            <td colspan="6" class="none">No account matches “{{ query }}”.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="fade">
      <div v-if="notice" class="notice" :class="{ bad: notice.bad }" role="status">
        <svg
          v-if="!notice.bad"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          aria-hidden="true"
        >
          <path d="M5 12l5 5 9-10" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l10 18H2z" fill="currentColor" />
        </svg>
        {{ notice.text }}
      </div>
    </Transition>

    <AccountDialog
      v-if="dialog"
      :mode="dialog.mode"
      :user="dialog.mode === 'password' ? dialog.user : null"
      :sectors="sectors.all"
      :busy="busy"
      @create="create"
      @password="(p) => dialog?.mode === 'password' && setPassword(dialog.user, p)"
      @cancel="dialog = null"
    />

    <ConfirmDialog
      v-if="deleting"
      title="Delete this account?"
      :message="`${deleting.name} (${deleting.email}) will no longer be able to sign in. Recorded sessions keep their history.`"
      confirm-label="DELETE"
      :busy="busy"
      @confirm="remove"
      @cancel="deleting = null"
    />
  </div>
</template>

<style scoped>
.users {
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--space-6) 32px 48px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-4);
}

.h2 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
}

.hint {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

.online-count {
  color: var(--color-ok);
}

.tools {
  display: flex;
  gap: var(--space-3);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-3);
  color: var(--color-text-muted);
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.search input {
  width: 260px;
  font-size: 14px;
  background: transparent;
  border: none;
  outline: none;
}

.primary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-4);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-radar-bg);
  background: var(--color-atc);
  border: none;
  border-radius: var(--radius);
}

.staffing {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
}

.staff-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-left: 3px solid var(--color-atc);
  border-radius: var(--radius-card);
}

.staff-card.empty {
  border-left-color: var(--color-border-control);
}

.staff-name {
  font-size: 14px;
  font-weight: 600;
}

.staff-icao {
  font-size: 12px;
  color: var(--color-text-muted);
}

.staff-count {
  grid-column: 1 / -1;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.error {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  border-radius: var(--radius);
}

.table-wrap {
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th {
  padding: var(--space-3) var(--space-4);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  color: var(--color-text-faint);
  background: var(--color-panel-raised);
  border-bottom: var(--border-width) solid var(--color-border);
}

.table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-width) solid var(--color-border);
  vertical-align: middle;
}

.table tr:last-child td {
  border-bottom: none;
}

.table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
}

.you {
  padding: 1px 6px;
  font-size: 10px;
  color: var(--color-atc);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius-sm);
}

.email {
  font-size: 12px;
  color: var(--color-text-muted);
}

select {
  height: 34px;
  min-width: 190px;
  padding: 0 var(--space-2);
  font-size: 14px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

select.missing {
  border-color: var(--color-caution);
  color: var(--color-caution);
}

select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.muted {
  font-size: 12px;
  color: var(--color-text-muted);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-idle);
}

.status.online {
  color: var(--color-text);
}

.status.online .dot {
  background: var(--color-ok);
}

.actions {
  text-align: right;
  white-space: nowrap;
}

.ghost {
  height: 32px;
  margin-left: var(--space-2);
  padding: 0 var(--space-3);
  font-size: 13px;
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.ghost:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.ghost.danger:hover:not(:disabled) {
  color: var(--color-warning-text);
  border-color: var(--color-warning);
}

.ghost:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.none {
  color: var(--color-text-faint);
}

.notice {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  font-size: 14px;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-ok);
  border-radius: var(--radius-card);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.notice svg {
  color: var(--color-ok);
}

.notice.bad {
  border-color: var(--color-warning);
}

.notice.bad svg {
  color: var(--color-warning);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
