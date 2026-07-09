import Modal, { ModalHeader, ModalBody } from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import Loader from '../../components/ui/Loader';
import CustomerStatus from './CustomerStatus';
import CustomerTags from './CustomerTags';
import CustomerNotes from './CustomerNotes';
import CustomerTimeline from './CustomerTimeline';
import { useCustomer } from './useCustomer';
import { CUSTOMER_STATUSES } from './constants';

/**
 * CustomerDetails — dono da busca de detalhe (via useCustomer), então
 * CustomerPage só precisa passar o `customerId` selecionado.
 */
export default function CustomerDetails({ customerId, userId, open, onClose }) {
  const { customer, notes, activities, loading, updateStatus, addNote } = useCustomer(customerId, userId);

  return (
    <Modal open={open} onClose={onClose} size="lg" aria-label="Detalhes do cliente">
      {loading || !customer ? (
        <ModalBody>
          <div className="uf-flex uf-justify-center uf-p-xl">
            <Loader variant="spinner" label="Carregando cliente" />
          </div>
        </ModalBody>
      ) : (
        <>
          <ModalHeader>
            <div className="uf-flex uf-gap-md uf-items-center">
              <Avatar name={customer.nome} size="lg" />
              <div className="uf-flex uf-flex-column uf-gap-xs">
                <span className="uf-text-title">{customer.nome}</span>
                {customer.empresa ? <span className="uf-text-caption uf-text-tertiary">{customer.empresa}</span> : null}
              </div>
            </div>
          </ModalHeader>

          <ModalBody>
            <div className="uf-flex uf-flex-column uf-gap-lg">
              <div className="uf-flex uf-flex-wrap uf-gap-md uf-items-center">
                <CustomerStatus status={customer.status} />
                <CustomerTags tags={customer.tags} />
              </div>

              <div className="uf-flex uf-flex-column uf-gap-sm">
                <span className="uf-text-micro uf-text-tertiary">Mudar status</span>
                <div className="uf-flex uf-flex-wrap uf-gap-sm">
                  {CUSTOMER_STATUSES.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => updateStatus(status.value)}
                      className="uf-cursor-pointer uf-border-none uf-bg-canvas"
                    >
                      <CustomerStatus status={status.value} />
                    </button>
                  ))}
                </div>
              </div>

              {customer.email ? <InfoRow label="E-mail" value={customer.email} /> : null}
              {customer.telefone ? <InfoRow label="Telefone" value={customer.telefone} /> : null}
              {customer.cargo ? <InfoRow label="Cargo" value={customer.cargo} /> : null}

              <div className="uf-flex uf-flex-column uf-gap-sm">
                <span className="uf-text-title">Notas</span>
                <CustomerNotes notes={notes} onAddNote={addNote} />
              </div>

              <div className="uf-flex uf-flex-column uf-gap-sm">
                <span className="uf-text-title">Timeline</span>
                <CustomerTimeline activities={activities} />
              </div>
            </div>
          </ModalBody>
        </>
      )}
    </Modal>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="uf-flex uf-justify-between uf-border-b uf-p-sm">
      <span className="uf-text-caption uf-text-tertiary">{label}</span>
      <span className="uf-text-caption uf-text-primary">{value}</span>
    </div>
  );
}
