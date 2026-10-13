import SimplifiedAppShell from './SimplifiedAppShell.jsx';
import SimplifiedProductProvider from './SimplifiedProductProvider.jsx';

function SimplifiedAuthenticatedLayout({ children }) {
  return (
    <SimplifiedProductProvider>
      <SimplifiedAppShell>{children}</SimplifiedAppShell>
    </SimplifiedProductProvider>
  );
}

export default SimplifiedAuthenticatedLayout;
