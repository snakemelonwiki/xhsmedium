export interface SubmitLock {
  isLocked: () => boolean;
  run: <T>(task: () => Promise<T> | T) => Promise<T | undefined>;
}

export function createSubmitLock(): SubmitLock {
  let locked = false;

  return {
    isLocked: () => locked,
    run: async <T>(task: () => Promise<T> | T): Promise<T | undefined> => {
      if (locked) return undefined;
      locked = true;
      try {
        return await task();
      } finally {
        locked = false;
      }
    },
  };
}
