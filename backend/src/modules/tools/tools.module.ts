import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [ParserModule],
  controllers: [ToolsController],
})
export class ToolsModule {}
