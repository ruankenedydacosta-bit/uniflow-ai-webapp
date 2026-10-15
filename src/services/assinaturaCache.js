// Assinatura guardada em memória por workspace. As telas de Mais e Seu
// plano pintam o valor guardado na hora e revalidam em segundo plano. Antes, cada tela buscava ao montar e descartava ao sair, e
// o menu mostrava "Carregando" (ou "Nenhuma assinatura ativa") a cada visita.
//
// A busca usa sempre local_only: o status vem do banco, que o webhook da
// Asaas mantém. A consulta à Asaas só acrescenta provider_status e o Pix
// pendente, que nenhuma dessas telas lê (o Pix fica no fluxo do Plano
// Pessoal, que chama getSubscription direto).
//
// Fica só em memória, nunca no localStorage: some ao recarregar a página, e
// o guarda de acesso do App.jsx busca por aqui ao abrir o app, deixando o
// valor pronto para o menu. A sessão encerrada limpa tudo
// (SessionContext.synchronizeSession).
import { getSubscription } from './billingService.js';

const VAZIA = Object.freeze({ temDado: false, assinatura: null, erro: null, carregando: false });

export function createAssinaturaCache({ buscar }) {
  const entradas = new Map();
  // Busca mais recente por workspace: { numero, promessa }. Resposta de
  // busca antiga não sobrescreve a nova (ex.: revalidação disparada antes
  // de cancelar o plano).
  const ultimaBusca = new Map();
  const ouvintes = new Set();
  let contador = 0;

  function gravar(workspaceId, parcial) {
    entradas.set(workspaceId, { ...ler(workspaceId), ...parcial });
    ouvintes.forEach((ouvinte) => ouvinte());
  }

  function ler(workspaceId) {
    return entradas.get(workspaceId) ?? VAZIA;
  }

  async function executar(workspaceId, numero) {
    let resultado;
    try {
      resultado = await buscar({ workspaceId, localOnly: true });
    } catch {
      resultado = { data: null, error: { code: 'NETWORK', message: 'billing_request_failed' } };
    }
    if (ultimaBusca.get(workspaceId)?.numero !== numero) return resultado;

    if (resultado.error) {
      // Com valor guardado, a falha da revalidação não apaga o que a tela
      // já mostra. O erro só aparece para quem ainda não tem dado.
      gravar(workspaceId, { carregando: false, erro: resultado.error });
    } else {
      gravar(workspaceId, { temDado: true, assinatura: resultado.data ?? null, erro: null, carregando: false });
    }
    return resultado;
  }

  // Sem opções, reaproveita a busca em andamento. `forcar` sempre faz uma
  // busca nova: o guarda de acesso não decide com uma resposta que saiu
  // antes do pagamento. `descartar` também apaga o valor guardado: depois de
  // cancelar ou trocar de plano, a tela volta a mostrar "Carregando" e, se a
  // busca falhar, o erro, em vez do plano antigo.
  function atualizar(workspaceId, { forcar = false, descartar = false } = {}) {
    if (!workspaceId) return Promise.resolve(null);
    const emAndamento = ultimaBusca.get(workspaceId);
    if (!forcar && !descartar && emAndamento && ler(workspaceId).carregando) return emAndamento.promessa;

    contador += 1;
    const numero = contador;
    gravar(workspaceId, descartar ? { ...VAZIA, carregando: true } : { carregando: true });
    const busca = { numero, promessa: null };
    ultimaBusca.set(workspaceId, busca);
    busca.promessa = executar(workspaceId, numero);
    return busca.promessa;
  }

  function ouvir(ouvinte) {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
  }

  function limpar() {
    entradas.clear();
    ultimaBusca.clear();
    ouvintes.forEach((ouvinte) => ouvinte());
  }

  return { ler, atualizar, ouvir, limpar };
}

// O que as telas mostram a partir da entrada guardada. `carregando` só fica
// true quando ainda não há valor guardado: revisitar a tela não mostra
// "Carregando" de novo.
export function resumirAssinatura(estado, workspaceId) {
  return {
    assinatura: estado.assinatura,
    carregando: Boolean(workspaceId) && !estado.temDado && (estado.carregando || !estado.erro),
    erro: estado.temDado ? null : estado.erro,
  };
}

const assinaturaCache = createAssinaturaCache({ buscar: getSubscription });

export const lerAssinatura = assinaturaCache.ler;
export const atualizarAssinatura = assinaturaCache.atualizar;
export const ouvirAssinaturas = assinaturaCache.ouvir;
export const limparAssinaturas = assinaturaCache.limpar;
