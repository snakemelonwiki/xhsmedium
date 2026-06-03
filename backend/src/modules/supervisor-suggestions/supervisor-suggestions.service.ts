import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupervisorSuggestion } from '../../entities/supervisor-suggestion.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { Employee } from '../../entities/employee.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { makeId } from '../../shared/utils/id-generator';

interface CreateSuggestionDto {
  senderId: string;
  targetType: string;
  targetId: string;
  content: string;
}

interface SuggestionQuery {
  targetType?: string;
  employeeId?: string;
  receiverId?: string;
  readStatus?: number;
}

@Injectable()
export class SupervisorSuggestionsService {
  constructor(
    @InjectRepository(SupervisorSuggestion)
    private readonly suggestionRepo: Repository<SupervisorSuggestion>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 创建主管建议并通知对应运营。
   * 支持关联账号、作品、员工。
   */
  async create(dto: CreateSuggestionDto): Promise<SupervisorSuggestion> {
    const { senderId, targetType, targetId, content } = dto;

    if (!targetType || !targetId || !content) {
      throw new Error('targetType、targetId、content 不能为空');
    }

    if (!['post', 'account', 'employee'].includes(targetType)) {
      throw new Error('targetType 仅支持 post、account、employee');
    }

    // 验证目标对象存在
    const employeeId = await this.resolveEmployeeId(targetType, targetId);
    if (!employeeId) {
      throw new Error('关联对象不存在');
    }

    // 查找运营用户
    const user = await this.userRepo.findOne({
      where: { employeeId, role: 'staff' },
    });
    const receiverId = user?.id;
    if (!receiverId) {
      throw new Error('关联员工没有登录账号，无法发送建议');
    }

    // 创建建议
    const suggestion = this.suggestionRepo.create({
      id: makeId(),
      senderId,
      receiverId,
      employeeId,
      targetType,
      targetId,
      content,
      readStatus: 0,
    });
    const saved = await this.suggestionRepo.save(suggestion);

    // 通知对应运营
    try {
      await this.notificationsService.create({
        receiverIds: [receiverId],
        senderId,
        portType: 'operations',
        typeCode: 'supervisor_suggestion',
        title: '主管建议',
        content: `您收到一条主管建议：${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
        relatedId: saved.id,
        relatedType: 'supervisor_suggestion',
      });
    } catch (notifErr) {
      // 通知失败不影响主流程
      console.error('[supervisor-suggestions] notification failed', (notifErr as any)?.message || notifErr);
    }

    return saved;
  }

  /**
   * 查询主管建议列表。
   */
  async list(query: SuggestionQuery = {}): Promise<SupervisorSuggestion[]> {
    const qb = this.suggestionRepo.createQueryBuilder('s')
      .orderBy('s.created_at', 'DESC')
      .limit(200);

    if (query.targetType) {
      qb.andWhere('s.target_type = :targetType', { targetType: query.targetType });
    }
    if (query.employeeId) {
      qb.andWhere('s.employee_id = :employeeId', { employeeId: query.employeeId });
    }
    if (query.receiverId) {
      qb.andWhere('s.receiver_id = :receiverId', { receiverId: query.receiverId });
    }
    if (query.readStatus !== undefined) {
      qb.andWhere('s.read_status = :readStatus', { readStatus: query.readStatus });
    }

    return qb.getMany();
  }

  /**
   * 获取单个建议详情。
   */
  async findById(id: string): Promise<SupervisorSuggestion | null> {
    return this.suggestionRepo.findOne({ where: { id } });
  }

  /**
   * 标记建议为已读。
   */
  async markAsRead(id: string, userId: string): Promise<boolean> {
    const result = await this.suggestionRepo
      .createQueryBuilder()
      .update(SupervisorSuggestion)
      .set({ readStatus: 1 })
      .where('id = :id AND receiver_id = :uid AND read_status = 0', {
        id,
        uid: userId,
      })
      .execute();
    return (result.affected || 0) > 0;
  }

  /**
   * 批量标记建议为已读。
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.suggestionRepo
      .createQueryBuilder()
      .update(SupervisorSuggestion)
      .set({ readStatus: 1 })
      .where('receiver_id = :uid AND read_status = 0', { uid: userId })
      .execute();
    return result.affected || 0;
  }

  /**
   * 获取未读建议数量。
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.suggestionRepo.count({
      where: { receiverId: userId, readStatus: 0 },
    });
  }

  /**
   * 根据目标类型和ID解析对应的员工ID。
   */
  private async resolveEmployeeId(targetType: string, targetId: string): Promise<string | null> {
    switch (targetType) {
      case 'post': {
        const post = await this.postRepo.findOne({ where: { id: targetId } });
        return post?.employeeId || null;
      }
      case 'account': {
        const account = await this.accountRepo.findOne({ where: { id: targetId } });
        return account?.employeeId || null;
      }
      case 'employee': {
        return targetId;
      }
      default:
        return null;
    }
  }
}
