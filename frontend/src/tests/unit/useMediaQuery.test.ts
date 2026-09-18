import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;
  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    onchange: null,
    addEventListener: ((_type: string, cb: EventListenerOrEventListenerObject) => {
      listeners.add(cb as Listener);
    }) as MediaQueryList['addEventListener'],
    removeEventListener: ((_type: string, cb: EventListenerOrEventListenerObject) => {
      listeners.delete(cb as Listener);
    }) as MediaQueryList['removeEventListener'],
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as MediaQueryList;
  window.matchMedia = () => mql;
  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      listeners.forEach(cb => cb(event));
    },
  };
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it('returns the current matchMedia result', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      media.setMatches(true);
    });
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia is missing', () => {
    // @ts-expect-error -- simulating unsupported environments
    delete window.matchMedia;
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });
});
