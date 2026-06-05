import { Module } from '@nestjs/common';
import { ParserController } from './parser.controller';
import { ParserService } from './parser.service';
import { ScrapingModule } from '../scraping/scraping.module';

@Module({
  imports: [ScrapingModule],
  controllers: [ParserController],
  providers: [ParserService],
  exports: [ParserService],
})
export class ParserModule {}
