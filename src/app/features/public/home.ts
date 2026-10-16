import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeIcon } from './home-icon';
import { HOME_TOOLS, normalizeToolSearch } from './home-tools';
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
  readonly query = signal('');
  readonly categories = computed(() => [
    ...new Set(this.filteredTools().map((tool) => tool.category)),
  ]);
  categoryTools(category: string) {
    return this.filteredTools().filter((tool) => tool.category === category);
  }
  readonly filteredTools = computed(() => {
    const terms = normalizeToolSearch(this.query()).split(/\s+/).filter(Boolean);
    return this.tools.filter((tool) => {
      const text = normalizeToolSearch(
        [tool.title, tool.description, tool.benefit, tool.category, ...tool.keywords].join(' '),
      );
      return terms.every((term) => text.includes(term));
    });
  });
}
