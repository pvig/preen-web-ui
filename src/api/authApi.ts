import { apiClient } from './apiClient';
import type {
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
  UserProfileDto,
} from '../types/community';

export const authApi = {
  login(data: LoginRequestDto): Promise<AuthResponseDto> {
    return apiClient.post<AuthResponseDto>('/api/auth/login', data);
  },

  register(data: RegisterRequestDto): Promise<AuthResponseDto> {
    return apiClient.post<AuthResponseDto>('/api/auth/register', data);
  },

  /** Uses the HttpOnly refresh_token cookie to obtain a new access token. */
  refresh(): Promise<AuthResponseDto> {
    return apiClient.post<AuthResponseDto>('/api/auth/refresh', {});
  },

  fetchProfile(): Promise<UserProfileDto> {
    return apiClient.get<UserProfileDto>('/api/user/profile');
  },
};
