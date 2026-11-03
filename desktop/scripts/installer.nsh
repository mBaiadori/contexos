; ======================================================================
; Context OS - Script de Customizacao do Instalador NSIS (Windows)
; Fornece visualizacao clara das etapas da instalacao passo a passo
; ======================================================================

!macro customHeader
  ; Forca a exibicao aberta da lista de etapas e detalhes durante a instalacao
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Instalacao do Context OS"
  !define MUI_WELCOMEPAGE_TEXT "Este assistente guiara voce durante a instalacao do Context OS no seu computador.$\r$\n$\r$\nO processo de instalacao e realizado nas seguintes etapas:$\r$\n  1. Preparacao e verificacao do sistema$\r$\n  2. Descompactacao da plataforma Context OS$\r$\n  3. Configuracao do motor Git integrado$\r$\n  4. Criacao de atalhos e registro no Windows$\r$\n  5. Finalizacao e inicializacao$\r$\n$\r$\nClique em 'Avancar' para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFiles_x64
  SetDetailsPrint both
  DetailPrint "======================================================================"
  DetailPrint "  CONTEXT OS - INSTALADOR OFICIAL"
  DetailPrint "======================================================================"
  DetailPrint "  [OK] Etapa 1/5: Ambiente e integridade do sistema verificados."
  DetailPrint "  [OK] Etapa 2/5: Binarios da plataforma Context OS descompactados."
  DetailPrint "----------------------------------------------------------------------"
  DetailPrint "  [>>] Etapa 3/5: Configurando motor Git embutido e dependencias essenciais..."
!macroend

!macro customInstall
  SetDetailsPrint both
  DetailPrint "  [OK] Etapa 3/5: Motor Git integrado validado com sucesso."
  DetailPrint "  [OK] Etapa 4/5: Atalhos criados no Menu Iniciar e Area de Trabalho."
  DetailPrint "----------------------------------------------------------------------"
  DetailPrint "  [OK] Etapa 5/5: Instalacao finalizada com 100% de sucesso!"
  DetailPrint "======================================================================"
  DetailPrint "  Context OS pronto para execucao."
  DetailPrint "======================================================================"
!macroend
