import { apiClient } from './apiClient';
import type {
  Comment,
  Page,
  PublishedPatch,
  PublishPatchRequestDto,
} from '../types/community';
import type { Patch } from '../types/patch';
import type { CommunityTag } from '../types/community';

export interface ListPatchesParams {
  page?: number;
  size?: number;
  search?: string;
  tags?: CommunityTag[];
}

export const communityApi = {
  listPatches(params: ListPatchesParams = {}): Promise<Page<PublishedPatch>> {
    const { page = 0, size = 20, search, tags } = params;
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('size', String(size));
    if (search) qs.set('search', search);
    if (tags && tags.length > 0) qs.set('tags', tags.join(','));
    return apiClient.get<Page<PublishedPatch>>(`/api/patches?${qs.toString()}`);
  },

  getPatch(id: string): Promise<PublishedPatch> {
    return apiClient.get<PublishedPatch>(`/api/patches/${id}`);
  },

  publishPatch(
    patch: Patch,
    meta: { name: string; description: string; tags: CommunityTag[] },
  ): Promise<PublishedPatch> {
    const body: PublishPatchRequestDto = {
      name: meta.name,
      description: meta.description,
      tags: meta.tags,
      patchData: patch,
    };
    return apiClient.post<PublishedPatch>('/api/patches', body);
  },

  deletePatch(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/patches/${id}`);
  },

  listComments(patchId: string): Promise<Comment[]> {
    return apiClient.get<Comment[]>(`/api/patches/${patchId}/comments`);
  },

  postComment(patchId: string, content: string): Promise<Comment> {
    return apiClient.post<Comment>(`/api/patches/${patchId}/comments`, { content });
  },
};
