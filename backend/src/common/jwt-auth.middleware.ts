import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
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
