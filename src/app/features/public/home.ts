import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeIcon } from './home-icon';
import { HOME_TOOLS, searchTools } from './home-tools';
import { HomeToolCard } from './tool-card';
import { ToolPreferencesService } from '../../core/tool-preferences.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, HomeIcon, HomeToolCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly preferences = inject(ToolPreferencesService);
  private readonly document = inject(DOCUMENT);
  readonly tools = HOME_TOOLS;
  readonly query = signal('');
  readonly categories = computed(() => [
    ...new Set(this.filteredTools().map((tool) => tool.category)),
  ]);
  categoryTools(category: string) {
    return this.filteredTools().filter((tool) => tool.category === category);
  }
  readonly filteredTools = computed(() => searchTools(this.query(), this.tools));

  removeFavorite(route: string, event: Event): void {
    const item = (event.currentTarget as HTMLElement).closest('li');
    const nextFocus =
      item?.nextElementSibling?.querySelector<HTMLElement>('button') ??
      item?.previousElementSibling?.querySelector<HTMLElement>('button') ??
      this.document.querySelector<HTMLElement>(`[data-tool-route="${route}"] .favorite-toggle`) ??
      this.document.getElementById('tool-search');
    this.preferences.toggleFavorite(route);
    nextFocus?.focus();
  }
}
