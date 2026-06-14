import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { TeacherSpecialtiesService } from './teacher-specialties.service';

@Controller('teacher-specialties')
@UseGuards(AuthGuard)
export class TeacherSpecialtiesController {
  constructor(private readonly svc: TeacherSpecialtiesService) {}

  @Get()
  list(@Query('keyword') keyword?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.svc.findAll(keyword || '', Number(page), Number(pageSize));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(Number(id));
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.svc.create(body.name);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name: string }) {
    return this.svc.update(Number(id), body.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(Number(id));
  }
}
