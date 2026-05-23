import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { communityApi } from '../api/communityApi';
import type { PublishedPatch } from '../types/community';
import { COMMUNITY_TAGS } from '../types/community';
import type { CommunityTag } from '../types/community';
import { useAuthStore } from '../stores/authStore';
import { UserBadge } from '../components/UserBadge';
import { PatchDetailModal } from '../components/PatchDetailModal';
import { PublishPatchModal } from '../components/PublishPatchModal';
import { SlowRequestBanner } from '../components/SlowRequestBanner';

// ─── Styled components ────────────────────────────────────────────────────────

const Screen = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem 2rem;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 0 1.25rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  margin-bottom: 1.25rem;
`;

const ScreenTitle = styled.h1`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Controls = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  padding: 0.4rem 0.7rem;
  outline: none;
  width: 180px;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const PublishButton = styled.button`
  background: ${props => props.theme.colors.primary} !important;
  color: ${props => props.theme.colors.background} !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 0.4rem 1rem !important;
  font-size: 0.875rem !important;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const TagFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
`;

const TagFilterChip = styled.button<{ $selected: boolean }>`
  padding: 0.15rem 0.6rem !important;
  border-radius: 999px !important;
  border: 1px solid ${props =>
    props.$selected ? props.theme.colors.primary : props.theme.colors.border} !important;
  background: ${props =>
    props.$selected ? `${props.theme.colors.primary}22` : 'transparent'} !important;
  color: ${props =>
    props.$selected ? props.theme.colors.primary : props.theme.colors.textMuted} !important;
  font-size: 0.75rem !important;
  font-weight: 600;
  cursor: pointer;
  text-transform: lowercase;
  transition: all 0.15s;

  &:hover {
    border-color: ${props => props.theme.colors.primary} !important;
    color: ${props => props.theme.colors.primary} !important;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.85rem;
`;

const PatchCard = styled.div`
  background: ${props => props.theme.colors.panel};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 10px;
  padding: 1rem;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  &:hover {
    border-color: ${props => props.theme.colors.primary};
    box-shadow: 0 2px 12px ${props => `${props.theme.colors.primary}20`};
  }
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardMeta = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textMuted};
`;

const CardTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.2rem;
`;

const CardTag = styled.span`
  background: ${props => `${props.theme.colors.primary}18`};
  color: ${props => props.theme.colors.primary};
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: lowercase;
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  background: ${props =>
    props.$active ? props.theme.colors.primary : 'transparent'} !important;
  color: ${props =>
    props.$active ? props.theme.colors.background : props.theme.colors.text} !important;
  border: 1px solid ${props =>
    props.$active ? props.theme.colors.primary : props.theme.colors.border} !important;
  border-radius: 6px !important;
  padding: 0.3rem 0.75rem !important;
  font-size: 0.875rem !important;
  cursor: pointer;
  transition: all 0.15s;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    border-color: ${props => props.theme.colors.primary} !important;
  }
`;

const PageInfo = styled.span`
  font-size: 0.8rem;
  color: ${props => props.theme.colors.textMuted};
`;

const EmptyState = styled.p`
  text-align: center;
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.9rem;
  padding: 3rem 0;
`;

const ErrorState = styled.p`
  text-align: center;
  color: #ef4444;
  font-size: 0.9rem;
  padding: 2rem 0;
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onNavigateToPatch?: () => void;
}

export const CommunityScreen: React.FC<Props> = ({ onNavigateToPatch }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [patches, setPatches] = useState<PublishedPatch[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<CommunityTag[]>([]);
  const [selectedPatch, setSelectedPatch] = useState<PublishedPatch | null>(null);
  const [showPublish, setShowPublish] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const fetchPatches = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await communityApi.listPatches({
        page,
        size: 20,
        search: debouncedSearch || undefined,
        tags: activeTags.length > 0 ? activeTags : undefined,
      });
      setPatches(result.content);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('community.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, activeTags, t]);

  useEffect(() => {
    fetchPatches();
  }, [fetchPatches]);

  const toggleTag = (tag: CommunityTag) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
    setPage(0);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <Screen>
      <TopBar>
        <ScreenTitle>
          {t('nav.community')}
          <SlowRequestBanner inline />
        </ScreenTitle>
        <Controls>
          <SearchInput
            type="search"
            placeholder={t('community.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <PublishButton
            onClick={() => setShowPublish(true)}
            disabled={!user}
            title={!user ? t('community.loginToPublish') : t('community.publish')}
          >
            {t('community.publish')}
          </PublishButton>
          <UserBadge />
        </Controls>
      </TopBar>

      <TagFilterRow>
        {COMMUNITY_TAGS.map(tag => (
          <TagFilterChip
            key={tag}
            $selected={activeTags.includes(tag)}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </TagFilterChip>
        ))}
      </TagFilterRow>

      {loadError && <ErrorState>{loadError}</ErrorState>}

      {!loadError && patches.length === 0 && !isLoading && (
        <EmptyState>{t('community.noPatches')}</EmptyState>
      )}

      <Grid>
        {patches.map(p => (
          <PatchCard key={p.id} onClick={() => setSelectedPatch(p)}>
            <CardTitle title={p.name}>{p.name}</CardTitle>
            <CardMeta>
              {p.author.name} · {formatDate(p.createdAt)}
              {p.commentsCount > 0 && ` · ${t('community.commentsCount', { count: p.commentsCount })}`}
            </CardMeta>
            {p.tags.length > 0 && (
              <CardTags>
                {p.tags.map(tag => <CardTag key={tag}>{tag}</CardTag>)}
              </CardTags>
            )}
          </PatchCard>
        ))}
      </Grid>

      {totalPages > 1 && (
        <Pagination>
          <PageButton
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            ‹
          </PageButton>
          <PageInfo>
            {t('community.page', { current: page + 1, total: totalPages, count: totalElements })}
          </PageInfo>
          <PageButton
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            ›
          </PageButton>
        </Pagination>
      )}

      {selectedPatch && (
        <PatchDetailModal
          patch={selectedPatch}
          onClose={() => setSelectedPatch(null)}
          onLoadInEditor={() => onNavigateToPatch?.()}
          onDeleted={() => { setSelectedPatch(null); fetchPatches(); }}
        />
      )}

      {showPublish && (
        <PublishPatchModal
          onClose={() => setShowPublish(false)}
          onPublished={fetchPatches}
        />
      )}
    </Screen>
  );
};
