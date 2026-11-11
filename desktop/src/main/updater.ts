import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const c = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const lPart = l[i] ?? 0;
    const cPart = c[i] ?? 0;
    if (lPart > cPart) return true;
    if (lPart < cPart) return false;
  }
  return false;
}

async function checkGitHubReleaseForMac(getMainWindow: () => BrowserWindow | null) {
  try {
    const currentVersion = app.getVersion();
    console.log(`[AutoUpdater Mac] Verificando versão mais recente no GitHub Releases (atual: ${currentVersion})...`);
    getMainWindow()?.webContents.send('updater:status', { status: 'checking' });

    const response = await fetch('https://api.github.com/repos/mBaiadori/contexos/releases/latest', {
      headers: {
        'User-Agent': 'Contexos-Desktop-Updater',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.warn(`[AutoUpdater Mac] Resposta do GitHub Releases: HTTP ${response.status}`);
      return;
    }

    const release = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };

    const rawTag = release.tag_name || '';
    const latestVersion = rawTag.replace(/^v/, '');

    if (isNewerVersion(latestVersion, currentVersion)) {
      console.log(`[AutoUpdater Mac] Nova versão encontrada: ${latestVersion} (atual: ${currentVersion})`);
      const arch = process.arch;
      const zipAsset =
        release.assets?.find((a) => a.name?.includes(arch) && a.name?.endsWith('.zip')) ||
        release.assets?.find((a) => a.name?.endsWith('.zip'));

      const dmgAsset =
        release.assets?.find((a) => a.name?.includes(arch) && a.name?.endsWith('.dmg')) ||
        release.assets?.find((a) => a.name?.endsWith('.dmg'));

      const asset = zipAsset || dmgAsset;
      const downloadUrl = asset?.browser_download_url || release.html_url || '';

      getMainWindow()?.webContents.send('updater:status', {
        status: 'available-manual',
        version: latestVersion,
        downloadUrl,
      });
    } else {
      console.log(`[AutoUpdater Mac] O aplicativo já está na versão mais recente: ${currentVersion}`);
      getMainWindow()?.webContents.send('updater:status', {
        status: 'up-to-date',
        version: currentVersion,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[AutoUpdater Mac] Falha ao verificar release no GitHub:', message);
    getMainWindow()?.webContents.send('updater:status', {
      status: 'error',
      error: message,
    });
  }
}

/**
 * Configura o serviço de Auto-Update para o Electron Desktop
 * Monitora releases no GitHub e envia notificações de progresso ao frontend
 */
export function setupAutoUpdater(
  getMainWindow: () => BrowserWindow | null,
  validateIpcSender: (event: Electron.IpcMainInvokeEvent) => void
) {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Modo desenvolvimento ativo: auto-updater em standby.');
    return;
  }

  if (process.platform === 'win32') {
    // Configurações do autoUpdater nativo do Electron com download automático em background para Windows
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Verificando atualizações no GitHub Releases...');
      getMainWindow()?.webContents.send('updater:status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      console.log(`[AutoUpdater] Nova versão encontrada: ${info.version}`);
      getMainWindow()?.webContents.send('updater:status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log(`[AutoUpdater] O aplicativo já está na versão mais recente: ${info.version}`);
      getMainWindow()?.webContents.send('updater:status', {
        status: 'up-to-date',
        version: info.version,
      });
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] Erro durante verificação de atualizações:', err?.message || err);
      getMainWindow()?.webContents.send('updater:status', {
        status: 'error',
        error: err?.message || 'Erro ao checar atualizações',
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      getMainWindow()?.webContents.send('updater:progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[AutoUpdater] Versão ${info.version} baixada e pronta para instalação.`);
      getMainWindow()?.webContents.send('updater:status', {
        status: 'downloaded',
        version: info.version,
      });
    });
  }

  // Handlers IPC para controle pelo frontend
  ipcMain.handle('updater:check', async (event) => {
    validateIpcSender(event);
    if (!app.isPackaged) {
      return { status: 'dev-mode', message: 'Auto-updater inativo em modo dev.' };
    }
    if (process.platform === 'darwin') {
      await checkGitHubReleaseForMac(getMainWindow);
      return { status: 'checked' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checked', updateInfo: result?.updateInfo };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: message };
    }
  });

  ipcMain.handle('updater:quit-and-install', async (event) => {
    validateIpcSender(event);
    if (!app.isPackaged) return;

    if (process.platform === 'win32') {
      console.log('[AutoUpdater Windows] Reiniciando aplicativo para aplicar atualização...');
      autoUpdater.quitAndInstall();
    } else if (process.platform === 'darwin') {
      console.log('[AutoUpdater Mac] Disparando script de atualização automática com reinicialização...');
      getMainWindow()?.webContents.send('updater:status', { status: 'updating' });

      // Script de atualização oficial que roda em background, substitui o .app e reabre
      const updaterScript = `
        sleep 1
        curl -sSL https://raw.githubusercontent.com/mBaiadori/contexos/main/scripts/install-mac.sh | bash -s -- --relaunch
      `;

      const child = spawn('/bin/bash', ['-c', updaterScript], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      setTimeout(() => {
        app.quit();
      }, 1000);
    }
  });

  // Executa uma checagem automática 5 segundos após o boot da janela
  setTimeout(() => {
    if (process.platform === 'darwin') {
      checkGitHubReleaseForMac(getMainWindow);
    } else {
      autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[AutoUpdater] Falha no checkForUpdatesAndNotify inicial:', message);
      });
    }
  }, 5000);
}
