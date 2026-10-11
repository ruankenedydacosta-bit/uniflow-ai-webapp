import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

// #144: o SimplifiedAppShell publica aqui o navigate com transição de tela
// (abrir, voltar ou trocar de aba, decidido pela rota). Fora do shell vale
// o navigate comum.
export const MovimentoDeTelaContext = createContext(null);

export function useNavegar() {
  const navegar = useContext(MovimentoDeTelaContext);
  const navigate = useNavigate();
  return navegar ?? navigate;
}
