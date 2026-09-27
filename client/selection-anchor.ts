import {useLayoutEffect, useRef} from 'react';

/** Keep the clicked cartridge in place when the selection above it grows. */
export function useSelectionAnchor(selection: string) {
  const anchor = useRef<{element: HTMLElement; top: number} | null>(null);

  useLayoutEffect(() => {
    const pending = anchor.current;
    anchor.current = null;
    if (!pending?.element.isConnected) return;
    // Reading layout includes any native scroll anchoring already applied.
    const shift = pending.element.getBoundingClientRect().top - pending.top;
    if (shift) window.scrollBy({top: shift, behavior: 'instant'});
  }, [selection]);

  useLayoutEffect(() => {
    // A person can keep scrolling while a party update is in flight.
    const moved = () => {
      if (anchor.current) anchor.current.top = anchor.current.element.getBoundingClientRect().top;
    };
    window.addEventListener('scroll', moved, {passive: true});
    return () => window.removeEventListener('scroll', moved);
  }, []);

  return (control: HTMLElement) => {
    const element = control.closest<HTMLElement>('.game-card');
    if (element) anchor.current = {element, top: element.getBoundingClientRect().top};
  };
}
