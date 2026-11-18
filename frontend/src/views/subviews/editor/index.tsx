import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { useAI } from '../../../context/AIContext';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { FileTree } from '../../../components/explorer/FileTree';
import { WorkbenchCanvas } from '../../../components/editor/WorkbenchCanvas';
import type { EditorSubViewProps } from './types';
import { useEditorLayout } from './hooks/useEditorLayout';
import { EditorLoadingBar } from './components/EditorLoadingBar';
import { EditorVersionBar } from './components/EditorVersionBar';

export const EditorSubView: React.FC<EditorSubViewProps> = ({
  onOpenScaffoldWizard,
  onOpenDiffModal,
  onToggleCopilot,
  onOpenFile,
}) => {
  const activeFile = useEditorStore((s) => s.activeFile);
  const fileContent = useEditorStore((s) => s.fileContent);
  const setFileContent = useEditorStore((s) => s.setFileContent);
  const loadFile = useEditorStore((s) => s.loadFile);
  const isLoadingFile = useEditorStore((s) => s.isLoadingFile);
  const { sendMessage } = useAI();
  const { activeRepo, gitStatus, versionGraph } = useWorkspace();
  const [isDraftPromptOpen, setIsDraftPromptOpen] = useState(false);
  const dismissedForBranchRef = useRef<string | null>(null);

  const defaultBranch = versionGraph?.defaultBranch || activeRepo?.default_branch || 'main';
  const currentBranch = gitStatus?.branch || versionGraph?.currentBranch || defaultBranch;
  const isDetached = Boolean(versionGraph?.isDetached);
  const isOfficial = !isDetached && currentBranch === defaultBranch;
  const activeNode = versionGraph?.nodes?.find((n) => n.name === currentBranch);
  const isPublished = !isDetached && !isOfficial && Boolean(activeNode?.isMerged || activeNode?.publicationStatus === 'published');

  useEffect(() => {
    dismissedForBranchRef.current = null;
  }, [activeFile, currentBranch, isDetached, isPublished]);

  const handleContentChange = (nextContent: string) => {
    setFileContent(nextContent);
    if ((isOfficial || isDetached || isPublished) && !isDraftPromptOpen) {
      const key = `${activeFile}:${currentBranch}:${isDetached}:${isPublished}`;
      if (dismissedForBranchRef.current !== key) {
        dismissedForBranchRef.current = key;
        setIsDraftPromptOpen(true);
      }
    }
  };

  const {
    isTreeCollapsed,
    handleToggleTreeCollapse,
    treeWidth,
    handleStartResize,
  } = useEditorLayout();

  const handleSendSelectionToCopilot = (text: string) => {
    sendMessage(`Analise a seguinte seção selecionada no documento:\n\n${text}`);
  };

  const suggestedName = activeFile
    ? `edicao-${activeFile.split('/').pop()?.replace(/\.[^.]+$/, '') || 'documento'}`
    : 'nova-edicao';

  return (
    <div id="subview-editor" className="dash-subview" style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div className="workbench-layout">
        {/* PANEL 1: DOCUMENT TREE EXPLORER (DOCKABLE / RESIZABLE) */}
        <FileTree
          onOpenFile={(path) => {
            loadFile(path);
            onOpenFile?.(path);
          }}
          isCollapsed={isTreeCollapsed}
          onToggleCollapse={handleToggleTreeCollapse}
          width={treeWidth}
        />

        {/* Resizer Divider between Tree and Editor */}
        {!isTreeCollapsed && (
          <div
            id="resizer-tree"
            className="pane-resizer"
            onMouseDown={handleStartResize}
            title="Arrastar para redimensionar árvore de documentos"
          />
        )}

        {/* PANEL 2: EDITOR & LIVE PREVIEW CANVAS */}
        <section className="workbench-editor-pane" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <EditorVersionBar
            isDraftPromptOpen={isDraftPromptOpen}
            onCloseDraftPrompt={() => setIsDraftPromptOpen(false)}
            onOpenDraftPrompt={() => setIsDraftPromptOpen(true)}
            suggestedDraftName={suggestedName}
          />
          {isLoadingFile && <EditorLoadingBar />}
          {isLoadingFile && !activeFile ? (
            <div className="loading-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Carregando documento...
            </div>
          ) : (
            <WorkbenchCanvas
              filePath={activeFile}
              content={fileContent}
              onChange={handleContentChange}
              onNavigateFile={(path) => {
                loadFile(path);
                onOpenFile?.(path);
              }}
              onReload={() => activeFile && loadFile(activeFile)}
              onOpenDiffModal={onOpenDiffModal}
              onToggleCopilot={onToggleCopilot}
              onOpenScaffoldWizard={onOpenScaffoldWizard}
              onSendSelectionToCopilot={handleSendSelectionToCopilot}
            />
          )}
        </section>
      </div>
    </div>
  );
};

export default EditorSubView;
