const DRAFT_PREFIX = 'xhsmedium.draft.';

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: DraftStorage): DraftStorage | undefined {
  if (storage) return storage;
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

/**
 * 保存表单草稿，用于刷新或切页后恢复录入内容。
 */
export function saveDraft(key: string, values: unknown, storage?: DraftStorage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  target.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(values ?? {}));
}

/**
 * 读取表单草稿；草稿损坏时返回 undefined。
 */
export function loadDraft<T = Record<string, unknown>>(key: string, storage?: DraftStorage): T | undefined {
  const target = resolveStorage(storage);
  if (!target) return undefined;
  const raw = target.getItem(`${DRAFT_PREFIX}${key}`);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * 清理已提交或主动放弃的表单草稿。
 */
export function clearDraft(key: string, storage?: DraftStorage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  target.removeItem(`${DRAFT_PREFIX}${key}`);
}
