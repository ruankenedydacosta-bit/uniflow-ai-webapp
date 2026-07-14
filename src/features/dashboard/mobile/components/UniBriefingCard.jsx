function UniBriefingCard({ briefing, onAction }) {
  const content = briefing ?? {};
  const message = content.message
    ?? 'Ainda estou conhecendo sua rotina. Registre um lançamento para eu começar a ajudar.';

  return (
    <section className="homeMobileBriefing" aria-labelledby="home-mobile-briefing-title">
      <div className="homeMobileEyebrow">
        <span className="homeMobileUniMark" aria-hidden="true">✦</span>
        <h2 id="home-mobile-briefing-title">{content.eyebrow ?? 'Uni Briefing'}</h2>
      </div>
      <p>{message}</p>
      <button type="button" className="homeMobileTextAction" onClick={onAction}>
        {content.actionLabel ?? 'Ver detalhes'} <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}

export default UniBriefingCard;
