function HomeEmptyState({ title, description, actionLabel, onAction, icon = '+' }) {
  return (
    <div className="homeMobileEmptyState">
      <span className="homeMobileEmptyIcon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {actionLabel ? (
        <button type="button" className="homeMobileSecondaryAction" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default HomeEmptyState;
