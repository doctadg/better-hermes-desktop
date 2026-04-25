import { useEffect, useState } from 'react';

/**
 * Returns true while the user is holding Alt/Option. Used to reveal pane
 * number badges when in multi-pane mode.
 */
export function useAltReveal(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.altKey) setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!e.altKey) setHeld(false);
    };
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return held;
}
