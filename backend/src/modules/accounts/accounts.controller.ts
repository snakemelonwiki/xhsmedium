import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, Res } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  /**
   * 查询账号列表，运营角色仅返回本人名下账号。
   */
  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('keyword') keyword?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextKeyword = keyword || search || q || '';
    const scopedEmployeeId = this.resolveScopedEmployeeId(req);
    if (wantsPaging) {
      const result = await this.accountsService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        nextKeyword,
        scopedEmployeeId,
      );
      return res.json(result);
    }
    const rows = await this.accountsService.findAll(nextKeyword, scopedEmployeeId);
    return res.json(rows.map((r) => ({
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
    })));
  }

  /**
   * 创建账号资料。
   */
  @Post()
  async create(@Body() body: any, @Res() res: Response) {
    const account = await this.accountsService.create({
      id: makeId(),
      employeeId: body.employeeId,
      platform: body.platform,
      profileUrl: body.profileUrl,
      accountName: body.accountName,
      accountUid: body.accountUid,
      persona: body.persona,
      positioning: body.positioning,
      postingPlan: body.postingPlan || '',
      status: body.status || '正常',
    });
    return res.json({ ok: true });
  }

  /**
   * 更新账号启停状态，运营角色只能修改本人名下账号。
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const denied = await this.ensureCanWriteAccount(id, body, req, res);
    if (denied) return denied;
    await this.accountsService.updateStatus(id, body.status);
    return res.json({ ok: true });
  }

  /**
   * 更新账号资料，运营角色只能修改本人名下账号。
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updateAccount(id, body, req, res);
  }

  /**
   * 兼容 PATCH 方式更新账号资料。
   */
  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updateAccount(id, body, req, res);
  }

  /**
   * 更新账号发布计划。
   */
  @Put(':id/posting-plan')
  async updatePostingPlan(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.accountsService.updatePostingPlan(id, body.postingPlan);
    return res.json({ ok: true });
  }

  /**
   * 删除账号。
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.accountsService.remove(id);
    return res.json({ ok: true });
  }

  /**
   * 执行账号资料更新并复用写权限校验。
   */
  private async updateAccount(id: string, body: any, req: Request, res: Response) {
    const denied = await this.ensureCanWriteAccount(id, body, req, res);
    if (denied) return denied;
    await this.accountsService.update(id, {
      employeeId: body.employeeId,
      platform: body.platform,
      profileUrl: body.profileUrl,
      accountName: body.accountName,
      accountUid: body.accountUid,
      persona: body.persona,
      positioning: body.positioning,
      postingPlan: body.postingPlan,
      status: body.status,
    });
    return res.json({ ok: true });
  }

  /**
   * 校验当前请求是否只能访问某个员工名下账号。
   */
  private resolveScopedEmployeeId(req: Request): string | undefined {
    const session = (req as any)?.session || {};
    if (session.role === 'staff' || session.role === 'operation') {
      return session.employeeId || '';
    }
    return undefined;
  }

  /**
   * 校验运营角色写账号时不能越过本人 employeeId。
   */
  private async ensureCanWriteAccount(id: string, body: any, req: Request, res: Response) {
    const scopedEmployeeId = this.resolveScopedEmployeeId(req);
    if (scopedEmployeeId === undefined) return null;
    const account = await this.accountsService.findById(id);
    if (!account) {
      return res.status(404).json({ ok: false, message: '账号不存在' });
    }
    if (account.employeeId !== scopedEmployeeId || (body.employeeId !== undefined && body.employeeId !== scopedEmployeeId)) {
      return res.status(403).json({ ok: false, message: '无权修改该账号' });
    }
    return null;
  }
}
