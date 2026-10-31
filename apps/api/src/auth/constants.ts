/** Sessions last a working day; after that the user logs in again. */
export const TOKEN_TTL_S = 12 * 60 * 60;

/** Used only when AUTH_SECRET is not set (local demo); logged as a warning at startup. */
export const DEV_AUTH_SECRET = 'towerwhisper-dev-secret-change-me';

/** scrypt parameters: 16-byte salt, 64-byte key. */
export const SALT_BYTES = 16;
export const KEY_BYTES = 64;

export const MIN_PASSWORD_LENGTH = 6;

/** Accounts created on the first run (empty users table); listed in the README. */
export const DEFAULT_PASSWORD = 'passpass';
export const SEED_USERS = [
  {
    email: 'atc@towerwhisper.app',
    name: 'Andrei Ionescu',
    role: 'atc' as const,
    sectorId: 'craiova-app',
  },
  {
    email: 'supervisor@towerwhisper.app',
    name: 'Maria Popescu',
    role: 'supervisor' as const,
    sectorId: null,
  },
];
