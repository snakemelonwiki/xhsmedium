import { ParserController } from './parser.controller';
import { ParserService } from './parser.service';

describe('ParserController', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('空 url 返回 400 usage', async () => {
    const service = { parse: jest.fn() } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({}, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'usage', retryable: false, message: 'url 必填', platform: '' },
    });
    expect(service.parse).not.toHaveBeenCalled();
  });

  it('platform_unsupported 映射 400', async () => {
    const service = {
      parse: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'platform_unsupported', retryable: false, message: 'URL 不属于小红书或抖音', platform: '' },
      }),
    } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({ url: 'https://www.baidu.com' }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'platform_unsupported' }) }),
    );
  });

  it('login_required 映射 401', async () => {
    const service = {
      parse: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'login_required', retryable: false, message: '登录页', platform: '小红书' },
      }),
    } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({ url: 'https://www.xiaohongshu.com/explore/abc' }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('playwright_missing 映射 500', async () => {
    const service = {
      parse: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'playwright_missing', retryable: false, message: 'Executable doesn\'t exist', platform: '抖音' },
      }),
    } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({ url: 'https://v.douyin.com/abc' }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('transient 映射 502', async () => {
    const service = {
      parse: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'transient', retryable: true, message: 'ECONNRESET', platform: '小红书' },
      }),
    } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({ url: 'https://www.xiaohongshu.com/explore/abc' }, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('成功结果返回 200 + ok=true data', async () => {
    const service = {
      parse: jest.fn().mockResolvedValue({
        ok: true,
        data: { platform: '小红书', title: '测试', likes: 1, comments: 2, favorites: 3, shares: 4, metricsUpdatedAt: 'x' },
      }),
    } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({ url: 'https://www.xiaohongshu.com/explore/abc' }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, data: expect.objectContaining({ title: '测试' }) }),
    );
  });

  it('retry/timeout 从 body 透传给 service', async () => {
    const service = { parse: jest.fn().mockResolvedValue({ ok: true, data: {} as any }) } as any;
    const controller = new ParserController(service);
    const res = response();

    await controller.parse({ url: 'https://example.com', retry: 5, timeout: 30000 }, res);

    expect(service.parse).toHaveBeenCalledWith('https://example.com', { retry: 5, timeout: 30000 });
  });
});

describe('ParserController 登录态', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('POST open-login 空 platform 返回 400', async () => {
    const service = { openLogin: jest.fn() } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.openLogin({}, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.openLogin).not.toHaveBeenCalled();
  });

  it('POST open-login 成功返回 ok=true', async () => {
    const service = { openLogin: jest.fn().mockResolvedValue({ ok: true, platform: '小红书' }) } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.openLogin({ platform: '小红书' }, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, platform: '小红书' });
  });

  it('POST open-login 失败返回 500 + hint', async () => {
    const service = { openLogin: jest.fn().mockRejectedValue(new Error('Cannot open display')) } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.openLogin({ platform: '抖音' }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'open_failed', hint: expect.any(String) }),
      }),
    );
  });

  it('POST close-login 转发给 service', async () => {
    const service = { closeLogin: jest.fn().mockResolvedValue({ ok: true, platform: '抖音' }) } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.closeLogin({ platform: '抖音' }, res);
    expect(service.closeLogin).toHaveBeenCalledWith('抖音');
  });

  it('GET login-status 无 platform 返回 2 平台列表', async () => {
    const service = {
      getAllLoginStatus: jest.fn().mockReturnValue([
        { platform: '小红书', hasSession: false },
        { platform: '抖音', hasSession: true },
      ]),
    } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.getLoginStatus(undefined, res);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      items: expect.arrayContaining([expect.objectContaining({ platform: '小红书' })]),
    });
  });

  it('GET login-status?platform=小红书 返回单平台', async () => {
    const service = { getLoginStatus: jest.fn().mockReturnValue({ platform: '小红书', hasSession: true }) } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.getLoginStatus('小红书', res);
    expect(service.getLoginStatus).toHaveBeenCalledWith('小红书');
  });

  it('GET login-status 平台无效返回 400', async () => {
    const service = { getLoginStatus: jest.fn().mockImplementation(() => { throw new Error('不支持的平台: 知乎'); }) } as any;
    const controller = new ParserController(service);
    const res = response();
    await controller.getLoginStatus('知乎', res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
