import QuickActionTile from './QuickActionTile.jsx';

function QuickActionsGrid({ actions = [], onSelect }) {
  return (
    <section className="homeMobileQuickActions" aria-labelledby="home-mobile-actions-title">
      <h2 id="home-mobile-actions-title">Atalhos rápidos</h2>
      <div className="homeMobileQuickGrid">
        {actions.map((action) => (
          <QuickActionTile key={action.id ?? action.label} action={action} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

export default QuickActionsGrid;
