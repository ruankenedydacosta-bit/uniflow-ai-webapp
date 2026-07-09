import Button from '../../components/ui/Button';

/**
 * DashboardGreeting — replica o wireframe 3.1 do docx: saudação +
 * resposta à "regra dos 5 segundos" (como estou hoje) + CTA para a Uni.
 * `statusMessage` é intencionalmente uma prop (não hardcoded aqui) — a
 * frase "sua saúde financeira está excelente" depende do Motor de
 * Projeção, que ainda não existe nesta fase.
 */
export default function DashboardGreeting({ userName, statusMessage, onTalkToUni }) {
  return (
    <div className="uf-flex uf-justify-between uf-items-center uf-flex-wrap uf-gap-md">
      <div className="uf-flex uf-flex-column uf-gap-xs">
        <h1>Olá, {userName}</h1>
        {statusMessage ? <p>{statusMessage}</p> : null}
      </div>
      <Button variant="primary" size="lg" onClick={onTalkToUni}>
        Conversar com Uni
      </Button>
    </div>
  );
}
