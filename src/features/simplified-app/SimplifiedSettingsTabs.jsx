import { useNavigate } from 'react-router-dom';
import Segmented from '../../components/ui/Segmented/index.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';

// Fase 3 do redesign (#90): a tela 14 "Configurações" do handoff tem três
// abas (Perfil, Preferências, Segurança). Cada aba já é uma rota própria
// do app, então o controle segmentado só navega entre elas.
const SETTINGS_TABS = Object.freeze([
  Object.freeze({ value: ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE, label: 'Perfil' }),
  Object.freeze({ value: ACCOUNT_SUBROUTE_IDS.THEME, label: 'Preferências' }),
  Object.freeze({ value: ACCOUNT_SUBROUTE_IDS.SECURITY, label: 'Segurança' }),
]);

function SimplifiedSettingsTabs({ active, onBeforeNavigate }) {
  const navigate = useNavigate();

  function handleChange(value) {
    if (value === active) return;
    const go = () => navigate(ACCOUNT_SUBROUTES[value].path);
    if (onBeforeNavigate) onBeforeNavigate(go);
    else go();
  }

  return (
    <Segmented
      label="Seções de Configurações"
      options={SETTINGS_TABS}
      value={active}
      onChange={handleChange}
    />
  );
}

export default SimplifiedSettingsTabs;
