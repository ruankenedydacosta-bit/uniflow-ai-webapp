import { useId, useMemo, useRef, useState } from 'react';
import { useSession } from '../../../app/SessionContext.jsx';
import ChoiceRow from '../../../components/ui/ChoiceRow';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import OutlineButton from '../../../components/ui/OutlineButton';
import Segmented from '../../../components/ui/Segmented';
import Toggle from '../../../components/ui/Toggle';
import UniCard from '../../../components/ui/UniCard';
import { useAccounts, useTransactions } from '../../../hooks';
import { formatCurrency } from '../../../utils/formatters.js';
import { PUSH_STATUS, useWebPush } from '../../mobile-push/useWebPush.js';
import { centsToAmount, digitsToCents, formatCentsAsCurrencyInput } from '../../simplified-app/balanceAdjustmentFormUtils.js';
import { PhCaretDownIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import { getMonthRange, summarizeMonth } from '../../simplified-app/simplifiedRecordsData.js';
import {
  calcularPlano,
  DIAS_DO_LEMBRETE,
  erroDoPasso,
  fraseDoPlano,
  mesDoCampo,
  MODOS_DO_PLANO,
  montarMetaParaCriar,
  PASSOS_DA_CRIACAO,
  PRIORIDADES_DA_META,
  somarMeses,
  tiposDeMeta,
} from '../criacaoDeMeta.js';
import styles from './GoalCreateFlow.module.css';

const TITULOS_DOS_PASSOS = {
  1: 'Tipo e nome',
  2: 'Valor e prazo',
  3: 'Conta e lembrete',
};

function CampoDeValor({ label, centavos, onChange, autoFocus = false }) {
  return (
    <Field label={label}>
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder="R$ 0,00"
        value={centavos ? formatCentsAsCurrencyInput(centavos) : ''}
        onChange={(event) => onChange(digitsToCents(event.target.value))}
      />
    </Field>
  );
}

// Só montado com o lembrete ligado: o useWebPush grava a inscrição do
// aparelho ao montar, e isso não precisa rodar a cada abertura da criação.
function AvisoDeNotificacao() {
  const push = useWebPush();
  if (push.status === PUSH_STATUS.ENABLED || push.status === PUSH_STATUS.CHECKING) return null;
  if (push.status === PUSH_STATUS.DENIED) {
    return <p className={styles.helper}>As notificações estão bloqueadas neste navegador. Libere nas configurações do navegador para receber o lembrete.</p>;
  }
  if (push.status === PUSH_STATUS.UNSUPPORTED || push.status === PUSH_STATUS.NOT_CONFIGURED) {
    return <p className={styles.helper}>Este navegador não recebe notificações. Instale o app no celular para receber o lembrete.</p>;
  }
  return (
    <div className={styles.pushNotice}>
      <p className={styles.helper}>Ative as notificações deste aparelho para receber o lembrete.</p>
      <OutlineButton
        variant="secondary"
        loading={push.status === PUSH_STATUS.ENABLING}
        onClick={() => push.enableNotifications()}
      >
        Ativar notificações
      </OutlineButton>
    </div>
  );
}

// Criação de meta em 3 passos (handoff 08b a 08d, #156). O pai monta o
// componente só enquanto a criação está aberta, então cada abertura começa
// do passo 1 com o formulário limpo. Com `inicial` ({ tipo, alvo }), vindo
// das sugestões do estado vazio (#155), começa no passo 2 já preenchido.
export default function GoalCreateFlow({ inicial = null, onClose, onCreate }) {
  const formId = useId();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;
  const tipos = tiposDeMeta(workspace?.workspace_type);

  const [hoje] = useState(() => new Date());
  const mes = useMemo(() => getMonthRange(hoje), [hoje]);
  const { transactions, isLoading: carregandoEntradas } = useTransactions({
    workspaceId,
    dateFrom: mes.dateFrom,
    dateTo: mes.dateTo,
    status: 'completed',
  });
  const entradasDoMes = carregandoEntradas ? null : summarizeMonth(transactions).income;
  const { activeAccounts } = useAccounts({ workspaceId });

  const tipoInicial = tipos.find((opcao) => opcao.value === inicial?.tipo) ?? tipos[0];
  const [passo, setPasso] = useState(inicial ? 2 : 1);
  const [tipo, setTipo] = useState(tipoInicial.value);
  const [nome, setNome] = useState(tipoInicial.nome);
  const [nomeEditado, setNomeEditado] = useState(false);
  const [alvoCentavos, setAlvoCentavos] = useState(() => Math.round(Number(inicial?.alvo || 0) * 100));
  const [guardadoCentavos, setGuardadoCentavos] = useState(0);
  const [modo, setModo] = useState('data');
  const [prazo, setPrazo] = useState('');
  const [porMesCentavos, setPorMesCentavos] = useState(0);
  const [contaId, setContaId] = useState('');
  const [prioridade, setPrioridade] = useState('medium');
  const [lembrete, setLembrete] = useState(false);
  const [diaDoLembrete, setDiaDoLembrete] = useState(() => Math.min(hoje.getDate(), 28));
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);
  const criandoRef = useRef(false);

  const formulario = {
    tipo,
    nome,
    alvo: centsToAmount(alvoCentavos),
    guardado: centsToAmount(guardadoCentavos),
    modo,
    prazo,
    porMes: centsToAmount(porMesCentavos),
    contaId,
    prioridade,
    lembrete,
    diaDoLembrete,
  };
  const plano = calcularPlano({ ...formulario, entradasDoMes, hoje });
  const tipoEscolhido = tipos.find((opcao) => opcao.value === tipo);
  const contaEscolhida = activeAccounts.find((conta) => conta.id === contaId);

  function mudar(setter) {
    return (valor) => {
      setter(valor);
      setErro(null);
    };
  }

  // O nome acompanha o tipo até a pessoa escrever outro.
  function escolherTipo(opcao) {
    setTipo(opcao.value);
    if (!nomeEditado) setNome(opcao.nome);
    setErro(null);
  }

  async function criar() {
    if (criandoRef.current) return;
    criandoRef.current = true;
    setCriando(true);
    let result;
    try {
      result = await onCreate(montarMetaParaCriar(formulario, plano, hoje));
    } catch (error) {
      result = { error };
    } finally {
      criandoRef.current = false;
      setCriando(false);
    }
    if (result?.error) {
      setErro('Não foi possível criar a meta. Tente de novo.');
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const erroDoPassoAtual = erroDoPasso(passo, formulario, plano);
    if (erroDoPassoAtual) {
      setErro(erroDoPassoAtual);
      return;
    }
    if (passo < PASSOS_DA_CRIACAO) {
      setPasso(passo + 1);
      return;
    }
    void criar();
  }

  function voltar() {
    setErro(null);
    setPasso(passo - 1);
  }

  const rodape = (
    <div className={styles.actions}>
      {passo > 1 ? (
        <OutlineButton variant="ghost" onClick={voltar} disabled={criando}>Voltar</OutlineButton>
      ) : (
        <OutlineButton variant="ghost" onClick={onClose}>Cancelar</OutlineButton>
      )}
      <OutlineButton type="submit" form={formId} loading={criando}>
        {passo < PASSOS_DA_CRIACAO ? 'Continuar' : 'Criar meta'}
      </OutlineButton>
    </div>
  );

  return (
    <Modal
      open
      onClose={criando ? undefined : onClose}
      closeOnOverlayClick={!criando}
      closeOnEsc={!criando}
      title="Nova meta"
      description={`Passo ${passo} de ${PASSOS_DA_CRIACAO}. ${TITULOS_DOS_PASSOS[passo]}`}
      footer={rodape}
      size="sm"
      className={styles.dialog}
      overlayClassName={styles.overlay}
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
        {passo === 1 ? (
          <>
            <fieldset className={styles.group}>
              <legend className={styles.legend}>Tipo</legend>
              {tipos.map((opcao) => (
                <ChoiceRow
                  key={opcao.value}
                  name="tipo-da-meta"
                  value={opcao.value}
                  title={opcao.label}
                  checked={tipo === opcao.value}
                  onChange={() => escolherTipo(opcao)}
                />
              ))}
            </fieldset>
            <Field label="Nome">
              <input
                value={nome}
                maxLength={80}
                placeholder="Ex.: Viagem em dezembro"
                onChange={(event) => {
                  setNome(event.target.value);
                  // Campo apagado volta a acompanhar o tipo escolhido.
                  setNomeEditado(event.target.value.trim() !== '');
                  setErro(null);
                }}
              />
            </Field>
          </>
        ) : null}

        {passo === 2 ? (
          <>
            <CampoDeValor label="Valor da meta" centavos={alvoCentavos} onChange={mudar(setAlvoCentavos)} autoFocus />
            <CampoDeValor label="Já tem guardado (opcional)" centavos={guardadoCentavos} onChange={mudar(setGuardadoCentavos)} />
            <div className={styles.group}>
              <span className={styles.legend}>Planejar por</span>
              <Segmented label="Planejar por" options={MODOS_DO_PLANO} value={modo} onChange={mudar(setModo)} />
            </div>
            {modo === 'data' ? (
              <Field label="Prazo">
                <input
                  type="month"
                  value={prazo}
                  min={mesDoCampo(somarMeses(hoje, 1))}
                  onChange={(event) => mudar(setPrazo)(event.target.value)}
                />
              </Field>
            ) : (
              <CampoDeValor label="Valor por mês" centavos={porMesCentavos} onChange={mudar(setPorMesCentavos)} />
            )}
            {plano ? (
              <UniCard aria-live="polite">
                <p>{fraseDoPlano(plano, modo)}</p>
              </UniCard>
            ) : null}
          </>
        ) : null}

        {passo === 3 ? (
          <>
            {activeAccounts.length > 0 ? (
              <Field label="Conta vinculada (opcional)" trailing={<PhCaretDownIcon />}>
                <select value={contaId} onChange={(event) => setContaId(event.target.value)}>
                  <option value="">Nenhuma</option>
                  {activeAccounts.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.name}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <div className={styles.group}>
              <span className={styles.legend}>Prioridade</span>
              <Segmented label="Prioridade" options={PRIORIDADES_DA_META} value={prioridade} onChange={setPrioridade} />
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleText}>
                <span>Lembrete mensal</span>
                <span className={styles.helper}>Receba um aviso no dia escolhido se o aporte do mês ainda não foi registrado.</span>
              </span>
              <Toggle checked={lembrete} onChange={setLembrete} label="Lembrete mensal" />
            </div>
            {lembrete ? (
              <>
                <Field label="Dia do lembrete" trailing={<PhCaretDownIcon />}>
                  <select value={diaDoLembrete} onChange={(event) => setDiaDoLembrete(Number(event.target.value))}>
                    {DIAS_DO_LEMBRETE.map((dia) => (
                      <option key={dia} value={dia}>{`Todo dia ${dia}`}</option>
                    ))}
                  </select>
                </Field>
                <AvisoDeNotificacao />
              </>
            ) : null}

            <section className={styles.summary} aria-label="Resumo da meta">
              <h3 className={styles.summaryTitle}>Resumo</h3>
              <dl className={styles.summaryList}>
                <div><dt>Meta</dt><dd>{`${nome.trim()} (${tipoEscolhido?.label})`}</dd></div>
                <div><dt>Valor da meta</dt><dd>{formatCurrency(formulario.alvo)}</dd></div>
                {formulario.guardado > 0 ? (
                  <div><dt>Já guardado</dt><dd>{formatCurrency(formulario.guardado)}</dd></div>
                ) : null}
                <div><dt>Por mês</dt><dd>{plano ? formatCurrency(plano.porMes) : '—'}</dd></div>
                <div><dt>Prazo</dt><dd>{plano?.textoDoPrazo ?? '—'}</dd></div>
                {activeAccounts.length > 0 ? (
                  <div><dt>Conta</dt><dd>{contaEscolhida?.name ?? 'Nenhuma'}</dd></div>
                ) : null}
                <div><dt>Prioridade</dt><dd>{PRIORIDADES_DA_META.find((opcao) => opcao.value === prioridade)?.label}</dd></div>
                <div><dt>Lembrete</dt><dd>{lembrete ? `Todo dia ${diaDoLembrete}` : 'Desligado'}</dd></div>
              </dl>
            </section>
          </>
        ) : null}

        {erro ? <p className={styles.error} role="alert">{erro}</p> : null}
      </form>
    </Modal>
  );
}
