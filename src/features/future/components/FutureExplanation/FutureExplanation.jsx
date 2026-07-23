import { cx } from '../../../../utils/cx';
import { formatCurrency } from '../../../../utils/formatters';
import Card from '../../../../components/ui/Card';
import styles from './FutureExplanation.module.css';

export default function FutureExplanation({
  hasData,
  monthsWithData,
  avgIncome,
  avgExpense,
  className,
}) {
  return (
    <section aria-labelledby="future-explanation-title" className={cx(styles.section, className)}>
      <h3 id="future-explanation-title" className={styles.sectionTitle}>Como calculamos</h3>

      <div className={styles.grid}>
        <Card variant="outline" padding="md" className={styles.card}>
          <strong className={styles.cardTitle}>Fonte dos dados</strong>
          <p className={styles.cardText}>
            Usamos seu saldo atual, o histórico de receitas e despesas dos últimos meses e suas metas financeiras ativas.
            {hasData ? ` Trabalhamos com dados de ${monthsWithData} ${monthsWithData === 1 ? 'mês' : 'meses'} de histórico.` : ''}
          </p>
        </Card>

        <Card variant="outline" padding="md" className={styles.card}>
          <strong className={styles.cardTitle}>Cálculo das projeções</strong>
          <p className={styles.cardText}>
            Para cada cenário, calculamos a média mensal de receitas e despesas. Aplicamos ajustes percentuais
            pré-definidos (receita {hasData ? formatCurrency(avgIncome) : '—'}, despesas {hasData ? formatCurrency(avgExpense) : '—'}) e projetamos
            o saldo mês a mês até o horizonte escolhido.
          </p>
        </Card>

        <Card variant="outline" padding="md" className={styles.card}>
          <strong className={styles.cardTitle}>Análise das metas</strong>
          <p className={styles.cardText}>
            Comparamos a contribuição planejada de cada meta com a capacidade mensal disponível.
            Se o fluxo mensal após as despesas for suficiente para cobrir a contribuição dentro do prazo,
            a meta é considerada viável. Caso contrário, calculamos o aporte necessário ou sinalizamos atenção.
          </p>
        </Card>

        <Card variant="outline" padding="md" className={styles.card}>
          <strong className={styles.cardTitle}>Premissas</strong>
          <ul className={styles.assumptions}>
            <li>Receitas e despesas futuras seguem a média do período analisado</li>
            <li>Lançamentos marcados como recorrentes ainda não são adicionados automaticamente aos meses futuros</li>
            <li>Não consideramos inflação, juros ou variações sazonais</li>
            <li>A contribuição das metas é descontada do fluxo mensal disponível</li>
            <li>Os percentuais de ajuste dos cenários são fixos e configuráveis</li>
          </ul>
        </Card>
      </div>

      <Card variant="glass" padding="md" className={styles.disclaimerCard}>
        <strong className={styles.disclaimerTitle}>Aviso importante</strong>
        <p className={styles.disclaimerText}>
          Esta é uma projeção baseada exclusivamente nos seus dados atuais e em premissas simplificadas.
          Resultados reais podem ser diferentes. Nada aqui constitui recomendação financeira,
          garantia de resultado ou promessa de retorno. Consulte um profissional qualificado
          para decisões financeiras importantes.
        </p>
      </Card>
    </section>
  );
}
