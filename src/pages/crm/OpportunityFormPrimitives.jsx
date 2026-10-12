// Copia local e minima dos primitivos de formulario (mesmo padrao visual do
// resto do app, tokens uf-* ja globais do Design System). Deliberadamente
// nao importados de src/pages/clientes/ClientFormPrimitives.jsx -- CRM
// mantem isolamento de dominio, mesma decisao ja documentada la.

export function SelectField({ id, label, children, ...props }) {
  return (
    <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor={id}>
      <span className="uf-text-primary">{label}</span>
      <select
        id={id}
        className="uf-w-full uf-p-md uf-rounded-md uf-border uf-bg-sunken"
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
