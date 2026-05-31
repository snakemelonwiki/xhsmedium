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

  async findAll(keyword = ''): Promise<any[]> {
    return this.accountRepository.find({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword),
    });
  }

  async findAllPaged(limit: number, offset: number, keyword = ''): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [items, total] = await this.accountRepository.findAndCount({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword),
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

  async create(dto: Partial<Account>): Promise<any> {
    const account = this.accountRepository.create({
      ...dto,
      profileUrl: dto.profileUrl ? normalizeExternalUrl(dto.profileUrl) : null,
      postingPlan: dto.postingPlan || '',
      id: makeId(),
    } as any);
    return this.accountRepository.save(account);
  }

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

  async updatePostingPlan(id: string, postingPlan: string): Promise<void> {
    await this.accountRepository.update(id, { postingPlan: postingPlan || '' });
  }

  async remove(id: string): Promise<void> {
    await this.accountRepository.delete(id);
  }

  private keywordWhere(keyword: string) {
    const value = String(keyword || '').trim();
    if (!value) return undefined;
    const like = Like(`%${value}%`);
    return [
      { accountName: like },
      { accountUid: like },
      { employeeId: like },
      { platform: like },
      { persona: like },
      { positioning: like },
      { status: like },
    ];
  }
}
