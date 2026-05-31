import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class TokenRefreshInterceptor implements NestInterceptor {
  constructor(private readonly jwtService: JwtService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return;

        const token = authHeader.substring(7);
        try {
          const payload = this.jwtService.decode(token) as any;
          if (!payload || !payload.exp) return;

          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = payload.exp - now;

          // 如果 token 剩余时间少于 30 分钟，自动续期
          if (timeUntilExpiry > 0 && timeUntilExpiry < 1800) {
            const newToken = this.jwtService.sign({
              sub: payload.sub,
              username: payload.username,
              role: payload.role,
              employeeId: payload.employeeId,
            });
            response.setHeader('X-New-Token', newToken);
          }
        } catch (err) {
          // Token 解析失败，忽略
        }
      }),
    );
  }
}
