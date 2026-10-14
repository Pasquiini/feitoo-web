import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeIcon } from './home-icon';
import { ToolCard } from './home-tools';
@Component({
  selector: 'app-tool-card',
  imports: [RouterLink, HomeIcon],
  templateUrl: './tool-card.html',
  styleUrl: './tool-card.scss',
})
export class HomeToolCard {
  readonly tool = input.required<ToolCard>();
}
