import React, { useState, useEffect } from 'react';
import { parseSpreadsheet } from '../../../utils/spreadsheet';
import { FileSpreadsheet, Download, Search, RefreshCw, AlertCircle, Laptop, FolderGit2 } from 'lucide-react';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { API } from '../../../services/api';

interface ExcelViewerProps {
  filePath: string;
}

export const ExcelViewer: React.FC<ExcelViewerProps> = ({ filePath }) => {
  const { activeRepo } = useWorkspace();
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [sheetData, setSheetData] = useState<any[][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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

  const loadExcelFile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/project/file/raw?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar arquivo Excel (${response.statusText})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      setFileBuffer(arrayBuffer);
      const parsed = await parseSpreadsheet(arrayBuffer);
      setSheetNames(parsed.sheetNames);
      setActiveSheet(parsed.activeSheet);
      setSheetData(parsed.rows);
    } catch (err: unknown) {
      console.error('[ExcelViewer] Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar planilha Excel.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExcelFile();
  }, [filePath]);

  const handleSelectSheet = async (name: string) => {
    if (!fileBuffer) return;
    try {
      setIsLoading(true);
      const parsed = await parseSpreadsheet(fileBuffer, name);
      setActiveSheet(parsed.activeSheet);
      setSheetData(parsed.rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alternar de aba.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/project/file/raw?path=${encodeURIComponent(filePath)}`;
    a.download = filePath.split('/').pop() || 'planilha.xlsx';
    a.click();
  };

  const filteredData = sheetData.filter((row) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return row.some((cell) => String(cell).toLowerCase().includes(term));
  });

  const getColLetter = (index: number) => {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  };

  const maxCols = Math.max(0, ...sheetData.map((row) => row.length));

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
          <FileSpreadsheet size={16} style={{ color: '#16a34a' }} />
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{filePath}</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#dcfce7',
              color: '#16a34a',
              fontWeight: 600,
            }}
          >
            {sheetData.length} linhas
          </span>
        </div>

        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#f8fafc',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            minWidth: '200px',
          }}
        >
          <Search size={14} style={{ color: '#94a3b8', marginRight: '6px' }} />
          <input
            type="text"
            placeholder="Pesquisar na aba..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#1e293b',
              fontSize: '12px',
              width: '100%',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={loadExcelFile}
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
            onClick={handleOpenInOS}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
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
              gap: '6px',
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
            Baixar Excel
          </button>
        </div>
      </div>

      {/* Main Sheet Grid Area with right padding */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: '16px 32px 32px 16px', background: '#ffffff' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
            Processando planilha Excel...
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#dc2626', gap: '8px' }}>
            <AlertCircle size={32} />
            <div>{error}</div>
            <button
              onClick={loadExcelFile}
              style={{
                padding: '6px 14px',
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', display: 'inline-block', minWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', fontFamily: 'system-ui, sans-serif' }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th
                    style={{
                      padding: '8px 10px',
                      width: '45px',
                      color: '#94a3b8',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid #e2e8f0',
                      textAlign: 'center',
                      fontWeight: 600,
                      background: '#f8fafc',
                    }}
                  >
                    #
                  </th>
                  {Array.from({ length: maxCols }).map((_, colIdx) => (
                    <th
                      key={colIdx}
                      style={{
                        padding: '8px 12px',
                        color: '#475569',
                        borderRight: '1px solid #e2e8f0',
                        borderBottom: '1px solid #e2e8f0',
                        textAlign: 'center',
                        fontWeight: 600,
                        minWidth: '100px',
                        background: '#f8fafc',
                      }}
                    >
                      {getColLetter(colIdx)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      background: rIdx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 8px',
                        color: '#94a3b8',
                        borderRight: '1px solid #e2e8f0',
                        textAlign: 'center',
                        fontSize: '11px',
                        background: '#f8fafc',
                        userSelect: 'none',
                      }}
                    >
                      {rIdx + 1}
                    </td>
                    {Array.from({ length: maxCols }).map((_, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          padding: '6px 12px',
                          borderRight: '1px solid #f1f5f9',
                          color: '#1e293b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '300px',
                        }}
                        title={String(row[colIdx] ?? '')}
                      >
                        {row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Sheet Tabs - Light Theme */}
      {sheetNames.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 16px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {sheetNames.map((name) => (
            <button
              key={name}
              onClick={() => handleSelectSheet(name)}
              style={{
                padding: '6px 14px',
                borderRadius: '4px 4px 0 0',
                border: '1px solid',
                borderColor: activeSheet === name ? '#e2e8f0 #e2e8f0 transparent #e2e8f0' : 'transparent',
                background: activeSheet === name ? '#ffffff' : 'transparent',
                color: activeSheet === name ? '#1a73e8' : '#64748b',
                fontWeight: activeSheet === name ? 600 : 400,
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 0.15s ease',
                borderTop: activeSheet === name ? '2px solid #1a73e8' : '2px solid transparent',
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
export default ExcelViewer;
