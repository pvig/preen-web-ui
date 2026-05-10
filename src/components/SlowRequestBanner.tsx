import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../stores/uiStore';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const fadeSlide = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Banner = styled.div<{ $visible: boolean }>`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 8px;
  background: ${props => props.theme.colors.panel
    ? `${props.theme.colors.panel}cc`
    : 'rgba(30, 30, 40, 0.80)'};
  backdrop-filter: blur(8px);
  border: 1px solid ${props =>
    props.theme.colors.primary
      ? `${props.theme.colors.primary}44`
      : 'rgba(255,255,255,0.12)'};
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  color: ${props => props.theme.colors.text ?? '#e0e0e0'};
  font-size: 0.875rem;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;

  ${props =>
    props.$visible
      ? css`
          animation: ${fadeSlide} 0.3s ease both;
          opacity: 1;
        `
      : css`
          opacity: 0;
          transition: opacity 0.3s ease;
        `}
`;

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;
`;

export const SlowRequestBanner: React.FC = () => {
  const { t } = useTranslation();
  const slowApiRequestCount = useUIStore(s => s.slowApiRequestCount);
  const visible = slowApiRequestCount > 0;

  // Keep the DOM element mounted so the fade-out transition can play
  return (
    <Banner $visible={visible} role="status" aria-live="polite">
      <Spinner />
      {t('common.slowRequest')}
    </Banner>
  );
};
