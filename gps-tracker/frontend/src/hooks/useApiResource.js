import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small data-fetching hook.
 *
 *   const { data, loading, error, reload } = useApiResource(
 *     () => api.getHistory({ range: 'today' }),
 *     [range],
 *   );
 *
 * `deps` works like useEffect deps: change them to refetch.
 */
export function useApiResource(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (cancelledRef) => {
    try {
      const result = await fetcherRef.current();
      if (cancelledRef && cancelledRef.current) return;
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      if (err?.name === 'AbortError') return undefined;
      if (cancelledRef && cancelledRef.current) return undefined;
      setError(err);
      return undefined;
    } finally {
      if (!cancelledRef || !cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    setLoading(true);
    run(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => {
    setLoading(true);
    return run(null);
  }, [run]);

  return { data, loading, error, reload };
}

export default useApiResource;
