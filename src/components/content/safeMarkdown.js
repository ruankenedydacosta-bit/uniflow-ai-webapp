const LIST_ITEM_PATTERN = /^(\s*)([-*]|\d+\.)\s+(.+)$/;

export function parseSafeMarkdown(value) {
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : '';
  if (!text.trim()) return [];

  const blocks = [];
  const lines = text.split('\n');
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (const line of lines) {
    const listMatch = line.match(LIST_ITEM_PATTERN);
    if (listMatch) {
      flushParagraph();
      const ordered = /\d+\./.test(listMatch[2]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: 'list', ordered, items: [] };
      }
      list.items.push(listMatch[3]);
      continue;
    }

    flushList();
    if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function parseSafeInlineMarkdown(value) {
  const text = typeof value === 'string' ? value : '';
  const segments = [];
  const pattern = /\*\*([^*\n]+)\*\*/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    segments.push({ type: 'strong', value: match[1] });
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  return segments.length ? segments : [{ type: 'text', value: text }];
}
