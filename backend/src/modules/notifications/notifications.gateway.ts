import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService?: JwtService) {}

  handleConnection(client: Socket) {
    let userId = '';
    try {
      userId = this.resolveUserId(client);
    } catch (_err) {
      userId = '';
    }
    if (userId) {
      client.data = client.data || {};
      client.data.userId = userId;
      client.join(this.room(userId));
      client.emit('notification.connected', { ok: true, userId });
      client.emit('notification:connected', { ok: true, userId });
      return;
    }
    client.emit('notification:error', { message: '登录状态已失效，请重新登录' });
    client.disconnect(true);
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('notification.subscribe')
  subscribe(client: Socket, payload: any) {
    return this.subscribeUser(client, payload);
  }

  @SubscribeMessage('notification:subscribe')
  subscribeLegacy(client: Socket, payload: any) {
    return this.subscribeUser(client, payload);
  }

  @SubscribeMessage('notification:ping')
  handlePing() {
    return { ok: true, event: 'notification:pong' };
  }

  private subscribeUser(client: Socket, payload: any) {
    const userId = String(payload?.userId || client.data?.userId || this.getUserId(client) || '').trim();
    if (!userId) return { ok: false };
    client.join(this.room(userId));
    return { ok: true };
  }

  /**
   * 文档 1.2 §5.2: 通知事件分发
   * - 始终 emit `notification.created` / `notification:new`（通用 envelope）
   * - 按 typeCode 额外 emit 对应的业务事件，便于前端按业务类型精确订阅
   */
  private static readonly TYPE_TO_BUSINESS_EVENT: Record<string, string> = {
    lead_assigned: 'lead.assigned',
    collaboration_requested: 'collaboration.requested',
    collaboration_handled: 'collaboration.handled',
    customer_not_passed: 'lead.customer_not_passed',
    customer_added: 'lead.added_success',
    order_created: 'order.created',
    order_updated: 'order.updated',
    order_abnormal: 'order.abnormal',
    export_done: 'export.finished',
  };

  emitCreated(userId: string, notification: any) {
    if (!userId || !this.server) return;
    const room = this.room(userId);
    this.server.to(room).emit('notification.created', notification);
    this.server.to(room).emit('notification:new', notification);
    const businessEvent =
      NotificationsGateway.TYPE_TO_BUSINESS_EVENT[notification?.typeCode];
    if (businessEvent) {
      this.server.to(room).emit(businessEvent, notification);
    }
  }

  private room(userId: string): string {
    return `user:${userId}`;
  }

  private getUserId(client: Socket): string {
    const auth = client.handshake.auth || {};
    const query = client.handshake.query || {};
    return String(auth.userId || query.userId || '').trim();
  }

  private resolveUserId(client: Socket): string {
    const token = this.getToken(client);
    if (!token) return this.getUserId(client);
    const payload = this.jwtService?.verify(token);
    return String(payload?.sub || payload?.userId || payload?.id || '').trim();
  }

  private getToken(client: Socket): string {
    const auth = client.handshake.auth || {};
    const query = client.handshake.query || {};
    const header = String(client.handshake.headers?.authorization || '');
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    return String(auth.token || query.token || bearer || '').trim();
  }
}
