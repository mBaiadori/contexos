#!/usr/bin/env bash
set -e

# ==============================================================================
# Contexos - Instalador Oficial para Linux
# Baixa e instala a versão mais recente em ~/.local/bin
# ==============================================================================

REPO="mBaiadori/project-boilerplate"
APP_NAME="Contexos"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

echo "🚀 Iniciando instalação do $APP_NAME no Linux..."

# 1. Cria diretórios de destino
mkdir -p "$BIN_DIR"
mkdir -p "$DESKTOP_DIR"

# 2. Consulta versão mais recente no GitHub
echo "🔍 Consultando versão mais recente no GitHub..."
LATEST_JSON=$(curl -sSL "https://api.github.com/repos/$REPO/releases/latest")
LATEST_TAG=$(echo "$LATEST_JSON" | grep -m1 '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  echo "❌ Falha ao obter release mais recente. Verifique sua conexão com a internet."
  exit 1
fi
echo "📦 Versão identificada: $LATEST_TAG"

# 3. Localiza AppImage ou Deb
DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep "browser_download_url" | grep -E "\.AppImage\"" | head -n1 | cut -d '"' -f 4)

if [ -n "$DOWNLOAD_URL" ]; then
  DEST_FILE="$BIN_DIR/context-os.AppImage"
  echo "⬇️ Baixando pacote AppImage oficial..."
  curl -sSL -L "$DOWNLOAD_URL" -o "$DEST_FILE"
  chmod +x "$DEST_FILE"

  # Cria lançador de desktop (.desktop)
  cat <<EOF > "$DESKTOP_DIR/context-os.desktop"
[Desktop Entry]
Name=Contexos
Exec=$DEST_FILE %U
Terminal=false
Type=Application
Icon=application-x-executable
Categories=Development;
EOF
  chmod +x "$DESKTOP_DIR/context-os.desktop"

  echo ""
  echo "🎉 $APP_NAME ($LATEST_TAG) instalado com sucesso em $DEST_FILE!"
  echo "👉 Execute digitando: ~/.local/bin/context-os.AppImage ou pelo menu de aplicativos."
else
  echo "ℹ️ Nenhum binário AppImage pré-compilado encontrado para este release."
fi
