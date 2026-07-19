import CategoryBar from './CategoryBar';

function CategoriesBreakdown({ categories, onManage }) {
  return <section className="financeMobileCard" aria-labelledby="mobile-categories-title"><header className="financeMobileSectionHeader"><h2 id="mobile-categories-title">Por categoria</h2><button type="button" onClick={onManage}>Editar</button></header>{categories.length ? <ul className="financeMobileCategories">{categories.map((category) => <CategoryBar key={category.id} category={category} />)}</ul> : <p className="financeMobileEmptyMessage">As despesas confirmadas aparecerão aqui por categoria.</p>}</section>;
}

export default CategoriesBreakdown;
