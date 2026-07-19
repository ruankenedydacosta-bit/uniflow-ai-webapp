function PeriodSelectorBar({ canGoNext, canGoPrevious, mode, onModeChange, onNext, onPrevious, period }) {
  return (
    <div className="financeMobilePeriod" aria-label="Período financeiro">
      <button type="button" onClick={onPrevious} disabled={!canGoPrevious} aria-label="Período anterior">‹</button>
      <div>
        <strong>{period}</strong>
        <label>
          <span className="sr-only">Tipo de período</span>
            <select value={mode} onChange={(event) => onModeChange(event.target.value)}>
              <option>Semana</option>
              <option>Mês</option>
              <option>Trimestre</option>
            </select>
        </label>
      </div>
      <button type="button" onClick={onNext} disabled={!canGoNext} aria-label="Próximo período">›</button>
    </div>
  );
}

export default PeriodSelectorBar;
