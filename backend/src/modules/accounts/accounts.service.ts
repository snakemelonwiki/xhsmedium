import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Account } from '../../entities/account.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizeExternalUrl } from '../../shared/utils/normalize';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  /**
   * 查询账号列表，可按员工隔离运营角色数据。
   */
  async findAll(keyword = '', employeeId?: string): Promise<any[]> {
    return this.accountRepository.find({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword, employeeId),
    });
  }

  /**
   * 分页查询账号列表，可按员工隔离运营角色数据。
   */
  async findAllPaged(limit: number, offset: number, keyword = '', employeeId?: string): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [items, total] = await this.accountRepository.findAndCount({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword, employeeId),
      take: limit,
      skip: offset,
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        platform: r.platform,
        profileUrl: r.profileUrl,
        accountName: r.accountName,
        accountUid: r.accountUid,
        persona: r.persona,
        positioning: r.positioning,
        postingPlan: r.postingPlan || '',
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * 按账号 ID 查询账号，用于写操作权限判断。
   */
  async findById(id: string): Promise<Account | null> {
    return this.accountRepository.findOne({ where: { id } });
  }

  /**
   * 创建账号资料。
   */
  async create(dto: Partial<Account>): Promise<any> {
    const account = this.accountRepository.create({
      ...dto,
      profileUrl: dto.profileUrl ? normalizeExternalUrl(dto.profileUrl) : null,
      postingPlan: dto.postingPlan || '',
      id: makeId(),
    } as any);
    return this.accountRepository.save(account);
  }

  /**
   * 更新账号资料。
   */
  async update(id: string, dto: Partial<Account>): Promise<void> {
    const updates: any = {};
    if (dto.profileUrl !== undefined) updates.profileUrl = dto.profileUrl ? normalizeExternalUrl(dto.profileUrl) : null;
    if (dto.employeeId !== undefined) updates.employeeId = dto.employeeId;
    if (dto.platform !== undefined) updates.platform = dto.platform;
    if (dto.accountName !== undefined) updates.accountName = dto.accountName;
    if (dto.accountUid !== undefined) updates.accountUid = dto.accountUid;
    if (dto.persona !== undefined) updates.persona = dto.persona;
    if (dto.positioning !== undefined) updates.positioning = dto.positioning;
    if (dto.postingPlan !== undefined) updates.postingPlan = dto.postingPlan;
    if (dto.status !== undefined) updates.status = dto.status;
    await this.accountRepository.update(id, updates);
  }

  /**
   * 更新账号启停状态。
   */
  async updateStatus(id: string, status: string): Promise<void> {
    await this.accountRepository.update(id, { status });
  }

  /**
   * 更新账号发布计划。
   */
  async updatePostingPlan(id: string, postingPlan: string): Promise<void> {
    await this.accountRepository.update(id, { postingPlan: postingPlan || '' });
  }

  /**
   * 删除账号。
   */
  async remove(id: string): Promise<void> {
    await this.accountRepository.delete(id);
  }

  /**
   * 组装账号查询关键字和员工范围条件。
   */
  private keywordWhere(keyword: string, employeeId?: string) {
    const value = String(keyword || '').trim();
    const employeeWhere = employeeId !== undefined ? { employeeId } : undefined;
    if (!value) return employeeWhere;
    const like = Like(`%${value}%`);
    const rows = [
      { accountName: like },
      { accountUid: like },
      { employeeId: like },
      { platform: like },
      { persona: like },
      { positioning: like },
      { status: like },
    ];
    if (!employeeWhere) return rows;
    return rows.map((item) => ({ ...item, ...employeeWhere }));
  }
}
