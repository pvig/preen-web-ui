import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { communityApi } from '../api/communityApi';
import type { Comment, PublishedPatch } from '../types/community';
import { useAuthStore } from '../stores/authStore';
import { usePatchStore } from '../stores/patchStore';

// ─── Styled components ────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const Modal = styled.div`
  background: ${props => props.theme.colors.panel};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 12px;
  width: min(600px, 96vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  gap: 1rem;
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const PatchTitle = styled.h2`
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
`;

const AuthorLine = styled.p`
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: ${props => props.theme.colors.textMuted};
`;

const CloseButton = styled.button`
  background: transparent !important;
  border: none !important;
  color: ${props => props.theme.colors.textMuted} !important;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0 !important;
  line-height: 1;
  flex-shrink: 0;
`;

const Description = styled.p`
  margin: 0;
  font-size: 0.9rem;
  color: ${props => props.theme.colors.text};
  line-height: 1.5;
  white-space: pre-wrap;
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Tag = styled.span`
  background: ${props => `${props.theme.colors.primary}20`};
  color: ${props => props.theme.colors.primary};
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: lowercase;
`;

const LoadButton = styled.button`
  background: ${props => props.theme.colors.primary} !important;
  color: ${props => props.theme.colors.background} !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 0.5rem 1.25rem !important;
  font-size: 0.875rem !important;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
  align-self: flex-start;

  &:hover {
    opacity: 0.85;
  }
`;

const SectionTitle = styled.h3`
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${props => props.theme.colors.textMuted};
`;

const CommentItem = styled.div`
  border-top: 1px solid ${props => props.theme.colors.border};
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const CommentMeta = styled.span`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textMuted};
`;

const CommentText = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  line-height: 1.5;
`;

const CommentForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const CommentInput = styled.textarea`
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  resize: vertical;
  min-height: 72px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const PostButton = styled.button`
  background: ${props => props.theme.colors.primary} !important;
  color: ${props => props.theme.colors.background} !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 0.45rem 1rem !important;
  font-size: 0.85rem !important;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-end;
  transition: opacity 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const AuthHint = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: ${props => props.theme.colors.textMuted};
  font-style: italic;
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  patch: PublishedPatch;
  onClose: () => void;
  onLoadInEditor: () => void;
}

export const PatchDetailModal: React.FC<Props> = ({ patch, onClose, onLoadInEditor }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { loadPatch } = usePatchStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    communityApi.listComments(patch.id).then(setComments).catch(() => {});
  }, [patch.id]);

  const handleLoad = () => {
    loadPatch(patch.patchData);
    onLoadInEditor();
    onClose();
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || posting) return;
    setPosting(true);
    try {
      const newComment = await communityApi.postComment(patch.id, commentText.trim());
      setComments(prev => [...prev, newComment]);
      setCommentText('');
    } finally {
      setPosting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <div>
            <PatchTitle>{patch.name}</PatchTitle>
            <AuthorLine>
              {t('community.by', { name: patch.author.name })} · {formatDate(patch.createdAt)}
            </AuthorLine>
          </div>
          <CloseButton onClick={onClose} aria-label={t('common.cancel')}>✕</CloseButton>
        </ModalHeader>

        <ModalBody>
          {patch.tags.length > 0 && (
            <TagList>
              {patch.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
            </TagList>
          )}

          {patch.description && <Description>{patch.description}</Description>}

          <LoadButton onClick={handleLoad}>
            {t('community.loadInEditor')}
          </LoadButton>

          {/* Comments */}
          <div>
            <SectionTitle>
              {t('community.comments.title')} ({comments.length})
            </SectionTitle>

            {comments.map(c => (
              <CommentItem key={c.id}>
                <CommentMeta>{c.author.name} · {formatDate(c.createdAt)}</CommentMeta>
                <CommentText>{c.content}</CommentText>
              </CommentItem>
            ))}

            {user ? (
              <CommentForm onSubmit={handlePostComment}>
                <CommentInput
                  value={commentText}
                  onChange={e => setCommentText(e.target.value.slice(0, 500))}
                  placeholder={t('community.comments.placeholder')}
                  maxLength={500}
                />
                <PostButton type="submit" disabled={posting || !commentText.trim()}>
                  {posting ? t('community.comments.posting') : t('community.comments.post')}
                </PostButton>
              </CommentForm>
            ) : (
              <AuthHint>{t('community.comments.loginRequired')}</AuthHint>
            )}
          </div>
        </ModalBody>
      </Modal>
    </Overlay>
  );
};
