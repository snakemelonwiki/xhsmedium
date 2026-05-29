import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Res() res: Response) {
    const users = await this.usersService.findAll();
    return res.json(users.map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      role: u.role,
      employeeId: u.employeeId,
      status: u.status,
    })));
  }

  @Get('staff')
  async findStaffUsers(@Res() res: Response) {
    const users = await this.usersService.findStaffUsers();
    return res.json(users.map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      role: u.role,
      employeeId: u.employeeId,
      status: u.status,
    })));
  }

  @Post('staff')
  async createStaff(@Body() body: any, @Res() res: Response) {
    const { username, password, employeeId, status } = body;
    const duplicated = await this.usersService.findByUsername(username);
    if (duplicated) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    await this.usersService.upsertStaffUser({
      id: makeId(),
      username,
      password,
      employeeId,
      status: status || 'active',
    });
    return res.json({ ok: true });
  }
}
