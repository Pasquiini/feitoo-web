import { Routes } from '@angular/router';
import { guestGuard } from './features/auth/guards/guest.guard';
import { authGuard } from './features/auth/guards/auth.guard';
import { guidePages } from './core/guide-pages';

export const routes: Routes = [
  {
    path: 'docx-para-pdf',
    loadComponent: () =>
      import('./features/processing/pages/docx-to-pdf').then((m) => m.DocxToPdfPage),
  },
  {
    path: 'analisar-xml',
    data: { tool: 'xml-analyzer' },
    loadComponent: () =>
      import('./features/processing/pages/xml-to-excel').then((m) => m.XmlToExcelPage),
  },
  {
    path: 'organizar-xml',
    data: { tool: 'xml-organizer' },
    loadComponent: () =>
      import('./features/processing/pages/xml-to-excel').then((m) => m.XmlToExcelPage),
  },
  {
    path: 'xml-para-pdf',
    data: { tool: 'xml-to-pdf' },
    loadComponent: () =>
      import('./features/processing/pages/xml-to-excel').then((m) => m.XmlToExcelPage),
  },
  ...Object.keys(guidePages).map((guide) => ({
    path: guide.slice(1),
    data: { guide },
    loadComponent: () => import('./features/public/guide-page').then((m) => m.GuidePage),
  })),
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
