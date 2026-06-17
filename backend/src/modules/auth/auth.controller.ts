import { Body, Controller, Post, Get, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/auth.guard';
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
  private readonly logger = new Logger('AuthExpiredTelemetry');

  /**
   * 简单 IP 级节流：同 IP 同 reason 在窗口内最多打一条日志，
   * 防止"全员雪崩"时把 pm2 日志冲掉，也避免被恶意客户端刷 log 卷盘。
   *   key   = `${ip}|${reason}`
   *   value = 上次打印时间戳（ms）
   */
  private static readonly EXPIRED_LOG_THROTTLE_MS = 5_000;
  private static readonly expiredLogLastSeen = new Map<string, number>();

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

  /**
   * 前端「登录已失效」遥测上报（Public 路由，**不需要登录**，因为此刻 token 已失效）。
   *
   * 设计目的：把浏览器侧 `console.warn('[auth] 登录已失效')` 的内容回流到 NestJS Logger，
   * 这样运维只看 `pm2 logs lan-backend` 就能掌握全量"被踢"事件分布，不用挨个让用户截图 DevTools。
   *
   * 可观测字段：
   *   - reason: 后端 refreshToken 透出的失败原因（token_revoked / invalid_signature / ...）
   *   - userId: localStorage 里登出前缓存的用户 id（best-effort，可能为空）
   *   - role:   登出前缓存的角色（便于按角色聚合分布）
   *   - route:  用户当时停留的前端路由（pathname），定位"哪个页面踩到的"
   *   - ua:     浏览器 UA（区分 Mobile / 旧 Chrome 之类的环境因素）
   *   - ip:     从 X-Forwarded-For / req.ip 解析（Nginx 透传）
   *
   * 防滥用：同 IP 同 reason 在 5s 内只打 1 条日志（避免雪崩刷盘）。
   * 安全约束：所有字段做长度截断 + 类型保护，绝不直接信任客户端输入。
   */
  @Post('expired-event')
  @Public()
  async reportExpiredEvent(
    @Body() body: { reason?: unknown; userId?: unknown; role?: unknown; route?: unknown },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const truncate = (raw: unknown, max: number): string => {
      if (raw === undefined || raw === null) return '';
      const s = typeof raw === 'string' ? raw : String(raw);
      // 同时把不可见控制字符干掉，避免日志被恶意改色 / 改行
      const sanitized = s.replace(/[\x00-\x1f\x7f]/g, '?');
      return sanitized.length > max ? `${sanitized.slice(0, max)}…` : sanitized;
    };

    const ip = parseIp(req) || '0.0.0.0';
    const reason = truncate(body?.reason, 32) || 'unknown';
    const userId = truncate(body?.userId, 64);
    const role = truncate(body?.role, 16);
    const route = truncate(body?.route, 200);
    const ua = truncate(req.headers['user-agent'], 200);

    // 节流：同 IP 同 reason 在窗口内只放行一条
    const throttleKey = `${ip}|${reason}`;
    const now = Date.now();
    const last = AuthController.expiredLogLastSeen.get(throttleKey) || 0;
    if (now - last < AuthController.EXPIRED_LOG_THROTTLE_MS) {
      // 不打日志但仍返回 204（避免客户端重试）
      return res.status(HttpStatus.NO_CONTENT).end();
    }
    AuthController.expiredLogLastSeen.set(throttleKey, now);

    // 顺手清理过期 key，避免 Map 无限膨胀（廉价 O(n)，n 一般 <几百）
    if (AuthController.expiredLogLastSeen.size > 500) {
      for (const [k, t] of AuthController.expiredLogLastSeen) {
        if (now - t > AuthController.EXPIRED_LOG_THROTTLE_MS * 4) {
          AuthController.expiredLogLastSeen.delete(k);
        }
      }
    }

    this.logger.warn(
      `[client:expired] reason=${reason} userId=${userId || '-'} role=${role || '-'} ip=${ip} route=${route || '-'} ua="${ua}"`,
    );

    return res.status(HttpStatus.NO_CONTENT).end();
  }
}
