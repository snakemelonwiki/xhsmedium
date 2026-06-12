import { EmployeesService } from './employees.service';

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

  it('stores the reset password as plain text for compatibility', async () => {
    const service = new EmployeesService(employeeRepository as any, userRepository as any);

    const result = await service.resetPassword('emp-1', 'abc123');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      password: 'abc123',
      failedLoginCount: 0,
      lastFailedAt: null,
      status: 'active',
    });
    expect(result).toEqual({
      userId: 'user-1',
      username: 'staff01',
      newPassword: 'abc123',
    });
  });
});
