import { escapeHtml, setSafeHtml } from '../../utils/sanitize';
import { NotionTable } from './notion-table';

export function createTableHtml(rows = 3, cols = 3): string {
  return NotionTable.createDefaultHtml(rows, cols);
}

export function createTableFromMarkdown(tableLines: string[]): string {
  return NotionTable.fromMarkdownLines(tableLines);
}

export function createToggleBlockHtml(
  title = 'Clique para expandir',
  content = 'Conteúdo oculto...',
  inlineParser?: (text: string) => string,
): string {
  const parsedContent = inlineParser ? inlineParser(content) : escapeHtml(content);
  return `
    <details class="notion-toggle" open>
      <summary>
        <span class="notion-toggle-summary-text" contenteditable="true">${escapeHtml(title)}</span>
      </summary>
      <div class="notion-toggle-content" contenteditable="true">
        <p>${parsedContent}</p>
      </div>
    </details>
  `;
}

export function createCalloutBlockHtml(
  type = 'note',
  content = 'Insira o contexto aqui...',
  inlineParser?: (text: string) => string,
): string {
  const iconMap: Record<string, string> = {
    note: 'info',
    tip: 'check_circle',
    warning: 'warning',
    danger: 'error',
  };
  const icon = iconMap[type] || 'info';
  const parsedContent = inlineParser ? inlineParser(content) : escapeHtml(content);

  return `
    <div class="notion-callout" data-type="${type}" contenteditable="false">
      <span class="notion-callout-icon material-symbols-outlined icon-sm" title="Clique para alternar tipo de alerta">${icon}</span>
      <div class="notion-callout-content" contenteditable="true">${parsedContent}</div>
    </div>
  `;
}

export function createTodoItemHtml(
  text = 'Nova tarefa',
  isChecked = false,
  indent = 0,
  inlineParser?: (text: string) => string,
): string {
  const indentAttr =
    indent > 0
      ? ` data-indent="${indent}" style="margin-left: ${indent * 24}px"`
      : '';
  const parsedText = inlineParser ? inlineParser(text) : escapeHtml(text);
  return `
    <div class="notion-todo-item ${isChecked ? 'checked' : ''}"${indentAttr} contenteditable="false">
      <input type="checkbox" class="notion-todo-checkbox" ${isChecked ? 'checked' : ''} />
      <span class="notion-todo-text" contenteditable="true">${parsedText}</span>
    </div>
  `;
}

export function createCodeBlockHtml(
  lang = 'javascript',
  code = '// Código aqui',
): string {
  return `
    <div class="notion-code-block" contenteditable="false">
      <div class="notion-code-header">
        <span class="notion-code-lang">${escapeHtml(lang)}</span>
        <button type="button" class="btn-code-copy">Copiar</button>
      </div>
      <pre class="notion-code-content" contenteditable="true"><code>${escapeHtml(code)}</code></pre>
    </div>
  `;
}

export function createMermaidBlockHtml(
  code = 'flowchart TD\n  A[Início] --> B[Processo]\n  B --> C[Fim]',
): string {
  const id = `mermaid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return `
    <div class="notion-mermaid-block" id="${id}" data-mermaid-code="${escapeHtml(code)}" contenteditable="false">
      <div class="notion-mermaid-header">
        <div class="notion-mermaid-title">
          <span class="material-symbols-outlined icon-xs">schema</span>
          <span>Diagrama Mermaid</span>
        </div>
        <div class="notion-mermaid-actions">
          <button type="button" class="btn-mermaid-action btn-toggle-mermaid-editor">Ver Código</button>
          <button type="button" class="btn-mermaid-action btn-copy-mermaid">Copiar</button>
          <button type="button" class="btn-mermaid-action btn-refresh-mermaid">Renderizar</button>
        </div>
      </div>
      <div class="notion-mermaid-render">
        <span style="color:#94a3b8; font-size:12px;">Renderizando diagrama...</span>
      </div>
      <div class="notion-mermaid-editor">
        <textarea class="notion-mermaid-textarea" spellcheck="false">${escapeHtml(code)}</textarea>
      </div>
    </div>
  `;
}

export function findTopLevelBlock(
  node: Node | null,
  canvas: HTMLElement,
): HTMLElement | null {
  let current = node as HTMLElement | null;
  while (current && current.parentElement && current.parentElement !== canvas) {
    current = current.parentElement;
  }
  return current;
}

export function toggleCalloutType(calloutEl: HTMLElement | null): void {
  if (!calloutEl) return;
  const types = ['note', 'tip', 'warning', 'danger'];
  const current = calloutEl.dataset.type || 'note';
  const nextIdx = (types.indexOf(current) + 1) % types.length;
  const nextType = types[nextIdx];

  calloutEl.dataset.type = nextType;
  const iconSpan = calloutEl.querySelector('.notion-callout-icon');
  if (iconSpan) {
    const iconMap: Record<string, string> = {
      note: 'info',
      tip: 'check_circle',
      warning: 'warning',
      danger: 'error',
    };
    iconSpan.textContent = iconMap[nextType] || 'info';
  }
}

export function turnBlockInto(
  block: HTMLElement,
  type: string,
  callbacks: {
    attachInteractiveListeners: () => void;
    placeCursorIn: (el: HTMLElement) => void;
    recordChange: () => void;
  },
): void {
  const text = block.textContent?.trim() || '';
  let newEl: HTMLElement | null = null;

  if (type === 'h1') newEl = document.createElement('h1');
  else if (type === 'h2') newEl = document.createElement('h2');
  else if (type === 'h3') newEl = document.createElement('h3');
  else if (type === 'p') newEl = document.createElement('p');
  else if (type === 'quote') newEl = document.createElement('blockquote');
  else if (type === 'todo') {
    const div = document.createElement('div');
    setSafeHtml(div, createTodoItemHtml(text || 'Nova tarefa'));
    newEl = div.firstElementChild as HTMLElement;
  } else if (type === 'callout') {
    const div = document.createElement('div');
    setSafeHtml(div, createCalloutBlockHtml('note', text || 'Nota de destaque...'));
    newEl = div.firstElementChild as HTMLElement;
  } else if (type === 'code') {
    const div = document.createElement('div');
    setSafeHtml(div, createCodeBlockHtml('javascript', text || '// Código'));
    newEl = div.firstElementChild as HTMLElement;
  }

  if (newEl && !['todo', 'callout', 'code'].includes(type)) {
    newEl.textContent = text || '';
    if (!newEl.innerHTML) newEl.innerHTML = '<br>';
  }

  if (newEl) {
    block.replaceWith(newEl);
    callbacks.attachInteractiveListeners();
    callbacks.placeCursorIn(newEl);
    callbacks.recordChange();
  }
}
