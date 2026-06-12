export class GenerateDispatchPlanDto {
  patients!: Array<{
    id: string;
    name?: string;
    city: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';
    bedridden?: boolean;
    wheelchair?: boolean;
  }>;

  vehicles!: Array<{
    id: string;
    type: string;
    capacity: number;
    city?: string;
    isPriority?: boolean;
    active?: boolean;
  }>;
}

