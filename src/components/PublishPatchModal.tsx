import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { communityApi } from '../api/communityApi';
import { useCurrentPatch } from '../stores/patchStore';
import { COMMUNITY_TAGS } from '../types/community';
import type { CommunityTag } from '../types/community';

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
  padding: 1.75rem;
  width: min(480px, 96vw);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
`;

const CloseButton = styled.button`
  background: transparent !important;
  border: none !important;
  color: ${props => props.theme.colors.textMuted} !important;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0 !important;
  line-height: 1;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const Label = styled.label`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Input = styled.input`
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text};
  font-size: 0.95rem;
  padding: 0.5rem 0.75rem;
  outline: none;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const Textarea = styled.textarea`
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text};
  font-size: 0.9rem;
  padding: 0.5rem 0.75rem;
  resize: vertical;
  min-height: 80px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const TagGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const TagChip = styled.button<{ $selected: boolean }>`
  padding: 0.2rem 0.65rem !important;
  border-radius: 999px !important;
  border: 1px solid ${props =>
    props.$selected ? props.theme.colors.primary : props.theme.colors.border} !important;
  background: ${props =>
    props.$selected ? `${props.theme.colors.primary}22` : 'transparent'} !important;
  color: ${props =>
    props.$selected ? props.theme.colors.primary : props.theme.colors.textMuted} !important;
  font-size: 0.78rem !important;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  text-transform: lowercase;

  &:hover {
    border-color: ${props => props.theme.colors.primary} !important;
    color: ${props => props.theme.colors.primary} !important;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
`;

const CancelButton = styled.button`
  background: transparent !important;
  border: 1px solid ${props => props.theme.colors.border} !important;
  color: ${props => props.theme.colors.text} !important;
  border-radius: 6px !important;
  padding: 0.5rem 1rem !important;
  font-size: 0.875rem !important;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${props => props.theme.colors.primary} !important;
  }
`;

const PublishButton = styled.button`
  background: ${props => props.theme.colors.primary} !important;
  color: ${props => props.theme.colors.background} !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 0.5rem 1.25rem !important;
  font-size: 0.875rem !important;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ErrorMsg = styled.p`
  margin: 0;
  color: #ef4444;
  font-size: 0.85rem;
`;

const SuccessMsg = styled.p`
  margin: 0;
  color: #10b981;
  font-size: 0.85rem;
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onPublished?: () => void;
}

export const PublishPatchModal: React.FC<Props> = ({ onClose, onPublished }) => {
  const { t } = useTranslation();
  const currentPatch = useCurrentPatch();

  const [name, setName] = useState(currentPatch.name || '');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<CommunityTag[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleTag = (tag: CommunityTag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsPublishing(true);
    setError(null);
    try {
      await communityApi.publishPatch(currentPatch, {
        name: name.trim(),
        description: description.trim(),
        tags: selectedTags,
      });
      setSuccess(true);
      onPublished?.();
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('community.publishError'));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{t('community.publish')}</ModalTitle>
          <CloseButton onClick={onClose} aria-label={t('common.cancel')}>✕</CloseButton>
        </ModalHeader>

        <form onSubmit={handlePublish} style={{ display: 'contents' }}>
          <Field>
            <Label>{t('community.patchName')}</Label>
            <Input
              type="text"
              value={name}
              onChange={e => setName(e.target.value.slice(0, 64))}
              maxLength={64}
              required
            />
          </Field>

          <Field>
            <Label>{t('community.description')}</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder={t('community.descriptionPlaceholder')}
              maxLength={500}
            />
          </Field>

          <Field>
            <Label>{t('community.tags')}</Label>
            <TagGrid>
              {COMMUNITY_TAGS.map(tag => (
                <TagChip
                  key={tag}
                  type="button"
                  $selected={selectedTags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </TagChip>
              ))}
            </TagGrid>
          </Field>

          {error && <ErrorMsg>{error}</ErrorMsg>}
          {success && <SuccessMsg>{t('community.publishSuccess')}</SuccessMsg>}

          <Actions>
            <CancelButton type="button" onClick={onClose}>
              {t('common.cancel')}
            </CancelButton>
            <PublishButton type="submit" disabled={isPublishing || !name.trim()}>
              {isPublishing ? t('community.publishing') : t('community.publish')}
            </PublishButton>
          </Actions>
        </form>
      </Modal>
    </Overlay>
  );
};
