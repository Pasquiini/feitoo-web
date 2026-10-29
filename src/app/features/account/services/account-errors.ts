import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';
import { CreditBalanceStore } from './credit-balance.store';

@Injectable({ providedIn: 'root' })
export class AccountErrors {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly balances = inject(CreditBalanceStore);
  readonly retryAt = signal(0);
  private unblock?: ReturnType<typeof setTimeout>;
  handle(error: unknown): string {
    if (!(error instanceof HttpErrorResponse))
      return 'A conexão demorou a responder. Consulte o estado antes de tentar novamente.';
    if ([401, 419].includes(error.status)) {
      const path = this.router.url.split(/[?#]/)[0];
      this.auth.clear();
      this.balances.clear();
      const order = this.router.parseUrl(this.router.url).queryParams['quotation_order'];
      void this.router.navigate(['/login'], {
        queryParams: {
          returnTo: path,
          session: 'expired',
          ...(path === '/conta/creditos' && /^[0-9a-f-]{36}$/i.test(order ?? '')
            ? { quotation_order: order }
            : {}),
        },
      });
      return 'Sua sessão expirou. Entre novamente para continuar.';
    }
    if (error.status === 429) {
      const header = error.headers?.get('Retry-After');
      const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
      const delay = Number.isFinite(seconds)
        ? seconds * 1000
        : header
          ? Date.parse(header) - Date.now()
          : 5000;
      this.retryAt.set(Date.now() + Math.max(3000, Number.isFinite(delay) ? delay : 5000));
      clearTimeout(this.unblock);
      this.unblock = setTimeout(
        () => this.retryAt.set(0),
        Math.max(0, this.retryAt() - Date.now()),
      );
      return (
        'Muitas tentativas. Aguarde ' +
        Math.ceil(Math.max(0, this.retryAt() - Date.now()) / 1000) +
        ' segundos antes de tentar novamente.'
      );
    }
    if (error.status === 409)
      return (
        (
          {
            subscription_exists:
              'Já existe uma assinatura. Consulte o estado e gerencie o pagamento existente.',
            subscription_confirmation_pending:
              'A assinatura aguarda confirmação. Consulte novamente; não inicie outra contratação.',
            subscription_reconciliation_required:
              'Esta tentativa precisa de conciliação. Consulte a assinatura ou acesse o gerenciamento.',
            checkout_expired:
              'A tentativa venceu. Consulte seus pedidos antes de iniciar uma nova compra.',
          } as Record<string, string>
        )[error.error?.code] ?? 'O estado mudou. Atualize os dados antes de continuar.'
      );
    if (error.status === 422)
      return 'Não foi possível validar esta operação. Confira os dados e consulte o estado atual.';
    if (error.status === 503)
      return 'Este serviço está temporariamente indisponível. Tente novamente mais tarde.';
    if (error.status === 0)
      return 'Sem resposta da conexão. Sua tentativa foi preservada; consulte antes de tentar novamente.';
    if (error.status === 404) return 'Este registro não está disponível para sua conta.';
    return 'Não foi possível concluir a consulta. Tente novamente.';
  }
  blocked(): boolean {
    return Date.now() < this.retryAt();
  }
}
