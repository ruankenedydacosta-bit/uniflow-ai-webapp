function NextStepCard({ step, onAction }) {
  const content = step ?? {};

  return (
    <section className="homeMobileCard homeMobileNextStep" aria-labelledby="home-mobile-next-step-title">
      <span className="homeMobileSectionLabel">Próximo passo</span>
      <div className="homeMobileNextStepBody">
        <span className="homeMobileActionIcon" aria-hidden="true">✓</span>
        <h2 id="home-mobile-next-step-title">
          {content.title ?? 'Que tal registrar sua primeira receita?'}
        </h2>
      </div>
      <button type="button" className="homeMobilePrimaryAction" onClick={onAction}>
        {content.actionLabel ?? 'Fazer agora'}
      </button>
    </section>
  );
}

export default NextStepCard;
