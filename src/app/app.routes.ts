import { Routes } from '@angular/router';
import { guestGuard } from './features/auth/guards/guest.guard';
import { authGuard } from './features/auth/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'planos',
    loadComponent: () => import('./features/public/plans').then((m) => m.PlansPage),
  },
  {
    path: 'produtos-dos-xmls',
    data: { tool: 'products-from-xml' },
    loadComponent: () =>
      import('./features/processing/pages/xml-to-excel').then((m) => m.XmlToExcelPage),
  },
  {
    path: 'conta',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/pages/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'xml-para-excel',
    loadComponent: () =>
      import('./features/processing/pages/xml-to-excel').then((m) => m.XmlToExcelPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/pages/auth-page').then((m) => m.AuthPage),
    data: { mode: 'login' },
  },
  {
    path: 'cadastro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/pages/auth-page').then((m) => m.AuthPage),
    data: { mode: 'register' },
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/public/home').then((m) => m.HomePage),
  },
  ...['seguranca', 'privacidade', 'termos'].map((page) => ({
    path: page,
    data: { page },
    loadComponent: () => import('./features/public/information').then((m) => m.InformationPage),
  })),
  {
    path: '404',
    loadComponent: () => import('./features/public/not-found').then((m) => m.NotFoundPage),
  },
  {
    path: '**',
    loadComponent: () => import('./features/public/not-found').then((m) => m.NotFoundPage),
  },
];
