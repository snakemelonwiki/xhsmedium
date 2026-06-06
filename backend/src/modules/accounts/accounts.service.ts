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
   * 查询账号列表，可按员工隔离运营角色数据 + 按平台过滤。
   */
  async findAll(keyword = '', platform = '', employeeId?: string): Promise<any[]> {
    const rows = await this.accountRepository.find({
      order: { createdAt: 'DESC' },
      where: this.buildWhere(keyword, platform, employeeId),
    });
    return this.attachEmployeeNames(rows.map((r) => this.mapAccount(r)));
  }

  /**
   * 分页查询账号列表，可按员工隔离运营角色数据 + 按平台过滤。
   */
  async findAllPaged(
    limit: number,
    offset: number,
    keyword = '',
    platform = '',
    employeeId?: string,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [rows, total] = await this.accountRepository.findAndCount({
      order: { createdAt: 'DESC' },
      where: this.buildWhere(keyword, platform, employeeId),
      take: limit,
      skip: offset,
    });
    const items = await this.attachEmployeeNames(rows.map((r) => this.mapAccount(r)));
    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * 按主键精准查一条（带员工范围隔离）。用于学习榜单等深链 ?id=xxx 的"只看该账号"场景。
   * - 命中且在员工范围内：返回 items=[该条], total=1
   * - 未命中或越权（运营只能查自己 employeeId 下的账号）：返回 items=[], total=0
   */
  async findByIdForPaged(
    id: string,
    employeeId?: string,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    if (!id) {
      return { items: [], total: 0, limit: 0, offset: 0 };
    }
    const row = await this.findById(id);
    if (!row) {
      return { items: [], total: 0, limit: 0, offset: 0 };
    }
    if (employeeId !== undefined && row.employeeId !== employeeId) {
      return { items: [], total: 0, limit: 0, offset: 0 };
    }
    const items = await this.attachEmployeeNames([this.mapAccount(row)]);
    return { items, total: 1, limit: 1, offset: 0 };
  }

  private mapAccount(r: Account): any {
    return {
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
    };
  }

  /**
   * 把 employeeName 注入到账号列表项上，employeeId 保持不变，
   * 前端"所属员工"列优先展示姓名，找不到时再回退到 employee_code 或 ID。
   */
  private async attachEmployeeNames(items: any[]): Promise<any[]> {
    if (!items.length) return items;
    const ids = Array.from(new Set(items.map((i) => i.employeeId).filter(Boolean)));
    if (!ids.length) return items.map((i) => ({ ...i, employeeName: '' }));

    const placeholders = ids.map(() => '?').join(',');
    const rows: Array<{ id: string; name: string | null; employee_code: string | null }> = await this.accountRepository.manager.query(
      `SELECT id, name, employee_code FROM employees WHERE id IN (${placeholders})`,
      ids,
    );
    const nameMap = new Map<string, string>();
    for (const r of rows) nameMap.set(r.id, (r.name || r.employee_code || '').trim());

    return items.map((i) => ({ ...i, employeeName: nameMap.get(i.employeeId) || '' }));
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
   * 组装账号查询条件：关键字模糊 + 平台精确 + 员工范围隔离。
   */
  private buildWhere(keyword: string, platform: string, employeeId?: string) {
    const kw = String(keyword || '').trim();
    const pf = String(platform || '').trim();
    const platformFilter = pf ? { platform: pf } : null;
    const employeeFilter = employeeId !== undefined ? { employeeId } : null;
    const baseFilter = { ...(platformFilter ?? {}), ...(employeeFilter ?? {}) };

    if (!kw) {
      return Object.keys(baseFilter).length ? baseFilter : undefined;
    }

    const like = Like(`%${kw}%`);
    const fields = ['accountName', 'accountUid', 'employeeId', 'platform', 'persona', 'positioning', 'status'] as const;
    return fields.map((field) => ({
      ...baseFilter,
      [field]: like,
    }));
  }
}
