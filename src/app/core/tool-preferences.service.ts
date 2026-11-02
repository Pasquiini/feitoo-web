import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, PRIMARY_OUTLET, Router } from '@angular/router';
import { filter } from 'rxjs';
import { HOME_TOOLS } from '../features/public/home-tools';

export const TOOL_PREFERENCES_KEY = 'feitoo-tool-preferences-v1';

@Injectable({ providedIn: 'root' })
export class ToolPreferencesService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tools = new Map(HOME_TOOLS.map((tool) => [tool.route, tool]));
  private readonly favoriteRoutes = signal<readonly string[]>([]);
  private readonly recentRoutes = signal<readonly string[]>([]);
  private loaded = false;

  readonly favorites = computed(() =>
    this.favoriteRoutes().flatMap((route) => this.tools.get(route) ?? []),
  );
  readonly recent = computed(() =>
    this.recentRoutes().flatMap((route) => this.tools.get(route) ?? []),
  );

  constructor() {
    // Server and first client render remain identical. Preferences are local to this browser.
    if (!this.browser) return;
    afterNextRender(() => {
      this.restore();
      if (this.router.navigated) this.recordVisit(this.router.url);
      this.router.events
        .pipe(
          filter((event): event is NavigationEnd => event instanceof NavigationEnd),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((event) => this.recordVisit(event.urlAfterRedirects));

      const view = this.document.defaultView;
      const onStorage = (event: StorageEvent) => {
        if (event.key !== TOOL_PREFERENCES_KEY && event.key !== null) return;
        if (event.storageArea && event.storageArea !== this.storage()) return;
        this.applySaved(event.newValue);
      };
      view?.addEventListener('storage', onStorage);
      this.destroyRef.onDestroy(() => view?.removeEventListener('storage', onStorage));
    });
  }

  isFavorite(route: string): boolean {
    return this.favoriteRoutes().includes(route);
  }

  toggleFavorite(route: string): void {
    if (!this.browser || !this.tools.has(route)) return;
    this.restore();
    this.favoriteRoutes.update((routes) =>
      routes.includes(route) ? routes.filter((item) => item !== route) : [...routes, route],
    );
    this.persist();
  }

  private recordVisit(url: string): void {
    const segments = this.router.parseUrl(url).root.children[PRIMARY_OUTLET]?.segments ?? [];
    const route = '/' + segments.map((segment) => segment.path).join('/');
    if (!this.tools.has(route) || this.recentRoutes()[0] === route) return;
    this.recentRoutes.update((routes) =>
      [route, ...routes.filter((item) => item !== route)].slice(0, 5),
    );
    this.persist();
  }

  private storage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private restore(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      this.applySaved(this.storage()?.getItem(TOOL_PREFERENCES_KEY) ?? null);
    } catch {
      // Keep working in memory if reading storage is unavailable.
    }
  }

  private applySaved(raw: string | null): void {
    let data: unknown;
    try {
      data = raw && raw.length <= 16384 ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    const saved =
      data && typeof data === 'object' && 'version' in data && data.version === 1 ? data : null;
    const routes = (value: unknown, limit: number): string[] =>
      Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (route): route is string => typeof route === 'string' && this.tools.has(route),
              ),
            ),
          ].slice(0, limit)
        : [];
    this.favoriteRoutes.set(
      routes(saved && 'favorites' in saved ? saved.favorites : null, this.tools.size),
    );
    this.recentRoutes.set(routes(saved && 'recent' in saved ? saved.recent : null, 5));
  }

  private persist(): void {
    try {
      this.storage()?.setItem(
        TOOL_PREFERENCES_KEY,
        JSON.stringify({
          version: 1,
          favorites: this.favoriteRoutes(),
          recent: this.recentRoutes(),
        }),
      );
    } catch {
      // Quota/security failures affect persistence, never the in-memory controls.
    }
  }
}
