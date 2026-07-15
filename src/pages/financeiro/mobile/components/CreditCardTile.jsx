function CreditCardTile({ card }) {
  return <article className={`financeMobileCredit financeMobileTone-${card.color}`}><header><strong>{card.name}</strong><span>{card.ending}</span></header><p><span>Fatura atual</span><strong>{card.invoice}</strong></p><footer><span>Limite {card.limit}</span><span>Vence {card.due}</span></footer></article>;
}

export default CreditCardTile;
