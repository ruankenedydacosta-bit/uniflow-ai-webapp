function HomeSectionSkeleton({ variant = 'card', label = 'Carregando seção' }) {
  return (
    <section className="homeMobileSkeleton" data-variant={variant} aria-label={label} aria-busy="true">
      <span className="homeMobileSkeletonLine homeMobileSkeletonShort" />
      <span className="homeMobileSkeletonLine" />
      <span className="homeMobileSkeletonLine homeMobileSkeletonMedium" />
      {variant === 'summary' ? <span className="homeMobileSkeletonMetrics" /> : null}
    </section>
  );
}

export default HomeSectionSkeleton;
