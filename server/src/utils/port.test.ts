import test from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { findAvailablePort, isPortFreeOnHost } from './port.js';

test('Multiplatform Port Hunting Suite', async (t) => {
  await t.test('detecta porta ocupada em 127.0.0.1 e avança para a próxima porta livre', async () => {
    // Abre um servidor dummy ocupando uma porta arbitrária no loopback
    const dummyServer = net.createServer();
    const targetPort = 4250;

    await new Promise<void>((resolve, reject) => {
      dummyServer.once('error', reject);
      dummyServer.listen({ port: targetPort, host: '127.0.0.1', exclusive: true }, () => resolve());
    });

    try {
      const isLoopbackFree = await isPortFreeOnHost(targetPort, '127.0.0.1');
      assert.strictEqual(isLoopbackFree, false, 'Deveria identificar que 127.0.0.1 está ocupada');

      const foundPort = await findAvailablePort(targetPort, 10);
      assert.strictEqual(foundPort > targetPort, true, `Deveria encontrar porta livre maior que ${targetPort}`);
    } finally {
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()));
    }
  });

  await t.test('identifica porta livre quando nenhuma interface está bloqueada', async () => {
    const port = await findAvailablePort(4280, 10);
    assert.strictEqual(typeof port, 'number');
    assert.strictEqual(port >= 4280, true);
  });
});
