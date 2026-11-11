# ==============================================================================
# Contexos - Instalador Oficial para Windows (PowerShell)
# Baixa e instala a versão mais recente silenciosamente
# ==============================================================================
$ErrorActionPreference = "Stop"

$repo = "mBaiadori/contexos"
$appName = "Contexos"

Write-Host "🚀 Iniciando instalação do $appName no Windows..." -ForegroundColor Cyan

# 1. Consulta versão mais recente no GitHub
Write-Host "🔍 Consultando versão mais recente no GitHub..." -ForegroundColor Yellow
$releaseUrl = "https://api.github.com/repos/$repo/releases/latest"
$release = Invoke-RestMethod -Uri $releaseUrl -Headers @{ "User-Agent" = "ContextOS-Installer" }

$latestTag = $release.tag_name
Write-Host "📦 Versão identificada: $latestTag" -ForegroundColor Green

# 2. Localiza instalador executável (.exe)
$asset = $release.assets | Where-Object { $_.name -like "*.exe" -and $_.name -notlike "*.blockmap" } | Select-Object -First 1

if (-not $asset) {
    Write-Error "❌ Nenhum executável de instalação encontrado no release $latestTag."
    exit 1
}

$downloadUrl = $asset.browser_download_url
$tempInstaller = Join-Path $env:TEMP "Context-OS-Setup.exe"

# 3. Download do executável
Write-Host "⬇️ Baixando $($asset.name)..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempInstaller

# 4. Executa instalação silenciosa
Write-Host "📲 Instalando $appName..." -ForegroundColor Cyan
$process = Start-Process -FilePath $tempInstaller -ArgumentList "/S" -Wait -PassThru

# Limpeza
Remove-Item -Path $tempInstaller -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "🎉 $appName ($latestTag) instalado com 100% de sucesso!" -ForegroundColor Green
Write-Host "👉 Você pode abrir pelo Menu Iniciar ou pelo atalho na Área de Trabalho." -ForegroundColor White
