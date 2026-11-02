import { ScreenWakeLock } from './wake-lock';

describe('ScreenWakeLock', () => {
  interface FakeSentinel {
    release: jasmine.Spy;
    listeners: Record<string, () => void>;
    addEventListener(type: string, fn: () => void): void;
  }
  const sentinel = (): FakeSentinel => {
    const s: FakeSentinel = {
      release: jasmine.createSpy('release').and.resolveTo(undefined),
      listeners: {},
      addEventListener(type, fn) {
        s.listeners[type] = fn;
      },
    };
    return s;
  };
  const flush = () => new Promise((r) => setTimeout(r));
  const nav = (request: jasmine.Spy) => ({ wakeLock: { request } as unknown as WakeLock });
  const show = (state: DocumentVisibilityState) => {
    spyOnProperty(document, 'visibilityState').and.returnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };
  let lock: ScreenWakeLock | undefined;
  afterEach(() => lock?.release());

  it('acquires on start', async () => {
    const request = jasmine.createSpy('request').and.resolveTo(sentinel());
    lock = new ScreenWakeLock(nav(request), document);
    await lock.acquire();
    expect(request).toHaveBeenCalledOnceWith('screen');
  });

  it('does nothing where wakeLock is missing', async () => {
    lock = new ScreenWakeLock({}, document);
    await expectAsync(lock.acquire()).toBeResolved();
  });

  it('swallows a rejected request', async () => {
    const request = jasmine.createSpy('request').and.rejectWith(new Error('denied'));
    lock = new ScreenWakeLock(nav(request), document);
    await expectAsync(lock.acquire()).toBeResolved();
  });

  it('re-acquires when the page becomes visible after the lock was released', async () => {
    const first = sentinel();
    const request = jasmine.createSpy('request').and.resolveTo(first);
    lock = new ScreenWakeLock(nav(request), document);
    await lock.acquire();
    first.listeners['release']();
    show('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not re-acquire while a lock is held', async () => {
    const request = jasmine.createSpy('request').and.resolveTo(sentinel());
    lock = new ScreenWakeLock(nav(request), document);
    await lock.acquire();
    show('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stops listening and releases on release()', async () => {
    const s = sentinel();
    const request = jasmine.createSpy('request').and.resolveTo(s);
    lock = new ScreenWakeLock(nav(request), document);
    await lock.acquire();
    lock.release();
    expect(s.release).toHaveBeenCalled();
    show('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that lands after release() was called', async () => {
    const s = sentinel();
    let resolve!: (v: FakeSentinel) => void;
    const request = jasmine.createSpy('request').and.returnValue(new Promise((r) => (resolve = r)));
    lock = new ScreenWakeLock(nav(request), document);
    const acquiring = lock.acquire();
    lock.release();
    resolve(s);
    await acquiring;
    expect(s.release).toHaveBeenCalled();
  });

  it('requests only once for two quick acquires', async () => {
    const request = jasmine.createSpy('request').and.resolveTo(sentinel());
    lock = new ScreenWakeLock(nav(request), document);
    await Promise.all([lock.acquire(), lock.acquire()]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
