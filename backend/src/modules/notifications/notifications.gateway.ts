import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

interface NotificationSocketPayload {
  id?: string;
  title?: string;
  message?: string;
  unreadCount?: number;
  [key: string]: any;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/notifications',
  path: '/api/socket.io',
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server?: Server;

  constructor(private readonly jwtService: JwtService) {}

  /**
   * 验证通知通道连接，认证通过后加入用户专属房间。
   */
  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    try {
      const payload: any = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) {
        throw new Error('missing user id');
      }
      client.data.userId = userId;
      client.data.role = payload.role;
      client.join(this.getUserRoom(userId));
      client.emit('notification:connected', { ok: true, userId });
    } catch {
      client.emit('notification:error', {
        message: '登录状态已失效，请重新登录',
      });
      client.disconnect(true);
    }
  }

  /**
   * 处理前端心跳，保持连接活跃且不触发业务数据刷新。
   */
  @SubscribeMessage('notification:ping')
  handlePing(): { ok: true; event: string } {
    return { ok: true, event: 'notification:pong' };
  }

  /**
   * 推送单个用户通知，供后续业务服务在创建通知后复用。
   */
  emitToUser(userId: string, payload: NotificationSocketPayload): void {
    if (!userId || !this.server) return;
    this.server.to(this.getUserRoom(userId)).emit('notification:new', payload);
  }

  /**
   * 推送未读数量变更，供标记已读等场景扩展。
   */
  emitUnreadCount(userId: string, unreadCount: number): void {
    if (!userId || !this.server) return;
    this.server.to(this.getUserRoom(userId)).emit('notification:unread', {
      unreadCount,
    });
  }

  /**
   * 允许前端手动订阅，重连后可幂等补齐用户房间。
   */
  @SubscribeMessage('notification:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() _body?: any,
  ): { ok: boolean } {
    const userId = String(client.data?.userId || '');
    if (!userId) {
      return { ok: false };
    }
    client.join(this.getUserRoom(userId));
    return { ok: true };
  }

  /**
   * 从 Socket.IO 握手中提取 JWT。
   */
  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }
    const header = client.handshake.headers?.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  }

  /**
   * 生成用户通知房间名。
   */
  private getUserRoom(userId: string): string {
    return `user:${userId}`;
  }
}
