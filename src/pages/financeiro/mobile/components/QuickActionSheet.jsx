const ACTIONS = [
  ['income', 'Registrar receita', '+'],
  ['expense', 'Registrar despesa', '−'],
  ['transfer', 'Fazer transferência', '↔'],
];

function QuickActionSheet({ onAction, onClose, open }) {
  if (!open) return null;
  return <div className="financeMobileSheetBackdrop" role="presentation" onClick={onClose}><section className="financeMobileSheet" role="dialog" aria-modal="true" aria-labelledby="finance-quick-title" onClick={(event) => event.stopPropagation()}><div className="financeMobileSheetHandle" /><header><h2 id="finance-quick-title">Novo lançamento</h2><button type="button" onClick={onClose} aria-label="Fechar ações rápidas">×</button></header>{ACTIONS.map(([id, label, icon]) => <button key={id} type="button" onClick={() => onAction(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}</section></div>;
}

export default QuickActionSheet;
