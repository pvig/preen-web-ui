import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../theme/ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useUIStore } from '../stores/uiStore';
import { SplashScreen } from './SplashScreen';

const MenuContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const HamburgerButton = styled.button`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  color: ${props => props.theme.colors.text};
  font-size: 18px;
  line-height: 1;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.theme.colors.buttonHover};
  }

  &:active {
    background: ${props => props.theme.colors.primary};
    color: white;
  }
`;

const DropdownMenu = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: ${props => props.theme.colors.panel};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  z-index: 1000;
  opacity: ${props => props.$isOpen ? 1 : 0};
  visibility: ${props => props.$isOpen ? 'visible' : 'hidden'};
  transform: ${props => props.$isOpen ? 'translateY(0)' : 'translateY(-10px)'};
  transition: all 0.2s ease-in-out;
`;

const MenuItem = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  &:last-child {
    border-bottom: none;
  }
`;

const MenuLabel = styled.span`
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.875rem;
  font-weight: 500;
`;

const AboutButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.text};
  cursor: pointer;
  padding: 0;
  font-size: 0.875rem;
  text-decoration: underline;
  
  &:hover {
    color: ${props => props.theme.colors.primary};
  }
`;

const AboutModal = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  z-index: 10000;
`;

const AboutContent = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  margin: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
`;

const AboutTitle = styled.h2`
  margin: 0 0 16px 0;
  color: ${props => props.theme.colors.text};
  font-size: 1.5rem;
`;

const AboutText = styled.p`
  color: ${props => props.theme.colors.textSecondary};
  line-height: 1.5;
  margin: 0 0 12px 0;
  
  &:last-of-type {
    margin-bottom: 20px;
  }
`;

const AboutLink = styled.a`
  color: ${props => props.theme.colors.primary};
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

const CloseButton = styled.button`
  background: ${props => props.theme.colors.primary};
  border: none;
  border-radius: 6px;
  color: white;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.875rem;
  
  &:hover {
    opacity: 0.9;
  }
`;

const ToggleSwitch = styled.button<{ $on: boolean }>`
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  cursor: pointer;
  position: relative;
  background: ${p => p.$on ? p.theme.colors.primary : p.theme.colors.button};
  transition: background 0.2s;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${p => p.$on ? '21px' : '3px'};
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    transition: left 0.2s;
  }
`;

export const HamburgerMenu: React.FC = () => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSplashOpen, setIsSplashOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { starfieldEnabled, toggleStarfield } = useUIStore();

  // Fermer le menu si on clique à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAboutClick = () => {
    setIsAboutOpen(true);
    setIsMenuOpen(false);
  };

  const handleCloseAbout = () => {
    setIsAboutOpen(false);
  };

  const handleSplashClick = () => {
    setIsSplashOpen(true);
    setIsMenuOpen(false);
  };

  return (
    <>
      <MenuContainer ref={menuRef}>
        <HamburgerButton
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={t('menu.title')}
        >
          ☰
        </HamburgerButton>
        
        <DropdownMenu $isOpen={isMenuOpen}>
          <MenuItem>
            <MenuLabel>{t('menu.theme')}</MenuLabel>
            <ThemeToggle />
          </MenuItem>
          
          <MenuItem>
            <MenuLabel>{t('menu.language')}</MenuLabel>
            <LanguageToggle />
          </MenuItem>

          <MenuItem>
            <MenuLabel>{t('menu.starfield', 'Fond étoilé')}</MenuLabel>
            <ToggleSwitch $on={starfieldEnabled} onClick={toggleStarfield} aria-label="Toggle starfield" />
          </MenuItem>
          
          <MenuItem>
            <MenuLabel>{t('menu.about')}</MenuLabel>
            <AboutButton onClick={handleAboutClick}>
              {t('menu.info')}
            </AboutButton>
          </MenuItem>

          <MenuItem>
            <MenuLabel>{t('menu.splash')}</MenuLabel>
            <AboutButton onClick={handleSplashClick}>
              {t('menu.splashOpen')}
            </AboutButton>
          </MenuItem>
        </DropdownMenu>
      </MenuContainer>

      {isSplashOpen && <SplashScreen onClose={() => setIsSplashOpen(false)} noAutoClose />}

      <AboutModal $isOpen={isAboutOpen} onClick={handleCloseAbout}>
        <AboutContent onClick={e => e.stopPropagation()}>
          <AboutTitle>{t('about.title')}</AboutTitle>
          <AboutText>
            {t('about.description1')}
          </AboutText>
          <AboutText>
            {t('about.description2')}
          </AboutText>
          <AboutText>
            {t('about.version', { version: __APP_VERSION__ })}
          </AboutText>
          <AboutText>
            <AboutLink href="https://github.com/pvig/preen-web-ui" target="_blank" rel="noopener noreferrer">
              {t('about.projectLink')}
            </AboutLink>
          </AboutText>
          <CloseButton onClick={handleCloseAbout}>
            {t('about.close')}
          </CloseButton>
        </AboutContent>
      </AboutModal>
    </>
  );
};