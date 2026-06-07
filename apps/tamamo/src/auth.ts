export type LoginCredentials = {
  username: string;
  password: string;
};

export type LoginResult =
  | { ok: true }
  | { ok: false; message: string };

export interface AuthenticationService {
  login(credentials: LoginCredentials): Promise<LoginResult>;
}

export const placeholderAuthenticationService: AuthenticationService = {
  async login() {
    return { ok: true };
  }
};
