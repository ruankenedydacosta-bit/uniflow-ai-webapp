import { CheckIcon, UniMark } from './SimplifiedIcons.jsx';
import styles from './simplifiedDownloadSuccessCard.module.css';

/**
 * DOWNLOAD-SUCCESS1 -- feedback visual PRÓPRIO da Uni depois que o
 * download já foi disparado, dentro da própria tela (o aviso nativo do
 * navegador/Android continua acontecendo em paralelo: ele é o caminho
 * garantido, este card é o reconhecimento da Uni por cima).
 *
 * Componente de APRESENTAÇÃO puro -- nenhum estado, nenhuma capacidade
 * detectada aqui dentro. Quem decide se "Abrir arquivo" existe é o
 * chamador (ver downloadedFileShare.js/canOpenDownloadedFile): quando a
 * capacidade real não existe no dispositivo, o botão simplesmente não é
 * renderizado -- nunca um botão morto que não faz nada ao ser tocado.
 *
 * Não existe estado de erro aqui, de propósito: o download já aconteceu e
 * o arquivo ESTÁ salvo. Se abrir/compartilhar falhar, o chamador apenas
 * para de passar `canOpen` -- sobra a confirmação, nunca uma mensagem de
 * erro sobre algo que não impediu o usuário de ter o arquivo.
 */
function SimplifiedDownloadSuccessCard({ filename, canOpen = false, onOpen }) {
  return (
    <section className={styles.card} role="status" aria-live="polite" data-download-success>
      <span className={styles.mark} aria-hidden="true"><UniMark /></span>

      <div className={styles.copy}>
        <span className={styles.titleRow}>
          <span className={styles.checkBadge} aria-hidden="true"><CheckIcon /></span>
          <strong className={styles.title}>Relatório baixado com sucesso</strong>
        </span>
        {filename ? <span className={styles.filename}>{filename}</span> : null}
        <span className={styles.hint}>O arquivo já está salvo no seu dispositivo.</span>

        {canOpen ? (
          <button type="button" className={styles.openButton} onClick={onOpen}>
            Abrir arquivo
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default SimplifiedDownloadSuccessCard;
