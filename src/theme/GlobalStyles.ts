import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  * {
    box-sizing: border-box;
  }
  
  html {
    font-size: 16px; /* Taille de base */
    
    /* Variables CSS pour la compatibilité navigateur */
    --font-size-small: 0.75rem;
    --font-size-normal: 0.9rem;
    --font-size-base: 1rem;
    
    --padding-tab-vertical: 5px;
    --padding-tab-horizontal: 10px;
    --padding-nav-vertical: 8px;
    --padding-nav-horizontal: 16px;
    
    /* Variables spécifiques à Firefox */
    --firefox-font-size-small: 0.7rem;
    --firefox-padding-tab-vertical: 4px;
    --firefox-padding-tab-horizontal: 9px;
    --firefox-padding-nav-vertical: 7px;
    --firefox-padding-nav-horizontal: 14px;
  }
  
  body {
    background-color: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
    transition: background-color 0.3s, color 0.3s;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-size: 14px;
    line-height: 1.4;
  }
  
  a {
    color: ${props => props.theme.colors.primary};
    
    &:hover {
      color: ${props => props.theme.colors.primaryHover};
    }
  }
  
  h3 {
    color: ${props => props.theme.colors.textSecondary};
  }
  
  /* Normalisation des selects pour tous les navigateurs */
  select {
    box-sizing: border-box;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.4;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    
    /* Flèche personnalisée adaptée aux deux thèmes */
    background-image: url("data:image/svg+xml;charset=US-ASCII,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'><path fill='%23888' d='M2 0L0 2h4zm0 5L0 3h4z'/></svg>");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 12px;
    padding-right: 28px;
  }

  /* Normalisation Firefox pour les boutons et le texte */
  @-moz-document url-prefix() {
    /* Réduction du padding par défaut des boutons sur Firefox */
    button {
      -moz-appearance: none;
      box-sizing: border-box;
      font-size: inherit;
      line-height: 1.2;
      padding: var(--button-padding, 6px 12px);
    }
    
    /* Normalisation de la taille du texte sur Firefox */
    body {
      font-size: 14px;
      line-height: 1.4;
    }
    
    /* Ajustement spécifique pour les tabs sur Firefox */
    button[aria-label*="tab"], .nav-tabs button, .tab {
      padding: 4px 10px !important;
      font-size: 0.75rem !important;
      line-height: 1.3 !important;
    }
  }
`;
