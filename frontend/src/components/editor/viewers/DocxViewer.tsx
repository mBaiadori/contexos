import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { FileText, Download, RefreshCw, AlertCircle, Copy, Check, Laptop, FolderGit2 } from 'lucide-react';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { API } from '../../../services/api';

interface DocxViewerProps {
  filePath: string;
}

export const DocxViewer: React.FC<DocxViewerProps> = ({ filePath }) => {
  const { activeRepo } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openedInOS, setOpenedInOS] = useState(false);

  const handleOpenInOS = async () => {
    try {
      const res = await API.openInOS(filePath);
      if (res.ok) {
        setOpenedInOS(true);
        setTimeout(() => setOpenedInOS(false), 2000);
      } else {
        alert(res.data?.error || 'Erro ao abrir no sistema operacional.');
      }
    } catch {
      alert('Erro ao conectar com o servidor.');
    }
  };

  const loadDocx = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/project/file/raw?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        throw new Error(`Falha ao carregar documento Word (${res.statusText})`);
      }
      const arrayBuffer = await res.arrayBuffer();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        await renderAsync(arrayBuffer, containerRef.current, undefined, {
          className: 'docx-rendered-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
        });
      }
    } catch (err: unknown) {
      console.error('[DocxViewer] Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao renderizar documento Word.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocx();
  }, [filePath]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/project/file/raw?path=${encodeURIComponent(filePath)}`;
    a.download = filePath.split('/').pop() || 'documento.docx';
    a.click();
  };

  const handleCopyText = async () => {
    if (!containerRef.current) return;
    const text = containerRef.current.innerText || '';
    if (!text.trim()) {
      alert('Nenhum texto legível encontrado neste documento.');
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#f8fafc',
        color: '#1e293b',
        overflow: 'hidden',
      }}
    >
      {/* Top Toolbar - Light Theme */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 24px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '13px',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#eff6ff',
              border: '1px solid #dbeafe',
              color: '#1d4ed8',
              fontSize: '11.5px',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <FolderGit2 size={12} />
            <span>{activeRepo?.name || 'local'}</span>
          </div>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>/</span>
          <FileText size={16} style={{ color: '#1a73e8' }} />
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{filePath}</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#e8f0fe',
              color: '#1a73e8',
              fontWeight: 600,
            }}
          >
            Word DOCX
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={loadDocx}
            title="Recarregar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleCopyText}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '6px',
              background: copied ? '#dcfce7' : '#f8fafc',
              border: '1px solid',
              borderColor: copied ? '#86efac' : '#e2e8f0',
              color: copied ? '#16a34a' : '#334155',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            title="Copiar todo o texto do documento"
          >
            {copied ? (
              <>
                <Check size={13} />
                Conteúdo Copiado!
              </>
            ) : (
              <>
                <Copy size={13} />
                Copiar Conteúdo
              </>
            )}
          </button>

          <button
            onClick={handleOpenInOS}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 12px',
              borderRadius: '6px',
              background: openedInOS ? '#dcfce7' : '#f8fafc',
              border: '1px solid',
              borderColor: openedInOS ? '#86efac' : '#e2e8f0',
              color: openedInOS ? '#16a34a' : '#334155',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
            title="Abrir no gerenciador de arquivos do PC"
          >
            <Laptop size={14} />
            {openedInOS ? 'Aberto no PC!' : 'Abrir no PC'}
          </button>

          <button
            onClick={handleDownload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 14px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#334155',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <Download size={14} />
            Baixar DOCX
          </button>
        </div>
      </div>

      {/* Doc Canvas with generous padding framing */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px 48px 64px 48px',
          display: 'flex',
          justifyContent: 'center',
          background: '#f1f5f9',
        }}
      >
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
            Processando documento Word...
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#dc2626', gap: '8px' }}>
            <AlertCircle size={32} />
            <div>{error}</div>
          </div>
        )}
        <div
          ref={containerRef}
          style={{
            display: isLoading || error ? 'none' : 'block',
            width: '100%',
            maxWidth: '850px',
            background: '#ffffff',
            color: '#1e293b',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
            padding: '48px',
            minHeight: '800px',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
};
export default DocxViewer;
