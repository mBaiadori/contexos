import React from 'react';

interface BubbleMenuProps {
  isOpen: boolean;
  position: { top: number; left: number };
  onFormat: (prefix: string, suffix?: string) => void;
  onAskAI?: () => void;
  onAddDictionaryTerm?: () => void;
  onLinkSynonym?: () => void;
}

export const BubbleMenu: React.FC<BubbleMenuProps> = ({
  isOpen,
  position,
  onFormat,
  onAskAI,
  onAddDictionaryTerm,
  onLinkSynonym,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="notion-bubble-menu"
      style={{
        position: 'fixed',
        top: position.top - 40,
        left: position.left,
        background: 'var(--color-surface, #fff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '8px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '4px 6px'
      }}
    >
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => onFormat('**', '**')}
        title="Negrito (Cmd+B)"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => onFormat('*', '*')}
        title="Itálico (Cmd+I)"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => onFormat('~~', '~~')}
        title="Tachado"
      >
        <s>S</s>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => onFormat('`', '`')}
        title="Código Inline"
      >
        <code>&lt;&gt;</code>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => onFormat('[', '](https://)')}
        title="Link"
      >
        <span className="material-symbols-outlined icon-xs">link</span>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => onFormat('==', '==')}
        title="Destaque"
      >
        <span className="material-symbols-outlined icon-xs">ink_highlighter</span>
      </button>

      {onAddDictionaryTerm && (
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onAddDictionaryTerm}
          title="Cadastrar no Dicionário Ubíquo"
          style={{ color: 'var(--color-primary, #2563eb)' }}
        >
          <span className="material-symbols-outlined icon-xs">library_add</span>
        </button>
      )}

      {onLinkSynonym && (
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onLinkSynonym}
          title="Vincular como Sinônimo"
          style={{ color: '#7c3aed' }}
        >
          <span className="material-symbols-outlined icon-xs">bookmarks</span>
        </button>
      )}

      {onAskAI && (
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onAskAI}
          title="Perguntar ao Nexos"
          style={{ color: 'var(--primary, #2563eb)', borderLeft: '1px solid var(--border-color)', marginLeft: '4px', paddingLeft: '6px' }}
        >
          <span className="material-symbols-outlined icon-xs">auto_awesome</span>
        </button>
      )}
    </div>
  );
};

