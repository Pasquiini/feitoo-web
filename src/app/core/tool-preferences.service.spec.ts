import { Component, inject, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { HOME_TOOLS } from '../features/public/home-tools';
import { launch } from '../../environments/launch.generated';
import { TOOL_PREFERENCES_KEY, ToolPreferencesService } from './tool-preferences.service';

@Component({ template: '' })
class ToolPage {}
@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class PreferencesHost {
  readonly preferences = inject(ToolPreferencesService);
}

describe('Tool preferences', () => {
  const routes = HOME_TOOLS.map((tool) => tool.route);
  const saved = (favorites: unknown = [], recent: unknown = []) =>
    JSON.stringify({ version: 1, favorites, recent });
  beforeEach(() => {
    localStorage.removeItem(TOOL_PREFERENCES_KEY);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          ...[
            ...new Set([
              ...routes,
              '/gerador-de-orcamentos',
              '/removed-tool',
              '/planos',
              '/seguranca',
              '/login',
              '/',
            ]),
          ].map((route) => ({ path: route.slice(1), component: ToolPage })),
          { path: 'redirect', redirectTo: 'docx-para-pdf', pathMatch: 'full' },
        ]),
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOOL_PREFERENCES_KEY);
  });
  function render() {
    const fixture = TestBed.createComponent(PreferencesHost);
    fixture.detectChanges();
    return {
      fixture,
      preferences: fixture.componentInstance.preferences,
      router: TestBed.inject(Router),
    };
  }

  it('loads only after the first client render, keeping initial hydration state empty', () => {
    localStorage.setItem(TOOL_PREFERENCES_KEY, saved([routes[0]], [routes[1]]));
    const preferences = TestBed.inject(ToolPreferencesService);
    expect(preferences.favorites()).toEqual([]);
    expect(preferences.recent()).toEqual([]);
    render();
    expect(preferences.favorites().map((tool) => tool.route)).toEqual([routes[0]]);
    expect(preferences.recent().map((tool) => tool.route)).toEqual([routes[1]]);
  });
  it('adds and removes favorites while exposing the existing catalog objects', () => {
    const { preferences } = render();
    preferences.toggleFavorite(routes[0]);
    expect(preferences.isFavorite(routes[0])).toBe(true);
    expect(preferences.favorites()[0]).toBe(HOME_TOOLS[0]);
    expect(JSON.parse(localStorage.getItem(TOOL_PREFERENCES_KEY)!).favorites).toEqual([routes[0]]);
    preferences.toggleFavorite(routes[0]);
    expect(preferences.isFavorite(routes[0])).toBe(false);
    expect(JSON.parse(localStorage.getItem(TOOL_PREFERENCES_KEY)!).favorites).toEqual([]);
  });
  it('restores favorites and order in a new application instance', () => {
    const { preferences } = render();
    preferences.toggleFavorite(routes[1]);
    preferences.toggleFavorite(routes[0]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const restored = render().preferences;
    expect(restored.favorites().map((tool) => tool.route)).toEqual([routes[1], routes[0]]);
  });
  it('keeps a favorite changed before the deferred initialization', () => {
    localStorage.setItem(TOOL_PREFERENCES_KEY, saved([routes[0]]));
    const preferences = TestBed.inject(ToolPreferencesService);
    preferences.toggleFavorite(routes[1]);
    render();
    expect(preferences.favorites().map((tool) => tool.route)).toEqual([routes[0], routes[1]]);
  });
  it('records completed router navigation, not rendering or favoriting', async () => {
    const { preferences, router } = render();
    preferences.toggleFavorite(routes[0]);
    expect(preferences.recent()).toEqual([]);
    await router.navigateByUrl(routes[0]);
    expect(preferences.recent().map((tool) => tool.route)).toEqual([routes[0]]);
  });
  it('records a directly opened tool when navigation completed before initialization', async () => {
    await TestBed.inject(Router).navigateByUrl(routes[0]);
    expect(
      render()
        .preferences.recent()
        .map((tool) => tool.route),
    ).toEqual([routes[0]]);
  });
  it('keeps five unique recent tools and promotes tools accessed again', async () => {
    const { preferences, router } = render();
    for (const route of routes.slice(0, 6)) await router.navigateByUrl(route);
    expect(preferences.recent().map((tool) => tool.route)).toEqual(routes.slice(1, 6).reverse());
    await router.navigateByUrl(routes[2]);
    expect(preferences.recent().map((tool) => tool.route)).toEqual([
      routes[2],
      routes[5],
      routes[4],
      routes[3],
      routes[1],
    ]);
    await router.navigateByUrl(routes[2] + '?source=test');
    expect(preferences.recent()).toHaveLength(5);
  });
  it('ignores home, institutional pages and routes absent from the enabled catalog', async () => {
    const { preferences, router } = render();
    for (const path of ['/', '/planos', '/seguranca', '/login', '/removed-tool'])
      await router.navigateByUrl(path);
    expect(preferences.recent()).toEqual([]);
    preferences.toggleFavorite('/removed-tool');
    expect(preferences.favorites()).toEqual([]);
  });
  it.skipIf(launch.quotationEnabled)(
    'ignores disabled tools in saved data, favorites and successful navigation',
    async () => {
      localStorage.setItem(
        TOOL_PREFERENCES_KEY,
        saved(['/gerador-de-orcamentos'], ['/gerador-de-orcamentos']),
      );
      const { preferences, router } = render();
      preferences.toggleFavorite('/gerador-de-orcamentos');
      await router.navigateByUrl('/gerador-de-orcamentos');
      expect(preferences.favorites()).toEqual([]);
      expect(preferences.recent()).toEqual([]);
    },
  );
  it('does not record canceled navigation', async () => {
    const { preferences, router } = render();
    router.resetConfig([
      { path: routes[0].slice(1), component: ToolPage, canActivate: [() => false] },
    ]);
    expect(await router.navigateByUrl(routes[0])).toBe(false);
    expect(preferences.recent()).toEqual([]);
  });
  it('records the final route after a redirect', async () => {
    const { preferences, router } = render();
    await router.navigateByUrl('/redirect');
    expect(preferences.recent().map((tool) => tool.route)).toEqual(['/docx-para-pdf']);
  });
  it('stores only stable routes, excluding query, fragment and matrix parameters', async () => {
    const { router } = render();
    await router.navigateByUrl(routes[0] + ';filename=private.xml?draft=secret-id#private-content');
    expect(JSON.parse(localStorage.getItem(TOOL_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      favorites: [],
      recent: [routes[0]],
    });
  });
  it('filters malformed entries, obsolete routes and duplicates and limits saved recents', () => {
    localStorage.setItem(
      TOOL_PREFERENCES_KEY,
      saved(
        [routes[0], routes[0], null, 4, {}, '/missing', routes[0] + '?private'],
        [null, '/missing', ...routes, ...routes],
      ),
    );
    const { preferences } = render();
    expect(preferences.favorites().map((tool) => tool.route)).toEqual([routes[0]]);
    expect(preferences.recent().map((tool) => tool.route)).toEqual(routes.slice(0, 5));
  });
  it.each([
    'broken json',
    'null',
    '[]',
    '42',
    '{"version":2,"favorites":["/xml-para-excel"]}',
    '{"version":1,"favorites":{},"recent":true}',
  ])('ignores invalid saved payload %s', (raw) => {
    localStorage.setItem(TOOL_PREFERENCES_KEY, raw);
    const { preferences } = render();
    expect(preferences.favorites()).toEqual([]);
    expect(preferences.recent()).toEqual([]);
  });
  it('keeps working in memory when access to localStorage throws', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const { preferences, router } = render();
    preferences.toggleFavorite(routes[0]);
    await router.navigateByUrl(routes[1]);
    expect(preferences.favorites()).toHaveLength(1);
    expect(preferences.recent().map((tool) => tool.route)).toEqual([routes[1]]);
    preferences.toggleFavorite(routes[0]);
    expect(preferences.favorites()).toEqual([]);
  });
  it('keeps working when storage reads and writes fail independently', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    const { preferences, router } = render();
    preferences.toggleFavorite(routes[0]);
    await router.navigateByUrl(routes[1]);
    expect(preferences.favorites()).toHaveLength(1);
    expect(preferences.recent()).toHaveLength(1);
  });
  it('reacts to valid cross-tab updates and clears without accepting other keys', () => {
    const { preferences } = render();
    const dispatch = (key: string | null, newValue: string | null) =>
      window.dispatchEvent(
        new StorageEvent('storage', { key, newValue, storageArea: localStorage }),
      );
    dispatch('other-key', saved([routes[0]]));
    expect(preferences.favorites()).toEqual([]);
    dispatch(TOOL_PREFERENCES_KEY, saved([routes[0], '/missing'], [routes[1]]));
    expect(preferences.favorites()).toHaveLength(1);
    expect(preferences.recent().map((tool) => tool.route)).toEqual([routes[1]]);
    dispatch(null, null);
    expect(preferences.favorites()).toEqual([]);
    expect(preferences.recent()).toEqual([]);
  });
  it('never reads or writes browser preferences on the server', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { preferences } = render();
    preferences.toggleFavorite(routes[0]);
    expect(preferences.favorites()).toEqual([]);
    expect(preferences.recent()).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
