export { default as MobileAuthPage } from './pages/MobileAuthPage.jsx';
export { default as WelcomeDecisionPage } from './pages/WelcomeDecisionPage.jsx';
export {
  AUTH_MODES,
  SOCIAL_PROVIDERS,
  getSocialUnavailableResult,
  normalizeAuthMode,
} from './authMobileSchema.js';
export { isValidEmail, validateAuthForm } from './authMobileValidator.js';
