import { UniVoiceInputProvider } from '../uni-voice/index.js';
import SimplifiedAppShell from './SimplifiedAppShell.jsx';
import SimplifiedProductProvider from './SimplifiedProductProvider.jsx';

function SimplifiedAuthenticatedLayout({ children }) {
  return (
    <SimplifiedProductProvider>
      <UniVoiceInputProvider>
        <SimplifiedAppShell>{children}</SimplifiedAppShell>
      </UniVoiceInputProvider>
    </SimplifiedProductProvider>
  );
}

export default SimplifiedAuthenticatedLayout;
