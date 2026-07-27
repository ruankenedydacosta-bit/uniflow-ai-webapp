import { Fragment } from 'react';
import { parseSafeInlineMarkdown, parseSafeMarkdown } from './safeMarkdown.js';
import styles from './SafeMarkdown.module.css';

function InlineContent({ value }) {
  return parseSafeInlineMarkdown(value).map((segment, index) => (
    segment.type === 'strong'
      ? <strong key={`${segment.type}-${index}`}>{segment.value}</strong>
      : <Fragment key={`${segment.type}-${index}`}>{segment.value}</Fragment>
  ));
}

export default function SafeMarkdown({ children, className = '' }) {
  const blocks = parseSafeMarkdown(children);
  if (!blocks.length) return null;

  return (
    <div className={`${styles.content} ${className}`.trim()}>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={`list-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>
                  <InlineContent value={item} />
                </li>
              ))}
            </List>
          );
        }

        return (
          <p key={`paragraph-${blockIndex}`}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={`line-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                <InlineContent value={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
