function PlanBenefitIcon({ type }) {
  if (type === 'voice') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="18" y="5" width="12" height="25" rx="6" />
        <path d="M11 23a13 13 0 0 0 26 0M24 36v7M17 43h14" />
      </svg>
    );
  }

  if (type === 'categories') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="7" y="7" width="14" height="14" rx="3" />
        <rect x="27" y="7" width="14" height="14" rx="3" />
        <rect x="7" y="27" width="14" height="14" rx="3" />
        <rect x="27" y="27" width="14" height="14" rx="3" />
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

