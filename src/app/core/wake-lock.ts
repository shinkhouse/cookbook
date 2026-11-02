/**
 * Keeps the screen awake. The browser drops a screen wake lock whenever the
 * page is hidden, so it is taken again when the page becomes visible.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private listening = false;
  private readonly onVisible = () => {
    if (this.doc.visibilityState === 'visible' && !this.sentinel) void this.acquire();
  };

  constructor(
    private readonly nav: { wakeLock?: WakeLock },
    private readonly doc: Document,
  ) {}

  async acquire(): Promise<void> {
    // Feature-detected and silently skipped where unsupported.
    try {
      if (!this.nav.wakeLock) return;
      if (!this.listening) {
        this.doc.addEventListener('visibilitychange', this.onVisible);
        this.listening = true;
      }
      const sentinel = await this.nav.wakeLock.request('screen');
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      // A rejected request is not worth surfacing; the screen just dims.
    }
  }

  release(): void {
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
