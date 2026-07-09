import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';
import { cx } from '../../lib/cx';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

export default function RecentActivityList({ items, loading }) {
  return (
    <Card variant="surface">
      <CardHeader>
        <span className="uf-text-title">Atividades recentes</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="uf-flex uf-justify-center uf-p-lg">
            <Loader variant="dots" label="Carregando atividades" />
          </div>
        ) : items.length === 0 ? (
          <p className="uf-text-caption uf-text-tertiary">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <ul className="uf-flex uf-flex-column uf-gap-md">
            {items.map((item) => (
              <li key={item.id} className="uf-flex uf-justify-between uf-items-center uf-border-b uf-p-sm">
                <div className="uf-flex uf-flex-column uf-min-w-0">
                  <span className="uf-text-caption uf-text-primary uf-truncate">
                    {item.descricao || item.categoria}
                  </span>
                  <span className="uf-text-micro uf-text-tertiary">
                    {dateFormatter.format(new Date(item.data))}
                  </span>
                </div>
                <span className={cx('uf-text-caption', 'uf-font-semibold', item.tipo === 'receita' ? 'uf-text-success' : 'uf-text-danger')}>
                  {item.tipo === 'receita' ? '+' : '-'} {currency.format(Math.abs(item.valor))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
