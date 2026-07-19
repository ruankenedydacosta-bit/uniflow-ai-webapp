import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import { VoiceProvider } from './features/uni-audio/index.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VoiceProvider>
      <App />
    </VoiceProvider>
  </React.StrictMode>
);
