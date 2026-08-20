/**
 * DOWNLOAD-SUCCESS1 -- capacidade real de "Abrir arquivo" depois que um
 * download já foi disparado.
 *
 * O QUE NÃO É POSSÍVEL (e por isso não é tentado aqui): depois que o
 * navegador entrega o arquivo ao gerenciador de downloads do sistema, a
 * aplicação web NÃO tem nenhuma referência a onde ele foi salvo -- não
 * existe API web para abrir um arquivo da pasta de downloads do
 * dispositivo. Reabrir a blob: URL também não resolve: no Android isso
 * dispara um SEGUNDO download em vez de abrir o arquivo.
 *
 * O QUE É POSSÍVEL: a Web Share API nível 2 (navigator.share com files)
 * entrega o arquivo em memória ao sistema, que oferece os apps capazes de
 * recebê-lo (Excel, Planilhas, Drive...). É esse o mecanismo real por trás
 * do botão "Abrir arquivo" -- disponível em Android/Chrome e iOS/Safari,
 * ausente na maioria dos navegadores desktop.
 *
 * Por isso a detecção abaixo é honesta e por arquivo (canShare({ files }),
 * nunca só "existe navigator.share"): quando a capacidade não existe, o
 * botão simplesmente NÃO é oferecido -- nunca um botão morto. O download
 * nativo, que já aconteceu, continua sendo o caminho garantido.
 */

/**
 * Converte o Blob já baixado em File -- `navigator.canShare`/`share`
 * exigem File (com nome e tipo), nunca aceitam um Blob cru.
 */
export function buildDownloadedFile(blob, filename) {
  if (!blob || !filename) return null;
  try {
    return new File([blob], filename, { type: blob.type });
  } catch {
    return null;
  }
}

/**
 * SHARE-TRUTHFUL1: alguns navegadores/WebViews respondem `true` em
 * canShare({ files }) e mesmo assim falham no share() real (nenhum app
 * capaz de receber o tipo, WebView sem a ponte de compartilhamento,
 * política do ambiente). Não dá para prever isso: canShare é a única
 * resposta que o navegador oferece, e às vezes ela mente -- foi
 * exatamente esse o bug relatado (botão aparecia e o toque só produzia
 * "Não foi possível abrir o arquivo").
 *
 * Por isso a capacidade também é APRENDIDA: quando um share falha de
 * verdade (nunca por cancelamento do usuário), este dispositivo provou que
 * não consegue, e o botão deixa de ser oferecido. É fato de DISPOSITIVO,
 * não de componente -- por isso mora aqui no módulo e não em estado do
 * React: vale para qualquer download seguinte na mesma sessão.
 *
 * Não é persistido de propósito: uma falha pontual (nenhum app instalado
 * naquele momento) não deve desligar o recurso para sempre -- na próxima
 * abertura do app a capacidade é avaliada de novo.
 */
let sharingProvenUnavailable = false;

/** Só para testes -- devolve o módulo ao estado inicial entre casos. */
export function resetDownloadedFileShareCapability() {
  sharingProvenUnavailable = false;
}

/**
 * `true` só quando ESTE arquivo específico pode mesmo ser compartilhado E
 * o dispositivo ainda não provou o contrário. canShare({ files }) é a
 * melhor checagem prévia disponível: navigator.share existe em navegadores
 * que não aceitam arquivos, e o suporte varia por tipo de arquivo. Nunca
 * lança -- navegador sem a API é só `false`.
 */
export function canOpenDownloadedFile(file, navigatorRef = globalThis.navigator) {
  if (sharingProvenUnavailable) return false;
  if (!file) return false;
  if (typeof navigatorRef?.share !== 'function') return false;
  if (typeof navigatorRef?.canShare !== 'function') return false;
  try {
    return navigatorRef.canShare({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/**
 * Entrega o arquivo ao sistema. Precisa ser chamado DENTRO de um gesto do
 * usuário (o clique no botão já é) -- fora disso o navegador recusa.
 *
 * Nunca lança: devolve sempre { ok, reason }. `reason: 'cancelled'` é o
 * usuário fechando a folha de compartilhamento -- NÃO é erro, e a UI não
 * deve mostrar mensagem de falha nesse caso (ver openDownloadedFile no
 * SimplifiedReportPage).
 */
export async function openDownloadedFile(file, navigatorRef = globalThis.navigator) {
  if (!canOpenDownloadedFile(file, navigatorRef)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    await navigatorRef.share({ files: [file] });
    return { ok: true, reason: null };
  } catch (error) {
    // AbortError = usuário cancelou/fechou a folha de compartilhamento.
    // Não é falha do dispositivo -- a capacidade continua valendo.
    if (error?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    // Falha real: o navegador disse que conseguia e não conseguiu. A partir
    // daqui o botão não é mais oferecido nesta sessão (ver
    // sharingProvenUnavailable) -- resta só a confirmação de download.
    sharingProvenUnavailable = true;
    return { ok: false, reason: 'failed' };
  }
}
