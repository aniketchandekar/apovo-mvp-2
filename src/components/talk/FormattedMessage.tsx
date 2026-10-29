import React from 'react';

interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'bold-italic' | 'code' | 'link';
  text: string;
  href?: string;
}

interface ListItem {
  level: number;
  isOrdered: boolean;
  orderNumber?: number;
  text: string;
}

type BlockToken =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'codeblock'; text: string }
  | { type: 'list'; items: ListItem[] }
  | { type: 'p'; text: string };

export function parseInlineMarkdown(text: string): InlineToken[] {
  const parts: InlineToken[] = [];
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***')) {
      parts.push({ type: 'bold-italic', text: token.slice(3, -3) });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push({ type: 'bold', text: token.slice(2, -2) });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push({ type: 'italic', text: token.slice(1, -1) });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push({ type: 'link', text: linkMatch[1], href: linkMatch[2] });
      } else {
        parts.push({ type: 'text', text: token });
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return parts;
}

export function parseMarkdownBlocks(markdown: string): BlockToken[] {
  const lines = markdown.split('\n');
  const blocks: BlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // Code blocks
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'codeblock', text: codeLines.join('\n') });
      continue;
    }

    // List item (ordered or unordered, with potential indentation)
    const listMatch = /^(\s*)([*•+-]|\d+\.)\s+(.*)$/.exec(rawLine);
    if (listMatch) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const line = lines[i];
        const match = /^(\s*)([*•+-]|\d+\.)\s+(.*)$/.exec(line);
        if (!match) break;
        const indent = match[1].length;
        const marker = match[2];
        const content = match[3];
        const isOrdered = /^\d+\./.test(marker);
        const orderNum = isOrdered ? parseInt(marker, 10) : undefined;

        items.push({
          level: Math.floor(indent / 2),
          isOrdered,
          orderNumber: orderNum,
          text: content,
        });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Normal paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      const current = lines[i].trim();
      if (
        current.startsWith('#') ||
        current.startsWith('>') ||
        current.startsWith('```') ||
        /^(\s*)([*•+-]|\d+\.)\s+/.test(lines[i])
      ) {
        break;
      }
      paraLines.push(current);
      i++;
    }
    blocks.push({ type: 'p', text: paraLines.join(' ') });
  }

  return blocks;
}

function InlineContent({ text }: { text: string }) {
  const tokens = parseInlineMarkdown(text);
  return (
    <>
      {tokens.map((token, idx) => {
        switch (token.type) {
          case 'bold-italic':
            return (
              <strong key={idx}>
                <em>{token.text}</em>
              </strong>
            );
          case 'bold':
            return <strong key={idx}>{token.text}</strong>;
          case 'italic':
            return <em key={idx}>{token.text}</em>;
          case 'code':
            return <code key={idx} className="msg-inline-code">{token.text}</code>;
          case 'link':
            return (
              <a
                key={idx}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className="msg-link"
              >
                {token.text}
              </a>
            );
          case 'text':
          default:
            return <React.Fragment key={idx}>{token.text}</React.Fragment>;
        }
      })}
    </>
  );
}

export function FormattedMessage({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="formatted-message">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h1':
            return (
              <h2 key={idx} className="msg-h1">
                <InlineContent text={block.text} />
              </h2>
            );
          case 'h2':
            return (
              <h3 key={idx} className="msg-h2">
                <InlineContent text={block.text} />
              </h3>
            );
          case 'h3':
            return (
              <h4 key={idx} className="msg-h3">
                <InlineContent text={block.text} />
              </h4>
            );
          case 'blockquote':
            return (
              <blockquote key={idx} className="msg-blockquote">
                <InlineContent text={block.text} />
              </blockquote>
            );
          case 'codeblock':
            return (
              <pre key={idx} className="msg-codeblock">
                <code>{block.text}</code>
              </pre>
            );
          case 'list': {
            const isAllOrdered = block.items.every((it) => it.isOrdered);
            const ListTag = isAllOrdered ? 'ol' : 'ul';
            return (
              <ListTag key={idx} className={`msg-list ${isAllOrdered ? 'ordered' : 'unordered'}`}>
                {block.items.map((item, itemIdx) => (
                  <li
                    key={itemIdx}
                    className={`msg-list-item level-${item.level}`}
                    style={item.level > 0 ? { marginLeft: `${item.level * 18}px` } : undefined}
                  >
                    <InlineContent text={item.text} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case 'p':
          default:
            return (
              <p key={idx} className="msg-paragraph">
                <InlineContent text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
