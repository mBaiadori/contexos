import { isSafeUrl, escapeHtml, sanitizeHtml } from '../../utils/sanitize';
import {
  createTableFromMarkdown,
  createToggleBlockHtml,
  createCalloutBlockHtml,
  createTodoItemHtml,
  createCodeBlockHtml,
  createMermaidBlockHtml,
} from './notion-editor-blocks';

export function parseInlineMarkdown(text: string): string {
  if (!text) return '<br>';

  // 1. Pass: Tokenizar trechos de código inline `...`
  const codeTokens: string[] = [];
  let processed = text.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00CODE_${idx}\x00`;
  });

  // 2. Pass: Tokenizar links [label](url) com suporte a parênteses balanceados na URL
  const linkTokens: string[] = [];
  let linkProcessed = '';
  let i = 0;
  while (i < processed.length) {
    if (processed[i] === '[') {
      const labelClose = processed.indexOf(']', i + 1);
      if (labelClose !== -1 && processed[labelClose + 1] === '(') {
        const rawLabel = processed.substring(i + 1, labelClose);
        let depth = 1;
        let j = labelClose + 2;
        while (j < processed.length && depth > 0) {
          if (processed[j] === '(') depth++;
          else if (processed[j] === ')') depth--;
          j++;
        }
        if (depth === 0) {
          const rawHref = processed.substring(labelClose + 2, j - 1);
          const tokenIdx = linkTokens.length;

          const cleanLabel =
            (rawLabel || '').replace(/^description(?=[a-zA-Z0-9_\sÀ-ÿ])/i, '').trim() ||
            rawLabel;
          const trimmedHref = (rawHref || '').trim();
          const safeTargetHref = isSafeUrl(trimmedHref) ? escapeHtml(trimmedHref) : '#';
          const isExternal =
            /^[a-z][a-z0-9+.-]*:/i.test(trimmedHref) || trimmedHref.startsWith('//');
          const isDoc =
            !isExternal &&
            !trimmedHref.startsWith('//') &&
            (trimmedHref.endsWith('.md') ||
              trimmedHref.includes('.md#') ||
              trimmedHref.startsWith('#') ||
              trimmedHref.includes(':~:text='));

          const formattedLabel = escapeHtml(cleanLabel);
          const linkHtml = `<a href="${safeTargetHref}" class="${isDoc ? 'notion-doc-link' : ''}" target="${isDoc ? '_self' : '_blank'}"${!isDoc ? ' rel="noopener noreferrer"' : ''}>${formattedLabel}</a>`;
          linkTokens.push(linkHtml);
          linkProcessed += `\x00LINK_${tokenIdx}\x00`;
          i = j;
          continue;
        }
      }
    }
    linkProcessed += processed[i];
    i++;
  }
  processed = linkProcessed;

  // 3. Pass: Escapar HTML nos fragmentos de texto comuns fora de tokens
  processed = escapeHtml(processed);

  // 4. Pass: Formatação inline sobre o texto já escapado
  // Negrito **texto**
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Tachado ~~texto~~
  processed = processed.replace(/~~(.*?)~~/g, '<s>$1</s>');
  // Itálico *texto* (protege expressões aritméticas como 2*3*4)
  processed = processed.replace(
    /(^|[^\w\\])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?=[^\w\\]|$)/g,
    '$1<em>$2</em>',
  );

  // 5. Pass: Restaurar tokens de links e código
  processed = processed.replace(
    /\x00LINK_(\d+)\x00/g,
    (_m, id) => linkTokens[Number(id)],
  );
  processed = processed.replace(
    /\x00CODE_(\d+)\x00/g,
    (_m, id) => codeTokens[Number(id)],
  );

  return processed;
}

export function parseListBlock(
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const listLines: { indent: number; type: 'ul' | 'ol'; text: string }[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.match(/^(\s*)[-*+•–—]\s+\[([ xX])\]\s+/)) {
      break;
    }
    const match = line.match(/^(\s*)([-*+•–—]|\d+\.)\s+(.*)$/);
    if (!match) {
      break;
    }
    const indent = match[1].length;
    const marker = match[2];
    const type: 'ul' | 'ol' = /^\d+\./.test(marker) ? 'ol' : 'ul';
    const text = match[3];
    listLines.push({ indent, type, text });
    i++;
  }

  if (listLines.length === 0) {
    return { html: '', nextIndex: startIndex };
  }

  const stack: { type: 'ul' | 'ol'; indent: number; hasOpenLi: boolean }[] = [];
  let result = '';

  for (const item of listLines) {
    if (stack.length === 0) {
      stack.push({ type: item.type, indent: item.indent, hasOpenLi: true });
      result += `<${item.type}><li>${parseInlineMarkdown(item.text)}`;
    } else {
      const top = stack[stack.length - 1];

      if (item.indent > top.indent) {
        stack.push({ type: item.type, indent: item.indent, hasOpenLi: true });
        result += `<${item.type}><li>${parseInlineMarkdown(item.text)}`;
      } else if (item.indent < top.indent) {
        while (stack.length > 1 && stack[stack.length - 1].indent > item.indent) {
          const popped = stack.pop()!;
          result += `</li></${popped.type}>`;
        }
        const currentTop = stack[stack.length - 1];
        if (currentTop.hasOpenLi) {
          result += `</li>`;
        }
        currentTop.hasOpenLi = true;
        result += `<li>${parseInlineMarkdown(item.text)}`;
      } else {
        if (top.type === item.type) {
          result += `</li><li>${parseInlineMarkdown(item.text)}`;
        } else {
          stack.pop();
          result += `</li></${top.type}><${item.type}><li>${parseInlineMarkdown(item.text)}`;
          stack.push({ type: item.type, indent: item.indent, hasOpenLi: true });
        }
      }
    }
  }

  while (stack.length > 0) {
    const popped = stack.pop()!;
    result += `</li></${popped.type}>`;
  }

  return { html: result, nextIndex: i };
}

export function parseMarkdownLinesToHtml(lines: string[]): string {
  const htmlFragments: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Mermaid Code Block
    if (line.trim().startsWith('```mermaid')) {
      let code = '';
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code += lines[i] + '\n';
        i++;
      }
      i++;
      htmlFragments.push(createMermaidBlockHtml(code.trim()));
      continue;
    }

    // 2. Generic Code Block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().replace(/^```/, '').trim() || 'text';
      let code = '';
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code += lines[i] + '\n';
        i++;
      }
      i++;
      htmlFragments.push(createCodeBlockHtml(lang, code.trim()));
      continue;
    }

    // 3. Dropdown / Toggle List
    if (line.trim().startsWith('<details') || line.trim().startsWith('<details>')) {
      let toggleContent = '';
      let summaryTitle = 'Seção Expansível';
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('</details>')) {
        const sumMatch = lines[i].match(/<summary>(.*?)<\/summary>/i);
        if (sumMatch) {
          summaryTitle = sumMatch[1].trim();
        } else {
          toggleContent += lines[i] + '\n';
        }
        i++;
      }
      i++;
      htmlFragments.push(
        createToggleBlockHtml(summaryTitle, toggleContent.trim(), parseInlineMarkdown),
      );
      continue;
    }

    // 4. Callout / Alert Box (> [!NOTE], > [!NOTA], > [!TIP], etc.)
    const calloutMatch = line.match(/^>\s*\[!\s*([a-zA-ZÀ-ÿ0-9_-]+)\s*\](?:\s*(.*))?$/i);
    if (calloutMatch) {
      const rawType = calloutMatch[1]
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      let type = 'note';
      if (['tip', 'dica', 'success', 'sucesso'].includes(rawType)) type = 'tip';
      else if (
        [
          'warning',
          'aviso',
          'atencao',
          'important',
          'importante',
          'caution',
          'cuidado',
        ].includes(rawType)
      )
        type = 'warning';
      else if (['danger', 'perigo'].includes(rawType)) type = 'danger';

      const calloutLines: string[] = [];
      if (calloutMatch[2] && calloutMatch[2].trim()) {
        calloutLines.push(calloutMatch[2].trim());
      }
      i++;
      while (i < lines.length && lines[i].startsWith('>')) {
        calloutLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const calloutBody = calloutLines.join('\n');
      htmlFragments.push(
        createCalloutBlockHtml(type, calloutBody.trim(), parseInlineMarkdown),
      );
      continue;
    }

    // 4.1. Admonition Container (:::note, :::tip, etc.)
    const containerMatch = line.match(/^:::\s*([a-zA-ZÀ-ÿ0-9_-]+)(?:\s+(.*))?$/i);
    if (containerMatch) {
      const rawType = containerMatch[1]
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      let type = 'note';
      if (['tip', 'dica', 'success', 'sucesso'].includes(rawType)) type = 'tip';
      else if (
        [
          'warning',
          'aviso',
          'atencao',
          'important',
          'importante',
          'caution',
          'cuidado',
        ].includes(rawType)
      )
        type = 'warning';
      else if (['danger', 'perigo'].includes(rawType)) type = 'danger';

      const containerLines: string[] = [];
      if (containerMatch[2] && containerMatch[2].trim()) {
        containerLines.push(containerMatch[2].trim());
      }
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(':::')) {
        containerLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith(':::')) {
        i++;
      }
      const containerBody = containerLines.join('\n');
      htmlFragments.push(
        createCalloutBlockHtml(type, containerBody.trim(), parseInlineMarkdown),
      );
      continue;
    }

    // 5. GFM Table
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        htmlFragments.push(createTableFromMarkdown(tableLines));
        continue;
      } else {
        i -= tableLines.length;
      }
    }

    // 6. To-Do Checklist (- [ ] , - [x] , * [ ] , – [ ])
    const todoMatch = line.match(/^(\s*)[-*+–—]\s*\[([ xX]?)\]\s*(.*)$/);
    if (todoMatch) {
      const indentSpaces = todoMatch[1].length;
      const indentLevel = Math.floor(indentSpaces / 2);
      const isChecked = todoMatch[2].toLowerCase() === 'x';
      const text = todoMatch[3];
      htmlFragments.push(
        createTodoItemHtml(text, isChecked, indentLevel, parseInlineMarkdown),
      );
      i++;
      continue;
    }

    // 7. Headings
    const h1Match = line.match(/^#\s+(.*)$/);
    if (h1Match) {
      htmlFragments.push(`<h1>${parseInlineMarkdown(h1Match[1])}</h1>`);
      i++;
      continue;
    }
    const h2Match = line.match(/^##\s+(.*)$/);
    if (h2Match) {
      htmlFragments.push(`<h2>${parseInlineMarkdown(h2Match[1])}</h2>`);
      i++;
      continue;
    }
    const h3Match = line.match(/^###\s+(.*)$/);
    if (h3Match) {
      htmlFragments.push(`<h3>${parseInlineMarkdown(h3Match[1])}</h3>`);
      i++;
      continue;
    }
    const h4Match = line.match(/^####\s+(.*)$/);
    if (h4Match) {
      htmlFragments.push(`<h4>${parseInlineMarkdown(h4Match[1])}</h4>`);
      i++;
      continue;
    }

    // 8. Horizontal Rule
    if (line.match(/^(\*{3,}|-{3,}|_{3,})$/)) {
      htmlFragments.push('<hr>');
      i++;
      continue;
    }

    // 9. Blockquote / Card Container
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const innerHtml = parseMarkdownLinesToHtml(quoteLines);
      htmlFragments.push(`<blockquote>${innerHtml}</blockquote>`);
      continue;
    }

    // 10. Listas com Bullets ou Numeradas
    const listMatch = line.match(/^(\s*)([-*+•–—]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const { html, nextIndex } = parseListBlock(lines, i);
      if (html) {
        htmlFragments.push(html);
        i = nextIndex;
        continue;
      }
    }

    // 12. Empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // 13. Regular Paragraph
    htmlFragments.push(`<p>${parseInlineMarkdown(line)}</p>`);
    i++;
  }

  if (htmlFragments.length === 0) {
    return '<p><br></p>';
  }

  return sanitizeHtml(htmlFragments.join('\n'));
}

export function serializeNode(node: Node | null): string {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';

    if (
      el.classList.contains('material-symbols-outlined') ||
      el.classList.contains('notion-icon') ||
      el.classList.contains('icon-xs') ||
      el.classList.contains('icon-sm') ||
      tag === 'svg'
    ) {
      return '';
    }

    if (tag === 'strong' || tag === 'b') {
      return `**${serializeInline(el)}**`;
    } else if (tag === 'em' || tag === 'i') {
      return `*${serializeInline(el)}*`;
    } else if (tag === 's' || tag === 'strike') {
      return `~~${serializeInline(el)}~~`;
    } else if (tag === 'code') {
      return `\`${el.textContent || ''}\``;
    } else if (tag === 'a') {
      const href = el.getAttribute('href') || '#';
      let label = serializeInline(el);
      label = label.replace(/^description(?=[a-zA-Z0-9_\sÀ-ÿ])/i, '').trim() || label;
      return `[${label}](${href})`;
    } else if (tag === 'br') {
      return '\n';
    } else {
      return serializeInline(el);
    }
  }
  return '';
}

export function serializeInline(element: HTMLElement | null): string {
  if (!element) return '';
  let result = '';
  element.childNodes.forEach((child) => {
    result += serializeNode(child);
  });
  return result;
}

export function serializeTable(wrapper: HTMLElement): string {
  const table = wrapper.querySelector('table');
  if (!table) return '';

  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const mdLines: string[] = [];
  rows.forEach((tr, rIdx) => {
    const cells = Array.from(tr.querySelectorAll('th, td')) as HTMLElement[];
    const rowStr = '| ' + cells.map((c) => serializeInline(c).trim() || ' ').join(' | ') + ' |';
    mdLines.push(rowStr);

    if (rIdx === 0) {
      const sepStr = '| ' + cells.map(() => '---').join(' | ') + ' |';
      mdLines.push(sepStr);
    }
  });

  return mdLines.join('\n');
}

export function serializeToggle(toggle: HTMLElement): string {
  const summary = toggle.querySelector('summary');
  const title = summary
    ? (
        summary.querySelector('.notion-toggle-summary-text')?.textContent ||
        summary.textContent ||
        'Seção'
      ).trim()
    : 'Seção';
  const content = (toggle.querySelector('.notion-toggle-content') || toggle) as HTMLElement;
  const body = serializeInline(content).trim();

  return `<details>\n<summary>${title}</summary>\n\n${body}\n</details>`;
}

export function serializeCallout(callout: HTMLElement): string {
  const type = (callout.dataset.type || 'note').toUpperCase();
  const content = (callout.querySelector('.notion-callout-content') || callout) as HTMLElement;
  const body = serializeInline(content).trim();
  const lines = body.split('\n');

  return `> [!${type}]\n` + lines.map((l) => `> ${l}`).join('\n');
}

export function serializeBlockquote(blockquote: HTMLElement): string {
  const lines: string[] = [];
  const children = Array.from(blockquote.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) lines.push(`> ${text}`);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName ? el.tagName.toLowerCase() : '';

      if (tag === 'h1') lines.push(`> # ${serializeInline(el)}`);
      else if (tag === 'h2') lines.push(`> ## ${serializeInline(el)}`);
      else if (tag === 'h3') lines.push(`> ### ${serializeInline(el)}`);
      else if (tag === 'h4') lines.push(`> #### ${serializeInline(el)}`);
      else if (tag === 'p') {
        const text = serializeInline(el).trim();
        lines.push(text ? `> ${text}` : '>');
      } else if (tag === 'ul' || tag === 'ol') {
        const listLines = serializeList(el, 0);
        listLines.forEach((l) => lines.push(`> ${l}`));
      } else if (tag === 'hr') {
        lines.push('> ---');
      } else if (el.classList.contains('notion-code-block')) {
        const lang = el.querySelector('.notion-code-lang')?.textContent?.trim() || '';
        const code = (el.querySelector('.notion-code-content') as HTMLElement)?.innerText || '';
        lines.push(`> \`\`\`${lang}`);
        code.split('\n').forEach((cLine) => lines.push(`> ${cLine}`));
        lines.push('> ```');
      } else {
        const text = serializeInline(el).trim();
        if (text) lines.push(`> ${text}`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : '> ';
}

export function serializeList(listEl: HTMLElement, depth = 0): string[] {
  const lines: string[] = [];
  const isOrdered = listEl.tagName.toLowerCase() === 'ol';
  const indent = '  '.repeat(depth);
  let idx = 1;

  const directLis = Array.from(listEl.children).filter(
    (c) => c.tagName && c.tagName.toLowerCase() === 'li',
  ) as HTMLElement[];

  for (const li of directLis) {
    let liText = '';
    const childLists: HTMLElement[] = [];

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'ul' || tag === 'ol') {
          childLists.push(el);
          continue;
        }
      }
      liText += serializeNode(child);
    }

    const prefix = isOrdered ? `${indent}${idx}. ` : `${indent}- `;
    lines.push(`${prefix}${liText.trim()}`);
    idx++;

    for (const childList of childLists) {
      const subLines = serializeList(childList, depth + 1);
      lines.push(...subLines);
    }
  }

  return lines;
}

