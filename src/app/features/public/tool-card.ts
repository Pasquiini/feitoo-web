import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeIcon } from './home-icon';
import { ToolCard } from './home-tools';
import { ToolPreferencesService } from '../../core/tool-preferences.service';
@Component({
  selector: 'app-tool-card',
  imports: [RouterLink, HomeIcon],
  templateUrl: './tool-card.html',
  styleUrl: './tool-card.scss',
})
export class HomeToolCard {
  readonly tool = input.required<ToolCard>();
  readonly preferences = inject(ToolPreferencesService);
  readonly favorite = computed(() => this.preferences.isFavorite(this.tool().route));
}
