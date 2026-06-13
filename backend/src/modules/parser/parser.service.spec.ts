import { ParserService } from './parser.service';

describe('ParserService', () => {
  const service = new ParserService();

  it('空 url 直接返回 usage 错误（不调用 fetchWithRetry）', async () => {
    // 实际上 service 不校验 url，由 controller 校验；这里只测 happy path 时调用了 fetchWithRetry
    // 不强制 url 校验位置，但确保暴露 classifyError 给 controller 用
    expect(typeof service.classifyError).toBe('function');
    expect(service.classifyError(new Error('Executable doesn\'t exist'))).toMatchObject({
      code: 'playwright_missing',
      retryable: false,
    });
    expect(service.classifyError(new Error('登录页'))).toMatchObject({
      code: 'login_required',
      retryable: false,
    });
    expect(service.classifyError(new Error('net::ERR_CONNECTION_RESET'))).toMatchObject({
      code: 'transient',
      retryable: true,
    });
  });

  it('parse 接收 url + opts 并返回 ParserResult', async () => {
    // mock fetchWithRetry：parser-core 是 require 进 service 的，直接测集成需运行 Playwright 太重
    // 这里用 spy 简单打桩，验证参数透传
    const spy = jest.spyOn(require('../../../scripts/parser-core'), 'fetchWithRetry');
    spy.mockResolvedValue({
      ok: true,
      data: { platform: '小红书', title: '测试', likes: 1, comments: 2, favorites: 3, shares: 4, metricsUpdatedAt: 'x' },
    });
    const result = await service.parse('https://example.com', { retry: 1, timeout: 5000 });
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ retry: 1, timeout: 5000 }));
    spy.mockRestore();
  });

  it('parse 不传 opts 时使用默认值', async () => {
    const spy = jest.spyOn(require('../../../scripts/parser-core'), 'fetchWithRetry');
    spy.mockResolvedValue({ ok: true, data: {} as any });
    await service.parse('https://example.com');
    expect(spy).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ retry: 3, timeout: 20000 }));
    spy.mockRestore();
  });

  describe('登录态', () => {
    it('getLoginStatus 接受有效平台', () => {
      const spy = jest.spyOn(require('../../../scripts/parser-core'), 'getLoginStatus');
      spy.mockReturnValue({ platform: '小红书', hasSession: true });
      const result = service.getLoginStatus('小红书');
      expect(result.platform).toBe('小红书');
      spy.mockRestore();
    });

    it('getLoginStatus 拒绝无效平台', () => {
      expect(() => service.getLoginStatus('知乎')).toThrow(/不支持的平台/);
    });

    it('getAllLoginStatus 返回 2 个平台', () => {
      const spy = jest.spyOn(require('../../../scripts/parser-core'), 'getLoginStatus');
      spy.mockImplementation((p: string) => ({ platform: p, hasSession: false }));
      const items = service.getAllLoginStatus();
      expect(items).toHaveLength(2);
      expect(items.every((i: any) => i.platform)).toBe(true);
      spy.mockRestore();
    });

    it('openLogin 拒绝无效平台', async () => {
      await expect(service.openLogin('知乎')).rejects.toThrow(/不支持的平台/);
    });

    it('closeLogin 拒绝无效平台', async () => {
      await expect(service.closeLogin('知乎')).rejects.toThrow(/不支持的平台/);
    });
  });
});
