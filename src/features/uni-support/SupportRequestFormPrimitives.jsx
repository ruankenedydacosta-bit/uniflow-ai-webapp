// Copia local e minima dos primitivos de formulario (mesmo padrao ja usado
// em AgendaFormPrimitives.jsx/ClientFormPrimitives.jsx) -- Suporte nao deve
// depender de outros dominios, mesma decisao de duplicacao minima aceita
// no projeto.

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

export function TextField({ id, label, error, ...props }) {
  return (
    <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor={id}>
      <span className="uf-text-primary">{label}</span>
      <input
        id={id}
        type="text"
        className="uf-w-full uf-p-md uf-rounded-md uf-border uf-bg-sunken uf-focus-ring"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
    </label>
  );
}

export function TextareaField({ id, label, ...props }) {
  return (
    <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor={id}>
      <span className="uf-text-primary">{label}</span>
      <textarea
        id={id}
        className="uf-w-full uf-p-md uf-rounded-md uf-border uf-bg-sunken uf-focus-ring"
        rows={4}
        {...props}
      />
    </label>
  );
}

export function FormMessage({ children, tone = 'danger', id }) {
  if (!children) return null;

  return (
    <p
      id={id}
      className={`uf-p-md uf-rounded-md uf-bg-${tone}-subtle uf-text-${tone} uf-text-caption`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
