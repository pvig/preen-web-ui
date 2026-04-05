import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { ThemeProvider } from 'styled-components';
import { PatchEditor } from './screens/PatchEditor';
import { ModulationsEditor } from './screens/modulationsEditor';
import { ArpFilterEditor } from './screens/ArpFilterEditor';
import { EffectsEditor } from './screens/EffectsEditor';
import { PatchLibrary } from './screens/PatchLibrary';
import { LatentSpaceMap } from './components/LatentSpaceMap';

import { MidiMenu } from './components/MidiMenu';
import { MidiCCTester } from './components/MidiCCTester';
import { HamburgerMenu } from './components/HamburgerMenu';
import { useThemeStore } from './theme/themeStore';
import { GlobalStyles } from './theme/GlobalStyles';
import { useMidiActions } from './midi/useMidiActions';
import { useCurrentPatch, usePatchStore } from './stores/patchStore';
import { useMutationStore } from './stores/mutationStore';

type AppScreen = 'patch' | 'matrix' | 'arpfilter' | 'effects' | 'library' | 'map';

const AppContainer = styled.div`
  background-color: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  min-height: 100vh;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
`;

const TestButton = styled.button`
  display: none;
  background: ${props => props.theme.colors.primary};
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.875rem;
  
  &:hover {
    opacity: 0.9;
  }
`;

const MidiQuickButtons = styled.div`
  display: flex;
  gap: 2px;
  margin: 4px;
`;

const QuickMidiButton = styled.button<{ $isReceiving?: boolean; $isSending?: boolean }>`
  width: 36px !important;
  height: 36px !important;
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => (props.$isReceiving || props.$isSending) ? '#10b981' : props.theme.colors.primary};
  color: ${props => props.theme.colors.background};
  border: 2px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  font-size: 1.25rem !important;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  
  @keyframes pulseGlow {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.8);
    }
    50% {
      transform: scale(1.1);
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.2);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }
  
  ${props => (props.$isReceiving || props.$isSending) ? `
    animation: pulseGlow 1.2s ease-in-out infinite;
    border-color: #10b981;
  ` : ''}
  
  &:hover:not(:disabled) {
    background: ${props => (props.$isReceiving || props.$isSending) ? '#059669' : (props.theme.colors.buttonHover || props.theme.colors.accent)};
    transform: ${props => (props.$isReceiving || props.$isSending) ? 'none' : 'scale(1.05)'};
  }
  
  &:disabled {
    background: ${props => props.theme.colors.button};
    color: ${props => props.theme.colors.textMuted};
    cursor: not-allowed;
    opacity: 0.5;
    animation: none;
    transform: none;
  }
`;

const NavWrapper = styled.div`
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: ${props => props.theme.colors.background};
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const Nav = styled.nav`
  background-color: transparent;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: end;
  gap: 0.5rem;
  margin: 0 auto;
  padding: 0.5rem 1rem 0 1rem;
  max-width: 900px;
  
  .nav-tabs {
    display: flex;
    gap: 0.5rem;
    align-items: end;
  }
  
  .nav-right {
    display: flex;
    align-items: center;
  }
  
  button {
    background-color: ${props => props.theme.colors.button};
    color: ${props => props.theme.colors.text};
    border: 1px solid ${props => props.theme.colors.border};
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    padding: 8px 16px;
    font-size: 0.9rem;
    line-height: 1.3;
    transition: all 0.2s;
    font-weight: 500;
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    -moz-appearance: none;
    -webkit-appearance: none;
    
    &:hover {
      background-color: ${props => props.theme.colors.buttonHover};
      border-color: ${props => props.theme.colors.borderHover};
    }
    
    &.active {
      background-color: ${props => props.theme.colors.navActive};
      color: ${props => props.theme.colors.primary};
      border-bottom: 2.5px solid ${props => props.theme.colors.primary};
      font-weight: 700;
      box-shadow: 0 2px 12px 0 ${props => props.theme.colors.primary}33;
      text-shadow: 0 1px 4px ${props => props.theme.colors.primary}55;
      z-index: 2;
    }
  }
  
  /* Ajustement spécifique pour tous les boutons sur Firefox */
  @-moz-document url-prefix() {
    button {
      padding: 8px 16px !important;
      font-size: 0.9rem !important;
      line-height: 1.3 !important;
    }
  }
`;

const Main = styled.main`
  padding: 20px 0 0 0;
  margin: 0 auto;
