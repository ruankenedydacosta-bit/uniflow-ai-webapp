import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Segmented from '../../components/ui/Segmented/index.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';

// Fase 3 do redesign (#90): a tela 14 "Configurações" do handoff tem três
// abas (Perfil, Preferências, Segurança). Cada aba já é uma rota própria
// do app, então o controle segmentado só navega entre elas. Como a troca
// remonta a página, a aba ativa recebe o foco de volta ao montar (sinal
// em location.state), para o teclado e o leitor de tela não caírem no body.
const SETTINGS_TABS = Object.freeze([
  Object.freeze({ value: ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE, label: 'Perfil' }),
  Object.freeze({ value: ACCOUNT_SUBROUTE_IDS.THEME, label: 'Preferências' }),
  Object.freeze({ value: ACCOUNT_SUBROUTE_IDS.SECURITY, label: 'Segurança' }),
]);

function SimplifiedSettingsTabs({ active, onBeforeNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!location.state?.focusSettingsTab) return;
    rootRef.current?.querySelector('[aria-pressed="true"]')?.focus();
  }, [location.state]);

  function handleChange(value) {
    if (value === active) return;
    const go = () => navigate(ACCOUNT_SUBROUTES[value].path, { state: { focusSettingsTab: true } });
    if (onBeforeNavigate) onBeforeNavigate(go);
    else go();
  }

  return (
    <div ref={rootRef}>
      <Segmented
        label="Seções de Configurações"
        options={SETTINGS_TABS}
        value={active}
        onChange={handleChange}
      />
    </div>
  );
}

export default SimplifiedSettingsTabs;
