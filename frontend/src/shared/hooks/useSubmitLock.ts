import { useCallback, useRef, useState } from 'react';

import { createSubmitLock, type SubmitLock } from './submitLock';

export { createSubmitLock };

export function useSubmitLock() {
  const lockRef = useRef<SubmitLock | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (!lockRef.current) {
    lockRef.current = createSubmitLock();
  }

  const run = useCallback(async <T>(task: () => Promise<T> | T): Promise<T | undefined> => {
    if (lockRef.current?.isLocked()) return undefined;
    setSubmitting(true);
    try {
      return await lockRef.current?.run(task);
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, run };
}
