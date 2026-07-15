function CategoryBar({ category }) {
  return <li className="financeMobileCategory"><div><span>{category.label}</span><strong>{category.value}</strong></div><div className="financeMobileCategoryTrack" aria-label={`${category.label}: ${category.percent}%`} role="progressbar" aria-valuenow={category.percent} aria-valuemin="0" aria-valuemax="100"><span className={`financeMobileTone-${category.color}`} style={{ '--finance-category-width': `${category.percent}%` }} /></div></li>;
}

export default CategoryBar;
