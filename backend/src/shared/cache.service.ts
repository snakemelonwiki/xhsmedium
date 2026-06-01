import { Global, Injectable, Module } from '@nestjs/common';

/**
 * 内存缓存（P2-B 性能底座）
 * - 进程内 Map<key, { value, expireAt }>
 * - 不依赖 Redis；进程重启即丢失
 * - 仅做"减轻高频读"用途，不承担数据一致性
 * - 业务在写入主表后无需手动 invalidate，下一周期自然过期
 */

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

@Injectable()
export class CacheService {
  private readonly store = new Map<string, CacheEntry<any>>();

  /**
   * 取缓存值；命中且未过期才返回，否则返回 undefined。
   */
  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expireAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /**
   * 写入缓存；ttlMs 缺省 30 秒。
   */
  set<T = unknown>(key: string, value: T, ttlMs: number = 30_000): void {
    if (!key) return;
    this.store.set(key, { value, expireAt: Date.now() + Math.max(0, ttlMs) });
  }

  /**
   * 主动失效（写主表后调用，非必须）。
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * 按前缀失效（极少用；仅命中模式化 key 时考虑）。
   */
  deleteByPrefix(prefix: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  /**
   * 测试 / 健康检查用：当前缓存条目数。
   */
  size(): number {
    return this.store.size;
  }
}

/**
 * 全局 Module — 各业务模块直接 inject CacheService 即可，不必各自 imports
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
