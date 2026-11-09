import net from 'node:net';

/**
 * Verifica de forma atômica e exclusiva se uma porta está livre em um host específico.
 */
export function isPortFreeOnHost(port: number, host: string): Promise<boolean> {
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
 * Encontra uma porta TCP livre a partir de startPort com tentativas incrementais.
 *
 * Considerações Multiplataforma (macOS, Windows, Linux):
 * 1. Interface Bindings (macOS/Darwin): No macOS, sockets BSD permitem que 0.0.0.0
 *    faça bind com sucesso mesmo se 127.0.0.1 estiver em uso pelo dev server.
 *    Portanto, precisamos checar 127.0.0.1 E 0.0.0.0.
 * 2. SO_EXCLUSIVEADDRUSE (Windows): Usamos `exclusive: true` para evitar que o Winsock
 *    permita múltiplos binds com reaproveitamento silencioso de porta.
 * 3. Faixas Dinâmicas Reservadas (Windows Hyper-V / WSL2): Se uma porta estiver na faixa
 *    excluída do Windows NAT, ela emite erro de permissão (EACCES/WSAEACCES). Nosso handler
 *    trata qualquer erro rejeitando a porta e avançando com segurança.
 * 4. Fechamento Síncrono / TIME_WAIT: Aguarda o callback `server.close()` finalizar
 *    antes de declarar a porta livre, prevenindo condições de corrida na inicialização do Fastify.
 */
export async function findAvailablePort(startPort: number = 4100, maxAttempts: number = 50): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;

    // 1. Testa loopback IPv4 (onde o Fastify prioritariamente escuta)
    const freeLoopback = await isPortFreeOnHost(port, '127.0.0.1');
    if (!freeLoopback) continue;

    // 2. Testa wildcard IPv4 (para garantir que nenhum outro daemon ou container ocupa a porta)
    const freeWildcard = await isPortFreeOnHost(port, '0.0.0.0');
    if (!freeWildcard) continue;

    return port;
  }
  return startPort;
}
