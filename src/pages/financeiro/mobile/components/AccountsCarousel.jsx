import AccountCardTile from './AccountCardTile';

function AccountsCarousel({ accounts, onManage }) {
  return (
    <section aria-labelledby="mobile-accounts-title">
      <header className="financeMobileSectionHeader"><h2 id="mobile-accounts-title">Contas</h2><button type="button" onClick={onManage}>Gerenciar</button></header>
      <div className="financeMobileCarousel">{accounts.map((account) => <AccountCardTile key={account.id} account={account} />)}</div>
    </section>
  );
}

export default AccountsCarousel;
