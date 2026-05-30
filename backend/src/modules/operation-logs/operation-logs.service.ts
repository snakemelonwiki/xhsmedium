import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { OperationLog } from '../../entities/operation-log.entity';
import { makeId } from '../../shared/utils/id-generator';

interface LogDto {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
  ip?: string;
}

interface ListOpts {
  userId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class OperationLogsService {
  constructor(
    @InjectRepository(OperationLog)
    private readonly repo: Repository<OperationLog>,
  ) {}

  async log(dto: LogDto): Promise<void> {
    await this.repo.save({
      id: makeId(),
      userId: dto.userId,
      action: dto.action,
      targetType: dto.targetType,
      targetId: dto.targetId,
      detail: dto.detail || null,
      ip: dto.ip || null,
    } as Partial<OperationLog>);
  }

  async list(opts: ListOpts): Promise<{ items: any[]; total: number }> {
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 500);
    const offset = Math.max(Number(opts?.offset) || 0, 0);

    const qb = this.repo.createQueryBuilder('o');

    if (opts.userId) {
      qb.andWhere('o.user_id = :userId', { userId: opts.userId });
    }
    if (opts.targetType) {
      qb.andWhere('o.target_type = :targetType', { targetType: opts.targetType });
    }
    if (opts.targetId) {
      qb.andWhere('o.target_id = :targetId', { targetId: opts.targetId });
    }
    if (opts.action) {
      qb.andWhere('o.action = :action', { action: opts.action });
    }
    if (opts.from || opts.to) {
      qb.andWhere(
        new Brackets((sqb) => {
          if (opts.from) {
            sqb.andWhere('o.created_at >= :from', { from: opts.from });
          }
          if (opts.to) {
            sqb.andWhere('o.created_at <= :to', { to: opts.to });
          }
        }),
      );
    }

    qb.orderBy('o.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows, total };
  }

  async findOne(id: string): Promise<any> {
    if (!id) return null;
    return this.repo.findOne({ where: { id } });
  }
}
