import { useState } from 'react';
import Button from '../../components/ui/Button';
import CustomerList from './CustomerList';
import CustomerDetails from './CustomerDetails';
import CustomerForm from './CustomerForm';
import { useCustomers } from './useCustomers';

/**
 * CustomerBoard — composição raiz do módulo Clientes (mesmo papel que
 * MainDashboard tem para o Dashboard e ChatWindow tem para o Chat).
 * CustomerPage só o envolve no MainLayout.
 */
export default function CustomerBoard({ userId }) {
  const { customers, loading, error, search, setSearch, statusFilter, setStatusFilter, createCustomer, refresh } =
    useCustomers(userId);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  async function handleCreate(payload) {
    await createCustomer(payload);
  }

  return (
    <div className="uf-flex uf-flex-column uf-gap-lg uf-p-xl">
      <div className="uf-flex uf-justify-between uf-items-center">
        <h1>Clientes</h1>
        <Button variant="primary" size="md" onClick={() => setFormOpen(true)}>
          + Novo cliente
        </Button>
      </div>

      <CustomerList
        customers={customers}
        loading={loading}
        error={error}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
      />

      <CustomerForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleCreate} />

      <CustomerDetails
        customerId={selectedCustomerId}
        userId={userId}
        open={Boolean(selectedCustomerId)}
        onClose={() => {
          setSelectedCustomerId(null);
          refresh(); // status/notas podem ter mudado dentro do detalhe
        }}
      />
    </div>
  );
}
