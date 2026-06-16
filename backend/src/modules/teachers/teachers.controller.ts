import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { TeachersService, CreateTeacherInput, UpdateTeacherInput } from './teachers.service';

@Controller('teachers')
@UseGuards(AuthGuard)
export class TeachersController {
  constructor(private readonly svc: TeachersService) {}

  @Get()
  list(
    @Query('keyword') keyword?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('specialty') specialty?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      return this.svc.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        keyword || '',
        specialty || '',
      );
    }
    return this.svc.findAll(keyword || '', specialty || '');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: CreateTeacherInput) {
    return this.svc.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateTeacherInput) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
