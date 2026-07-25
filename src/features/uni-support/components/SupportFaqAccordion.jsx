import { useState } from 'react';
import { getKnowledgeEntryById } from '../../product-knowledge';
import styles from './SupportFaqAccordion.module.css';

/**
 * SUPORTE1: cada pergunta mostra o `content` já existente do manifesto
 * oficial (nunca um texto novo escrito aqui) -- ver supportFaq.js. Um botão
 * "Perguntar à Uni" abre a conversa em modo suporte com a mesma pergunta,
 * para quem quiser uma resposta conversacional em vez de ler o trecho.
 */
export default function SupportFaqAccordion({ categories, onAskUni }) {
  const [openItemKey, setOpenItemKey] = useState(null);

  function toggle(key) {
    setOpenItemKey((current) => (current === key ? null : key));
  }

  return (
    <div className={styles.wrap}>
      {categories.map((category) => (
        <section key={category.id} className={styles.category} aria-labelledby={`faq-cat-${category.id}`}>
          <h3 id={`faq-cat-${category.id}`} className={styles.categoryTitle}>{category.label}</h3>
          <div className={styles.items}>
            {category.items.map((item) => {
              const key = `${category.id}:${item.question}`;
              const isOpen = openItemKey === key;
              const entry = getKnowledgeEntryById(item.knowledgeId);
              return (
                <div key={key} className={styles.item}>
                  <button
                    type="button"
                    className={styles.question}
                    onClick={() => toggle(key)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${key}`}
                  >
                    <span>{item.question}</span>
                    <span className={styles.chevron} aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div id={`faq-answer-${key}`} className={styles.answer} role="region">
                      <p>{entry?.content ?? 'Conteúdo não encontrado.'}</p>
                      <button
                        type="button"
                        className={styles.askButton}
                        onClick={() => onAskUni?.(item.question)}
                      >
                        Perguntar à Uni sobre isso
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
