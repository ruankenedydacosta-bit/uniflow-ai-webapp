import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Segmented from '../../components/ui/Segmented/Segmented.jsx';
import { getPlatformUsageReport } from '../../services/platformAdminService.js';
import { cx } from '../../utils/cx.js';
import groups from '../simplified-app/simplifiedGroups.module.css';
import {
  formatUsageDuration,
  rankByAppTime,
  rankUniUsage,
  resolvePlatformAdminErrorMessage,
  summarizeUsage,
  UNI_RANKING_OPTIONS,
  USAGE_PERIOD_OPTIONS,
  USAGE_RANKING_LIMIT,
} from './platformAdminPresentation.js';
import styles from './platformAdmin.module.css';

function formatLastSeen(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function RankRow({ position, title, subtitle, value }) {
  return (
    <div className={styles.rankRow}>
      <span className={styles.rankPosition}>{position}</span>
      <span className={groups.rowText}>
        <span className={groups.rowTitle}>{title}</span>
        {subtitle ? <span className={groups.rowSubtitle}>{subtitle}</span> : null}
      </span>
      <span className={styles.rankValue}>{value}</span>
    </div>
  );
}

// Aba "Uso" do painel: quem abriu o app e por quanto tempo, e o top 25 da Uni
// por prompts ou minutos de voz. Os números vêm de admin_usage_report
// (migration 068), que confere is_platform_admin() no banco.
function PlatformUsageReport({ totalUsers }) {
  const [days, setDays] = useState(USAGE_PERIOD_OPTIONS[1].value);
  const [uniMetric, setUniMetric] = useState(UNI_RANKING_OPTIONS[0].value);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const lastRequestRef = useRef(0);

  // Trocar de período com a resposta anterior ainda a caminho: só a última
  // chamada escreve na tela.
  const loadReport = useCallback(async (periodDays) => {
    const requestId = lastRequestRef.current + 1;
    lastRequestRef.current = requestId;
    setIsLoading(true);
    const result = await getPlatformUsageReport({ days: periodDays });
    if (requestId !== lastRequestRef.current) return;
    setRows(result.data ?? []);
    setLoadError(result.error ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Mesmo deferimento via setTimeout(0) da lista de usuários: evita
    // setState síncrono no corpo do efeito.
    const timeoutId = window.setTimeout(() => loadReport(days), 0);
    return () => window.clearTimeout(timeoutId);
  }, [days, loadReport]);

  const summary = useMemo(() => summarizeUsage(rows), [rows]);
  const appRanking = useMemo(() => rankByAppTime(rows), [rows]);
  const uniRanking = useMemo(() => rankUniUsage(rows, uniMetric), [rows, uniMetric]);

  function nameOf(row) {
    return row.full_name || row.email;
  }

  return (
    <>
      <Segmented label="Período" options={USAGE_PERIOD_OPTIONS} value={days} onChange={setDays} />

      {isLoading && rows.length === 0 ? (
        <p className={styles.state}>Carregando relatório...</p>
      ) : loadError ? (
        <div className={cx(styles.banner, styles.bannerError)} role="alert">
          <span>{resolvePlatformAdminErrorMessage(loadError)}</span>
          <button type="button" className={styles.dismiss} onClick={() => loadReport(days)}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <dl className={styles.facts} aria-busy={isLoading}>
            <div>
              <dt>Abriram o app</dt>
              <dd>
                {totalUsers > 0
                  ? `${summary.appUsers} de ${plural(totalUsers, 'usuário', 'usuários')}`
                  : plural(summary.appUsers, 'usuário', 'usuários')}
              </dd>
            </div>
            <div>
              <dt>Tempo no app</dt>
              <dd>{formatUsageDuration(summary.appSeconds)}</dd>
            </div>
            <div>
              <dt>Usaram a Uni</dt>
              <dd>{plural(summary.uniUsers, 'usuário', 'usuários')}</dd>
            </div>
            <div>
              <dt>Prompts</dt>
              <dd>{summary.prompts}</dd>
            </div>
            <div>
              <dt>Voz</dt>
              <dd>{formatUsageDuration(summary.voiceSeconds)}</dd>
            </div>
          </dl>

          <section className={groups.group} aria-label="Acessos ao app">
            <h2 className={groups.groupLabel}>Acessos ao app</h2>
            <p className={styles.hint}>
              Tempo no app conta só os minutos com o app aberto na tela. Um acesso novo começa depois de 30 minutos sem uso.
            </p>
            {appRanking.length === 0 ? (
              <p className={styles.state}>Ninguém abriu o app neste período.</p>
            ) : (
              <div className={groups.list}>
                {appRanking.map((row, index) => (
                  <RankRow
                    key={row.user_id}
                    position={index + 1}
                    title={nameOf(row)}
                    subtitle={[
                      plural(row.active_days, 'dia', 'dias'),
                      plural(row.visits, 'acesso', 'acessos'),
                      row.last_seen_at ? `último em ${formatLastSeen(row.last_seen_at)}` : null,
                    ].filter(Boolean).join(' · ')}
                    value={formatUsageDuration(row.active_seconds)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={groups.group} aria-label={`Top ${USAGE_RANKING_LIMIT} da Uni`}>
            <h2 className={groups.groupLabel}>Top {USAGE_RANKING_LIMIT} da Uni</h2>
            <Segmented label="Ordenar por" options={UNI_RANKING_OPTIONS} value={uniMetric} onChange={setUniMetric} />
            <p className={styles.hint}>
              Prompts são as mensagens enviadas à Uni, escritas ou faladas. Voz soma as conversas por voz em tempo real.
            </p>
            {uniRanking.length === 0 ? (
              <p className={styles.state}>Ninguém usou a Uni neste período.</p>
            ) : (
              <div className={groups.list}>
                {uniRanking.map((row, index) => (
                  <RankRow
                    key={row.user_id}
                    position={index + 1}
                    title={nameOf(row)}
                    subtitle={uniMetric === 'voice'
                      ? `${plural(row.voice_sessions, 'conversa', 'conversas')} · ${plural(row.prompts, 'prompt', 'prompts')}`
                      : `${formatUsageDuration(row.voice_seconds)} de voz`}
                    value={uniMetric === 'voice'
                      ? formatUsageDuration(row.voice_seconds)
                      : plural(row.prompts, 'prompt', 'prompts')}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default PlatformUsageReport;
