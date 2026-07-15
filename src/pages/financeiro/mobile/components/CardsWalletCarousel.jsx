import CreditCardTile from './CreditCardTile';

function CardsWalletCarousel({ cards }) {
  return <section aria-labelledby="mobile-cards-title"><header className="financeMobileSectionHeader"><h2 id="mobile-cards-title">Cartões</h2><span>{cards.length} ativos</span></header><div className="financeMobileCarousel">{cards.map((card) => <CreditCardTile key={card.id} card={card} />)}</div></section>;
}

export default CardsWalletCarousel;
