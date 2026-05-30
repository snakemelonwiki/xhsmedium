import { Controller, Post, Get, Req, Res, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const { username, password } = req.body;
    // legacy proxy 在 server.js 里通过 X-Origin-Port header 透传原始端口
    // （否则后端 socket.localPort 永远是 NestJS 监听端口 8089）
    const originPort = Number(req.headers['x-origin-port']) || 0;
    const requestPort = originPort || Number((req.socket as any)?.localPort || 3000);
    try {
      const result = await this.authService.login(username, password, requestPort);
      return res.json(result);
    } catch (error: any) {
      return res.status(error.status || 401).json(error.response || { message: error.message });
    }
  }

  @Get('me')
  async getMe(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user?.sub;
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }
    const user = await this.authService.getMe(userId);
    if (!user) {
      return res.status(401).json({ message: '未登录' });
    }
    return res.json({ user });
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      this.authService.logout(token);
    }
    return res.json({ ok: true });
  }
}
