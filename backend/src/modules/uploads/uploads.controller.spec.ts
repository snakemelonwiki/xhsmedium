import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  it('uploads a file through storage service and returns a browser url', async () => {
    const storageService = {
      putBuffer: jest.fn().mockResolvedValue('/api/uploads/view/post-covers/file.png'),
      resolveEffectiveDriver: jest.fn().mockReturnValue('local'),
    };
    const controller = new UploadsController(storageService as any);

    const result = await controller.upload(
      {
        originalname: 'cover.png',
        mimetype: 'image/png',
        size: 12,
        buffer: Buffer.from('file'),
      } as any,
      'post-covers',
    );

    expect(storageService.putBuffer).toHaveBeenCalledWith(
      'post-covers',
      expect.stringMatching(/\.png$/),
      Buffer.from('file'),
      { contentType: 'image/png' },
    );
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      url: '/api/uploads/view/post-covers/file.png',
      fileType: 'image/png',
      originalName: 'cover.png',
    }));
  });

  it('redirects stable view paths to storage readable URLs', async () => {
    const storageService = {
      getReadableUrl: jest.fn().mockReturnValue('https://signed.example.com/file.png?Signature=abc'),
    };
    const controller = new UploadsController(storageService as any);
    const res = {
      setHeader: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    } as any;

    await controller.view('post-covers', 'file.png', res);

    expect(storageService.getReadableUrl).toHaveBeenCalledWith('post-covers', 'file.png');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.redirect).toHaveBeenCalledWith('https://signed.example.com/file.png?Signature=abc');
  });

  it('rejects missing files', async () => {
    const controller = new UploadsController({ putBuffer: jest.fn() } as any);

    await expect(controller.upload(undefined as any, 'post-covers')).rejects.toThrow('请上传文件');
  });
});
