import { cx } from '../../lib/cx';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import ConversationItem from './ConversationItem';
import { groupConversationsByRecency } from './utils';

const GROUP_LABELS = {
  hoje: 'Hoje',
  ultimos7Dias: 'Últimos 7 dias',
  antigas: 'Mais antigas',
};

/**
 * ConversationList — docx Módulo 10 ("lista de chats"). Mesma estrutura
 * de navegação (ul/li + uf-gap-*) já usada em Sidebar.jsx, mas é uma
 * lista de dados da feature, não a navegação estrutural do produto —
 * por isso não reutiliza o componente Sidebar em si, só o padrão visual.
 */
export default function ConversationList({ conversations, activeId, loading, onSelect, onCreate }) {
  const groups = groupConversationsByRecency(conversations);

  return (
    <div className={cx('uf-flex', 'uf-flex-column', 'uf-gap-md', 'uf-bg-surface', 'uf-h-full', 'uf-p-md')}>
      <Button variant="primary" size="md" fullWidth onClick={onCreate}>
        + Nova conversa
      </Button>

      {loading ? (
        <div className="uf-flex uf-justify-center uf-p-lg">
          <Loader variant="dots" label="Carregando conversas" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="uf-text-caption uf-text-tertiary uf-p-sm">Suas conversas com a Uni vão aparecer aqui.</p>
      ) : (
        <nav className="uf-flex-1 uf-overflow-y-auto">
          {Object.entries(groups).map(([groupKey, items]) =>
            items.length > 0 ? (
              <div key={groupKey} className="uf-flex uf-flex-column uf-gap-xs uf-mb-md">
                <span className="uf-text-micro uf-text-tertiary uf-p-sm">{GROUP_LABELS[groupKey]}</span>
                <ul role="list" className="uf-flex uf-flex-column uf-gap-xs">
                  {items.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onSelect={onSelect}
                    />
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </nav>
      )}
    </div>
  );
}
