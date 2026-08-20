import { TestBed } from '@angular/core/testing';
import { Storage } from './storage';

describe('Storage', () => {
  let store: Storage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(Storage);
  });

  afterEach(() => localStorage.clear());

  it('round-trips a value', () => {
    interface Shape { a: number; b: string[] }
    store.write('k', { a: 1, b: ['x'] });
    expect(store.read<Shape | null>('k', null)).toEqual({ a: 1, b: ['x'] });
  });

  it('returns the fallback for a missing key', () => {
    expect(store.read('nope', 'fallback')).toBe('fallback');
  });

  it('returns the fallback for a corrupt entry, and clears it', () => {
    localStorage.setItem('bad', '{not json');
    expect(store.read('bad', [])).toEqual([]);
    // Cleared so it cannot keep costing a parse attempt on every read.
    expect(localStorage.getItem('bad')).toBeNull();
  });

  it('treats a stored null as absent', () => {
    store.write('n', null);
    expect(store.read('n', 'fallback')).toBe('fallback');
  });

  it('removes a key', () => {
    store.write('k', 1);
    store.remove('k');
    expect(store.read('k', 'gone')).toBe('gone');
  });

  it('distinguishes a stored false from a missing key', () => {
    store.write('flag', false);
    expect(store.read('flag', true)).toBe(false);
  });

  it('serves the newer in-memory value after a write starts failing', () => {
    store.write('k', 'first');
    expect(store.read('k', '')).toBe('first');

    spyOn(globalThis.localStorage, 'setItem').and.throwError('QuotaExceeded');
    store.write('k', 'second');
    // The bug this guards: reads prefer the persisted copy, so the stale
    // 'first' would keep winning over the 'second' held in memory.
    expect(store.read('k', '')).toBe('second');
  });

  it('keeps working when the backing store throws on write', () => {
    const boom = spyOn(globalThis.localStorage, 'setItem').and.throwError('QuotaExceeded');
    expect(() => store.write('k', 'v')).not.toThrow();
    expect(boom).toHaveBeenCalled();
    // Degraded to memory: this session still reads its own write.
    expect(store.read('k', 'missing')).toBe('v');
  });
});
