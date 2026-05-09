import React, { useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { AuthModal } from './AuthModal';

// ─── Styled components ────────────────────────────────────────────────────────

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const LoginButton = styled.button`
  height: 32px !important;
  padding: 0 12px !important;
  background: ${props => props.theme.colors.button} !important;
  color: ${props => props.theme.colors.text} !important;
  border: 1px solid ${props => props.theme.colors.border} !important;
  border-radius: 6px !important;
  font-size: 0.8rem !important;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.theme.colors.buttonHover} !important;
    border-color: ${props => props.theme.colors.primary} !important;
    color: ${props => props.theme.colors.primary} !important;
  }
`;

const AvatarButton = styled.button`
  width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  border: 1px solid ${props => props.theme.colors.primary} !important;
  background: ${props => `${props.theme.colors.primary}22`} !important;
  color: ${props => props.theme.colors.primary} !important;
  font-size: 0.75rem !important;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  transition: all 0.2s;

  &:hover {
    background: ${props => `${props.theme.colors.primary}44`} !important;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: ${props => props.theme.colors.panel};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  z-index: 200;
  overflow: hidden;
`;

const DropdownHeader = styled.div`
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const DropdownName = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DropdownEmail = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DropdownItem = styled.button`
  display: block;
  width: 100%;
  padding: 0.6rem 0.85rem !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  color: ${props => props.theme.colors.text} !important;
  font-size: 0.85rem !important;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${props => `${props.theme.colors.primary}15`} !important;
    color: ${props => props.theme.colors.primary} !important;
  }
`;

const LogoutItem = styled(DropdownItem)`
  color: #ef4444 !important;
  &:hover {
    background: rgba(239, 68, 68, 0.1) !important;
    color: #ef4444 !important;
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export const UserBadge: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  if (!user) {
    return (
      <Wrapper>
        <LoginButton onClick={() => setShowAuth(true)}>
          {t('auth.login')}
        </LoginButton>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </Wrapper>
    );
  }

  return (
    <Wrapper ref={wrapperRef}>
      <AvatarButton
        onClick={() => setShowDropdown(v => !v)}
        title={user.name}
        aria-label={user.name}
      >
        {initials}
      </AvatarButton>

      {showDropdown && (
        <Dropdown>
          <DropdownHeader>
            <DropdownName>{user.name}</DropdownName>
            <DropdownEmail>{user.email}</DropdownEmail>
          </DropdownHeader>
          <LogoutItem
            onClick={() => {
              logout();
              setShowDropdown(false);
            }}
          >
            {t('auth.logout')}
          </LogoutItem>
        </Dropdown>
      )}
    </Wrapper>
  );
};
