import Button from '../../components/ui/Button';

export function SelectField({ id, label, children, ...props }) {
  return (
    <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor={id}>
      <span className="uf-text-primary">{label}</span>
      <select
        id={id}
        className="uf-w-full uf-p-md uf-rounded-md uf-border uf-bg-sunken uf-focus-ring"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function FormMessage({ children, tone = 'danger' }) {
  if (!children) return null;

  return (
    <p
      className={`uf-p-md uf-rounded-md uf-bg-${tone}-subtle uf-text-${tone} uf-text-caption`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function CrudRow({ title, detail, children }) {
  return (
    <div className="uf-flex uf-items-center uf-justify-between uf-gap-md uf-p-md uf-border-subtle uf-rounded-md uf-bg-sunken">
      <div className="uf-flex uf-flex-column uf-gap-xs uf-min-w-0">
        <strong className="uf-text-primary">{title}</strong>
        {detail ? <span className="uf-text-secondary uf-text-caption">{detail}</span> : null}
      </div>
      <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
        {children}
      </div>
    </div>
  );
}

export function DeleteActions({
  actionLabel = 'Excluir',
  confirmLabel = 'Confirmar',
  isConfirming,
  isLoading,
  onCancel,
  onConfirm,
  onRequest,
}) {
  if (!isConfirming) {
    return (
      <Button variant="ghost" size="sm" disabled={isLoading} onClick={onRequest}>
        {actionLabel}
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={isLoading} onClick={onCancel}>
        Cancelar
      </Button>
      <Button variant="danger" size="sm" loading={isLoading} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </>
  );
}
