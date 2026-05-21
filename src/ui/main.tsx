import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './i18n/index.js';
import './styles/tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
