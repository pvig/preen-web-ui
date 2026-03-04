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

type AppScreen = 'patch' | 'matrix' | 'arpfilter' | 'effects' | 'library';

const AppContainer = styled.div`
  background-color: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  min-height: 100vh;
  transition: background-color 0.3s, color 0.3s;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.5rem 1rem;
  background-color: none;
  border-bottom: 0;
`;

const HeaderRight = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
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

const Nav = styled.nav`
  background-color: none;
  display: flex;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  max-width: 900px;
  margin: 0 auto;
  
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
        <Header>
          <MidiMenu />
          <HeaderRight>
            <TestButton onClick={() => setShowCCTester(prev => !prev)}>
              🧪 Test CC
            </TestButton>
            <LanguageToggle />
            <ThemeToggle />
          </HeaderRight>
        </Header>
        
        <Nav>
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