import { StorageService } from './storage.service';

describe('StorageService OSS driver', () => {
  const env = {
    OBJECT_STORAGE_DRIVER: 'oss',
    OSS_BUCKET: 'xhs-test01',
    OSS_REGION: 'oss-cn-shenzhen',
    OSS_ENDPOINT: 'https://oss-cn-shenzhen.aliyuncs.com',
    OSS_ACCESS_KEY_ID: 'test-id',
    OSS_ACCESS_KEY_SECRET: 'test-secret',
    OSS_PREFIX: 'lan-system',
    OSS_PRIVATE: 'true',
    OSS_SIGN_URL_EXPIRES: '900',
  };

  it('uploads buffers to prefixed OSS objects and returns stable app view paths', async () => {
    const ossClient = {
      put: jest.fn().mockResolvedValue({}),
      signatureUrl: jest.fn(),
    };
    const service = new StorageService(env, ossClient as any);

    const url = await service.putBuffer('post-covers', 'cover.png', Buffer.from('image'), {
      contentType: 'image/png',
    });

    expect(ossClient.put).toHaveBeenCalledWith(
      'lan-system/post-covers/cover.png',
      Buffer.from('image'),
      { headers: { 'Content-Type': 'image/png' } },
    );
    expect(url).toBe('/api/uploads/view/post-covers/cover.png');
  });

  it('turns stable app view paths into signed OSS URLs for private buckets', () => {
    const ossClient = {
      put: jest.fn(),
      signatureUrl: jest.fn().mockReturnValue('https://signed.example.com/cover.png?Signature=abc'),
    };
    const service = new StorageService(env, ossClient as any);

    const readableUrl = service.getReadableUrl('post-covers', 'cover.png');

    expect(ossClient.signatureUrl).toHaveBeenCalledWith(
      'lan-system/post-covers/cover.png',
      { expires: 900, method: 'GET' },
    );
    expect(readableUrl).toBe('https://signed.example.com/cover.png?Signature=abc');
  });
});
