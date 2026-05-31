import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  it('accepts connections with a bearer token and joins a user room', () => {
    const gateway = new NotificationsGateway({
      verify: jest.fn().mockReturnValue({ sub: 'user-1', role: 'staff' }),
    } as any);
    const client = {
      handshake: {
        auth: { token: 'token-1' },
        query: {},
        headers: {},
      },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    gateway.handleConnection(client);

    expect(client.data.userId).toBe('user-1');
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.emit).toHaveBeenCalledWith('notification:connected', {
      ok: true,
      userId: 'user-1',
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects clients without a valid token', () => {
    const gateway = new NotificationsGateway({
      verify: jest.fn().mockImplementation(() => {
        throw new Error('invalid token');
      }),
    } as any);
    const client = {
      handshake: { auth: {}, query: {}, headers: {} },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('notification:error', {
      message: '登录状态已失效，请重新登录',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('responds to heartbeat pings without changing page state', () => {
    const gateway = new NotificationsGateway({ verify: jest.fn() } as any);

    expect(gateway.handlePing()).toEqual({
      ok: true,
      event: 'notification:pong',
    });
  });
});
