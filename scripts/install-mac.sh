#!/usr/bin/env bash
set -e

# ==============================================================================
# Contexos - Instalador Oficial para macOS
# Baixa e instala a versão mais recente em /Applications sem alertas do Gatekeeper
# ==============================================================================

REPO="mBaiadori/project-boilerplate"
APP_NAME="Contexos"
TARGET_DIR="/Applications"
APP_DEST="$TARGET_DIR/$APP_NAME.app"

echo "🚀 Iniciando instalação do $APP_NAME..."

# 1. Detecta arquitetura do Mac (Apple Silicon vs Intel)
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  ARCH_TAG="arm64"
else
  ARCH_TAG="x64"
fi
echo "💻 Arquitetura detectada: $ARCH ($ARCH_TAG)"

# 2. Busca URL do último release publicado no GitHub
echo "🔍 Consultando versão mais recente no GitHub..."
LATEST_JSON=$(curl -sSL "https://api.github.com/repos/$REPO/releases/latest")
LATEST_TAG=$(echo "$LATEST_JSON" | grep -m1 '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  echo "❌ Falha ao obter release mais recente. Verifique sua conexão com a internet."
  exit 1
fi
echo "📦 Versão identificada: $LATEST_TAG"

DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep "browser_download_url" | grep "$ARCH_TAG-mac.zip" | head -n1 | cut -d '"' -f 4)
if [ -z "$DOWNLOAD_URL" ]; then
  DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep "browser_download_url" | grep "mac.zip" | head -n1 | cut -d '"' -f 4)
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

ZIP_PATH="$TMP_DIR/context-os.zip"

echo "⬇️ Baixando pacote oficial ($ARCH_TAG)..."
curl -sSL -L "$DOWNLOAD_URL" -o "$ZIP_PATH"

echo "📂 Descompactando aplicativo..."
unzip -q "$ZIP_PATH" -d "$TMP_DIR/extracted"

SRC_APP=$(find "$TMP_DIR/extracted" -maxdepth 2 -name "*.app" | head -n 1)
if [ -z "$SRC_APP" ]; then
  echo "❌ Erro: Aplicativo não encontrado no pacote descompactado."
  exit 1
fi

echo "📲 Instalando em $TARGET_DIR..."
# Fecha instâncias antigas se estiverem abertas
killall -q "$APP_NAME" 2>/dev/null || true

rm -rf "$APP_DEST"
cp -R "$SRC_APP" "$TARGET_DIR/"

echo "🛡️ Configurando permissões e liberando Gatekeeper..."
xattr -cr "$APP_DEST"
codesign --force --deep --sign - "$APP_DEST" 2>/dev/null || true
xattr -cr "$APP_DEST"

echo ""
echo "🎉 Contexos ($LATEST_TAG) instalado com 100% de sucesso!"
echo "👉 Abra pelo Spotlight (Cmd + Barra de Espaço) ou em /Applications/$APP_NAME.app"
