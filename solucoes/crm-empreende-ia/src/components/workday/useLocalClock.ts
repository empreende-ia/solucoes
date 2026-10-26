import { useEffect, useState } from 'react';
/** Re-evaluate date filters while the screen remains open and when returning to it. */
export function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date()); const interval = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return now;
}
