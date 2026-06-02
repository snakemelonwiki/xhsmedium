import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../entities/post.entity';
import { SupervisorSuggestionsController } from './supervisor-suggestions.controller';
import { SupervisorSuggestionsService } from './supervisor-suggestions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post])],
  controllers: [SupervisorSuggestionsController],
  providers: [SupervisorSuggestionsService],
})
export class SupervisorSuggestionsModule {}
