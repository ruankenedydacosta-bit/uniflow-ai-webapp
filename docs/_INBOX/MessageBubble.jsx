import { cx } from '../../lib/cx';
import Avatar from '../../components/ui/Avatar';
import ImageAttachment from './ImageAttachment';
import FileAttachment from './FileAttachment';
import ThinkingIndicator from './ThinkingIndicator';
import MarkdownRenderer from './MarkdownRenderer';
import { MESSAGE_ROLE, ACCEPTED_IMAGE_TYPES } from './constants';
import styles from './MessageBubble.module.css';

/**
 * MessageBubble — um lado da conversa. Não é chamado diretamente pelo
 * ChatWindow (ver AssistantMessage/UserMessage, wrappers finos deste
 * componente) — mas concentra 100% da lógica de renderização aqui, para
 * não duplicá-la nos dois wrappers.
 *
 * @param {{ role: 'user'|'uni', content: string, streaming?: boolean, attachments?: Array<{url:string,name:string,type?:string}> }} props
 */
export default function MessageBubble({ role, content, streaming, attachments = [] }) {
  const isUser = role === MESSAGE_ROLE.USER;
  const isEmpty = !content && attachments.length === 0;

  return (
    <div className={cx('uf-flex', 'uf-gap-md', isUser && 'uf-justify-end')}>
      {!isUser ? <Avatar name="Uni" size="sm" className="uf-shrink-0" /> : null}

      <div
        className={cx(
          styles.bubble,
          isUser && styles.fromUser,
          'uf-rounded-lg',
          'uf-p-md',
          isUser ? 'uf-bg-primary-subtle' : 'uf-bg-surface'
        )}
        aria-live={streaming ? 'polite' : undefined}
      >
        {streaming && isEmpty ? (
          <ThinkingIndicator />
        ) : (
          <div className="uf-flex uf-flex-column uf-gap-sm">
            {attachments.map((attachment) => (
              <AttachmentPreview key={attachment.url} attachment={attachment} />
            ))}
            {content ? <MarkdownRenderer content={content} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }) {
  const isImage = attachment.type
    ? ACCEPTED_IMAGE_TYPES.includes(attachment.type)
    : /\.(png|jpe?g|webp|gif)$/i.test(attachment.name);
  return isImage ? (
    <ImageAttachment url={attachment.url} name={attachment.name} />
  ) : (
    <FileAttachment url={attachment.url} name={attachment.name} />
  );
}
