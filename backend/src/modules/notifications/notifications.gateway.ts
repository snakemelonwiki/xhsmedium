import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = this.getUserId(client);
    if (userId) {
      client.join(this.room(userId));
      client.emit('notification.connected', { ok: true, userId });
    }
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('notification.subscribe')
  subscribe(client: Socket, payload: any) {
    const userId = String(payload?.userId || this.getUserId(client) || '').trim();
    if (!userId) return { ok: false };
    client.join(this.room(userId));
    return { ok: true };
  }

  emitCreated(userId: string, notification: any) {
    if (!userId || !this.server) return;
    this.server.to(this.room(userId)).emit('notification.created', notification);
  }

  private room(userId: string): string {
    return `user:${userId}`;
  }

  private getUserId(client: Socket): string {
    const auth = client.handshake.auth || {};
    const query = client.handshake.query || {};
    return String(auth.userId || query.userId || '').trim();
  }
}
