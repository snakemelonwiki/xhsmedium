import { Module } from '@nestjs/common';
import { LeadsParserController } from './leads-parser.controller';
import { LeadsParserService } from './leads-parser.service';

@Module({
  controllers: [LeadsParserController],
  providers: [LeadsParserService],
  exports: [LeadsParserService],
})
export class LeadsParserModule {}
