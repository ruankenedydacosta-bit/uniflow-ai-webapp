function FinancialForecastCard({ forecast }) {
  return <section className="financeMobileForecast" aria-labelledby="mobile-forecast-title"><span>Previsão da Uni</span><h2 id="mobile-forecast-title">{forecast.title}</h2><p>{forecast.description}</p><small>{forecast.status}</small></section>;
}

export default FinancialForecastCard;
