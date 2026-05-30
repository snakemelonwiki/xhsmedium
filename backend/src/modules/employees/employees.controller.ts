import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res, Query } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Request, Response } from 'express';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async findAll(
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.employeesService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(result);
    }
    const rows = await this.employeesService.findAll();
    return res.json(rows);
  }

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

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.employeesService.update(id, {
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: body.status,
    });
    return res.json({ ok: true });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.employeesService.remove(id);
    return res.json({ ok: true });
  }
}
