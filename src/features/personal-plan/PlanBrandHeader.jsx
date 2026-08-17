import styles from './PersonalPlan.module.css';

// REDESIGN APP-LIKE: a parceria deixou de ser um banner no topo e passou a
// ser uma ASSINATURA INSTITUCIONAL discreta no rodapé (referência
// aprovada). Além do ganho visual, isso remove do carregamento da página
// dois PNGs de ~2,5 MB cada (logo_uniflowai.png e
// smartech_logo_transparente.png), que eram baixados só para desenhar o
// cabeçalho -- cerca de 5 MB numa tela aberta no celular. As marcas agora
// são texto com a mesma identidade de cor, sem nenhum asset de rede.
function PlanBrandSignature() {
  return (
    <div className={styles.brandSignature}>
      <p className={styles.brandSignatureRow}>
        <span className={styles.brandUniflow}>UniFlow AI</span>
        <span className={styles.brandTimes} aria-hidden="true">×</span>
        <span className={styles.brandSmartech}>Smartech</span>
      </p>
      <p className={styles.brandSignatureNote}>
        Parceria que conecta tecnologia e inteligência.
      </p>
    </div>
  );
}

export default PlanBrandSignature;
