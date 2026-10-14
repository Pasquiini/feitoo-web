const apiOrigin = 'https://api.feitoo.com.br';

export const environment = {
  production: true,
  apiUrl: `${apiOrigin}/api`,
  csrfUrl: `${apiOrigin}/sanctum/csrf-cookie`,
} as const;
