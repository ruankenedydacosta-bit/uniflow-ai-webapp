function AccountCardTile({ account }) {
  return <article className={`financeMobileAccount financeMobileTone-${account.color}`}><span>{account.type}</span><strong>{account.name}</strong><p>{account.balance}</p></article>;
}

export default AccountCardTile;
