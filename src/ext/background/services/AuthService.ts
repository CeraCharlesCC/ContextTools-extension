import { AUTH_STORAGE_KEY } from '@ext/bridge/keys';
import { storageGet, storageSet } from '@ext/bridge/storage';

interface AuthStateV1 {
  token: string;
}

function normalizeAuthState(value: unknown): AuthStateV1 {
  if (typeof value === 'object' && value !== null && typeof (value as { token?: unknown }).token === 'string') {
    return {
      token: (value as { token: string }).token,
    };
  }

  return {
    token: '',
  };
}

export class AuthService {
  async getToken(): Promise<string> {
    const stored = await storageGet<unknown>(AUTH_STORAGE_KEY);
    return normalizeAuthState(stored).token;
  }

  async setToken(token: string): Promise<void> {
    await storageSet<AuthStateV1>(AUTH_STORAGE_KEY, {
      token,
    });
  }
}
