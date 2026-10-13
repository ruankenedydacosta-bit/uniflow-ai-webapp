// Assinatura guardada em memória por workspace. As telas de Mais, Seu plano
// e Pagamento e assinatura pintam o valor guardado na hora e revalidam em
// segundo plano. Antes, cada tela buscava ao montar e descartava ao sair, e
// o menu mostrava "Carregando" (ou "Nenhuma assinatura ativa") a cada visita.
//
// A busca usa sempre local_only: o status vem do banco, que o webhook da
// Asaas mantém. A consulta à Asaas só acrescenta provider_status e o Pix
// pendente, que nenhuma dessas telas lê (o Pix fica no fluxo do Plano
// Pessoal, que chama getSubscription direto).
//
// Fica só em memória, nunca no localStorage: some ao recarregar a página, e
// o guarda de acesso do App.jsx preenche de novo ao abrir o app. O logout
// limpa tudo (SessionContext.signOut).
import { getSubscription } from './billingService.js';

const VAZIA = Object.freeze({ temDado: false, assinatura: null, erro: null, carregando: false });

export function createAssinaturaCache({ buscar }) {
  const entradas = new Map();
  // Número da busca mais recente por workspace. Resposta de busca antiga
  // não sobrescreve a nova (ex.: revalidação disparada antes de cancelar).
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

  function guardar(workspaceId, assinatura) {
    if (!workspaceId) return;
    contador += 1;
    ultimaBusca.set(workspaceId, contador);
    gravar(workspaceId, { temDado: true, assinatura: assinatura ?? null, erro: null, carregando: false });
  }

  async function atualizar(workspaceId) {
    if (!workspaceId) return null;
    contador += 1;
    const numero = contador;
    ultimaBusca.set(workspaceId, numero);
    gravar(workspaceId, { carregando: true });

    const resultado = await buscar({ workspaceId, localOnly: true });
    if (ultimaBusca.get(workspaceId) !== numero) return resultado;

    if (resultado.error) {
      // Com valor guardado, a falha da revalidação não apaga o que a tela
      // já mostra. O erro só aparece para quem ainda não tem dado.
      gravar(workspaceId, { carregando: false, erro: resultado.error });
    } else {
      gravar(workspaceId, { temDado: true, assinatura: resultado.data ?? null, erro: null, carregando: false });
    }
    return resultado;
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

  return { ler, guardar, atualizar, ouvir, limpar };
}

const assinaturaCache = createAssinaturaCache({ buscar: getSubscription });

export const lerAssinatura = assinaturaCache.ler;
export const guardarAssinatura = assinaturaCache.guardar;
export const atualizarAssinatura = assinaturaCache.atualizar;
export const ouvirAssinaturas = assinaturaCache.ouvir;
export const limparAssinaturas = assinaturaCache.limpar;
