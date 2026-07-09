import Loader from '../../components/ui/Loader';
import CustomerSearch from './CustomerSearch';
import CustomerFilters from './CustomerFilters';
import CustomerCard from './CustomerCard';
import styles from './CustomerList.module.css';

export default function CustomerList({
  customers,
  loading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onSelectCustomer,
}) {
  return (
    <div className="uf-flex uf-flex-column uf-gap-lg">
      <CustomerSearch value={search} onChange={onSearchChange} />
      <CustomerFilters activeStatus={statusFilter} onChange={onStatusFilterChange} />

      {error ? (
        <p className="uf-text-danger uf-text-caption">Não consegui carregar os clientes: {error}</p>
      ) : loading ? (
        <div className="uf-flex uf-justify-center uf-p-xl">
          <Loader variant="dots" label="Carregando clientes" />
        </div>
      ) : customers.length === 0 ? (
        <p className="uf-text-tertiary uf-text-caption uf-text-center uf-p-xl">
          Nenhum cliente encontrado. Cadastre o primeiro para começar.
        </p>
      ) : (
        <div className={styles.grid}>
          {customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} onSelect={onSelectCustomer} />
          ))}
        </div>
      )}
    </div>
  );
}
