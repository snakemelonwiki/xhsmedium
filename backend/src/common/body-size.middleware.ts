type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  on(event: string, handler: (chunk: Buffer) => void): unknown;
  destroy(error?: Error): void;
};

/**
 * 限制普通请求体大小；multipart 必须交给 Multer 独占读取请求流。
 */
export function createBodySizeGuard(limitBytes: number) {
  return (req: RequestLike, _res: unknown, next: () => void) => {
    const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
    if (contentType.startsWith('multipart/form-data')) {
      next();
      return;
    }

    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > limitBytes) {
        req.destroy(new Error('Request entity too large'));
      }
    });
    next();
  };
}
