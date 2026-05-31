import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class DebounceGuard implements CanActivate {
  private readonly requestMap = new Map<string, number>();
  private readonly DEBOUNCE_TIME = 1000; // 1秒防抖

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = this.generateKey(request);
    const now = Date.now();
    const lastRequest = this.requestMap.get(key);

    if (lastRequest && now - lastRequest < this.DEBOUNCE_TIME) {
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    this.requestMap.set(key, now);

    // 清理过期记录
    if (this.requestMap.size > 10000) {
      const cutoff = now - this.DEBOUNCE_TIME * 2;
      for (const [k, v] of this.requestMap.entries()) {
        if (v < cutoff) this.requestMap.delete(k);
      }
    }

    return true;
  }

  private generateKey(request: any): string {
    const userId = request.session?.userId || request.user?.sub || 'anonymous';
    const method = request.method;
    const path = request.route?.path || request.url;
    return `${userId}:${method}:${path}`;
  }
}
