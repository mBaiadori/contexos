// =============================================================================
// COMPONENT: BUBBLE MENU (FLOATING SELECTION TOOLBAR WITH NOTION PALETTE)
// Oferece formatação rápida (Negrito, Itálico, Código, Link, Cores Notion) ao selecionar texto.
// =============================================================================

import {
  createTextFragmentFromSelection,
  formatTextFragmentUrl,
} from "../../utils/text-fragment";

export class BubbleMenuEngine {
  container: HTMLElement;
  onFormat: (action: string) => void;
  onAskCopilot?: (text: string) => void;
  getFilePath?: () => string | null;
  onCopyLink?: (url: string) => void;
  onOpenLinkModal?: (defaultText: string, callback: (url: string, text: string) => void, initialUrl?: string) => void;
  onAddDictionaryTerm?: (text: string) => void;
  onLinkSynonym?: (text: string) => void;
  element: HTMLElement | null = null;
  colorPicker: HTMLElement | null = null;
  isVisible = false;
  savedRange: Range | null = null;

  notionColors = [
    { name: "Padrão", color: "inherit", bg: "transparent" },
    { name: "Cinza", color: "#64748b", bg: "#f1f5f9" },
    { name: "Marrom", color: "#78350f", bg: "#fef3c7" },
    { name: "Laranja", color: "#c2410c", bg: "#ffedd5" },
    { name: "Amarelo", color: "#854d0e", bg: "#fef9c3" },
    { name: "Verde", color: "#15803d", bg: "#dcfce7" },
    { name: "Azul", color: "#1d4ed8", bg: "#dbeafe" },
    { name: "Roxo", color: "#7e22ce", bg: "#f3e8ff" },
    { name: "Rosa", color: "#be185d", bg: "#fce7f3" },
    { name: "Vermelho", color: "#b91c1c", bg: "#fee2e2" },
  ];

  private onSelectionChangeHandler: () => void;
  private onResizeHandler: () => void;
  private onScrollHandler: () => void;

  constructor({
    container,
    onFormat,
    onAskCopilot,
    getFilePath,
    onCopyLink,
    onOpenLinkModal,
    onAddDictionaryTerm,
    onLinkSynonym,
  }: {
    container: HTMLElement;
    onFormat?: (action: string) => void;
    onAskCopilot?: (text: string) => void;
    getFilePath?: () => string | null;
    onCopyLink?: (url: string) => void;
    onOpenLinkModal?: (defaultText: string, callback: (url: string, text: string) => void, initialUrl?: string) => void;
    onAddDictionaryTerm?: (text: string) => void;
    onLinkSynonym?: (text: string) => void;
  }) {
    this.container = container;
    this.onFormat = onFormat || (() => {});
    this.onAskCopilot = onAskCopilot;
    this.getFilePath = getFilePath;
    this.onCopyLink = onCopyLink;
    this.onOpenLinkModal = onOpenLinkModal;
    this.onAddDictionaryTerm = onAddDictionaryTerm;
    this.onLinkSynonym = onLinkSynonym;

    this.onSelectionChangeHandler = () => this.updatePosition();
    this.onResizeHandler = () => this.updatePosition();
    this.onScrollHandler = () => this.updatePosition();

    this.init();
  }