`;

const PatchNameEditor = styled.div`
  display: flex;
  align-items: center;
  margin: 0 1rem;
  cursor: pointer;
  
  input {
    background: transparent;
    border: none;
    color: ${props => props.theme.colors.text};
    font-size: 1rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    min-width: 120px;
    max-width: 200px;
    
    &:focus {
      outline: 1px solid ${props => props.theme.colors.primary};
      background: ${props => props.theme.colors.panel};
    }
    
    &:hover:not(:focus) {
      background: ${props => `${props.theme.colors.primary}10`};
    }
  }
  
  span {
    color: ${props => props.theme.colors.text};
    font-size: 1rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    
    &:hover {
      background: ${props => `${props.theme.colors.primary}10`};
    }
  }
`;

const PatchNameEditorComponent: React.FC = () => {
  const currentPatch = useCurrentPatch();
  const { updatePatchName } = usePatchStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = () => {
    setEditValue(currentPatch.name);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editValue.trim() && editValue !== currentPatch.name) {
      updatePatchName(editValue.trim());
      // Preserve user-edited name during mutation interpolation
      const { sourceA, sourceB, setCustomName } = useMutationStore.getState();
      if (sourceA && sourceB) {
        setCustomName(editValue.trim());
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <PatchNameEditor>
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value.replace(/[^\x20-\x7E]/g, '').slice(0, 12))}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          maxLength={12}
          placeholder="Nom du patch"
        />
      ) : (
        <span onClick={handleStartEdit} title="Cliquer pour éditer le nom">
          {currentPatch.name}
        </span>
      )}
    </PatchNameEditor>
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('patch');
  const [showCCTester, setShowCCTester] = useState(false);
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const { sendPatch, receivePatch, isReceiving, isSending, midi } = useMidiActions();

  // Keyboard shortcut: Ctrl+T to toggle CC Tester
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        setShowCCTester(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <AppContainer>
        
        <NavWrapper>
        <Nav>
          <div className="nav-tabs">
            <button onClick={() => setCurrentScreen('patch')} className={currentScreen === 'patch' ? 'active' : ''}>
              {t('nav.patch')}
            </button>
            <button onClick={() => setCurrentScreen('matrix')} className={currentScreen === 'matrix' ? 'active' : ''}>
              {t('nav.modulations')}
            </button>
            <button onClick={() => setCurrentScreen('arpfilter')} className={currentScreen === 'arpfilter' ? 'active' : ''}>
              {t('nav.arpFilter')}
            </button>
            <button onClick={() => setCurrentScreen('library')} className={currentScreen === 'library' ? 'active' : ''}>
              {t('nav.library')}
            </button>
            <button onClick={() => setCurrentScreen('map')} className={currentScreen === 'map' ? 'active' : ''}>
              🗺 Map
            </button>
          </div>
          
          
          <PatchNameEditorComponent />
          
          <div className="nav-right">
            <TestButton onClick={() => setShowCCTester(prev => !prev)}>
              🧪 Test CC
            </TestButton>
            <MidiMenu />
            <MidiQuickButtons>
              <QuickMidiButton 
                onClick={() => sendPatch()}
                disabled={!midi.selectedOutput || isSending}
                $isSending={isSending}
                title={isSending ? "Envoi en cours…" : "Push vers PreenFM3"}
              >
                ▲
              </QuickMidiButton>
              <QuickMidiButton 
                onClick={receivePatch}
                disabled={!midi.selectedInput || isReceiving}
                $isReceiving={isReceiving}
                title={isReceiving ? "Réception en cours..." : "Pull depuis PreenFM3"}
              >
                ▼
              </QuickMidiButton>
            </MidiQuickButtons>
            <HamburgerMenu />
          </div>
        </Nav>
        </NavWrapper>

        <Main>
          {currentScreen === 'patch' && <PatchEditor />}
          {currentScreen === 'matrix' && <ModulationsEditor />}
          {currentScreen === 'arpfilter' && <ArpFilterEditor />}
          {currentScreen === 'effects' && <EffectsEditor />}
          {/* Always mounted — preserves AudioContext and CVAE model state across tab switches */}
          <div style={currentScreen !== 'library' ? { display: 'none' } : undefined}>
            <PatchLibrary />
          </div>
          <div style={currentScreen !== 'map' ? { display: 'none' } : undefined}>
            <LatentSpaceMap />
          </div>
        </Main>
        
        {showCCTester && <MidiCCTester onClose={() => setShowCCTester(false)} />}
      </AppContainer>
    </ThemeProvider>
  );
}