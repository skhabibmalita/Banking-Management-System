import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async function and tracks loading and error. Only the newest call may update the state,
// so a slow earlier request (for example an old search) can never overwrite a newer result.
export default function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latest = useRef(0);

  const run = useCallback(() => {
    const id = (latest.current += 1);
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn()
      .then((data) => { if (id === latest.current) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (id === latest.current) setState({ data: null, loading: false, error: error.message }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}
