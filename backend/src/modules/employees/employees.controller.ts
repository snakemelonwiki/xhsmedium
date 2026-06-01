import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, Res, Query } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Request, Response } from 'express';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /**
   * 查询员工列表，支持分页和关键字过滤。
   */
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
      const result = await this.employeesService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        nextKeyword,
      );
      return res.json(result);
    }
    const rows = await this.employeesService.findAll(nextKeyword);
    return res.json(rows);
  }

  /**
   * 创建员工并自动生成员工编号。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const allCodes = await this.employeesService.findAllCodes();
    const maxNum = allCodes.length === 0 ? 0 : Math.max(...allCodes.map((c) => Number(String(c).replace('EMP', '')) || 0));
    const employeeCode = `EMP${String(maxNum + 1).padStart(4, '0')}`;
    const employee = await this.employeesService.create({
      employeeCode,
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: body.status || '在职',
    });
    return res.json({ ok: true });
  }

  /**
   * 更新员工启停状态。
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.employeesService.updateStatus(id, body.status);
    return res.json({ ok: true });
  }

  /**
   * 更新员工资料。
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    return this.updateEmployee(id, body, res);
  }

  /**
   * 兼容 PATCH 方式更新员工资料。
   */
  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    return this.updateEmployee(id, body, res);
  }

  /**
   * 删除员工，保持现有服务删除策略。
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.employeesService.remove(id);
    return res.json({ ok: true });
  }

  /**
   * 执行员工资料更新，供 PUT/PATCH 复用。
   */
  private async updateEmployee(id: string, body: any, res: Response) {
    await this.employeesService.update(id, {
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: body.status,
    });
    return res.json({ ok: true });
  }
}
