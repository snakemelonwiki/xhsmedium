import * as fs from 'fs';
import * as path from 'path';

const ROOT_MARKERS = [
  '.playwright-profiles',
  'server.js',
  'backend',
  'public',
];

/**
 * 解析仓库根目录。
 * 优先向上寻找同时具备项目根特征的目录，兼容 backend/src 与 backend/dist 运行时。
 */
export function resolveRepoRoot(anchorDir: string = __dirname): string {
  const start = path.resolve(anchorDir);
  const candidates = collectCandidates(start);

  for (const candidate of candidates) {
    if (isRepoRoot(candidate)) {
      return candidate;
    }
  }

  return path.resolve(start, '..', '..', '..', '..', '..');
}

/**
 * 获取统一 uploads 根目录。
 */
export function resolveUploadsRoot(anchorDir: string = __dirname): string {
  return path.join(resolveRepoRoot(anchorDir), 'uploads');
}

function collectCandidates(start: string): string[] {
  const candidates: string[] = [];
  let current = start;

  while (true) {
    candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return candidates;
}

function isRepoRoot(dir: string): boolean {
  return ROOT_MARKERS.every((marker) => fs.existsSync(path.join(dir, marker)));
}
