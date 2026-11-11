import { app, BrowserWindow, shell, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bytenode from 'bytenode';
import { setupAutoUpdater } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let activeServerPort = 4100;

/**
 * Verifica de forma atômica e exclusiva se uma porta está livre em um host específico
 */
function isPortFreeOnHost(port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();

    let resolved = false;
    const finish = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    server.once('error', () => {
      finish(false);
    });

    try {
      server.listen({ port, host, exclusive: true }, () => {
        server.close(() => {
          finish(true);
        });
      });
    } catch {
      finish(false);
    }
  });
}

/**
 * Encontra uma porta TCP livre a partir de startPort
 * Suporta resiliência multiplataforma (macOS, Windows, Linux) checando 127.0.0.1 e 0.0.0.0 com exclusive: true
 */
async function findAvailablePort(startPort: number = 4100, maxAttempts: number = 50): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;

    // 1. Testa loopback IPv4
    const freeLoopback = await isPortFreeOnHost(port, '127.0.0.1');
    if (!freeLoopback) continue;

    // 2. Testa wildcard IPv4
    const freeWildcard = await isPortFreeOnHost(port, '0.0.0.0');
    if (!freeWildcard) continue;

    return port;
  }
  return startPort;
}

/**
 * Inicializa o processo do servidor Fastify/Express embutido com suporte a Bytenode
 */
async function startEmbeddedServer(): Promise<number> {
  const isDev = !app.isPackaged;
  const userDataDir = app.getPath('userData');
  const resourcesDir = process.resourcesPath || path.resolve(__dirname, '../../..');

  // Garante diretório do usuário criado
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Registra caminhos do node_modules no Module.globalPaths
  const appPath = app.getAppPath();
  const candidateModulePaths = [
    path.join(appPath, 'node_modules'),
    path.join(appPath + '.unpacked', 'node_modules'),
    path.join(resourcesDir, 'node_modules'),
  ];
  for (const p of candidateModulePaths) {
    if (fs.existsSync(p) && !(Module as any).globalPaths.includes(p)) {
      (Module as any).globalPaths.push(p);
    }
  }

  // Detecta porta livre dinamicamente (resiliência contra conflito com dev server)
  const port = await findAvailablePort(4100);
  activeServerPort = port;

  process.env.CONTEXT_OS_USER_DATA = userDataDir;
  process.env.CONTEXT_OS_RESOURCES = resourcesDir;
  process.env.PORT = String(port);
  process.env.NODE_ENV = isDev ? 'development' : 'production';

  const serverJsc = isDev
    ? path.resolve(__dirname, '../../../server/dist/server.jsc')
    : path.join(process.resourcesPath, 'server/server.jsc');

  const serverProdCjs = isDev
    ? path.resolve(__dirname, '../../../server/dist/server.prod.cjs')
    : path.join(process.resourcesPath, 'server/server.prod.cjs');

  console.log(`[Desktop Main] Inicializando backend protegido na porta ${port}... (caminho: ${serverProdCjs})`);

  let started = false;

  // Carrega o bundle de produção compilado e protegido
  if (fs.existsSync(serverProdCjs)) {
    try {
      console.log(`[Desktop Main] Carregando bundle protegido: ${serverProdCjs}`);
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      require(serverProdCjs);
      started = true;
    } catch (err: any) {
      console.error('[Desktop Main] Erro ao carregar bundle de produção:', err);
    }
  } else if (fs.existsSync(serverJsc)) {
    try {
      bytenode.runBytecodeFile(serverJsc);
      started = true;
    } catch (err: any) {
      console.warn('[Desktop Main] Erro no bytecode:', err.message);
    }
  }

  // Tentativa 3: Fallback dev JS
  if (!started) {
    const fallbackJs = path.resolve(__dirname, '../../../server/dist/server.js');
    if (fs.existsSync(fallbackJs)) {
      await import(pathToFileURL(fallbackJs).href);
    }
  }

  // Polling de verificação de prontidão do servidor Fastify
  console.log(`[Desktop Main] Aguardando inicialização do servidor HTTP na porta ${port}...`);
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) {
        console.log(`[Desktop Main] Servidor Fastify pronto e respondendo na porta ${port}!`);
        return port;
      }
    } catch {
      // Servidor ainda subindo
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.warn('[Desktop Main] Timeout no polling do servidor, prosseguindo com carregamento da janela...');
  return port;
}