export function serializeCanvasToMarkdown(canvas: HTMLElement): string {
  const lines: string[] = [];
  const children = Array.from(canvas.children) as HTMLElement[];

  for (const node of children) {
    if (
      node.classList &&
      (node.classList.contains('notion-inline-diff-card') ||
        node.classList.contains('not-prose'))
    ) {
      continue;
    }

    const tag = node.tagName ? node.tagName.toLowerCase() : '';

    if (tag === 'h1') {
      lines.push(`# ${serializeInline(node)}`);
      lines.push('');
    } else if (tag === 'h2') {
      lines.push(`## ${serializeInline(node)}`);
      lines.push('');
    } else if (tag === 'h3') {
      lines.push(`### ${serializeInline(node)}`);
      lines.push('');
    } else if (tag === 'h4') {
      lines.push(`#### ${serializeInline(node)}`);
      lines.push('');
    } else if (tag === 'p') {
      const text = serializeInline(node).trim();
      if (text) {
        lines.push(text);
        lines.push('');
      }
    } else if (tag === 'hr') {
      lines.push('---');
      lines.push('');
    } else if (tag === 'blockquote') {
      lines.push(serializeBlockquote(node));
      lines.push('');
    } else if (tag === 'ul' || tag === 'ol') {
      const listLines = serializeList(node, 0);
      lines.push(...listLines);
      lines.push('');
    } else if (
      node.classList.contains('notion-table-block') ||
      node.classList.contains('notion-table-wrapper')
    ) {
      lines.push(serializeTable(node));
      lines.push('');
    } else if (node.classList.contains('notion-toggle') || tag === 'details') {
      lines.push(serializeToggle(node));
      lines.push('');
    } else if (node.classList.contains('notion-callout')) {
      lines.push(serializeCallout(node));
      lines.push('');
    } else if (node.classList.contains('notion-todo-item')) {
      const chk = node.querySelector('.notion-todo-checkbox') as HTMLInputElement | null;
      const isChecked = chk ? chk.checked : false;
      const textEl = (node.querySelector('.notion-todo-text') || node) as HTMLElement;
      const text = serializeInline(textEl).trim();
      const indentLevel = parseInt(node.getAttribute('data-indent') || '0', 10);
      const indent = '  '.repeat(indentLevel);
      lines.push(`${indent}- [${isChecked ? 'x' : ' '}] ${text}`);
    } else if (node.classList.contains('notion-code-block')) {
      const langEl = node.querySelector('.notion-code-lang');
      const codeEl = (node.querySelector('.notion-code-content') ||
        node.querySelector('code')) as HTMLElement | null;
      const lang = langEl ? langEl.textContent?.trim().toLowerCase() : '';
      const code = codeEl ? codeEl.innerText : '';
      lines.push(`\`\`\`${lang}`);
      lines.push(code);
      lines.push('```');
      lines.push('');
    } else if (node.classList.contains('notion-mermaid-block')) {
      const textarea = node.querySelector(
        '.notion-mermaid-textarea',
      ) as HTMLTextAreaElement | null;
      const code = textarea
        ? textarea.value.trim()
        : node.dataset.mermaidCode || '';
      lines.push('```mermaid');
      lines.push(code);
      lines.push('```');
      lines.push('');
    } else {
      const text = serializeInline(node).trim();
      if (text) {
        lines.push(text);
        lines.push('');
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function convertHtmlToMarkdown(htmlString: string): string {
  if (typeof DOMParser === 'undefined' || !htmlString) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const body = doc.body;
    if (!body) return '';

    // Remover scripts, estilos e metadados
    body.querySelectorAll('style, script, meta, link, noscript').forEach((el) => el.remove());

    // Desembrulhar nós de contêiner redundantes (div, section, article)
    let root: HTMLElement = body;
    while (
      root.children.length === 1 &&
      root.firstElementChild &&
      ['div', 'section', 'article', 'main'].includes(
        root.firstElementChild.tagName.toLowerCase(),
      )
    ) {
      root = root.firstElementChild as HTMLElement;
    }

    const lines: string[] = [];
    const children = Array.from(root.childNodes);

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim();
        if (t) {
          lines.push(t);
          lines.push('');
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (/^h[1-6]$/.test(tag)) {
          const level = parseInt(tag.charAt(1), 10);
          lines.push(`${'#'.repeat(level)} ${serializeInline(el).trim()}`);
          lines.push('');
        } else if (tag === 'p') {
          const t = serializeInline(el).trim();
          if (t) {
            lines.push(t);
            lines.push('');
          }
        } else if (tag === 'ul' || tag === 'ol') {
          const listLines = serializeList(el, 0);
          lines.push(...listLines);
          lines.push('');
        } else if (tag === 'pre') {
          const codeEl = el.querySelector('code') || el;
          lines.push('```');
          lines.push((codeEl as HTMLElement).innerText || codeEl.textContent || '');
          lines.push('```');
          lines.push('');
        } else if (tag === 'blockquote') {
          lines.push(serializeBlockquote(el));
          lines.push('');
        } else if (tag === 'hr') {
          lines.push('---');
          lines.push('');
        } else if (tag === 'div') {
          if (el.querySelector('p, ul, ol, h1, h2, h3, h4, h5, h6, pre, blockquote')) {
            for (const sub of Array.from(el.childNodes)) {
              if (sub.nodeType === Node.ELEMENT_NODE) {
                const subEl = sub as HTMLElement;
                const subTag = subEl.tagName.toLowerCase();
                if (subTag === 'ul' || subTag === 'ol') {
                  lines.push(...serializeList(subEl, 0));
                  lines.push('');
                } else {
                  const t = serializeInline(subEl).trim();
                  if (t) {
                    lines.push(t);
                    lines.push('');
                  }
                }
              }
            }
          } else {
            const t = serializeInline(el).trim();
            if (t) {
              lines.push(t);
              lines.push('');
            }
          }
        } else {
          const t = serializeInline(el).trim();
          if (t) {
            lines.push(t);
            lines.push('');
          }
        }
      }
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    console.warn('[NotionEditorEngine] Erro ao converter HTML colado para Markdown:', err);
    return '';
  }
}
