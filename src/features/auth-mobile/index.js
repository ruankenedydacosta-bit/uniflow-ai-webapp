export { default as MobileAuthPage } from './pages/MobileAuthPage.jsx';
export { default as MobileWelcomePage } from './pages/MobileWelcomePage.jsx';
export {
  AUTH_MODES,
  SOCIAL_PROVIDERS,
  WELCOME_SLIDES,
  getNextSlideIndex,
  getSocialUnavailableResult,
  normalizeAuthMode,
} from './authMobileSchema.js';
export { isValidEmail, validateAuthForm } from './authMobileValidator.js';
