import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useVoiceManager, voiceManifest } from '../../../features/uni-audio';
import {
  filterAudioLibrary,
  getAdjacentPlayableClip,
  getAudioLibraryCounts,
  getAudioLibraryOptions,
  getOfficialReviewState,
} from './audioLibraryModel.js';
import {
  AUDIO_REVIEW_STATUSES,
  downloadAudioReviewJson,
  readAudioReviews,
  writeAudioReview,
} from './audioReviewStorage.js';
import TtsPlayground from './components/TtsPlayground.jsx';
import styles from './AudioLibraryPage.module.css';

const EMPTY_FILTERS = Object.freeze({
  category: '', context: '', emotion: '', status: 'all', search: '',
});

const REVIEW_LABELS = Object.freeze({
  unreviewed: 'Não revisado',
  approved: 'Aprovado',
  review: 'Revisar',
  replace: 'Substituir',
  disable_future: 'Desativar futuramente',
});

function SummaryItem({ label, value }) {
  return (
    <div className={styles.summaryItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterSelect({ id, label, value, options, onChange }) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function AudioLibraryPage() {
  const manager = useVoiceManager();
  const subscribe = useCallback((listener) => manager.subscribe(listener), [manager]);
  const getSnapshot = useCallback(() => manager.getState(), [manager]);
  const playback = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const clips = voiceManifest.clips;
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(clips[0]?.id ?? null);
  const [volume, setVolume] = useState(1);
  const [sequential, setSequential] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [reviews, setReviews] = useState(() => readAudioReviews());
  const [playbackError, setPlaybackError] = useState('');
  const filteredClips = useMemo(() => filterAudioLibrary(clips, filters), [clips, filters]);
  const filteredRef = useRef(filteredClips);
  const sequentialRef = useRef(sequential);
  const repeatRef = useRef(repeat);
  const playRef = useRef(null);

  useEffect(() => { filteredRef.current = filteredClips; }, [filteredClips]);
  useEffect(() => { sequentialRef.current = sequential; }, [sequential]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  const selectedClip = clips.find((clip) => clip.id === selectedId) ?? filteredClips[0] ?? null;
  const counts = getAudioLibraryCounts(clips, filteredClips);
  const categories = getAudioLibraryOptions(clips, 'category');
  const contexts = getAudioLibraryOptions(clips, 'context');
  const emotions = getAudioLibraryOptions(clips, 'emotion');

  const playClip = useCallback(async (clip) => {
    if (!clip?.enabled || !clip.src) return false;
    setSelectedId(clip.id);
    setPlaybackError('');
    try {
      await manager.play(clip.id, {
        volume,
        onEnded: () => {
          const next = repeatRef.current
            ? clip
            : sequentialRef.current
              ? getAdjacentPlayableClip(filteredRef.current, clip.id, 1)
              : null;
          if (next) playRef.current?.(next);
        },
      });
      return true;
    } catch {
      setPlaybackError('Não foi possível reproduzir este áudio.');
      return false;
    }
  }, [manager, volume]);
  useEffect(() => { playRef.current = playClip; }, [playClip]);

  const playAdjacent = (direction) => {
    const next = getAdjacentPlayableClip(filteredClips, playback.clipId ?? selectedId, direction);
    if (next) playClip(next);
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const activeReview = reviews[selectedClip?.id] ?? { status: 'unreviewed', note: '' };
  const updateReview = (patch) => {
    if (!selectedClip) return;
    setReviews(writeAudioReview(selectedClip.id, { ...activeReview, ...patch }));
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ferramenta interna DEV</p>
          <h1>Biblioteca de Voz da Uni</h1>
          <p>Ouça e revise o catálogo local sem alterar o manifesto oficial.</p>
        </div>
        <button type="button" className={styles.exportButton} onClick={() => downloadAudioReviewJson(reviews)}>
          Exportar revisão
        </button>
      </header>

      <TtsPlayground />

      <section className={styles.summary} aria-label="Resumo da biblioteca">
        <SummaryItem label="Total de áudios" value={counts.total} />
        <SummaryItem label="Ativos" value={counts.active} />
        <SummaryItem label="Desativados" value={counts.disabled} />
        <SummaryItem label="Resultado do filtro" value={counts.filtered} />
      </section>

      <details className={styles.filters} open>
        <summary>Filtros</summary>
        <div className={styles.filterGrid}>
          <label className={`${styles.field} ${styles.searchField}`} htmlFor="audio-search">
            <span>Pesquisar texto ou ID</span>
            <input
              id="audio-search"
              type="search"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Ex.: processing_001"
            />
          </label>
          <FilterSelect id="audio-category" label="Categoria" value={filters.category} options={categories} onChange={(value) => updateFilter('category', value)} />
          <FilterSelect id="audio-context" label="Contexto" value={filters.context} options={contexts} onChange={(value) => updateFilter('context', value)} />
          <FilterSelect id="audio-emotion" label="Emoção" value={filters.emotion} options={emotions} onChange={(value) => updateFilter('emotion', value)} />
          <label className={styles.field} htmlFor="audio-status">
            <span>Status</span>
            <select id="audio-status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="disabled">Desativados</option>
            </select>
          </label>
        </div>
      </details>

      <div className={styles.workspace}>
        <section className={styles.library} aria-label="Áudios do catálogo">
          <div className={styles.listHeader} aria-hidden="true">
            <span>Ação</span><span>Áudio</span><span>Classificação</span><span>Status</span>
          </div>
          <div className={styles.clipList}>
            {filteredClips.map((clip) => {
              const isPlaying = playback.clipId === clip.id && playback.status === 'playing';
              const isPaused = playback.clipId === clip.id && playback.status === 'paused';
              const officialReviewState = getOfficialReviewState(clip);
              const officialReviewLabel = {
                approved: 'Aprovado',
                replacement_future: 'Substituição futura — ativo no MVP',
                safety_disabled: 'Desativado por segurança',
                unreviewed: 'Não revisado',
              }[officialReviewState];
              return (
                <article
                  key={clip.id}
                  className={`${styles.clipCard} ${selectedId === clip.id ? styles.selected : ''} ${isPlaying ? styles.playing : ''}`}
                  onClick={() => setSelectedId(clip.id)}
                >
                  <div className={styles.clipAction}>
                    <button
                      type="button"
                      aria-label={isPlaying ? `Pausar ${clip.id}` : `Reproduzir ${clip.id}`}
                      disabled={!clip.enabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isPlaying) manager.pause();
                        else if (isPaused) manager.resume();
                        else playClip(clip);
                      }}
                    >
                      {isPlaying ? 'Pausar' : isPaused ? 'Retomar' : 'Play'}
                    </button>
                  </div>
                  <div className={styles.clipIdentity}>
                    <code>{clip.id}</code>
                    <p>{clip.text}</p>
                    <small>{clip.fileName ?? clip.proposedFileName ?? 'Arquivo não importado'} · duração —</small>
                  </div>
                  <dl className={styles.classification}>
                    <div><dt>Categoria</dt><dd>{clip.category}</dd></div>
                    <div><dt>Contexto</dt><dd>{clip.context}</dd></div>
                    <div><dt>Emoção</dt><dd>{clip.emotion}</dd></div>
                  </dl>
                  <div className={styles.statusColumn}>
                    <span className={styles[officialReviewState]}>
                      {officialReviewLabel}
                    </span>
                    {!clip.enabled && <small>{clip.disabledReason}</small>}
                  </div>
                </article>
              );
            })}
            {filteredClips.length === 0 && <p className={styles.empty}>Nenhum áudio corresponde aos filtros.</p>}
          </div>
        </section>

        <aside className={styles.reviewPanel} aria-label="Metadados e revisão">
          <h2>Revisão local</h2>
          {selectedClip ? (
            <>
              <code>{selectedClip.id}</code>
              <dl className={styles.metadata}>
                <div><dt>Arquivo</dt><dd>{selectedClip.fileName ?? selectedClip.proposedFileName ?? '—'}</dd></div>
                <div><dt>Categoria original</dt><dd>{selectedClip.origin?.originalCategory ?? '—'}</dd></div>
                <div><dt>Checksum</dt><dd className={styles.checksum}>{selectedClip.origin?.checksumSha256 ?? '—'}</dd></div>
                <div><dt>Versão</dt><dd>{selectedClip.version}</dd></div>
              </dl>
              <label className={styles.field} htmlFor="review-status">
                <span>Status da revisão</span>
                <select id="review-status" value={activeReview.status} onChange={(event) => updateReview({ status: event.target.value })}>
                  {AUDIO_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{REVIEW_LABELS[status]}</option>)}
                </select>
              </label>
              <label className={styles.field} htmlFor="review-note">
                <span>Observação</span>
                <textarea id="review-note" value={activeReview.note} onChange={(event) => updateReview({ note: event.target.value })} rows="5" />
              </label>
              <p className={styles.localNote}>Salvo apenas neste navegador DEV.</p>
            </>
          ) : <p>Selecione um áudio.</p>}
        </aside>
      </div>

      <section className={styles.playerBar} aria-label="Player da biblioteca">
        <div className={styles.nowPlaying} aria-live="polite">
          <span>{playback.status === 'playing' ? 'Reproduzindo' : playback.status === 'paused' ? 'Pausado' : 'Player parado'}</span>
          <strong>{playback.clipId ?? selectedClip?.id ?? 'Nenhum áudio selecionado'}</strong>
          {playbackError && <small role="alert">{playbackError}</small>}
        </div>
        <div className={styles.transport}>
          <button type="button" aria-label="Áudio anterior" onClick={() => playAdjacent(-1)}>Anterior</button>
          <button type="button" onClick={() => selectedClip && playClip(selectedClip)} disabled={!selectedClip?.enabled}>Play</button>
          <button type="button" onClick={() => manager.pause()} disabled={playback.status !== 'playing'}>Pausar</button>
          <button type="button" onClick={() => manager.resume()} disabled={playback.status !== 'paused'}>Retomar</button>
          <button type="button" onClick={() => manager.stop()} disabled={playback.status === 'idle'}>Parar</button>
          <button type="button" aria-label="Próximo áudio" onClick={() => playAdjacent(1)}>Próximo</button>
        </div>
        <div className={styles.playerOptions}>
          <label htmlFor="audio-volume">Volume <span>{Math.round(volume * 100)}%</span></label>
          <input id="audio-volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); manager.setVolume(next); }} />
          <label><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /> Repetir</label>
          <label><input type="checkbox" checked={sequential} onChange={(event) => setSequential(event.target.checked)} /> Sequencial</label>
        </div>
      </section>
    </main>
  );
}
