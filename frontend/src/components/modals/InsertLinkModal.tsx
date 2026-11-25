import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { parseTextFragmentUrl } from '../../utils/text-fragment';
import type { TreeNode } from '../../types';
import { Modal, Tabs, FormField, Input, Textarea, Button, Badge } from '../ui';
import { 
  Link as LinkIcon, 
  Edit3, 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  CheckCircle2, 
  Globe, 
  FileCode, 
  Check, 
  Search,
  ExternalLink 
} from 'lucide-react';

interface InsertLinkModalProps {
  isOpen: boolean;
  initialText?: string;
  initialUrl?: string;
  onClose: () => void;
  onConfirm: (url: string, text: string) => void;
  title?: string;
}

export const InsertLinkModal: React.FC<InsertLinkModalProps> = ({
  isOpen,
  initialText = '',
  initialUrl = '',
  onClose,
  onConfirm,
  title,
}) => {
  const { tree, activeFile } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'doc' | 'snippet' | 'url'>('doc');
  const [linkText, setLinkText] = useState(initialText);

  // Tab 1: Document Tree Navigation
  const [searchDoc, setSearchDoc] = useState('');
  const [selectedDocPath, setSelectedDocPath] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Tab 2: Snippet / Fragment Deep Link
  const [snippetUrl, setSnippetUrl] = useState('');

  // Tab 3: External Web URL
  const [customUrl, setCustomUrl] = useState('');

  // Helpers to truncate and format default link labels
  const getTruncatedDefaultLabel = useCallback((url: string, tab: 'doc' | 'snippet' | 'url'): string => {
    if (tab === 'doc') {
      const fileName = url.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || url;
      return fileName || 'Documento';
    }
    if (tab === 'snippet') {
      const parsed = parseTextFragmentUrl(url);
      if (parsed?.exact) {
        const exact = parsed.exact.trim();
        return exact.length > 32 ? `${exact.slice(0, 30)}...` : exact;
      }
      const pathPart = url.split('#')[0].split('/').pop()?.replace(/\.(md|markdown)$/i, '') || '';
      return pathPart ? `${pathPart} (trecho)` : 'Trecho';
    }
    // Web url
    try {
      const clean = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      return clean.length > 32 ? `${clean.slice(0, 30)}...` : clean || url;
    } catch {
      return url;
    }
  }, []);

  // Initialize and pre-fill state upon opening
  useEffect(() => {
    if (isOpen) {
      setLinkText(initialText || '');
      setSearchDoc('');

      if (initialUrl) {
        if (initialUrl.startsWith('http://') || initialUrl.startsWith('https://')) {
          setActiveTab('url');
          setCustomUrl(initialUrl);
          setSnippetUrl('');
          setSelectedDocPath('');
        } else if (initialUrl.includes(':~:text=') || initialUrl.includes('#')) {
          setActiveTab('snippet');
          setSnippetUrl(initialUrl);
          setSelectedDocPath(initialUrl.split('#')[0]);
          setCustomUrl('');
        } else {
          setActiveTab('doc');
          setSelectedDocPath(initialUrl);
          setSnippetUrl('');
          setCustomUrl('');
        }
      } else {
        setActiveTab('doc');
        setSnippetUrl('');
        setCustomUrl('');
      }
    }
  }, [isOpen, initialText, initialUrl]);

  // Decoded preview for Snippet tab
  const snippetParsedInfo = useMemo(() => {
    if (!snippetUrl.trim()) return null;
    const pathPart = snippetUrl.split('#')[0].replace(/^\.?\//, '');
    const fragment = parseTextFragmentUrl(snippetUrl);
    return {
      filePath: pathPart,
      fragment,
    };
  }, [snippetUrl]);

  if (!isOpen) return null;

  // Toggle folder in tree
  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders(prev => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  // Filter tree nodes recursively when searching
  const filterTreeNodes = (nodes: TreeNode[], term: string): TreeNode[] => {
    if (!term.trim()) return nodes;
    const lower = term.toLowerCase();

    const result: TreeNode[] = [];
    for (const node of nodes) {
      const isDir = node.type === 'dir' || node.type === 'directory' || node.is_directory;
      if (isDir) {
        const matchingChildren = filterTreeNodes(node.children || [], term);
        if (matchingChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
          result.push({
            ...node,
            children: matchingChildren
          });
        }
      } else if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
        result.push(node);
      }
    }
    return result;
  };

  const displayTree = filterTreeNodes(tree || [], searchDoc);

  // Render tree item recursively
  const renderTree = (nodes: TreeNode[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isDir = node.type === 'dir' || node.type === 'directory' || node.is_directory;
      const isCollapsed = searchDoc.trim() ? false : !!collapsedFolders[node.path];
      const isMd = !isDir && (node.name.endsWith('.md') || node.name.endsWith('.markdown'));
      const isSelected = selectedDocPath === node.path;
      const isCurrentFile = activeFile === node.path;

      if (isDir) {
        return (
          <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              onClick={(e) => toggleFolder(node.path, e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 8px',
                paddingLeft: `${depth * 16 + 8}px`,
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-on-surface-variant)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-md, 8px)',
                userSelect: 'none',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-container-high)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <ChevronRight
                size={14}
                style={{
                  transform: !isCollapsed ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s ease',
                  color: 'var(--color-outline)',
                }}
              />
              {isCollapsed ? (
                <Folder size={15} style={{ color: 'var(--color-outline)' }} />
              ) : (
                <FolderOpen size={15} style={{ color: 'var(--color-primary)' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.name}
              </span>
            </div>

            {!isCollapsed && node.children && node.children.length > 0 && (
              <div>{renderTree(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      // File item
      return (
        <div
          key={node.path}
          onClick={() => {
            if (isMd) {
              setSelectedDocPath(node.path);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 8px',
            paddingLeft: `${depth * 16 + 22}px`,
            fontSize: '12.5px',
            cursor: isMd ? 'pointer' : 'default',
            borderRadius: 'var(--radius-md, 8px)',
            background: isSelected ? 'var(--color-primary-container)' : 'transparent',
            border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
            color: isSelected ? 'var(--color-on-primary-container)' : isMd ? 'var(--color-on-surface)' : 'var(--color-outline)',
            opacity: isMd ? 1 : 0.6,
            transition: 'all 0.12s ease',
            margin: '1px 0',
          }}
          onMouseEnter={(e) => {
            if (!isSelected && isMd) e.currentTarget.style.background = 'var(--color-surface-container-high)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'transparent';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            <FileText
              size={14}
              style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-outline)', flexShrink: 0 }}
            />
            <span
              style={{
                fontWeight: isSelected ? 600 : 400,
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {node.name.replace(/\.(md|markdown)$/i, '')}
            </span>
            {isCurrentFile && (
              <Badge variant="neutral" size="sm">atual</Badge>
            )}
          </div>

          {isSelected && (
            <CheckCircle2 size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          )}
        </div>
      );
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'doc') {
      if (!selectedDocPath) return;
      const finalUrl = selectedDocPath;
      const finalLabel = linkText.trim() || getTruncatedDefaultLabel(selectedDocPath, 'doc');
      onConfirm(finalUrl, finalLabel);
    } else if (activeTab === 'snippet') {
      if (!snippetUrl.trim()) return;
      let finalUrl = snippetUrl.trim();
      const mdMatch = finalUrl.match(/^\[(?:[^\]]*)\]\(([^)]+)\)$/);
      if (mdMatch) {
        finalUrl = mdMatch[1].trim();
      }
      finalUrl = finalUrl.replace(/^["'<]|["'>]$/g, '').trim();
      const finalLabel = linkText.trim() || getTruncatedDefaultLabel(finalUrl, 'snippet');
      onConfirm(finalUrl, finalLabel);
    } else {
      if (!customUrl.trim()) return;
      let finalUrl = customUrl.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('mailto:')) {
        finalUrl = `https://${finalUrl}`;
      }
      const finalLabel = linkText.trim() || getTruncatedDefaultLabel(finalUrl, 'url');
      onConfirm(finalUrl, finalLabel);
    }

    onClose();
  };

  const isSubmitDisabled =
    (activeTab === 'doc' && !selectedDocPath) ||
    (activeTab === 'snippet' && !snippetUrl.trim()) ||
    (activeTab === 'url' && !customUrl.trim());

  const tabItems = [
    { id: 'doc', label: 'Documento', icon: <FileText size={15} /> },
    { id: 'snippet', label: 'Trecho (Link)', icon: <FileCode size={15} /> },
    { id: 'url', label: 'Web (URL)', icon: <Globe size={15} /> },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || (initialUrl ? 'Editar Link / Referência' : 'Inserir Link / Referência')}
      icon={initialUrl ? <Edit3 size={18} /> : <LinkIcon size={18} />}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={isSubmitDisabled}
            onClick={handleSubmit}
            icon={initialUrl ? <Check size={14} /> : <LinkIcon size={14} />}
          >
            {initialUrl ? 'Salvar Link' : 'Inserir Link'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormField
          label="Texto de Exibição"
          helperText="Se vazio, usará o nome do documento ou URL de forma resumida."
        >
          <Input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="Ex: Documento de Autenticação"
          />
        </FormField>

        <Tabs
          tabs={tabItems}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as "doc" | "snippet" | "url")}
          variant="pills"
        />

        <div style={{ minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'doc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <Input
                leftIcon={<Search size={14} />}
                value={searchDoc}
                onChange={(e) => setSearchDoc(e.target.value)}
                placeholder="Filtrar documentos no workspace..."
                clearable
                onClear={() => setSearchDoc('')}
              />

              <div
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'var(--color-surface-container-lowest)',
                  padding: '6px',
                }}
              >
                {displayTree.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-outline)', fontSize: '13px' }}>
                    Nenhum documento encontrado no workspace.
                  </div>
                ) : (
                  renderTree(displayTree)
                )}
              </div>

              {selectedDocPath && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--color-primary)',
                    background: 'var(--color-primary-container)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>
                    Documento selecionado: <strong>{selectedDocPath}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'snippet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <FormField
                label="Cole o link do trecho copiado"
                helperText='Dica: No editor, selecione o texto desejado e use "Link do Trecho".'
              >
                <Textarea
                  rows={3}
                  value={snippetUrl}
                  onChange={(e) => setSnippetUrl(e.target.value)}
                  placeholder="Ex: specs/auth.md#:~:text=login%20via%20Google..."
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}
                  autoFocus
                />
              </FormField>

              {snippetParsedInfo && snippetParsedInfo.fragment && (
                <div
                  style={{
                    background: 'var(--color-surface-container)',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-outline)' }}>
                    PREVIEW DO TRECHO IDENTIFICADO:
                  </div>
                  <div>
                    Arquivo: <strong>{snippetParsedInfo.filePath || 'Documento atual'}</strong>
                  </div>
                  <div style={{ color: 'var(--color-primary)', background: 'var(--color-primary-container)', padding: '4px 8px', borderRadius: '4px' }}>
                    Trecho: <strong>"{snippetParsedInfo.fragment.exact}"</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <FormField
                label="Endereço Web (URL)"
                helperText="Insira links para documentações online, repositórios externos, APIs ou artigos."
              >
                <Input
                  leftIcon={<ExternalLink size={14} />}
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://exemplo.com/documentacao..."
                  autoFocus
                />
              </FormField>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};
