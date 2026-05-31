import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async findAll(
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('keyword') keyword?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextKeyword = keyword || search || q || '';
    if (wantsPaging) {
      const result = await this.accountsService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        nextKeyword,
      );
      return res.json(result);
    }
    const rows = await this.accountsService.findAll(nextKeyword);
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

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
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

  @Put(':id/posting-plan')
  async updatePostingPlan(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.accountsService.updatePostingPlan(id, body.postingPlan);
    return res.json({ ok: true });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.accountsService.remove(id);
    return res.json({ ok: true });
  }
}
