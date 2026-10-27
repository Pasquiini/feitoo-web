import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeIcon } from './home-icon';
import { HOME_TOOLS, searchTools } from './home-tools';
import { HomeToolCard } from './tool-card';
import { HomePlans } from './home-plans';

@Component({
  selector: 'app-home',
  imports: [RouterLink, HomeIcon, HomePlans, HomeToolCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly tools = HOME_TOOLS;
  readonly shortcuts = [HOME_TOOLS[0], HOME_TOOLS[5], HOME_TOOLS[3]];
  readonly featured = [HOME_TOOLS[5], HOME_TOOLS[6]];
  readonly query = signal('');
  readonly categories = computed(() => [
    ...new Set(this.filteredTools().map((tool) => tool.category)),
  ]);
  categoryTools(category: string) {
    return this.filteredTools().filter((tool) => tool.category === category);
  }
  readonly filteredTools = computed(() => searchTools(this.query(), this.tools));
}
