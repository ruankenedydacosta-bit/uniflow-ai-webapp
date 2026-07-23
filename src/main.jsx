import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import { ThemeProvider } from './features/theme';
import { VoiceProvider } from './features/uni-audio/index.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <VoiceProvider>
        <App />
      </VoiceProvider>
    </ThemeProvider>
  </React.StrictMode>
);
