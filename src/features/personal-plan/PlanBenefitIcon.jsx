function PlanBenefitIcon({ type }) {
  if (type === 'voice') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="18" y="5" width="12" height="25" rx="6" />
        <path d="M11 23a13 13 0 0 0 26 0M24 36v7M17 43h14" />
      </svg>
    );
  }

  // REDESIGN APP-LIKE: "categorias inteligentes" passa a usar o brilho
  // (inteligência/automação) em vez da grade, seguindo a referência
  // aprovada -- mesma biblioteca local, nenhuma dependência nova.
  if (type === 'categories') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M27 6.5 30.6 17 41 20.5 30.6 24 27 34.5 23.4 24 13 20.5 23.4 17 27 6.5Z" />
        <path d="M13.5 30.5 15.4 36 21 37.9 15.4 39.8 13.5 45.3 11.6 39.8 6 37.9 11.6 36 13.5 30.5Z" />
      </svg>
    );
  }

  if (type === 'agenda') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="7" y="10" width="34" height="32" rx="4" />
        <path d="M7 20h34M16 5v9M32 5v9" />
        <path d="M16 28h.1M24 28h.1M32 28h.1M16 35h.1M24 35h.1" />
      </svg>
    );
  }

  if (type === 'uni') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 10h32v23H24l-9 7v-7H8Z" />
        <path d="M16 21h.1M24 21h.1M32 21h.1" />
      </svg>
    );
  }

  if (type === 'history') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="5" width="28" height="38" rx="3" />
        <path d="M17 15h14M17 23h14M17 31h10" />
      </svg>
    );
  }

  if (type === 'summary') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 5v19h19A19 19 0 1 1 24 5Z" />
        <path d="M29 5a14 14 0 0 1 14 14H29Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 18 24 7l18 11M9 20h30M12 20v18m8-18v18m8-18v18m8-18v18M7 40h34" />
    </svg>
  );
}

export default PlanBenefitIcon;

