import { describe, expect, it } from 'vitest';

import { buildAcademicTodoHref } from './academicTodoRoutes';

describe('academic todo routes', () => {
  it('links waiting material todo to the client info section on order detail', () => {
    expect(buildAcademicTodoHref({ type: 'waitingMaterial', orderId: 'order-1' }))
      .toBe('/academic/orders/order-1?todo=waitingMaterial&target=client-info#client-info');
  });

  it('links waiting teacher todo to the teacher section on order detail', () => {
    expect(buildAcademicTodoHref({ type: 'waitingTeacher', orderId: 'order-1' }))
      .toBe('/academic/orders/order-1?todo=waitingTeacher&target=teacher#teacher');
  });

  it('links near due todo to the progress section on order detail', () => {
    expect(buildAcademicTodoHref({ type: 'nearDue', orderId: 'order-1' }))
      .toBe('/academic/orders/order-1?todo=nearDue&target=progress#progress');
  });

  it('falls back to list pages when no order id is available', () => {
    expect(buildAcademicTodoHref({ type: 'waitingMaterial' }))
      .toBe('/academic/followup?status=awaiting_client_info');
  });
});
