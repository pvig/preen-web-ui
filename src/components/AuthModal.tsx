import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';

// ─── Styled components ────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: ${props => props.theme.colors.panel};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 12px;
  padding: 2rem;
  width: min(420px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
`;

const TabRow = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const Tab = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 0.5rem;
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid ${props =>
    props.$active ? props.theme.colors.primary : 'transparent'} !important;
  color: ${props =>
    props.$active ? props.theme.colors.primary : props.theme.colors.textMuted} !important;
  font-weight: ${props => (props.$active ? '700' : '400')};
  cursor: pointer;
  font-size: 0.9rem;
  border-radius: 0 !important;
  transition: all 0.15s;
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

const SubmitButton = styled.button`
  background: ${props => props.theme.colors.primary} !important;
  color: ${props => props.theme.colors.background} !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 0.6rem 1.25rem !important;
  font-size: 0.95rem !important;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
  transition: opacity 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMsg = styled.p`
  margin: 0;
  color: #ef4444;
  font-size: 0.85rem;
  text-align: center;
`;

const CloseButton = styled.button`
  background: transparent !important;
  border: none !important;
  color: ${props => props.theme.colors.textMuted} !important;
  cursor: pointer;
  align-self: flex-end;
  font-size: 1.2rem;
  padding: 0 !important;
  line-height: 1;
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  initialTab?: 'login' | 'register';
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

export const AuthModal: React.FC<Props> = ({ onClose, initialTab = 'login' }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const { login, register, isLoading, error, clearError } = useAuthStore();

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const switchTab = (next: 'login' | 'register') => {
    clearError();
    setLocalError(null);
    setTab(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!isValidEmail(loginEmail)) {
      setLocalError(t('auth.errors.invalidEmail'));
      return;
    }
    try {
      await login(loginEmail, loginPassword);
      onClose();
    } catch {
      // error is displayed from store
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!regName.trim()) {
      setLocalError(t('auth.errors.nameRequired'));
      return;
    }
    if (!isValidEmail(regEmail)) {
      setLocalError(t('auth.errors.invalidEmail'));
      return;
    }
    if (regPassword.length < 8) {
      setLocalError(t('auth.errors.passwordTooShort'));
      return;
    }
    if (regPassword !== regConfirm) {
      setLocalError(t('auth.errors.passwordMismatch'));
      return;
    }
    try {
      await register(regName.trim(), regEmail, regPassword);
      onClose();
    } catch {
      // error is displayed from store
    }
  };

  const displayError = localError ?? error;

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <CloseButton onClick={onClose} aria-label={t('common.cancel')}>✕</CloseButton>
        <ModalTitle>{t('auth.title')}</ModalTitle>

        <TabRow>
          <Tab $active={tab === 'login'} onClick={() => switchTab('login')}>
            {t('auth.login')}
          </Tab>
          <Tab $active={tab === 'register'} onClick={() => switchTab('register')}>
            {t('auth.register')}
          </Tab>
        </TabRow>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Field>
              <Label>{t('auth.email')}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                required
              />
            </Field>
            <Field>
              <Label>{t('auth.password')}</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                required
              />
            </Field>
            {displayError && <ErrorMsg>{displayError}</ErrorMsg>}
            <SubmitButton type="submit" disabled={isLoading}>
              {isLoading ? t('auth.loggingIn') : t('auth.login')}
            </SubmitButton>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Field>
              <Label>{t('auth.name')}</Label>
              <Input
                type="text"
                autoComplete="name"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field>
              <Label>{t('auth.email')}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                required
              />
            </Field>
            <Field>
              <Label>{t('auth.password')}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                required
              />
            </Field>
            <Field>
              <Label>{t('auth.confirmPassword')}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={regConfirm}
                onChange={e => setRegConfirm(e.target.value)}
                required
              />
            </Field>
            {displayError && <ErrorMsg>{displayError}</ErrorMsg>}
            <SubmitButton type="submit" disabled={isLoading}>
              {isLoading ? t('auth.registering') : t('auth.register')}
            </SubmitButton>
          </form>
        )}
      </Modal>
    </Overlay>
  );
};
