import { Injectable } from '@angular/core';

/**
 * The single point of contact with `localStorage`, per the design spec §2.2.
 *
 * Two reasons it exists rather than the stores touching the global directly:
 * it can be faked in tests, and a quota or private-mode failure degrades to an
 * in-memory map instead of throwing. Persistence is a convenience here — losing
 * it must never take the app down with it.
 */
@Injectable({ providedIn: 'root' })
export class Storage {
  private readonly memory = new Map<string, string>();
  private readonly backing = probe();

  /** Reads and parses, falling back on anything at all going wrong. */
  read<T>(key: string, fallback: T): T {
    // Memory is consulted whenever the backing store has nothing, not only when
    // it is absent entirely: a write that hit the quota lives only in memory,
    // and this session still needs to read its own write back.
    const persisted = this.backing ? safeGet(this.backing, key) : null;
    const raw = persisted ?? this.memory.get(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw) as T;
      // A stored `null` is indistinguishable from "absent" to a caller with a
      // non-null fallback, so treat it as absent.
      return parsed === null ? fallback : parsed;
    } catch {
      // Corrupt entry — drop it so it stops causing trouble on every read.
      this.remove(key);
      return fallback;
    }
  }

  write<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    if (!this.backing) return;
    try {
      this.backing.setItem(key, raw);
    } catch {
      // Quota exceeded or a private-mode write block. The in-memory copy above
      // means this session still behaves correctly; it just will not survive
      // a reload.
      //
      // Drop whatever is still persisted under this key: it is now an older
      // value than the one in memory, and `read` prefers the persisted copy.
      // Leaving it would serve stale data for the rest of the session.
      try {
        this.backing.removeItem(key);
      } catch {
        /* nothing useful to do */
      }
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    if (!this.backing) return;
    try {
      this.backing.removeItem(key);
    } catch {
      /* nothing useful to do */
    }
  }

  /** True when writes will actually survive a reload. Exposed for tests. */
  get persistent(): boolean {
    return this.backing !== null;
  }
}

/**
 * Feature-detects a usable `localStorage`. Safari in private mode historically
 * exposed the object but threw on write, so detection has to attempt a write
 * rather than just check for existence.
 */
function probe(): globalThis.Storage | null {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const key = '__cookbook_probe__';
    store.setItem(key, '1');
    store.removeItem(key);
    return store;
  } catch {
    return null;
  }
}

function safeGet(store: globalThis.Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
