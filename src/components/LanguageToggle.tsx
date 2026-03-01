import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

const ToggleButton = styled.button`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${props => props.theme.colors.text};
  font-size: 0.9rem;
  transition: all 0.2s;
  min-width: 80px;
  justify-content: center;
  
  &:hover {
    background: ${props => props.theme.colors.buttonHover};
    border-color: ${props => props.theme.colors.borderHover};
  }
`;

export const LanguageToggle: React.FC = () => {
  const { i18n } = useTranslation();
  
  const toggleLanguage = () => {
    const newLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(newLang);
  };
  
  return (
    <ToggleButton onClick={toggleLanguage} title={i18n.t('language.toggle')}>
      🌐 {i18n.language.toUpperCase()}
    </ToggleButton>
  );
};

export default LanguageToggle;