/**
 * Criação da janela principal do Contexos
 */
function createMainWindow(port: number) {
  const preloadPath = fs.existsSync(path.join(__dirname, '../preload/index.cjs'))
    ? path.join(__dirname, '../preload/index.cjs')
    : path.join(__dirname, '../preload/index.js');

  const iconCandidates = [
    path.join(__dirname, '../../resources/icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ];
  const windowIcon = iconCandidates.find(p => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Contexos',
    icon: windowIcon,
    backgroundColor: '#0f172a',
    titleBarStyle: 'default',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const isDev = !app.isPackaged;
  const appUrl = isDev ? `http://localhost:5173` : `http://localhost:${port}`;

  console.log(`[Desktop Main] Carregando URL na janela: ${appUrl}`);
  mainWindow.loadURL(appUrl);

  // Redireciona links externos para o navegador padrão do sistema operacional
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Intercepta e neutraliza navegação in-window para destinos externos (M3)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const isLocal =
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        (parsed.port === String(activeServerPort) || parsed.port === '5173' || parsed.port === '5174');

      if (!isLocal) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-redirect', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const isLocal =
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        (parsed.port === String(activeServerPort) || parsed.port === '5173' || parsed.port === '5174');

      if (!isLocal) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function validateIpcSender(event: Electron.IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url || '';
  const allowedPrefixes = [
    `http://localhost:${activeServerPort}`,
    `http://127.0.0.1:${activeServerPort}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'app://',
    'file://',
  ];
  const isAllowed = allowedPrefixes.some((prefix) => senderUrl.startsWith(prefix));
  if (!isAllowed) {
    throw new Error(`Acesso IPC não autorizado originado de: '${senderUrl}'`);
  }
}

// Criptografia e Armazenamento Seguro via Keychain/DPAPI (safeStorage) - Fail-Closed (M1)
ipcMain.handle('secure-store:encrypt', async (event, plainText: string) => {
  validateIpcSender(event);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Armazenamento seguro indisponível no sistema operacional (safeStorage indisponível).');
  }
  const buffer = safeStorage.encryptString(plainText);
  return buffer.toString('base64');
});

ipcMain.handle('secure-store:decrypt', async (event, encryptedBase64: string) => {
  validateIpcSender(event);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Armazenamento seguro indisponível no sistema operacional (safeStorage indisponível).');
  }
  const buffer = Buffer.from(encryptedBase64, 'base64');
  return safeStorage.decryptString(buffer);
});

// Fornece o token de sessão local para o frontend sem necessidade de bootstrap HTTP
ipcMain.handle('desktop:get-session-token', async (event) => {
  validateIpcSender(event);
  try {
    const userDataDir = app.getPath('userData');
    const tokenPath = path.join(userDataDir, '.context-os', 'session-token');

    // Tenta ler o token do userDataDir aguardando inicialização do servidor se necessário
    for (let i = 0; i < 15; i++) {
      if (fs.existsSync(tokenPath)) {
        const content = fs.readFileSync(tokenPath, 'utf-8').trim();
        if (content) return content;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    const home = process.env.HOME || '';
    const homeTokenPath = path.join(home, '.context-os', 'session-token');
    if (fs.existsSync(homeTokenPath)) {
      return fs.readFileSync(homeTokenPath, 'utf-8').trim();
    }
  } catch {}
  return null;
});

// Fornece a versão do executável/aplicativo
ipcMain.handle('desktop:get-version', async (event) => {
  validateIpcSender(event);
  return app.getVersion();
});

// Abre links externos no navegador padrão do sistema de forma segura
ipcMain.handle('desktop:open-external', async (event, url: string) => {
  validateIpcSender(event);
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  }
});

// Inicialização do ciclo de vida do Electron
app.whenReady().then(async () => {
  const port = await startEmbeddedServer();
  createMainWindow(port);

  // Inicializa o serviço de atualizações automáticas via GitHub Releases
  setupAutoUpdater(() => mainWindow, validateIpcSender);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(activeServerPort);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
