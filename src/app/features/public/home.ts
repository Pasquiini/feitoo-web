import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/services/auth.service';
import { HomeIcon } from './home-icon';
import { HomePreview } from './home-preview';
import { HomePlans } from './home-plans';

@Component({
  selector: 'app-home',
  imports: [RouterLink, HomeIcon, HomePreview, HomePlans],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly auth = inject(AuthService);
}
