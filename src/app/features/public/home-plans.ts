import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/services/auth.service';

@Component({
  selector: 'app-home-plans',
  imports: [RouterLink],
  templateUrl: './home-plans.html',
  styleUrl: './home-plans.scss',
})
export class HomePlans {
  readonly auth = inject(AuthService);
}
