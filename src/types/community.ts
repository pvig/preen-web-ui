import type { Patch } from './patch';

// ─── Auth DTOs (mirror backend) ───────────────────────────────────────────────

export interface RegisterRequestDto {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  accessToken: string;
}

export interface UserProfileDto {
  sub: string;
  name: string;
  email: string;
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const COMMUNITY_TAGS = [
  'bass',
  'lead',
  'pad',
  'pluck',
  'keys',
  'organ',
  'brass',
  'strings',
  'percussion',
  'fx',
  'ambient',
  'acid',
  'arp',
  'bell',
  'noise',
  'drone',
  'experimental',
] as const;

export type CommunityTag = (typeof COMMUNITY_TAGS)[number];

// ─── Community DTOs ───────────────────────────────────────────────────────────

export interface PublishedPatch {
  id: string;
  name: string;
  description: string;
  tags: CommunityTag[];
  author: UserProfileDto;
  patchData: Patch;
  createdAt: string;
  commentsCount: number;
}

export interface Comment {
  id: string;
  author: UserProfileDto;
  content: string;
  createdAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface PublishPatchRequestDto {
  name: string;
  description: string;
  tags: CommunityTag[];
  patchData: Patch;
}
