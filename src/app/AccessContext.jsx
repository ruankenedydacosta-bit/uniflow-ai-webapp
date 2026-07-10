/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { DEFAULT_DEMO_ACCESS } from './access.js';

const AccessContext = createContext(null);

function AccessProvider({ children }) {
  const [access, setAccess] = useState(DEFAULT_DEMO_ACCESS);

  return <AccessContext.Provider value={{ access, setAccess }}>{children}</AccessContext.Provider>;
}

function useAccess() {
  const context = useContext(AccessContext);

  if (!context) {
    throw new Error('useAccess must be used within AccessProvider');
  }

  return context;
}

export { AccessProvider, useAccess };
