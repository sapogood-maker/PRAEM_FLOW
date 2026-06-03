import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchSuggestionService } from './dispatch-suggestion.service';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [RoutesModule],
  controllers: [DispatchController],
  providers: [DispatchSuggestionService],
})
export class DispatchModule {}

