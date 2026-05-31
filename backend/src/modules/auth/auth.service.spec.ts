import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService refreshToken', () => {
  const userRepository = {
    findOne: jest.fn(),
  };
  const employeeRepository = {
    find: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  const createService = () =>
    new AuthService(
      userRepository as any,
      employeeRepository as any,
      jwtService as unknown as JwtService,
      configService as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      role: 'staff',
      employeeId: 'emp-1',
      status: 'active',
    });
    employeeRepository.find.mockResolvedValue([{ id: 'emp-1', name: '员工A' }]);
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      username: 'alice',
      role: 'staff',
      employeeId: 'emp-1',
    });
    jwtService.sign.mockReturnValue('new-token');
  });

  it('issues a new token for an active user token', async () => {
    const service = createService();

    const result = await service.refreshToken('old-token');

    expect(jwtService.verify).toHaveBeenCalledWith('old-token');
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      username: 'alice',
      role: 'staff',
      employeeId: 'emp-1',
    });
    expect(result).toEqual({
      token: 'new-token',
      user: {
        id: 'user-1',
        username: 'alice',
        role: 'staff',
        employeeId: 'emp-1',
        employeeName: '员工A',
      },
    });
  });

  it('rejects invalid or inactive sessions', async () => {
    userRepository.findOne.mockResolvedValueOnce(null);
    const service = createService();

    await expect(service.refreshToken('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
