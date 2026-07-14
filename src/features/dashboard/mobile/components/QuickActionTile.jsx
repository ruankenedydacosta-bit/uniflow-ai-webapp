function QuickActionTile({ action, onSelect }) {
  return (
    <button type="button" className="homeMobileQuickTile" onClick={() => onSelect?.(action)}>
      <span className="homeMobileQuickIcon" aria-hidden="true">{action.icon}</span>
      <span>{action.label}</span>
    </button>
  );
}

export default QuickActionTile;
