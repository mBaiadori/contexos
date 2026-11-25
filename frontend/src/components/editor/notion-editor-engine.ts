// =============================================================================
// COMPONENT: NOTION-LIKE LIVE INTERACTIVE MARKDOWN EDITOR ENGINE (PRO NOTION UX)
// Side Block Handles ('+' e '⋮⋮'), Auto-formatação Markdown (#, ##, -, 1., []),
// Smart Backspace, Context Menu de Blocos, Tabelas, Callouts e Diagramas Mermaid.
// =============================================================================

import { SlashMenuEngine } from './slash-menu';
import { BubbleMenuEngine } from './bubble-menu';
import { NotionTable } from './notion-table';
import {
  parseTextFragmentUrl,
  findTextFragmentInElement,
  type TextFragmentQuery
} from '../../utils/text-fragment';
import {
  decorateHtmlWithTerms,
  stripDictionaryHighlightSpans,
  findDictionaryTerm
} from '../../utils/dictionary-matcher';
import type { DictionaryTerm } from '../../types';
import type { DictionaryPopoverData } from '../dictionary/DictionaryPopover';

import mermaid from 'mermaid';
import { isSafeUrl, sanitizeSvg, setSafeHtml, escapeHtml } from '../../utils/sanitize';
import {
  createTableHtml,
  createTableFromMarkdown,
  createToggleBlockHtml,
  createCalloutBlockHtml,
  createTodoItemHtml,
  createCodeBlockHtml,
  createMermaidBlockHtml,
  findTopLevelBlock,
  turnBlockInto,
  toggleCalloutType,
} from './notion-editor-blocks';
import {
  parseInlineMarkdown,
  parseListBlock,
  parseMarkdownLinesToHtml,
  serializeNode,
  serializeInline,
  serializeTable,
  serializeToggle,
  serializeCallout,
  serializeBlockquote,
  serializeList,
  serializeCanvasToMarkdown,
  convertHtmlToMarkdown,
} from './notion-editor-markdown';
import {
  indentListItem,
  outdentListItem,
  handleEnterInListItem,
  handleBackspaceInListItem,
  checkMarkdownInputRules,
} from './notion-editor-lists';

try {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  });
} catch (e) {
  console.warn('[NotionEditorEngine] Erro ao inicializar mermaid:', e);
}

export interface FragmentStatusInfo {
  type: 'not_found' | 'fuzzy_match';
  exact: string;
  prefix?: string;
  suffix?: string;
  currentFoundText?: string;
}

export class NotionEditorEngine {
  canvas: HTMLElement;
  filePath: string | null = null;
  onChange: () => void;
  onSave: () => void;
  onNavigateFile?: (path: string) => void;
  onSendSelectionToCopilot?: (text: string) => void;
  onToast?: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  onOpenLinkModal?: (defaultText: string, callback: (url: string, text: string) => void, initialUrl?: string) => void;
  onFragmentStatus?: (info: FragmentStatusInfo | null) => void;
  onShowDictionaryPopover?: (data: DictionaryPopoverData | null) => void;
  onAddDictionaryTerm?: (text: string) => void;
  onLinkSynonym?: (text: string) => void;
  dictionaryTerms: DictionaryTerm[] = [];
  private dictHoverTimer: ReturnType<typeof setTimeout> | null = null;
  private dictCurrentHoverEl: HTMLElement | null = null;

  undoStack: string[] = [];
  redoStack: string[] = [];
  isComposing = false;
  historyTimer: ReturnType<typeof setTimeout> | null = null;
  MAX_HISTORY = 150;

