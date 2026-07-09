import { useState } from 'react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { validateEmail, validateRequired } from '../../utils/validators';

const EMPTY_FORM = { nome: '', email: '', telefone: '', empresa: '', cargo: '' };

/**
 * CustomerForm — reaproveita Modal + Input + Button já existentes e os
 * validadores de src/utils/validators.js (já usados em Login/Signup) —
 * nenhuma validação nova foi reimplementada.
 */
export default function CustomerForm({ open, onClose, onSubmit }) {
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function setField(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev));
  }

  function validate() {
    const nextErrors = {
      nome: validateRequired(values.nome, 'O nome'),
      email: values.email ? validateEmail(values.email) : null,
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSubmit(values);
      setValues(EMPTY_FORM);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" aria-label="Novo cliente">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <span className="uf-text-title">Novo cliente</span>
        </ModalHeader>
        <ModalBody>
          <div className="uf-flex uf-flex-column uf-gap-md">
            <Input label="Nome" value={values.nome} onChange={(e) => setField('nome', e.target.value)} error={errors.nome} fullWidth required />
            <Input label="E-mail" type="email" value={values.email} onChange={(e) => setField('email', e.target.value)} error={errors.email} fullWidth />
            <Input label="Telefone" value={values.telefone} onChange={(e) => setField('telefone', e.target.value)} fullWidth />
            <Input label="Empresa" value={values.empresa} onChange={(e) => setField('empresa', e.target.value)} fullWidth />
            <Input label="Cargo" value={values.cargo} onChange={(e) => setField('cargo', e.target.value)} fullWidth />
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="uf-flex uf-justify-end uf-gap-sm">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="primary" loading={saving}>Salvar cliente</Button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}
