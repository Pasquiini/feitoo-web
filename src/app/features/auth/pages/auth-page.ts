import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly registering = this.route.snapshot.data['mode'] === 'register';
  readonly returnTo = (() => {
    const path = this.route.snapshot.queryParamMap.get('returnTo');
    return path === '/conta' ||
      path === '/analisar-xml' || path === '/organizar-xml' ||
      path === '/xml-para-pdf' ||
      path === '/xml-para-excel' ||
      path === '/produtos-dos-xmls'
      ? path
      : null;
  })();
  readonly busy = signal(false);
  readonly action = signal<'email' | 'google' | null>(null);
  readonly passwordVisible = signal(false);
  readonly confirmationVisible = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', this.registering ? [Validators.required, Validators.maxLength(120)] : []],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: [
      '',
      this.registering
        ? [Validators.required, Validators.minLength(12), Validators.maxLength(72)]
        : [Validators.required],
    ],
    password_confirmation: ['', this.registering ? [Validators.required] : []],
  });

  constructor() {
    const reason = this.route.snapshot.queryParamMap.get('google_error');
    if (reason === 'account_exists')
      this.error.set(
        'Este e-mail já tem uma conta. Entre com sua senha e escolha Vincular Google.',
      );
    else if (reason === 'link_conflict')
      this.error.set(
        'Não foi possível vincular essa conta Google. Use o mesmo e-mail da sua conta Feitoo.',
      );
    else if (reason) this.error.set('Não foi possível entrar com Google. Tente novamente.');
  }

  submit(): void {
    if (this.busy()) return;
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const payload = this.form.getRawValue();
    if (this.registering && payload.password !== payload.password_confirmation) {
      this.form.controls.password_confirmation.markAsTouched();
      this.error.set('As senhas precisam ser iguais.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    this.action.set('email');
    const request = this.registering
      ? this.auth.register(payload)
      : this.auth.login({ email: payload.email, password: payload.password });
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busy.set(false);
          this.action.set(null);
        }),
      )
      .subscribe({
        next: () => {
          this.form.reset();
          void this.router.navigateByUrl(this.returnTo ?? '/');
        },
        error: (error: unknown) =>
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 422
              ? this.registering
                ? 'Confira os campos, a confirmação da senha e se o e-mail já está cadastrado.'
                : 'E-mail ou senha inválidos.'
              : 'Não foi possível concluir. Verifique a conexão e tente novamente.',
          ),
      });
  }

  google(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.action.set('google');
    this.error.set('');
    this.auth
      .startGoogle('login', this.returnTo ?? undefined)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busy.set(false);
          this.action.set(null);
        }),
      )
      .subscribe({
        next: (response) => window.location.assign(response.redirect_url),
        error: () =>
          this.error.set('Google indisponível. Use e-mail e senha ou tente novamente mais tarde.'),
      });
  }

  fieldError(field: 'name' | 'email' | 'password' | 'password_confirmation'): string {
    const control = this.form.controls[field];
    if (!control.touched) return '';
    if (control.hasError('required'))
      return field === 'password_confirmation'
        ? 'Confirme sua senha.'
        : field === 'name'
          ? 'Informe seu nome.'
          : field === 'email'
            ? 'Informe seu e-mail.'
            : 'Informe sua senha.';
    if (control.hasError('email')) return 'Use um e-mail válido, como voce@exemplo.com.';
    if (control.hasError('minlength')) return 'Use pelo menos 12 caracteres.';
    if (control.hasError('maxlength')) return 'O campo ultrapassa o tamanho permitido.';
    if (field === 'password_confirmation' && control.value !== this.form.controls.password.value)
      return 'As senhas precisam ser iguais.';
    return '';
  }
}
