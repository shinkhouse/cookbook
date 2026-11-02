import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Storage } from '../storage';

const KEY = 'cookbook.deviceKey';
const DEFAULT_LOCKOUT_MINUTES = 15;

export type UnlockResult = 'ok' | 'wrong' | 'locked-out' | 'unreachable';

/**
 * Whether this device holds the passcode that lets it make the API's narrow
 * writes from the live site. The passcode lives only in localStorage (via
 * Storage) and in the `x-device-key` header; it is never put in a URL, a log or
 * an error message.
 */
@Injectable({ providedIn: 'root' })
export class DeviceStore {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(Storage);

  private readonly key = signal(this.storage.read<string>(KEY, ''));

  readonly unlocked = computed(() => this.key() !== '');

  /** Minutes the last 429 asked us to wait: its Retry-After rounded up, else 15. */
  readonly lockoutMinutes = signal(DEFAULT_LOCKOUT_MINUTES);

  async unlock(passcode: string): Promise<UnlockResult> {
    const candidate = passcode.trim();
    if (!candidate) return 'wrong';
    try {
      await firstValueFrom(
        this.http.post<void>(`${environment.apiBase}/device/verify`, null, {
          headers: { 'x-device-key': candidate },
        }),
      );
    } catch (err) {
      const status = (err as { status?: unknown } | null)?.status;
      if (status === 403) return 'wrong';
      if (status === 429) {
        this.lockoutMinutes.set(retryMinutes(err));
        return 'locked-out';
      }
      return 'unreachable';
    }
    this.storage.write(KEY, candidate);
    this.key.set(candidate);
    return 'ok';
  }

  lock(): void {
    this.storage.remove(KEY);
    this.key.set('');
  }

  headers(): Record<string, string> {
    const key = this.key();
    return key ? { 'x-device-key': key } : {};
  }
}

function retryMinutes(err: unknown): number {
  const raw = err instanceof HttpErrorResponse ? err.headers?.get('Retry-After') : null;
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds / 60)
    : DEFAULT_LOCKOUT_MINUTES;
}
