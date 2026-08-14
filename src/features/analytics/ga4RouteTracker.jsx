import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getGa4StateVersion,
  subscribeGa4State,
  trackGa4PageView,
} from './ga4Client.js';

function Ga4RouteTracker() {
  const { pathname } = useLocation();
  const stateVersion = useSyncExternalStore(
    subscribeGa4State,
    getGa4StateVersion,
    getGa4StateVersion,
  );

  useEffect(() => {
    trackGa4PageView({
      pathname,
      origin: globalThis.location?.origin,
    });
  }, [pathname, stateVersion]);

  return null;
}

export default Ga4RouteTracker;
