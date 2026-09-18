import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initLang } from './lib/i18n';
import './styles.css';

// <html lang> before the first paint: it drives hyphenation, the spell checker
// and what a screen reader sounds like, none of which are worth a frame of the
// wrong language.
initLang();

const container = document.getElementById('root');
if (!container) throw new Error('#root not found in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
