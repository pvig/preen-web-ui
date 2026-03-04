import { useState, useEffect } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { PatchEditor } from './screens/PatchEditor';
import { ModulationsEditor } from './screens/modulationsEditor';
import { ArpFilterEditor } from './screens/ArpFilterEditor';
import { EffectsEditor } from './screens/EffectsEditor';
import { PatchLibrary } from './screens/PatchLibrary';
import { MidiMenu } from './components/MidiMenu';
import { MidiCCTester } from './components/MidiCCTester';
import { ThemeToggle } from './theme/ThemeToggle';
import { LanguageToggle } from './components/LanguageToggle';
import { useThemeStore } from './theme/themeStore';
import { GlobalStyles } from './theme/GlobalStyles';
import { useMidiActions } from './midi/useMidiActions';

type AppScreen = 'patch' | 'matrix' | 'arpfilter' | 'effects' | 'library';

const AppContainer = styled.div`
  background-color: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  min-height: 100vh;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
`;

const AbsoluteToggles = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  gap: 10px;
  align-items: center;
  z-index: 100;
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
  margin-left: 4px;
`;

const QuickMidiButton = styled.button`
  width: 24px !important;
  height: 30px !important;
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.theme.colors.primary};
  color: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.buttonHover || props.theme.colors.accent};
    transform: scale(1.05);
  }
  
  &:disabled {
    background: ${props => props.theme.colors.button};
    color: ${props => props.theme.colors.textMuted};
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const Nav = styled.nav`
  background-color: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin: 0 auto;
  padding: 0.5rem 1rem 0 1rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  max-width: 900px;
  
  .nav-tabs {
    display: flex;
    gap: 0.5rem;
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
    transition: all 0.2s;
    font-weight: 500;
    position: relative;
    z-index: 1;
    
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
`;

const Main = styled.main`
  padding: 20px 0 0 0;
  margin: 0 auto;
`;

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('patch');
  const [showCCTester, setShowCCTester] = useState(false);
  const { theme } = useThemeStore();
  const { sendPatch, receivePatch, midi } = useMidiActions();

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
        <AbsoluteToggles>
          <LanguageToggle />
          <ThemeToggle />
        </AbsoluteToggles>
        
        <Nav>
          <div className="nav-tabs">
            <button onClick={() => setCurrentScreen('patch')} className={currentScreen === 'patch' ? 'active' : ''}>
              Patch
            </button>
            <button onClick={() => setCurrentScreen('matrix')} className={currentScreen === 'matrix' ? 'active' : ''}>
              Modulations
            </button>
            <button onClick={() => setCurrentScreen('arpfilter')} className={currentScreen === 'arpfilter' ? 'active' : ''}>
              Arp/Filter
            </button>
            <button onClick={() => setCurrentScreen('library')} className={currentScreen === 'library' ? 'active' : ''}>
              Librairie
            </button>
          </div>
          
          <div className="nav-right">
            <TestButton onClick={() => setShowCCTester(prev => !prev)}>
              🧪 Test CC
            </TestButton>
            <MidiMenu />
            <MidiQuickButtons>
              <QuickMidiButton 
                onClick={sendPatch}
                disabled={!midi.selectedOutput}
                title="Push vers PreenFM3"
              >
                ↑
              </QuickMidiButton>
              <QuickMidiButton 
                onClick={receivePatch}
                disabled={!midi.selectedInput}
                title="Pull depuis PreenFM3"
              >
                ↓
              </QuickMidiButton>
            </MidiQuickButtons>
          </div>
        </Nav>

        <Main>
          {currentScreen === 'patch' && <PatchEditor />}
          {currentScreen === 'matrix' && <ModulationsEditor />}
          {currentScreen === 'arpfilter' && <ArpFilterEditor />}
          {currentScreen === 'effects' && <EffectsEditor />}
          {currentScreen === 'library' && <PatchLibrary />}
        </Main>
        
        {showCCTester && <MidiCCTester onClose={() => setShowCCTester(false)} />}
      </AppContainer>
    </ThemeProvider>
  );
}