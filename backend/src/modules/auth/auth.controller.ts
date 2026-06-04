import { Controller, Post, Get, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { getSessionUserId } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Post('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const { username, password } = req.body;
    // legacy proxy 在 server.js 里通过 X-Origin-Port header 透传原始端口
    // （否则后端 socket.localPort 永远是 NestJS 监听端口 8089）
    const originPort = Number(req.headers['x-origin-port']) || 0;
    const requestPort = originPort || Number((req.socket as any)?.localPort || 3000);
    try {
      const result = await this.authService.login(username, password, requestPort);
      // 写操作日志：登录成功（best-effort）
      try {
        await this.operationLogs.log({
          userId: result?.user?.id || '',
          action: OPERATION_LOG_ACTIONS.LOGIN,
          targetType: OPERATION_LOG_TARGET_TYPES.USER,
          targetId: result?.user?.id || '',
          detail: stringifyDetail({
            username: result?.user?.username || username,
            role: result?.user?.role || '',
          }),
          ip: parseIp(req),
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[auth] operation log failed', (logErr as any)?.message || logErr);
      }
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

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ message: '未登录' });
    }
    try {
      const result = await this.authService.refreshToken(token);
      return res.json(result);
    } catch (error: any) {
      return res.status(error.status || HttpStatus.UNAUTHORIZED).json(error.response || { message: error.message });
    }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    // 用户 ID 优先从 session / 解析 token 拿
    const userId = getSessionUserId(req) || '';
    let revoked = false;
    if (token) {
      try {
        const result = await this.authService.logout(token, userId);
        revoked = result?.revoked === true;
      } catch (err: any) {
        // 写撤销表失败不应阻塞登出响应（用户体感是「已登出」），但打 ERROR
        // eslint-disable-next-line no-console
        console.error('[auth] logout failed', err?.message || err);
      }
    }
    // 写操作日志：登出（best-effort）
    void this.operationLogs
      .log({
        userId,
        action: OPERATION_LOG_ACTIONS.LOGOUT,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: userId,
        detail: stringifyDetail({ token: token ? 'present' : 'absent', revoked }),
        ip: parseIp(req),
      })
      .catch((logErr: any) => {
        // eslint-disable-next-line no-console
        console.error('[auth] operation log failed', logErr?.message || logErr);
      });
    return res.json({ ok: true, revoked });
  }
}
