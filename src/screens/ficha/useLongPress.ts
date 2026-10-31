import { useCallback, useRef } from 'react';

/** Hold 500 ms (spec §9.2). `click` handlers should call `consumed()` to ignore the click that ends a long press. */
export function useLongPress(onLong: () => void, ms = 500) {
  const timer = useRef<number>();
  const fired = useRef(false);

  const start = useCallback(() => {
    fired.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLong();
    }, ms);
  }, [onLong, ms]);

  const cancel = useCallback(() => window.clearTimeout(timer.current), []);

  const consumed = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return { start, cancel, consumed };
}
