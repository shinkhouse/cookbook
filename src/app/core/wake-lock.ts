/**
 * Keeps the screen awake. The browser drops a screen wake lock whenever the
 * page is hidden, so it is taken again when the page becomes visible.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private listening = false;
  private wanted = false;
  private pending: Promise<void> | null = null;
  private readonly onVisible = () => {
    if (this.doc.visibilityState === 'visible' && !this.sentinel) void this.acquire();
  };

  constructor(
    private readonly nav: { wakeLock?: WakeLock },
    private readonly doc: Document,
  ) {}

  acquire(): Promise<void> {
    // One request at a time, so two quick visibility events cannot make two sentinels.
    this.wanted = true;
    this.pending ??= this.request().finally(() => (this.pending = null));
    return this.pending;
  }

  private async request(): Promise<void> {
    // Feature-detected and silently skipped where unsupported.
    try {
      if (!this.nav.wakeLock) return;
      if (!this.listening) {
        this.doc.addEventListener('visibilitychange', this.onVisible);
        this.listening = true;
      }
      const sentinel = await this.nav.wakeLock.request('screen');
      if (!this.wanted) {
        // Released while the request was in flight: hand the lock straight back.
        void sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      // A rejected request is not worth surfacing; the screen just dims.
    }
  }

  release(): void {
    this.wanted = false;
    try {
      this.doc.removeEventListener('visibilitychange', this.onVisible);
      this.listening = false;
      const sentinel = this.sentinel;
      this.sentinel = null;
      void sentinel?.release().catch(() => undefined);
    } catch {
      // Nothing to do if the platform refuses.
    }
  }
}
