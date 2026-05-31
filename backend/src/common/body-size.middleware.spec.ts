import { createBodySizeGuard } from './body-size.middleware';

describe('createBodySizeGuard', () => {
  it('does not attach data listeners to multipart requests before multer parses them', () => {
    const req = {
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      on: jest.fn(),
      destroy: jest.fn(),
    };
    const next = jest.fn();

    createBodySizeGuard(10)(req as any, {} as any, next);

    expect(req.on).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('keeps guarding non-multipart request bodies', () => {
    const handlers: Record<string, Function> = {};
    const req = {
      headers: { 'content-type': 'application/json' },
      on: jest.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
      destroy: jest.fn(),
    };

    createBodySizeGuard(4)(req as any, {} as any, jest.fn());
    handlers.data(Buffer.from('12345'));

    expect(req.destroy).toHaveBeenCalledWith(expect.any(Error));
  });
});
