import { InjectionToken } from '@angular/core';
import { launch } from '../../environments/launch.generated';
import { environment } from '../../environments/environment';

export interface LaunchConfig {
  origin: string;
  contact: string;
  responsible: string;
  ga4Id: string;
  analyticsEnabled: boolean;
  ttlMinutes: number;
}
export const LAUNCH_CONFIG = new InjectionToken<LaunchConfig>('launch', {
  providedIn: 'root',
  factory: () =>
    environment.production ? launch : { ...launch, origin: '', analyticsEnabled: false },
});
