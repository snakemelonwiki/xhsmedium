const { filterByRole, canAccessResource } = require('./permission');

describe('permission role compatibility', () => {
  it('treats legacy staff as an operation-scoped role', () => {
    expect(filterByRole('staff', 'user-1', 'emp-1', { status: 'active' })).toEqual({
      status: 'active',
      employee_id: 'emp-1',
    });
    expect(
      canAccessResource('staff', 'user-1', 'emp-1', {
        employee_id: 'emp-1',
      }),
    ).toBe(true);
  });

  it('treats legacy owner as a privileged full-access role', () => {
    expect(filterByRole('owner', 'user-1', 'emp-1', { status: 'active' })).toEqual({
      status: 'active',
    });
    expect(
      canAccessResource('owner', 'user-1', 'emp-1', {
        employee_id: 'other-emp',
        assigned_sales_user_id: 'other-user',
      }),
    ).toBe(true);
  });
});