  slashMenu: SlashMenuEngine | null = null;
  bubbleMenu: BubbleMenuEngine | null = null;
  sideHandle: HTMLElement | null = null;
  blockMenu: HTMLElement | null = null;
  linkPopover: HTMLElement | null = null;
  activeAnchor: HTMLAnchorElement | null = null;
  dropIndicator: HTMLElement | null = null;
  hoveredBlock: HTMLElement | null = null;
  draggedBlock: HTMLElement | null = null;
  dropTargetBlock: HTMLElement | null = null;
  dropPosition: 'before' | 'after' = 'after';

  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnInput: (e: Event) => void;
  private boundOnPaste: (e: ClipboardEvent) => void;
  private boundOnClick: (e: MouseEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseLeave: (e: MouseEvent) => void;
  private boundOnDragOver: (e: DragEvent) => void;
  private boundOnDragLeave: (e: DragEvent) => void;
  private boundOnDrop: (e: DragEvent) => void;
  private boundDocClick: (e: MouseEvent) => void;

  constructor({
    canvasElement,
    filePath,
    onChange,
    onSave,
    onNavigateFile,
    onSendSelectionToCopilot,
    onToast,
    onOpenLinkModal,
    onFragmentStatus,
    onShowDictionaryPopover,
    onAddDictionaryTerm,
    onLinkSynonym,
    dictionaryTerms,
  }: {
    canvasElement: HTMLElement;
    filePath?: string | null;
    onChange?: () => void;
    onSave?: () => void;
    onNavigateFile?: (path: string) => void;
    onSendSelectionToCopilot?: (text: string) => void;
    onToast?: (msg: string, type?: 'info' | 'success' | 'warning') => void;
    onOpenLinkModal?: (defaultText: string, callback: (url: string, text: string) => void, initialUrl?: string) => void;
    onFragmentStatus?: (info: FragmentStatusInfo | null) => void;
    onShowDictionaryPopover?: (data: DictionaryPopoverData | null) => void;
    onAddDictionaryTerm?: (text: string) => void;
    onLinkSynonym?: (text: string) => void;
    dictionaryTerms?: DictionaryTerm[];
  }) {
    this.canvas = canvasElement;
    this.filePath = filePath || null;
    this.onChange = onChange || (() => {});
    this.onSave = onSave || (() => {});
    this.onNavigateFile = onNavigateFile;
    this.onSendSelectionToCopilot = onSendSelectionToCopilot;
    this.onToast = onToast;
    this.onOpenLinkModal = onOpenLinkModal;
    this.onFragmentStatus = onFragmentStatus;
    this.onShowDictionaryPopover = onShowDictionaryPopover;
    this.onAddDictionaryTerm = onAddDictionaryTerm;
    this.onLinkSynonym = onLinkSynonym;
    this.dictionaryTerms = dictionaryTerms || [];

    this.boundOnKeyDown = (e) => this.handleKeyDown(e);
    this.boundOnKeyUp = (e) => this.handleKeyUp(e);
    this.boundOnInput = (e) => this.handleInput(e);
    this.boundOnPaste = (e) => this.handlePaste(e);
    this.boundOnClick = (e) => this.handleClick(e);
    this.boundOnMouseMove = (e) => this.handleMouseMove(e);
    this.boundOnMouseLeave = (e) => this.handleMouseLeave(e);
    this.boundOnDragOver = (e) => this.handleDragOver(e);
    this.boundOnDragLeave = (e) => this.handleDragLeave(e);
    this.boundOnDrop = (e) => this.handleDrop(e);
    this.boundDocClick = (e) => {
      if (this.blockMenu && !this.blockMenu.contains(e.target as Node)) {
        this.blockMenu.style.display = 'none';
      }
      if (this.linkPopover && !this.linkPopover.contains(e.target as Node) && !(e.target as HTMLElement).closest('a')) {
        this.hideLinkPopover();
      }
    };

    this.init();
  }

  init() {
    this.canvas.setAttribute('contenteditable', 'true');
    this.canvas.setAttribute('spellcheck', 'false');
    this.canvas.classList.add('notion-canvas');

    // 1. Menus Flutuantes
    this.slashMenu = new SlashMenuEngine({
      container: this.canvas,
      dictionaryTerms: this.dictionaryTerms,
      onSelectCommand: (cmdId, targetRange) => this.handleSlashCommand(cmdId, targetRange)
    });

    this.bubbleMenu = new BubbleMenuEngine({
      container: this.canvas,
      getFilePath: () => this.filePath,
      onFormat: () => this.recordChange(),
      onOpenLinkModal: this.onOpenLinkModal,
      onAddDictionaryTerm: this.onAddDictionaryTerm,
      onLinkSynonym: this.onLinkSynonym,
      onAskCopilot: (text) => {
        if (this.onSendSelectionToCopilot) {
          this.onSendSelectionToCopilot(text);
        }
      },
      onCopyLink: () => {
        if (this.onToast) {
          this.onToast('Link resiliente do trecho copiado para a área de transferência!', 'success');
        }
      }
    });

    // 2. Side Handle e Menu de Contexto
    this.initSideHandles();
    this.initLinkPopover();

    // 3. Event Listeners
    this.canvas.addEventListener('keydown', this.boundOnKeyDown);
    this.canvas.addEventListener('keyup', this.boundOnKeyUp);
    this.canvas.addEventListener('input', this.boundOnInput);
    this.canvas.addEventListener('paste', this.boundOnPaste);
    this.canvas.addEventListener('click', this.boundOnClick);
    this.canvas.addEventListener('mousemove', this.boundOnMouseMove);
    this.canvas.addEventListener('mouseleave', this.boundOnMouseLeave);
    this.canvas.addEventListener('dragover', this.boundOnDragOver);
    this.canvas.addEventListener('dragleave', this.boundOnDragLeave);
    this.canvas.addEventListener('drop', this.boundOnDrop);
    document.addEventListener('click', this.boundDocClick);

    if (!this.canvas.innerHTML.trim()) {
      this.canvas.innerHTML = '<p><br></p>';
    }
  }

  initSideHandles() {
    this.sideHandle = document.createElement('div');
    this.sideHandle.className = 'notion-side-handle';
    this.sideHandle.style.display = 'none';
    this.sideHandle.innerHTML = `
      <button type="button" class="btn-side-handle" data-action="add-block" title="Adicionar bloco abaixo (+)">+</button>
      <button type="button" class="btn-side-handle" data-action="block-options" draggable="true" title="Arraste para mover ou clique para opções (⋮⋮)">⋮⋮</button>
    `;
    document.body.appendChild(this.sideHandle);

    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'notion-drop-indicator';
    this.dropIndicator.style.display = 'none';
    document.body.appendChild(this.dropIndicator);

    this.blockMenu = document.createElement('div');
    this.blockMenu.className = 'notion-block-menu';
    this.blockMenu.style.display = 'none';
    this.blockMenu.innerHTML = `
      <div class="block-menu-section">Ações do Bloco</div>
      <div class="block-menu-item" data-action="move-up"><span class="material-symbols-outlined icon-xs">arrow_upward</span> Mover para Cima</div>
      <div class="block-menu-item" data-action="move-down"><span class="material-symbols-outlined icon-xs">arrow_downward</span> Mover para Baixo</div>
      <div class="block-menu-item" data-action="duplicate"><span class="material-symbols-outlined icon-xs">content_copy</span> Duplicar Bloco</div>
      <div class="block-menu-item danger" data-action="delete"><span class="material-symbols-outlined icon-xs">delete</span> Excluir Bloco</div>
      <div class="block-menu-divider"></div>
      <div class="block-menu-section">Transformar em...</div>
      <div class="block-menu-item" data-turn="p"><span class="material-symbols-outlined icon-xs">notes</span> Texto Normal</div>
      <div class="block-menu-item" data-turn="h1"><span class="material-symbols-outlined icon-xs">format_h1</span> Título 1</div>
      <div class="block-menu-item" data-turn="h2"><span class="material-symbols-outlined icon-xs">format_h2</span> Título 2</div>
      <div class="block-menu-item" data-turn="h3"><span class="material-symbols-outlined icon-xs">format_h3</span> Título 3</div>
      <div class="block-menu-item" data-turn="todo"><span class="material-symbols-outlined icon-xs">check_box</span> Checklist</div>
      <div class="block-menu-item" data-turn="callout"><span class="material-symbols-outlined icon-xs">info</span> Caixa de Destaque</div>
      <div class="block-menu-item" data-turn="quote"><span class="material-symbols-outlined icon-xs">format_quote</span> Citação</div>
      <div class="block-menu-item" data-turn="code"><span class="material-symbols-outlined icon-xs">code</span> Bloco de Código</div>
    `;
    document.body.appendChild(this.blockMenu);

    const dragBtn = this.sideHandle.querySelector('[data-action="block-options"]') as HTMLElement | null;

    if (dragBtn) {
      dragBtn.addEventListener('dragstart', (e: DragEvent) => {
        if (!this.hoveredBlock) return;
        this.draggedBlock = this.hoveredBlock;
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', '');
          e.dataTransfer.effectAllowed = 'move';
        }
        this.hoveredBlock.style.opacity = '0.4';
        if (this.blockMenu) this.blockMenu.style.display = 'none';
      });

      dragBtn.addEventListener('dragend', () => {
        if (this.draggedBlock) {
          this.draggedBlock.style.opacity = '1';
          this.draggedBlock = null;
        }
        if (this.dropIndicator) this.dropIndicator.style.display = 'none';
      });

      dragBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.hoveredBlock || !this.sideHandle || !this.blockMenu) return;
        const rect = this.sideHandle.getBoundingClientRect();
        this.blockMenu.style.display = 'flex';
        const menuWidth = 230;
        const left = Math.min(rect.right + 6, window.innerWidth - menuWidth - 10);
        this.blockMenu.style.left = `${Math.max(10, left)}px`;
        this.blockMenu.style.top = `${rect.top}px`;
      });
    }

    this.sideHandle.querySelector('[data-action="add-block"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.hoveredBlock) return;
      const newP = document.createElement('p');
      newP.innerHTML = '<br>';
      this.hoveredBlock.insertAdjacentElement('afterend', newP);
      this.placeCursorIn(newP);
      if (this.slashMenu) this.slashMenu.openAtCaret('');
      this.recordChange();
    });

    this.sideHandle.addEventListener('mouseenter', () => {
      if (this.sideHandle) this.sideHandle.style.display = 'flex';
    });

    this.sideHandle.addEventListener('mouseleave', () => {
      setTimeout(() => {
        const isOverCanvas = this.canvas && this.canvas.matches(':hover');
        const isOverMenu = this.blockMenu && this.blockMenu.matches(':hover');
        if (!isOverCanvas && !isOverMenu && this.sideHandle) {
          this.sideHandle.style.display = 'none';
        }
      }, 60);
    });

    // Ações do Menu de Bloco
    this.blockMenu.querySelectorAll('.block-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = (item as HTMLElement).dataset.action;
        const turn = (item as HTMLElement).dataset.turn;
        if (this.blockMenu) this.blockMenu.style.display = 'none';

        if (!this.hoveredBlock) return;

        if (action === 'move-up') {
          const prev = this.hoveredBlock.previousElementSibling;
          if (prev) {
            prev.insertAdjacentElement('beforebegin', this.hoveredBlock);
            this.recordChange();
          }
        } else if (action === 'move-down') {
          const next = this.hoveredBlock.nextElementSibling;
          if (next) {
            next.insertAdjacentElement('afterend', this.hoveredBlock);
            this.recordChange();
          }
        } else if (action === 'delete') {
          this.hoveredBlock.remove();
          if (!this.canvas.children.length) this.canvas.innerHTML = '<p><br></p>';
          this.recordChange();
        } else if (action === 'duplicate') {
          const clone = this.hoveredBlock.cloneNode(true) as HTMLElement;
          this.hoveredBlock.insertAdjacentElement('afterend', clone);
          this.attachInteractiveListeners();
          this.recordChange();
        } else if (turn) {
          this.turnBlockInto(this.hoveredBlock, turn);
        }
      });
    });
  }

  initLinkPopover() {
    this.linkPopover = document.createElement('div');
    this.linkPopover.className = 'notion-link-popover';
    this.linkPopover.style.display = 'none';
    this.linkPopover.innerHTML = `
      <div class="link-popover-info">
        <span class="material-symbols-outlined link-popover-type-icon">description</span>
        <a class="link-popover-url-text" target="_blank" rel="noopener noreferrer"></a>
      </div>
      <div class="link-popover-divider"></div>
      <button type="button" class="link-popover-btn" data-action="open-link" title="Abrir / Navegar">
        <span class="material-symbols-outlined icon-xs">open_in_new</span>
        <span>Abrir</span>
      </button>
      <button type="button" class="link-popover-btn" data-action="edit-link" title="Editar texto ou destino do link">
        <span class="material-symbols-outlined icon-xs">edit</span>
        <span>Editar</span>
      </button>
      <button type="button" class="link-popover-btn" data-action="copy-link" title="Copiar endereço do link">
        <span class="material-symbols-outlined icon-xs">content_copy</span>
        <span>Copiar</span>
      </button>
      <button type="button" class="link-popover-btn danger" data-action="unlink" title="Remover link (manter texto)">
        <span class="material-symbols-outlined icon-xs">link_off</span>
        <span>Remover</span>
      </button>
    `;
    document.body.appendChild(this.linkPopover);

    this.linkPopover.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    this.linkPopover.querySelectorAll('.link-popover-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        if (!this.activeAnchor) return;

        if (action === 'open-link') {
          const href = this.activeAnchor.getAttribute('href') || '';
          this.hideLinkPopover();
          if (href.startsWith('http://') || href.startsWith('https://')) {
            window.open(href, '_blank');
          } else if (href.startsWith('#') || href.startsWith(':~:text=')) {
            this.scrollToFragment(href);
          } else {
            const hashIndex = href.indexOf('#');
            const linkFile = hashIndex !== -1 ? href.slice(0, hashIndex).replace(/^\.?\//, '') : href.replace(/^\.?\//, '');
            const hash = hashIndex !== -1 ? href.slice(hashIndex) : '';
            const currentFile = (this.filePath || '').replace(/^\.?\//, '');
            
            if (linkFile === currentFile || !linkFile) {
              if (hash) {
                this.scrollToFragment(hash);
              }
            } else if (this.onNavigateFile) {
              this.onNavigateFile(href);
            }
          }
        } else if (action === 'edit-link') {
          const anchor = this.activeAnchor;
          const href = anchor.getAttribute('href') || '';
          const currentText = anchor.textContent || '';
          this.hideLinkPopover();
          if (this.onOpenLinkModal) {
            this.onOpenLinkModal(currentText, (newUrl, newText) => {
              if (anchor && anchor.isConnected) {
                anchor.setAttribute('href', newUrl);
                anchor.textContent = newText || newUrl;
                const isDoc = newUrl.endsWith('.md') || newUrl.includes('.md#') || newUrl.includes(':~:text=');
                if (isDoc) {
                  anchor.classList.add('notion-doc-link');
                } else {
                  anchor.classList.remove('notion-doc-link');
                }
                this.recordChange();
                if (this.onToast) {
                  this.onToast('Link atualizado com sucesso!', 'success');
                }
              }
            }, href);
          }
        } else if (action === 'copy-link') {
          const href = this.activeAnchor.getAttribute('href') || '';
          if (href) {
            navigator.clipboard.writeText(href);
            if (this.onToast) {
              this.onToast('Link copiado para a área de transferência!', 'success');
            }
          }
          this.hideLinkPopover();
        } else if (action === 'unlink') {
          const anchor = this.activeAnchor;
          const textNode = document.createTextNode(anchor.textContent || '');
          anchor.parentNode?.replaceChild(textNode, anchor);
          this.hideLinkPopover();
          this.recordChange();
          if (this.onToast) {
            this.onToast('Link removido.', 'info');
          }
        }
      });
    });
  }

  showLinkPopover(anchor: HTMLAnchorElement) {
    if (!this.linkPopover) return;
    this.activeAnchor = anchor;
    const href = anchor.getAttribute('href') || '';
    const isDoc = href.endsWith('.md') || href.includes('.md#') || href.includes(':~:text=');
    
    const typeIcon = this.linkPopover.querySelector('.link-popover-type-icon') as HTMLElement | null;
    if (typeIcon) {
      typeIcon.textContent = isDoc ? 'description' : href.startsWith('http') ? 'public' : 'link';
    }

    const urlText = this.linkPopover.querySelector('.link-popover-url-text') as HTMLAnchorElement | null;
    if (urlText) {
      urlText.textContent = href;
      urlText.title = href;
      urlText.href = href;
    }

    this.linkPopover.style.display = 'flex';
    const rect = anchor.getBoundingClientRect();
    const popWidth = this.linkPopover.offsetWidth || 320;
    const left = Math.max(10, Math.min(rect.left + (rect.width / 2) - (popWidth / 2), window.innerWidth - popWidth - 10));
    
    let top = rect.bottom + 6;
    if (top + 45 > window.innerHeight && rect.top - 45 > 0) {
      top = rect.top - 45;
    }

    this.linkPopover.style.left = `${left}px`;
    this.linkPopover.style.top = `${top}px`;
  }

  hideLinkPopover() {
    if (this.linkPopover) {
      this.linkPopover.style.display = 'none';
    }
    this.activeAnchor = null;
  }

  handleMouseMove(e: MouseEvent) {
    if (this.draggedBlock) return;
    if (!this.canvas.offsetParent) {
      this.hideFloatingMenus();
      return;
    }

    // 1. Side Handles
    const block = this.findTopLevelBlock(e.target as Node);
    if (block && block !== this.canvas && this.sideHandle) {
      this.hoveredBlock = block;
      const rect = block.getBoundingClientRect();
      this.sideHandle.style.display = 'flex';
      this.sideHandle.style.left = `${rect.left - 54}px`;
      this.sideHandle.style.top = `${rect.top + 2}px`;
    }

    // 2. Dictionary Term Hover Popover
    const dictSpan = (e.target as HTMLElement)?.closest('.dict-term-highlight') as HTMLElement | null;
    if (dictSpan && this.onShowDictionaryPopover && this.dictionaryTerms && this.dictionaryTerms.length > 0) {
      if (this.dictCurrentHoverEl !== dictSpan) {
        this.dictCurrentHoverEl = dictSpan;
        if (this.dictHoverTimer) clearTimeout(this.dictHoverTimer);
        this.dictHoverTimer = setTimeout(() => {
          const termKey = dictSpan.getAttribute('data-term-key') || dictSpan.textContent || '';
          const match = findDictionaryTerm(termKey, this.dictionaryTerms);
          if (match) {
            const t = match.term;
            this.onShowDictionaryPopover?.({
              termId: t.id,
              term: t.term,
              codename: t.codename || t.code_name || '',
              domain: t.domain || t.category || '',
              definition: t.definition || '',
              synonyms: Array.isArray(t.synonyms) ? t.synonyms : t.aliases || [],
              rect: dictSpan.getBoundingClientRect(),
            });
          }
        }, 150);
      }
    } else {
      if (this.dictCurrentHoverEl) {
        this.dictCurrentHoverEl = null;
        if (this.dictHoverTimer) {
          clearTimeout(this.dictHoverTimer);
          this.dictHoverTimer = null;
        }
      }
    }
  }

  handleMouseLeave(_e: MouseEvent) {
    if (this.dictHoverTimer) {
      clearTimeout(this.dictHoverTimer);
      this.dictHoverTimer = null;
    }
    this.dictCurrentHoverEl = null;

    setTimeout(() => {
      const isOverHandle = this.sideHandle && this.sideHandle.matches(':hover');
      const isOverMenu = this.blockMenu && this.blockMenu.matches(':hover');
      if (!isOverHandle && !isOverMenu && this.sideHandle) {
        this.sideHandle.style.display = 'none';
      }
    }, 60);
  }

  handleDragOver(e: DragEvent) {
    if (!this.draggedBlock) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    const target = this.findTopLevelBlock(e.target as Node);
    if (target && target !== this.canvas && target !== this.draggedBlock && this.dropIndicator) {
      this.dropTargetBlock = target;
      const rect = target.getBoundingClientRect();
      const isUpperHalf = e.clientY < rect.top + rect.height / 2;
      this.dropPosition = isUpperHalf ? 'before' : 'after';

      this.dropIndicator.style.display = 'block';
      this.dropIndicator.style.left = `${rect.left}px`;
      this.dropIndicator.style.width = `${rect.width}px`;
      this.dropIndicator.style.top = isUpperHalf ? `${rect.top - 2}px` : `${rect.bottom - 1}px`;
    }
  }

  handleDragLeave(e: DragEvent) {
    if (!this.canvas.contains(e.relatedTarget as Node) && this.dropIndicator) {
      this.dropIndicator.style.display = 'none';
    }
  }

  handleDrop(e: DragEvent) {
    if (!this.draggedBlock || !this.dropTargetBlock) return;
    e.preventDefault();

    if (this.dropPosition === 'before') {
      this.dropTargetBlock.insertAdjacentElement('beforebegin', this.draggedBlock);
    } else {
      this.dropTargetBlock.insertAdjacentElement('afterend', this.draggedBlock);
    }

    if (this.dropIndicator) this.dropIndicator.style.display = 'none';
    this.draggedBlock.style.opacity = '1';
    this.draggedBlock = null;
    this.dropTargetBlock = null;
    this.recordChange();
  }

  handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Tratar clique em links para popover de edição/ações ou navegação direta com Ctrl/Cmd
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (anchor && this.canvas.contains(anchor)) {
      const href = anchor.getAttribute('href') || '';
      if (href) {
        if (e.ctrlKey || e.metaKey) {
          if (href.startsWith('http://') || href.startsWith('https://')) return;
          e.preventDefault();
          if (href.startsWith('#') || href.startsWith(':~:text=')) {
            this.scrollToFragment(href);
          } else {
            const hashIndex = href.indexOf('#');
            const linkFile = hashIndex !== -1 ? href.slice(0, hashIndex).replace(/^\.?\//, '') : href.replace(/^\.?\//, '');
            const hash = hashIndex !== -1 ? href.slice(hashIndex) : '';
            const currentFile = (this.filePath || '').replace(/^\.?\//, '');
            
            if (linkFile === currentFile || !linkFile) {
              if (hash) {
                this.scrollToFragment(hash);
              }
            } else if (this.onNavigateFile) {
              this.onNavigateFile(href);
            }
          }
          return;
        }

        // Clique normal abre o menu flutuante de ações do link (Abrir, Editar, Copiar, Remover)
        e.preventDefault();
        this.showLinkPopover(anchor);
        return;
      }
    }

    if (target.classList.contains('notion-todo-checkbox')) {
      const item = target.closest('.notion-todo-item') as HTMLElement | null;
      if (item) {
        item.classList.toggle('checked', (target as HTMLInputElement).checked);
        this.recordChange();
      }
    } else if (target.classList.contains('notion-callout-icon')) {
      this.toggleCalloutType(target.closest('.notion-callout') as HTMLElement | null);
    }
  }

  /**
   * Rola suavemente até o trecho especificado por um W3C TextFragment ou texto exato,
   * aplicando um efeito visual de destaque luminoso (pulsing highlight).
   */
  scrollToFragment(target: TextFragmentQuery | string, retryCount = 0): boolean {
    let query: TextFragmentQuery | null = null;
    if (typeof target === 'string') {
      query = parseTextFragmentUrl(target);
      if (!query) {
        const cleanText = target.replace(/^#/, '').replace(/^\/?/, '').trim();
        if (cleanText) {
          try {
            query = { exact: decodeURIComponent(cleanText).replace(/-/g, ' ') };
          } catch {
            query = { exact: cleanText.replace(/-/g, ' ') };
          }
        }
      }
    } else {
      query = target;
    }

    if (!query || !query.exact) return false;

    this.clearFragmentHighlights();

    const canvasText = (this.canvas.textContent || '').trim();
    if (!canvasText && retryCount < 3) {
      setTimeout(() => {
        this.scrollToFragment(target, retryCount + 1);
      }, 150);
      return false;
    }

    let match = findTextFragmentInElement(this.canvas, query);
    if (!match && retryCount < 2) {
      setTimeout(() => {
        const retryMatch = findTextFragmentInElement(this.canvas, query!);
        if (retryMatch) {
          this.applyFragmentMatch(retryMatch, query!);
        } else if (this.onFragmentStatus) {
          this.onFragmentStatus({
            type: 'not_found',
            exact: query!.exact,
            prefix: query!.prefix,
            suffix: query!.suffix
          });
        }
      }, 180);
      return false;
    }

    if (!match) {
      if (this.onFragmentStatus) {
        this.onFragmentStatus({
          type: 'not_found',
          exact: query.exact,
          prefix: query.prefix,
          suffix: query.suffix
        });
      }
      return false;
    }

    this.applyFragmentMatch(match, query);
    return true;
  }

  private applyFragmentMatch(match: { element: HTMLElement; range: Range; isExact: boolean }, query: TextFragmentQuery) {
    if (match.isExact) {
      if (this.onFragmentStatus) {
        this.onFragmentStatus(null);
      }
    } else {
      if (this.onFragmentStatus) {
        this.onFragmentStatus({
          type: 'fuzzy_match',
          exact: query.exact,
          prefix: query.prefix,
          suffix: query.suffix,
          currentFoundText: match.element.textContent?.trim()
        });
      }
    }

    // Rolagem suave até o elemento centralizando no viewport
    match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Aplicar destaque visual com classe CSS animada
    match.element.classList.add('notion-fragment-highlight-block');
    if (!match.isExact) {
      match.element.classList.add('is-fuzzy-match');
      match.element.setAttribute('data-fragment-note', 'Trecho localizado por aproximação');
    }

    setTimeout(() => {
      this.clearFragmentHighlights();
    }, 4500);
  }

  /**
   * Remove marcações de destaque de fragmentos
   */
  clearFragmentHighlights() {
    const highlightedBlocks = this.canvas.querySelectorAll('.notion-fragment-highlight-block, .is-fuzzy-match');
    highlightedBlocks.forEach(b => {
      b.classList.remove('notion-fragment-highlight-block', 'is-fuzzy-match');
      b.removeAttribute('data-fragment-note');
    });
  }

  hideFloatingMenus() {
    if (this.sideHandle) this.sideHandle.style.display = 'none';
    if (this.blockMenu) this.blockMenu.style.display = 'none';
    if (this.dropIndicator) this.dropIndicator.style.display = 'none';
    if (this.bubbleMenu) this.bubbleMenu.hide();
    if (this.slashMenu) this.slashMenu.hide();
    this.hideLinkPopover();
  }

  findTopLevelBlock(node: Node | null): HTMLElement | null {
    return findTopLevelBlock(node, this.canvas);
  }

  turnBlockInto(block: HTMLElement, type: string) {
    turnBlockInto(block, type, {
      attachInteractiveListeners: () => this.attachInteractiveListeners(),
      placeCursorIn: (el) => this.placeCursorIn(el),
      recordChange: () => this.recordChange(),
    });
  }

  toggleCalloutType(calloutEl: HTMLElement | null) {
    toggleCalloutType(calloutEl);
    this.recordChange();
  }

  parseListBlock(lines: string[], startIndex: number): { html: string; nextIndex: number } {
    return parseListBlock(lines, startIndex);
  }

  parseMarkdownLinesToHtml(lines: string[]): string {
    return parseMarkdownLinesToHtml(lines);
  }

  isFocused(): boolean {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    return !!(active && this.canvas && (this.canvas === active || this.canvas.contains(active)));
  }

  saveCursorPosition(): { blockIndex: number; offset: number } | null {
    if (typeof window === 'undefined') return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startContainer = range.startContainer;
    if (!this.canvas.contains(startContainer)) return null;

    let block: Node | null = startContainer;
    while (block && block.parentNode !== this.canvas) {
      block = block.parentNode;
    }
    if (!block) return null;

    const blockIndex = Array.from(this.canvas.children).indexOf(block as Element);
    if (blockIndex === -1) return null;

    let offset = 0;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode === startContainer) {
        offset += range.startOffset;
        break;
      }
      offset += currentNode.textContent?.length || 0;
      currentNode = walker.nextNode();
    }

    return { blockIndex, offset };
  }

  restoreCursorPosition(saved: { blockIndex: number; offset: number } | null) {
    if (!saved || typeof window === 'undefined') return;
    const blocks = Array.from(this.canvas.children);
    if (saved.blockIndex < 0 || saved.blockIndex >= blocks.length) return;
    const block = blocks[saved.blockIndex] as HTMLElement;
    if (!block) return;

    let currentOffset = 0;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    let currentNode = walker.nextNode();
    let targetNode: Node | null = null;
    let targetOffset = 0;

    while (currentNode) {
      const len = currentNode.textContent?.length || 0;
      if (currentOffset + len >= saved.offset) {
        targetNode = currentNode;
        targetOffset = saved.offset - currentOffset;
        break;
      }
      currentOffset += len;
      targetNode = currentNode;
      targetOffset = len;
      currentNode = walker.nextNode();
    }

    if (targetNode) {
      try {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) {}
    } else {
      this.placeCursorIn(block);
    }
  }

  setMarkdown(markdown = '', preserveCursor = false) {
    let savedCursor = null;
    if (preserveCursor) {
      savedCursor = this.saveCursorPosition();
    }

    if (!markdown.trim()) {
      this.canvas.innerHTML = '<p><br></p>';
      this.pushSnapshot(true);
      if (savedCursor) this.restoreCursorPosition(savedCursor);
      return;
    }

    const lines = markdown.split(/\r?\n/);
    setSafeHtml(this.canvas, this.parseMarkdownLinesToHtml(lines));
    this.applyDictionaryHighlights();
    this.renderAllMermaidBlocks();
    this.attachInteractiveListeners();
    this.pushSnapshot(true);

    if (savedCursor) {
      this.restoreCursorPosition(savedCursor);
    }

    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.includes(':~:text=')) {
        setTimeout(() => {
          this.scrollToFragment(hash);
        }, 180);
      }
    }
  }

  // ===========================================================================
  // DOM TO MARKDOWN (SERIALIZER)
  // ===========================================================================

  serializeBlockquote(blockquote: HTMLElement): string {
    return serializeBlockquote(blockquote);
  }

  serializeList(listEl: HTMLElement, depth = 0): string[] {
    return serializeList(listEl, depth);
  }

  getMarkdown(): string {
    return serializeCanvasToMarkdown(this.canvas);
  }

  setDictionaryTerms(terms: DictionaryTerm[]) {
    this.dictionaryTerms = terms || [];
    if (this.slashMenu) {
      this.slashMenu.setDictionaryTerms(this.dictionaryTerms);
    }
    this.applyDictionaryHighlights();
  }

  applyDictionaryHighlights() {
    if (!this.dictionaryTerms || this.dictionaryTerms.length === 0 || !this.canvas) return;

    const targetElements = this.canvas.querySelectorAll<HTMLElement>(
      'p, h1, h2, h3, h4, h5, h6, blockquote, .notion-todo-text, .notion-callout-content, .notion-toggle-content'
    );

    targetElements.forEach((el) => {
      // Ignorar bloco focado para não interromper digitação ou mover o cursor
      if (document.activeElement === el || el.contains(document.activeElement)) {
        return;
      }
      const currentHtml = el.innerHTML;
      const cleanHtml = stripDictionaryHighlightSpans(currentHtml);
      const decorated = decorateHtmlWithTerms(cleanHtml, this.dictionaryTerms);
      if (decorated !== currentHtml) {
        setSafeHtml(el, decorated);
      }
    });
  }

  parseInlineMarkdown(text: string): string {
    return parseInlineMarkdown(text);
  }

  serializeNode(node: Node | null): string {
    return serializeNode(node);
  }

  serializeInline(element: HTMLElement | null): string {
    return serializeInline(element);
  }

  serializeTable(wrapper: HTMLElement): string {
    return serializeTable(wrapper);
  }

  serializeToggle(toggle: HTMLElement): string {
    return serializeToggle(toggle);
  }

  serializeCallout(callout: HTMLElement): string {
    return serializeCallout(callout);
  }

  createTableHtml(rows = 3, cols = 3): string {
    return createTableHtml(rows, cols);
  }

  createTableFromMarkdown(tableLines: string[]): string {
    return createTableFromMarkdown(tableLines);
  }

  createToggleBlockHtml(title = 'Clique para expandir', content = 'Conteúdo oculto...'): string {
    return createToggleBlockHtml(title, content, parseInlineMarkdown);
  }

  createCalloutBlockHtml(type = 'note', content = 'Insira o contexto aqui...'): string {
    return createCalloutBlockHtml(type, content, parseInlineMarkdown);
  }

  createTodoItemHtml(text = 'Nova tarefa', isChecked = false, indent = 0): string {
    return createTodoItemHtml(text, isChecked, indent, parseInlineMarkdown);
  }

  createCodeBlockHtml(lang = 'javascript', code = '// Código aqui'): string {
    return createCodeBlockHtml(lang, code);
  }

  createMermaidBlockHtml(code = 'flowchart TD\n  A[Início] --> B[Processo]\n  B --> C[Fim]'): string {
    return createMermaidBlockHtml(code);
  }

  // ===========================================================================
  // INTERACTIVE LISTENERS & MERMAID RENDERING
  // ===========================================================================

  attachInteractiveListeners() {
    this.canvas.querySelectorAll('.notion-table-block, .notion-table-wrapper').forEach(wrapper => {
      new NotionTable({
        wrapper: wrapper as HTMLElement,
        onChange: () => this.recordChange()
      });
    });

    this.canvas.querySelectorAll('.btn-code-copy').forEach(btn => {
      (btn as HTMLElement).onclick = (e) => {
        e.preventDefault();
        const codeEl = btn.closest('.notion-code-block')?.querySelector('.notion-code-content') as HTMLElement | null;
        if (codeEl) {
          navigator.clipboard.writeText(codeEl.innerText);
          btn.textContent = 'Copiado!';
          setTimeout(() => { btn.textContent = 'Copiar'; }, 1500);
        }
      };
    });

    this.canvas.querySelectorAll('.notion-mermaid-block').forEach(block => {
      const btnToggle = block.querySelector('.btn-toggle-mermaid-editor') as HTMLElement | null;
      const btnRefresh = block.querySelector('.btn-refresh-mermaid') as HTMLElement | null;
      const editorPanel = block.querySelector('.notion-mermaid-editor') as HTMLElement | null;
      const textarea = block.querySelector('.notion-mermaid-textarea') as HTMLTextAreaElement | null;

      if (btnToggle && editorPanel) {
        btnToggle.onclick = () => {
          const isHidden = editorPanel.style.display === 'none' || !editorPanel.style.display;
          editorPanel.style.display = isHidden ? 'block' : 'none';
          btnToggle.textContent = isHidden ? 'Fechar Editor' : 'Editar Código';
          if (isHidden && textarea) textarea.focus();
        };
      }

      if (btnRefresh && textarea) {
        btnRefresh.onclick = () => {
          (block as HTMLElement).dataset.mermaidCode = textarea.value.trim();
          this.renderMermaidBlock(block as HTMLElement);
          this.recordChange();
        };
      }
    });
  }

  async renderAllMermaidBlocks() {
    const blocks = Array.from(this.canvas.querySelectorAll('.notion-mermaid-block')) as HTMLElement[];
    for (const block of blocks) {
      await this.renderMermaidBlock(block);
    }
  }

  async renderMermaidBlock(block: HTMLElement) {
    if (typeof mermaid === 'undefined') return;
    const renderArea = block.querySelector('.notion-mermaid-render');
    const textarea = block.querySelector('.notion-mermaid-textarea') as HTMLTextAreaElement | null;
    const code = textarea ? textarea.value.trim() : (block.dataset.mermaidCode || '');

    if (!renderArea || !code) return;

    const renderId = `mermaid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    try {
      const { svg } = await mermaid.render(renderId, code);
      renderArea.innerHTML = sanitizeSvg(svg);
    } catch (e: unknown) {
      // Remove any stray error elements mermaid might append to body
      const strayErr = document.getElementById(`d${renderId}`);
      if (strayErr) strayErr.remove();

      renderArea.innerHTML = `
        <div style="color:#ef4444; font-size:12px; padding:12px; display:flex; align-items:center; gap:6px; background:#fef2f2; border-radius:6px; border:1px solid #fecaca;">
          <span class="material-symbols-outlined icon-xs">warning</span>
          <span>Erro na sintaxe Mermaid: ${escapeHtml(e instanceof Error ? e.message : String(e))}</span>
        </div>
      `;
    }
  }

  indentListItem(li: HTMLElement): boolean {
    return indentListItem(li, {
      placeCursorIn: (el) => this.placeCursorIn(el),
      recordChange: () => this.recordChange(),
    });
  }

  outdentListItem(li: HTMLElement): boolean {
    return outdentListItem(li, {
      canvas: this.canvas,
      placeCursorIn: (el) => this.placeCursorIn(el),
      recordChange: () => this.recordChange(),
    });
  }

  handleEnterInListItem(li: HTMLElement, e: KeyboardEvent): boolean {
    return handleEnterInListItem(li, e, {
      canvas: this.canvas,
      placeCursorIn: (el) => this.placeCursorIn(el),
      recordChange: () => this.recordChange(),
    });
  }

  handleBackspaceInListItem(li: HTMLElement, e: KeyboardEvent): boolean {
    return handleBackspaceInListItem(li, e, {
      canvas: this.canvas,
      placeCursorIn: (el) => this.placeCursorIn(el),
      recordChange: () => this.recordChange(),
    });
  }

  // ===========================================================================
  // NOTION INPUT RULES
  // ===========================================================================

  handleKeyUp(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      this.checkMarkdownInputRules();
    }
  }

  checkMarkdownInputRules() {
    checkMarkdownInputRules({
      canvas: this.canvas,
      placeCursorIn: (el) => this.placeCursorIn(el),
      recordChange: () => this.recordChange(),
      turnBlockInto: (b, t) => this.turnBlockInto(b, t),
    });
  }

  // ===========================================================================
  // ATALHOS DE TECLADO & SMART BACKSPACE
  // ===========================================================================

  handleKeyDown(e: KeyboardEvent) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (this.slashMenu && this.slashMenu.isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.slashMenu.close(true);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.slashMenu.handleKeydown(e);
        return;
      }
    }

    if (e.key === 'Escape') {
      this.hideLinkPopover();
    }

    if (modifier && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      this.onSave();
      return;
    }

    if (modifier && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const selection = window.getSelection();
      let existingAnchor: HTMLAnchorElement | null = null;
      if (selection && selection.anchorNode) {
        const parentEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
          ? (selection.anchorNode as HTMLElement) 
          : selection.anchorNode.parentElement;
        existingAnchor = (parentEl?.closest('a') as HTMLAnchorElement) || null;
      }
      const initialUrl = existingAnchor ? existingAnchor.getAttribute('href') || '' : '';
      const selectedText = selection ? selection.toString().trim() : '';
      const initialText = selectedText || (existingAnchor ? existingAnchor.textContent || '' : '');
      const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

      if (this.onOpenLinkModal) {
        this.onOpenLinkModal(initialText, (newUrl, newText) => {
          const isDoc = newUrl.endsWith('.md') || newUrl.includes('.md#') || newUrl.includes(':~:text=') || newUrl.startsWith('#');
          if (existingAnchor && existingAnchor.isConnected) {
            existingAnchor.setAttribute('href', newUrl);
            existingAnchor.textContent = newText || newUrl;
            if (isDoc) {
              existingAnchor.classList.add('notion-doc-link');
              existingAnchor.target = '_self';
            } else {
              existingAnchor.classList.remove('notion-doc-link');
              existingAnchor.target = '_blank';
            }
          } else if (savedRange) {
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(savedRange);
            }
            const anchor = document.createElement('a');
            anchor.setAttribute('href', newUrl);
            if (isDoc) {
              anchor.className = 'notion-doc-link';
              anchor.target = '_self';
            } else {
              anchor.target = '_blank';
            }
            anchor.textContent = newText || newUrl;
            savedRange.deleteContents();
            savedRange.insertNode(anchor);
          } else {
            document.execCommand('createLink', false, newUrl);
          }
          this.attachInteractiveListeners();
          this.recordChange();
        }, initialUrl);
      }
      return;
    }

    if (modifier && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    if ((modifier && (e.key === 'y' || e.key === 'Y')) || (modifier && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault();
      this.redo();
      return;
    }

    // Smart Backspace
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      let activeLi: HTMLElement | null = null;
      if (selection && selection.anchorNode) {
        const parentEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
          ? (selection.anchorNode as HTMLElement) 
          : selection.anchorNode.parentElement;
        activeLi = parentEl ? (parentEl.closest('li') as HTMLElement | null) : null;
      }

      if (activeLi) {
        if (this.handleBackspaceInListItem(activeLi, e)) {
          return;
        }
      }

      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        if (range.startOffset === 0) {
          const block = this.findTopLevelBlock(range.startContainer);
          if (block && block !== this.canvas) {
            const tag = block.tagName.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)) {
              e.preventDefault();
              this.turnBlockInto(block, 'p');
              return;
            } else if (block.classList.contains('notion-todo-item')) {
              e.preventDefault();
              const currentIndent = parseInt(block.getAttribute('data-indent') || '0', 10);
              if (currentIndent > 0) {
                const newIndent = currentIndent - 1;
                block.setAttribute('data-indent', String(newIndent));
                if (newIndent === 0) {
                  block.removeAttribute('data-indent');
                  block.style.marginLeft = '';
                } else {
                  block.style.marginLeft = `${newIndent * 24}px`;
                }
                this.recordChange();
              } else {
                this.turnBlockInto(block, 'p');
              }
              return;
            } else if (block.classList.contains('notion-callout')) {
              e.preventDefault();
              this.turnBlockInto(block, 'p');
              return;
            }
          }
        }
      }
    }

    // Tab Navigation & Indentation (Tabelas, Listas, To-Dos, Parágrafos)
    if (e.key === 'Tab') {
      // 1. Tab em Tabelas
      const cell = document.activeElement ? document.activeElement.closest('td, th') as HTMLElement | null : null;
      if (cell) {
        e.preventDefault();
        const tr = cell.parentElement as HTMLTableRowElement | null;
        const table = tr ? tr.closest('table') : null;
        if (table) {
          const allCells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
          const idx = allCells.indexOf(cell);

          if (e.shiftKey) {
            if (idx > 0) allCells[idx - 1].focus();
          } else {
            if (idx < allCells.length - 1) {
              allCells[idx + 1].focus();
            } else {
              const cols = table.querySelectorAll('thead tr th').length || 2;
              const newTr = document.createElement('tr');
              for (let i = 0; i < cols; i++) {
                const td = document.createElement('td');
                td.setAttribute('contenteditable', 'true');
                newTr.appendChild(td);
              }
              table.querySelector('tbody')?.appendChild(newTr);
              this.recordChange();
              setTimeout(() => {
                (newTr.querySelector('td') as HTMLElement)?.focus();
              }, 10);
            }
          }
          return;
        }
      }

      // 2. Tab / Shift+Tab em Listas (ul / ol -> li)
      const selection = window.getSelection();
      let activeLi: HTMLElement | null = null;
      if (selection && selection.anchorNode) {
        const parentEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
          ? (selection.anchorNode as HTMLElement) 
          : selection.anchorNode.parentElement;
        activeLi = parentEl ? (parentEl.closest('li') as HTMLElement | null) : null;
      }

      if (activeLi) {
        e.preventDefault();
        if (e.shiftKey) {
          this.outdentListItem(activeLi);
        } else {
          this.indentListItem(activeLi);
        }
        return;
      }

      // 3. Tab / Shift+Tab em To-Do Items
      let activeTodo: HTMLElement | null = null;
      if (selection && selection.anchorNode) {
        const parentEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
          ? (selection.anchorNode as HTMLElement) 
          : selection.anchorNode.parentElement;
        activeTodo = parentEl ? (parentEl.closest('.notion-todo-item') as HTMLElement | null) : null;
      }

      if (activeTodo) {
        e.preventDefault();
        const currentIndent = parseInt(activeTodo.getAttribute('data-indent') || '0', 10);
        if (e.shiftKey) {
          if (currentIndent > 0) {
            const newIndent = currentIndent - 1;
            activeTodo.setAttribute('data-indent', String(newIndent));
            if (newIndent === 0) {
              activeTodo.removeAttribute('data-indent');
              activeTodo.style.marginLeft = '';
            } else {
              activeTodo.style.marginLeft = `${newIndent * 24}px`;
            }
            this.recordChange();
          } else {
            this.turnBlockInto(activeTodo, 'p');
          }
        } else {
          if (currentIndent < 5) {
            const newIndent = currentIndent + 1;
            activeTodo.setAttribute('data-indent', String(newIndent));
            activeTodo.style.marginLeft = `${newIndent * 24}px`;
            this.recordChange();
          }
        }
        return;
      }

      // 4. Tab em Parágrafos / Texto Comum (insere 2 espaços sem perder foco)
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      this.recordChange();
      return;
    }

    // Enter dentro de Li ou To-Do
    if (e.key === 'Enter') {
      const selection = window.getSelection();
      let activeLi: HTMLElement | null = null;
      let activeTodo: HTMLElement | null = null;

      if (selection && selection.anchorNode) {
        const parentEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
          ? (selection.anchorNode as HTMLElement) 
          : selection.anchorNode.parentElement;
        activeLi = parentEl ? (parentEl.closest('li') as HTMLElement | null) : null;
        activeTodo = parentEl ? (parentEl.closest('.notion-todo-item') as HTMLElement | null) : null;
      }

      if (activeLi && !e.shiftKey) {
        if (this.handleEnterInListItem(activeLi, e)) {
          return;
        }
      }

      if (activeTodo && !e.shiftKey) {
        e.preventDefault();
        const textSpan = activeTodo.querySelector('.notion-todo-text');
        if (textSpan && !textSpan.textContent?.trim()) {
          this.turnBlockInto(activeTodo, 'p');
          return;
        }

        const currentIndent = parseInt(activeTodo.getAttribute('data-indent') || '0', 10);
        const newItem = document.createElement('div');
        newItem.className = 'notion-todo-item';
        newItem.setAttribute('contenteditable', 'false');
        if (currentIndent > 0) {
          newItem.setAttribute('data-indent', String(currentIndent));
          newItem.style.marginLeft = `${currentIndent * 24}px`;
        }
        newItem.innerHTML = `
          <input type="checkbox" class="notion-todo-checkbox" />
          <span class="notion-todo-text" contenteditable="true"></span>
        `;
        activeTodo.insertAdjacentElement('afterend', newItem);
        this.recordChange();
        setTimeout(() => {
          (newItem.querySelector('.notion-todo-text') as HTMLElement)?.focus();
        }, 10);
        return;
      }
    }

    // Trigger Slash '/'
    if (e.key === '/' && !modifier) {
      setTimeout(() => {
        this.checkSlashTrigger();
      }, 10);
    }
  }

  checkSlashTrigger() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const text = node.textContent || '';
    const offset = range.startOffset;

    if (offset > 0 && text[offset - 1] === '/' && this.slashMenu) {
      this.slashMenu.openAtCaret('');
    }
  }

  handleSlashCommand(cmdId: string, targetRange: Range | null) {
    let savedRange: Range | null = targetRange ? targetRange.cloneRange() : null;

    if (savedRange) {
      const node = savedRange.startContainer;
      if (node && node.nodeType === Node.TEXT_NODE && node.textContent) {
        const offset = savedRange.startOffset;
        const text = node.textContent;
        if (offset > 0 && text[offset - 1] === '/') {
          // Remover exatamente a barra '/' digitada na posição do caret
          const before = text.slice(0, offset - 1);
          const after = text.slice(offset);
          node.textContent = before + after;
          // Reposicionar o range salvo
          savedRange.setStart(node, offset - 1);
          savedRange.setEnd(node, offset - 1);
        } else if (text.includes('/')) {
          node.textContent = text.replace(/\/$/, '');
        }
      }

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
    }

    switch (cmdId) {
      case 'p':
      case 'paragraph':
        this.insertBlockHtml('<p>Texto normal...</p>');
        break;
      case 'h1':
        this.insertBlockHtml('<h1>Título 1</h1>');
        break;
      case 'h2':
        this.insertBlockHtml('<h2>Título 2</h2>');
        break;
      case 'h3':
        this.insertBlockHtml('<h3>Título 3</h3>');
        break;
      case 'link':
      case 'doc-link': {
        if (this.onOpenLinkModal) {
          this.onOpenLinkModal('', (url, text) => {
            if (!url) return;
            const trimmedUrl = url.trim();
            const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(trimmedUrl);
            const isDoc = !isExternal && (trimmedUrl.endsWith('.md') || trimmedUrl.includes('.md#') || trimmedUrl.includes(':~:text=') || trimmedUrl.startsWith('#'));
            const safeHref = isSafeUrl(trimmedUrl) ? trimmedUrl : '#';
            const label = text || url;
            
            const anchor = document.createElement('a');
            anchor.setAttribute('href', safeHref);
            if (isDoc) {
              anchor.className = 'notion-doc-link';
              anchor.target = '_self';
            } else {
              anchor.target = '_blank';
              anchor.rel = 'noopener noreferrer';
            }
            anchor.textContent = label;

            if (savedRange && savedRange.startContainer && savedRange.startContainer.isConnected) {
              savedRange.deleteContents();
              savedRange.insertNode(anchor);

              // Posicionar o cursor imediatamente após o link inserido
              const newRange = document.createRange();
              newRange.setStartAfter(anchor);
              newRange.collapse(true);
              const sel = window.getSelection();
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(newRange);
              }
            } else {
              this.insertBlockHtml(`<p><a href="${escapeHtml(safeHref)}" class="${isDoc ? 'notion-doc-link' : ''}" target="${isDoc ? '_self' : '_blank'}"${!isDoc ? ' rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a></p>`);
            }

            this.attachInteractiveListeners();
            this.recordChange();
          });
        }
        break;
      }
      case 'table':
        this.insertBlockHtml(this.createTableHtml(2, 3));
        break;
      case 'toggle':
        this.insertBlockHtml(this.createToggleBlockHtml('Nova Seção Expansível', 'Conteúdo da seção...'));
        break;
      case 'divider':
        this.insertBlockHtml('<hr>');
        break;
      case 'callout-note':
        this.insertBlockHtml(this.createCalloutBlockHtml('note', 'Nota explicativa ou regra de negócio...'));
        break;
      case 'callout-tip':
        this.insertBlockHtml(this.createCalloutBlockHtml('tip', 'Dica de implementação ou boas práticas...'));
        break;
      case 'callout-warning':
        this.insertBlockHtml(this.createCalloutBlockHtml('warning', 'Atenção aos critérios de aceite e contratos...'));
        break;
      case 'callout-danger':
        this.insertBlockHtml(this.createCalloutBlockHtml('danger', 'Restrição crítica de segurança ou arquitetura...'));
        break;
      case 'todo':
        this.insertBlockHtml(this.createTodoItemHtml('Nova tarefa a executar', false));
        break;
      case 'bullet-list':
        this.insertBlockHtml('<ul><li>Item da lista</li></ul>');
        break;
      case 'number-list':
        this.insertBlockHtml('<ol><li>Primeiro passo</li></ol>');
        break;
      case 'mermaid':
        this.insertBlockHtml(this.createMermaidBlockHtml());
        break;
      case 'code':
        this.insertBlockHtml(this.createCodeBlockHtml('javascript', '// Seu código aqui'));
        break;
      case 'quote':
        this.insertBlockHtml('<blockquote>Citação em destaque...</blockquote>');
        break;
      default:
        if (cmdId.startsWith('term:')) {
          const termName = cmdId.replace(/^term:/, '');
          this.insertBlockHtml(`<p><span class="dict-term-highlight" data-term-key="${escapeHtml(termName.toLowerCase())}">${escapeHtml(termName)}</span></p>`);
        }
        break;
    }

    this.attachInteractiveListeners();
    this.renderAllMermaidBlocks();
    this.recordChange();
  }

  insertBlocksHtml(html: string) {
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const elements = Array.from(temp.children) as HTMLElement[];
    if (elements.length === 0) return;

    const selection = window.getSelection();
    let currentTarget: HTMLElement | null = null;
    let shouldReplaceTarget = false;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      let node: Node | null = range.startContainer;
      while (node && node.parentElement !== this.canvas && node !== this.canvas) {
        node = node.parentElement;
      }
      if (node && node.parentElement === this.canvas) {
        currentTarget = node as HTMLElement;
        const text = currentTarget.textContent?.trim() || '';
        if (!text && !currentTarget.querySelector('table, pre, .notion-mermaid-block, .notion-callout')) {
          shouldReplaceTarget = true;
        }
      }
    }

    let lastEl: HTMLElement | null = null;
    if (currentTarget && shouldReplaceTarget) {
      currentTarget.replaceWith(elements[0]);
      lastEl = elements[0];
      let insertAfter = elements[0];
      for (let k = 1; k < elements.length; k++) {
        insertAfter.insertAdjacentElement('afterend', elements[k]);
        insertAfter = elements[k];
        lastEl = elements[k];
      }
    } else if (currentTarget) {
      let insertAfter = currentTarget;
      for (let k = 0; k < elements.length; k++) {
        insertAfter.insertAdjacentElement('afterend', elements[k]);
        insertAfter = elements[k];
        lastEl = elements[k];
      }
    } else {
      for (const el of elements) {
        this.canvas.appendChild(el);
        lastEl = el;
      }
    }

    this.attachInteractiveListeners();
    this.renderAllMermaidBlocks();
    if (lastEl) {
      this.placeCursorIn(lastEl);
    }
    this.recordChange();
  }

  insertBlockHtml(html: string) {
    this.insertBlocksHtml(html);
  }

  placeCursorIn(element: HTMLElement) {
    const target = (element.querySelector('[contenteditable="true"]') || element) as HTMLElement;
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  handleInput(_e: Event) {
    this.recordChange();
  }

  convertHtmlToMarkdown(htmlString: string): string {
    return convertHtmlToMarkdown(htmlString);
  }

  handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const clipboardData =
      e.clipboardData ||
      (window as Window & { clipboardData?: DataTransfer }).clipboardData;
    let text = clipboardData?.getData('text/plain') || '';
    const htmlData = clipboardData?.getData('text/html') || '';

    // Se temos HTML na área de transferência com elementos ricos (ex: <code>, <li>, <strong>, etc.)
    // mas o texto plano perdeu formatações como crases de código (comum ao copiar de saídas renderizadas do ChatGPT ou web),
    // convertemos o HTML preservando a sintaxe Markdown
    if (htmlData && (htmlData.includes('<code') || htmlData.includes('<strong') || htmlData.includes('<b') || htmlData.includes('<li') || htmlData.includes('<h'))) {
      const converted = this.convertHtmlToMarkdown(htmlData);
      if (converted && converted.trim()) {
        text = converted;
      }
    }

    if (!text) return;

    // Detect if text contains markdown constructs or multiple lines
    const hasMarkdownOrMultiline =
      text.includes('\n') ||
      /^#{1,6}\s/m.test(text) ||
      /^[-*+•–—]\s/m.test(text) ||
      /^\d+\.\s/m.test(text) ||
      /^>\s/m.test(text) ||
      /^```/m.test(text) ||
      /\|.*\|/.test(text) ||
      /\*\*.*?\*\*/.test(text) ||
      /`.*?`/.test(text) ||
      /\[.*?\]\(.*?\)/.test(text);

    if (hasMarkdownOrMultiline) {
      const lines = text.split(/\r?\n/);
      const html = this.parseMarkdownLinesToHtml(lines);
      this.insertBlocksHtml(html);
    } else {
      document.execCommand('insertText', false, text);
      this.recordChange();
    }
  }

  recordChange() {
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => {
      this.pushSnapshot();
    }, 300);

    this.onChange();
  }

  pushSnapshot(force = false) {
    const html = this.canvas.innerHTML;
    if (!force && this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === html) {
      return;
    }

    this.undoStack.push(html);
    if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();
    if (force) this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length <= 1) return;
    const current = this.undoStack.pop();
    if (current) this.redoStack.push(current);

    const prev = this.undoStack[this.undoStack.length - 1];
    if (prev) {
      setSafeHtml(this.canvas, prev);
      this.attachInteractiveListeners();
      this.renderAllMermaidBlocks();
      this.onChange();
    }
  }

  redo() {
    if (!this.redoStack.length) return;
    const next = this.redoStack.pop();
    if (next) {
      this.undoStack.push(next);
      setSafeHtml(this.canvas, next);
      this.attachInteractiveListeners();
      this.renderAllMermaidBlocks();
      this.onChange();
    }
  }

  destroy() {
    this.canvas.removeEventListener('keydown', this.boundOnKeyDown);
    this.canvas.removeEventListener('keyup', this.boundOnKeyUp);
    this.canvas.removeEventListener('input', this.boundOnInput);
    this.canvas.removeEventListener('paste', this.boundOnPaste);
    this.canvas.removeEventListener('click', this.boundOnClick);
    this.canvas.removeEventListener('mousemove', this.boundOnMouseMove);
    this.canvas.removeEventListener('mouseleave', this.boundOnMouseLeave);
    this.canvas.removeEventListener('dragover', this.boundOnDragOver);
    this.canvas.removeEventListener('dragleave', this.boundOnDragLeave);
    this.canvas.removeEventListener('drop', this.boundOnDrop);
    document.removeEventListener('click', this.boundDocClick);

    if (this.slashMenu) this.slashMenu.destroy();
    if (this.bubbleMenu) this.bubbleMenu.destroy();
    if (this.sideHandle) this.sideHandle.remove();
    if (this.blockMenu) this.blockMenu.remove();
    if (this.linkPopover) this.linkPopover.remove();
    if (this.dropIndicator) this.dropIndicator.remove();
  }
}
