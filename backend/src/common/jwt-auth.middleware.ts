import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 优先从 Authorization 头取 Bearer 令牌; 浏览器 <a href> 导航无法设置
    // Authorization 头, 兜底支持 ?token=xxx(主要用于导出/导入等文件下载直链)。
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const queryToken = (req.query as any)?.token;
      if (typeof queryToken === 'string' && queryToken.trim()) {
        token = queryToken.trim();
      }
    }
    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        // 将JWT payload附加到req.user
        (req as any).user = payload;
        // 同时附加到req.session以兼容现有代码
        (req as any).session = {
          userId: payload.sub,
          id: payload.sub,
          username: payload.username,
          role: payload.role,
          employeeId: payload.employeeId,
        };
      } catch (err) {
        // Token无效，继续但不附加用户信息
      }
    }
    next();
  }
}
