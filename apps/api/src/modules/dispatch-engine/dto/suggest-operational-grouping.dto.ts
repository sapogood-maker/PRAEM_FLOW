import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SuggestOperationalGroupingDemandDto {
  @IsString()
  demandId!: string;

  @IsString()
  destination!: string;

  @IsDateString()
  appointmentTime!: string;

  @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL', 'EMERGENCY'])
  priority!: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';

  @IsBoolean()
  wheelchair!: boolean;

  @IsBoolean()
  stretcher!: boolean;

  @IsBoolean()
  returnTrip!: boolean;
}

export class SuggestOperationalGroupingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestOperationalGroupingDemandDto)
  demands!: SuggestOperationalGroupingDemandDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  vehicleCapacity?: number;
}
