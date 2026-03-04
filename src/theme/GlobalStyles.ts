import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  body {
    background-color: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
    transition: background-color 0.3s, color 0.3s;
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
`;
