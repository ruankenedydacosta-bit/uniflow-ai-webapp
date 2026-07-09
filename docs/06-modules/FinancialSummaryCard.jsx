import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';
import { cx } from '../../lib/cx';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * FinancialSummaryCard — "Resumo financeiro" (docx 3.1: Patrimônio,
 * Receitas, Despesas). Usa Card composto (Header/Body) exatamente como
 * documentado no README do Card — nenhum novo padrão de card criado.
 */
export default function FinancialSummaryCard({ summary, loading }) {
  return (
    <Card variant="surface">
      <CardHeader>
        <span className="uf-text-title">Resumo financeiro</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="uf-flex uf-justify-center uf-p-lg">
            <Loader variant="dots" label="Carregando resumo financeiro" />
          </div>
        ) : (
          <div className="uf-flex uf-flex-column uf-gap-md">
            <Row label="Receitas do mês" value={summary?.receitas ?? 0} tone="success" />
            <Row label="Despesas do mês" value={summary?.despesas ?? 0} tone="danger" />
            <Row label="Economia do mês" value={summary?.economia ?? 0} tone={summary?.economia >= 0 ? 'success' : 'danger'} emphasis />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value, tone, emphasis }) {
  return (
    <div className="uf-flex uf-justify-between uf-items-center">
      <span className="uf-text-caption uf-text-secondary">{label}</span>
      <span className={cx(emphasis && 'uf-text-title', `uf-text-${tone}`)}>
        {currency.format(value)}
      </span>
    </div>
  );
}
