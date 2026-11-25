import React, { useState } from 'react';
import { FileText, Download, ExternalLink, Copy, Check, RefreshCw, Laptop, FolderGit2 } from 'lucide-react';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { API } from '../../../services/api';

interface PdfViewerProps {
  filePath: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ filePath }) => {
  const { activeRepo } = useWorkspace();
  const [isExtracting, setIsExtracting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openedInOS, setOpenedInOS] = useState(false);
  const fileUrl = `/api/project/file/raw?path=${encodeURIComponent(filePath)}`;

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

  const handleOpenInNewTab = () => {
    window.open(fileUrl, '_blank');
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = filePath.split('/').pop() || 'documento.pdf';
    a.click();
  };

  const extractPdfText = async (): Promise<string> => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const loadingTask = pdfjs.getDocument({ url: fileUrl });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const textBlocks: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(' ')
        .replace(/\s+/g, ' ');

      if (pageText.trim()) {
        textBlocks.push(`## Página ${i}\n\n${pageText}`);
      }
    }

    return textBlocks.join('\n\n');
  };

  const handleCopyText = async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    try {
      const text = await extractPdfText();
      if (!text.trim()) {
        alert('Nenhum texto legível encontrado neste PDF (pode ser uma imagem digitalizada).');
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err: unknown) {
      console.error('[PdfViewer] Erro ao extrair texto:', err);
      alert('Não foi possível extrair o texto do PDF: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#ffffff',
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
          <FileText size={16} style={{ color: '#d93025' }} />
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{filePath}</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#fce8e6',
              color: '#d93025',
              fontWeight: 600,
            }}
          >
            PDF
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleCopyText}
            disabled={isExtracting}
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
              cursor: isExtracting ? 'wait' : 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            title="Extrair e copiar todo o texto do PDF"
          >
            {isExtracting ? (
              <>
                <RefreshCw size={13} className="spinning" />
                Extraindo...
              </>
            ) : copied ? (
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
            onClick={handleOpenInNewTab}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 12px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#334155',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <ExternalLink size={14} />
            Nova Aba
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
            Baixar PDF
          </button>
        </div>
      </div>

      {/* PDF Iframe Canvas with clean light container */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', background: '#525659' }}>
        <iframe
          src={fileUrl}
          title={filePath}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};
export default PdfViewer;
