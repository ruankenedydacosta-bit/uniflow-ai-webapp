import styles from '../authMobile.module.css';

function PartnershipFooter() {
  return (
    <footer className={styles.partnershipFooter}>
      <strong>
        <span aria-hidden="true">◇</span>
        Parceria que conecta <em>tecnologia e inteligência</em>
      </strong>
      <p>
        A união entre UniFlow AI e SmartTech traz a combinação entre inteligência financeira
        e tecnologia de monitoramento avançada.
      </p>
    </footer>
  );
}

export default PartnershipFooter;
