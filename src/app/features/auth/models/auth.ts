export interface AuthUser {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly google_linked: boolean;
  readonly has_password: boolean;
  readonly created_at: string;
}

export interface UserResponse {
  readonly signup_method?: 'google';
  readonly data: AuthUser;
}

export interface LoginPayload {
  readonly email: string;
  readonly password: string;
}

export interface RegisterPayload extends LoginPayload {
  readonly name: string;
  readonly password_confirmation: string;
}

export interface GoogleStartResponse {
  readonly redirect_url: string;
}
