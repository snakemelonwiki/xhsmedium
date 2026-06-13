import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlazaConfig } from '../../entities/plaza-config.entity';
import { PlazaConfigService } from './plaza-config.service';
import { PlazaConfigController } from './plaza-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlazaConfig])],
  controllers: [PlazaConfigController],
  providers: [PlazaConfigService],
  exports: [PlazaConfigService],
})
export class PlazaConfigModule {}
