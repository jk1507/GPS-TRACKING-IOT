import { useEffect, useState } from 'react';

/**
 * Returns the current time (epoch ms) updated every `intervalMs`.
 * Used to re-evaluate the device online/offline state without a server push.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export default useNow;
