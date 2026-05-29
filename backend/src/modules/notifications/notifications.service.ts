import { Injectable } from '@nestjs/common';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  fromUserId: string;
  audienceRoles: string[];
  audienceEmployeeIds: string[];
  excludeUserIds: string[];
  readBy: string[];
}

const notifications: NotificationItem[] = [];

@Injectable()
export class NotificationsService {
  listForUser(userId: string, role: string, employeeId: string): any[] {
    return notifications
      .filter((item) => {
        if (item.excludeUserIds?.includes(userId)) return false;
        const roleMatch = !item.audienceRoles?.length || item.audienceRoles.includes(role);
        const employeeScopedRoles = new Set(['staff']);
        const shouldMatchEmployee = employeeScopedRoles.has(role);
        const employeeMatch = !shouldMatchEmployee || !item.audienceEmployeeIds?.length || item.audienceEmployeeIds.includes(employeeId);
        return roleMatch && employeeMatch;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => ({
        ...item,
        unread: !(item.readBy || []).includes(userId),
      }));
  }

  markRead(notificationId: string, userId: string): boolean {
    let changed = false;
    for (const item of notifications) {
      if (item.id !== notificationId) continue;
      if ((item.readBy || []).includes(userId)) continue;
      item.readBy = [...(item.readBy || []), userId];
      changed = true;
      break;
    }
    return changed;
  }
}
