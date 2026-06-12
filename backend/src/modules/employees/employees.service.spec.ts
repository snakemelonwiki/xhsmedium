import { EmployeesService } from './employees.service';

jest.mock('bcrypt', () =>
  ({
    hash: jest.fn((pwd: string) => Promise.resolve(`$2b$10$hashed_${pwd}`)),
  }));

describe('EmployeesService resetPassword', () => {
  const employeeRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    employeeRepository.findOne.mockResolvedValue({ id: 'emp-1', name: '员工A' });
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'staff01',
      employeeId: 'emp-1',
      status: 'locked',
    });
    userRepository.update.mockResolvedValue({ affected: 1 });
  });

  it('hashes the provided password and unlocks the account', async () => {
    const service = new EmployeesService(employeeRepository as any, userRepository as any);

    const result = await service.resetPassword('emp-1', 'Strong1!');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      password: '$2b$10$hashed_Strong1!',
      failedLoginCount: 0,
      lastFailedAt: null,
      status: 'active',
    });
    expect(result).toEqual({
      userId: 'user-1',
      username: 'staff01',
      newPassword: 'Strong1!',
    });
  });

  it('generates a random password when none is provided', async () => {
    const service = new EmployeesService(employeeRepository as any, userRepository as any);

    const result = await service.resetPassword('emp-1');

    expect(result.newPassword).toBeTruthy();
    expect(result.newPassword.length).toBeGreaterThanOrEqual(8);
    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        failedLoginCount: 0,
        lastFailedAt: null,
        status: 'active',
      }),
    );
  });

  it('throws BadRequestException for weak provided passwords', async () => {
    const service = new EmployeesService(employeeRepository as any, userRepository as any);

    await expect(service.resetPassword('emp-1', 'abc123')).rejects.toThrow('密码长度需为 8-20 位');
    await expect(service.resetPassword('emp-1', 'abcdefgh')).rejects.toThrow(
      '密码需包含大写字母、小写字母、数字、特殊字符中的至少两种',
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when employee does not exist', async () => {
    employeeRepository.findOne.mockResolvedValue(null);
    const service = new EmployeesService(employeeRepository as any, userRepository as any);

    await expect(service.resetPassword('emp-1', 'Strong1!')).rejects.toThrow('员工不存在');
  });

  it('throws BadRequestException when employee has no linked user', async () => {
    userRepository.findOne.mockResolvedValue(null);
    const service = new EmployeesService(employeeRepository as any, userRepository as any);

    await expect(service.resetPassword('emp-1', 'Strong1!')).rejects.toThrow(
      '该员工未绑定登录账号，无法重置密码',
    );
  });
});
