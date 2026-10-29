import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, timer } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../auth/services/auth.service';
import { AccountService } from '../services/account.service';
import { AccountErrors } from '../services/account-errors';
@Component({
  selector: 'app-account-profile',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './account-profile.html',
  styleUrl: './account-profile.scss',
})
export class AccountProfilePage {
  readonly auth = inject(AuthService);
  private readonly api = inject(AccountService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(AccountErrors);
  private errorText(error: unknown, fallback: string): string {
    return error instanceof HttpErrorResponse ? this.errors.handle(error) : fallback;
  }
  private readonly fb = inject(FormBuilder);
  readonly profileForm = this.fb.nonNullable.group({
    name: [
      this.auth.user()?.name ?? '',
      [
        Validators.required,
        Validators.maxLength(120),
        Validators.pattern(/^[^<>\x00-\x1f\x7f]+$/u),
      ],
    ],
  });
  readonly passwordForm = this.fb.nonNullable.group({
    current_password: ['', [Validators.required, Validators.maxLength(72)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(72)]],
    password_confirmation: ['', Validators.required],
  });
  readonly saving = signal(false);
  readonly changingPassword = signal(false);
  readonly linkingGoogle = signal(false);
  readonly profileMessage = signal('');
  readonly profileError = signal('');
  readonly passwordMessage = signal('');
  readonly passwordError = signal('');
  readonly googleError = signal('');
  constructor() {
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('google_error'))
      this.googleError.set(
        'Não foi possível vincular Google. Use uma conta com o mesmo e-mail do Feitoo.',
      );
  }
  saveProfile(): void {
    if (this.errors.blocked() || this.saving()) return;
    this.profileError.set('');
    this.profileMessage.set('');
    this.profileForm.controls.name.setValue(this.profileForm.controls.name.value.trim());
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api
      .profile(this.profileForm.getRawValue().name)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.profileForm.reset({ name: response.data.name });
          this.profileMessage.set('Nome atualizado.');
        },
        error: (error) => {
          this.profileError.set(
            this.errorText(error, 'Não foi possível salvar. Confira seu nome e tente novamente.'),
          );
        },
      });
  }

  changePassword(): void {
    if (this.errors.blocked() || this.changingPassword() || !this.auth.user()?.has_password) return;
    this.passwordError.set('');
    this.passwordMessage.set('');
    if (
      this.passwordForm.invalid ||
      this.passwordForm.controls.password.value !==
        this.passwordForm.controls.password_confirmation.value
    ) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.changingPassword.set(true);
    this.api
      .password(this.passwordForm.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.changingPassword.set(false)),
      )
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.passwordMessage.set('Senha atualizada. Use a nova senha no próximo acesso.');
        },
        error: (error) => {
          this.passwordError.set(
            error instanceof HttpErrorResponse && error.status === 422
              ? error.error?.errors?.current_password
                ? 'A senha atual não confere.'
                : 'Confira a nova senha e sua confirmação. Use de 12 a 72 caracteres (até 72 bytes).'
              : this.errorText(error, 'Não foi possível atualizar a senha. Tente novamente.'),
          );
        },
      });
  }

  nameError(): string {
    const control = this.profileForm.controls.name;
    return control.touched && control.invalid
      ? 'Informe um nome de até 120 caracteres, sem marcação HTML.'
      : '';
  }

  passwordFieldError(field: 'current_password' | 'password' | 'password_confirmation'): string {
    const control = this.passwordForm.controls[field];
    if (!control.touched) return '';
    if (control.hasError('required'))
      return field === 'password_confirmation' ? 'Confirme a nova senha.' : 'Informe a senha.';
    if (control.hasError('minlength')) return 'Use pelo menos 12 caracteres.';
    if (control.hasError('maxlength')) return 'Use no máximo 72 caracteres.';
    if (
      field === 'password_confirmation' &&
      control.value !== this.passwordForm.controls.password.value
    )
      return 'As senhas precisam ser iguais.';
    return '';
  }

  linkGoogle(): void {
    if (this.errors.blocked() || this.linkingGoogle() || this.auth.user()?.google_linked) return;
    this.googleError.set('');
    this.linkingGoogle.set(true);
    this.auth
      .startGoogle('link', '/conta/perfil')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.linkingGoogle.set(false)),
      )
      .subscribe({
        next: (response) => window.location.assign(response.redirect_url),
        error: (error) => {
          this.googleError.set(
            this.errorText(error, 'Google indisponível. Tente novamente mais tarde.'),
          );
        },
      });
  }
}
