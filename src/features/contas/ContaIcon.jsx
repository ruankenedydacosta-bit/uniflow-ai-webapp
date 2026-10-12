import {
  PhBankIcon,
  PhChartLineUpIcon,
  PhCreditCardIcon,
  PhDeviceMobileIcon,
  PhWalletFillIcon,
  PhWalletIcon,
} from '../simplified-app/SimplifiedIcons.jsx';

const ICONE_POR_TIPO = Object.freeze({
  checking: PhBankIcon,
  savings: PhWalletFillIcon,
  cash: PhWalletIcon,
  credit_card: PhCreditCardIcon,
  investment: PhChartLineUpIcon,
  digital_wallet: PhDeviceMobileIcon,
  other: PhWalletIcon,
});

// Ícone da conta pelo tipo, para a linha da lista e o cabeçalho do detalhe.
export function ContaIcon({ conta }) {
  const Icone = ICONE_POR_TIPO[conta?.account_type] ?? PhWalletIcon;
  return <Icone />;
}