  init() {
    this.element = document.createElement("div");
    this.element.className = "bubble-menu-popover";
    this.element.style.display = "none";
    this.element.innerHTML = `
      <button type="button" class="bubble-btn" data-action="bold" title="Negrito (Ctrl+B)"><strong>B</strong></button>
      <button type="button" class="bubble-btn" data-action="italic" title="Itálico (Ctrl+I)"><em>I</em></button>
      <button type="button" class="bubble-btn" data-action="strike" title="Tachado"><s>S</s></button>
      <div class="bubble-divider"></div>
      <button type="button" class="bubble-btn" data-action="code" title="Código inline"><code>&lt;/&gt;</code></button>
      <button type="button" class="bubble-btn" data-action="link" title="Inserir Link (Ctrl+K)"><span class="material-symbols-outlined icon-xs">link</span></button>
      <button type="button" class="bubble-btn" data-action="color" title="Cor & Destaque"><span class="material-symbols-outlined icon-xs">palette</span></button>
      <div class="bubble-divider"></div>
      <button type="button" class="bubble-btn dict-btn" data-action="add-dictionary" title="Cadastrar termo no Dicionário Ubíquo" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; padding: 2px 7px; color: var(--color-primary, #2563eb); font-weight: 500;">
        <span class="material-symbols-outlined icon-xs">library_add</span>
        <span>Novo Termo</span>
      </button>
      <button type="button" class="bubble-btn syn-btn" data-action="link-synonym" title="Vincular como sinônimo a um termo existente" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; padding: 2px 7px; color: #7c3aed; font-weight: 500;">
        <span class="material-symbols-outlined icon-xs">bookmarks</span>
        <span>Sinônimo</span>
      </button>
      <div class="bubble-divider"></div>
      <button type="button" class="bubble-btn fragment-btn" data-action="copy-fragment-link" title="Copiar Link Resiliente do Trecho" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11px; padding: 2px 7px;">
        <span class="material-symbols-outlined icon-xs">share_location</span>
        <span>Link do Trecho</span>
      </button>
      <div class="bubble-divider"></div>
      <button type="button" class="bubble-btn ai-btn" data-action="ask-ai" title="Consultar / Refatorar com Nexos" style="color: var(--primary, #2563eb); display: inline-flex; align-items: center; gap: 3px; font-weight: 600; font-size: 11.5px; padding: 2px 7px;">
        <span class="material-symbols-outlined icon-xs">auto_awesome</span>
        <span>Perguntar à IA</span>
      </button>
    `;

    // Color Picker Popover
    this.colorPicker = document.createElement("div");
    this.colorPicker.className = "bubble-color-picker";
    this.colorPicker.style.display = "none";
    this.colorPicker.innerHTML = this.notionColors
      .map(
        (c) => `
      <div class="color-swatch" style="background:${c.bg}; border-color:${c.color};" data-color="${c.color}" data-bg="${c.bg}" title="${c.name}"></div>
    `,
      )
      .join("");

    this.element.appendChild(this.colorPicker);
    document.body.appendChild(this.element);

    this.element.querySelectorAll(".bubble-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const action = (btn as HTMLElement).dataset.action;
        if (action === "color") {
          if (this.colorPicker) {
            const isShown = this.colorPicker.style.display === "flex";
            this.colorPicker.style.display = isShown ? "none" : "flex";
          }
        } else if (action === "add-dictionary") {
          const selection = window.getSelection();
          const text = selection ? selection.toString().trim() : "";
          this.hide();
          if (text && this.onAddDictionaryTerm) {
            this.onAddDictionaryTerm(text);
          }
        } else if (action === "link-synonym") {
          const selection = window.getSelection();
          const text = selection ? selection.toString().trim() : "";
          this.hide();
          if (text && this.onLinkSynonym) {
            this.onLinkSynonym(text);
          }
        } else if (action === "copy-fragment-link") {
          const selection = window.getSelection();
          if (selection) {
            const fragment = createTextFragmentFromSelection(selection);
            if (fragment) {
              const currentPath =
                (this.getFilePath ? this.getFilePath() : "") || "documento.md";
              const url = formatTextFragmentUrl(currentPath, fragment);
              navigator.clipboard
                .writeText(url)
                .then(() => {
                  const span = (btn as HTMLElement).querySelector(
                    "span:last-child",
                  );
                  if (span) {
                    const orig = span.textContent;
                    span.textContent = "Copiado!";
                    setTimeout(() => {
                      span.textContent = orig;
                    }, 1600);
                  }
                })
                .catch(() => {
                  prompt("Link Resiliente do Trecho:", url);
                });
              if (this.onCopyLink) {
                this.onCopyLink(url);
              }
            }
          }
        } else if (action === "ask-ai") {
          const selection = window.getSelection();
          const text = selection ? selection.toString().trim() : "";
          this.hide();
          if (text && this.onAskCopilot) {
            this.onAskCopilot(text);
          }
        } else {
          if (this.colorPicker) this.colorPicker.style.display = "none";
          if (action) this.handleAction(action);
        }
      });
    });

    this.colorPicker.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const color = (swatch as HTMLElement).dataset.color || "inherit";
        const bg = (swatch as HTMLElement).dataset.bg || "transparent";
        this.applyColor(color, bg);
        if (this.colorPicker) this.colorPicker.style.display = "none";
      });
    });

    document.addEventListener("selectionchange", this.onSelectionChangeHandler);
    window.addEventListener("resize", this.onResizeHandler);
    window.addEventListener("scroll", this.onScrollHandler, true);
  }

  updatePosition() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !this.container) {
      this.hide();
      return;
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range || !this.container.contains(range.commonAncestorContainer)) {
      this.hide();
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      this.hide();
      return;
    }

    this.savedRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.hide();
      return;
    }

    if (this.element) {
      this.element.style.display = "flex";
      const menuWidth = this.element.offsetWidth || 480;
      const menuHeight = this.element.offsetHeight || 38;

      // Obtém os limites visuais do container do editor e da janela para nunca cortar
      const editorWrapper =
        document.getElementById("notion-editor-wrapper") || this.container;
      const wrapperRect = editorWrapper.getBoundingClientRect();

      // Limite à esquerda: nunca ultrapassar a margem do editor nem invadir a barra lateral
      const minLeft = Math.max(16, wrapperRect.left + 8);
      // Limite à direita: nunca sair da tela nem do editor
      const maxLeft = Math.min(
        window.innerWidth - menuWidth - 16,
        wrapperRect.right - menuWidth - 8,
      );

      let left = rect.left + rect.width / 2 - menuWidth / 2;
      if (maxLeft >= minLeft) {
        left = Math.max(minLeft, Math.min(left, maxLeft));
      } else {
        left = Math.max(16, Math.min(left, window.innerWidth - menuWidth - 16));
      }

      // Posição vertical: posiciona 8px acima da seleção; se colidir com o topo, inverte para baixo
      let top = rect.top - menuHeight - 8;
      if (top < 10) {
        top = rect.bottom + 8;
      }

      this.element.style.left = `${Math.round(left)}px`;
      this.element.style.top = `${Math.round(top)}px`;
    }
    this.isVisible = true;
  }

  handleAction(action: string) {
    switch (action) {
      case "bold":
        document.execCommand("bold", false, undefined);
        break;
      case "italic":
        document.execCommand("italic", false, undefined);
        break;
      case "strike":
        document.execCommand("strikeThrough", false, undefined);
        break;
      case "code":
        this.wrapSelectionWithTag("code");
        break;
      case "link": {
        const selection = window.getSelection();
        let existingAnchor: HTMLAnchorElement | null = null;
        if (selection && selection.anchorNode) {
          const parentEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
            ? (selection.anchorNode as HTMLElement) 
            : selection.anchorNode.parentElement;
          existingAnchor = (parentEl?.closest('a') as HTMLAnchorElement) || null;
        }
        if (!existingAnchor && this.savedRange) {
          const common = this.savedRange.commonAncestorContainer;
          const parentEl = common.nodeType === Node.ELEMENT_NODE ? (common as HTMLElement) : common.parentElement;
          existingAnchor = (parentEl?.closest('a') as HTMLAnchorElement) || null;
        }

        const selectedText = selection ? selection.toString().trim() : "";
        const initialText = selectedText || (existingAnchor ? existingAnchor.textContent || "" : "");
        const initialUrl = existingAnchor ? existingAnchor.getAttribute("href") || "" : "";
        const savedRange = this.savedRange?.cloneRange() || (selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null);

        this.hide();
        if (this.onOpenLinkModal) {
          this.onOpenLinkModal(initialText, (url, text) => {
            const isDoc = url.endsWith(".md") || url.includes(".md#") || url.includes(":~:text=") || url.startsWith("#");
            if (existingAnchor && existingAnchor.isConnected) {
              existingAnchor.setAttribute("href", url);
              existingAnchor.textContent = text || url;
              if (isDoc) {
                existingAnchor.classList.add("notion-doc-link");
                existingAnchor.target = "_self";
              } else {
                existingAnchor.classList.remove("notion-doc-link");
                existingAnchor.target = "_blank";
              }
            } else {
              if (savedRange) {
                const sel = window.getSelection();
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(savedRange);
                }
                const anchor = document.createElement("a");
                anchor.setAttribute("href", url);
                if (isDoc) {
                  anchor.className = "notion-doc-link";
                  anchor.target = "_self";
                } else {
                  anchor.target = "_blank";
                }
                anchor.textContent = text || url;
                savedRange.deleteContents();
                savedRange.insertNode(anchor);
              } else {
                document.execCommand("createLink", false, url);
              }
            }
            this.onFormat("link");
          }, initialUrl);
        }
        return;
      }
    }

    this.onFormat(action);
    this.updatePosition();
  }

  wrapSelectionWithTag(tag: string) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.extractContents();
    const el = document.createElement(tag);
    el.appendChild(selectedText);
    range.insertNode(el);

    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(el);
    selection.addRange(newRange);
  }

  applyColor(color: string, bg: string) {
    if (bg && bg !== "transparent") {
      document.execCommand("hiliteColor", false, bg);
    }
    if (color && color !== "inherit") {
      document.execCommand("foreColor", false, color);
    }
    this.onFormat("color");
  }

  hide() {
    if (this.element) this.element.style.display = "none";
    if (this.colorPicker) this.colorPicker.style.display = "none";
    this.isVisible = false;
  }

  destroy() {
    document.removeEventListener(
      "selectionchange",
      this.onSelectionChangeHandler,
    );
    window.removeEventListener("resize", this.onResizeHandler);
    window.removeEventListener("scroll", this.onScrollHandler, true);
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
