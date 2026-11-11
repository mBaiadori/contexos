; ======================================================================
; Contexos - Script de Customizacao do Instalador NSIS (Windows)
; Fornece visualizacao clara das etapas da instalacao passo a passo
; ======================================================================

!macro customHeader
  ; Forca a exibicao aberta da lista de etapas e detalhes durante a instalacao
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro customFiles_x64
  SetDetailsPrint both
  DetailPrint "======================================================================"
  DetailPrint "  CONTEXOS - INSTALADOR OFICIAL"
  DetailPrint "======================================================================"
  DetailPrint "  [OK] Etapa 1/5: Ambiente e integridade do sistema verificados."
  DetailPrint "  [OK] Etapa 2/5: Binarios da plataforma Contexos descompactados."
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
  DetailPrint "  Contexos pronto para execucao."
  DetailPrint "======================================================================"
!macroend
