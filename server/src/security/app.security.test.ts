import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../app.js';
import { getSessionToken, isValidHostHeader, isValidSessionToken } from './session.js';
import { FastifyInstance } from 'fastify';

describe('Segurança de API e Autenticação de Sessão (Fase 3 - N3)', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  describe('3.1 Proteção de Host Header (Anti-DNS Rebinding)', () => {
    it('deve validar hosts locais legítimos', () => {
      assert.strictEqual(isValidHostHeader('localhost'), true);
      assert.strictEqual(isValidHostHeader('localhost:4100'), true);
      assert.strictEqual(isValidHostHeader('127.0.0.1:4100'), true);
      assert.strictEqual(isValidHostHeader('[::1]:4100'), true);
    });

    it('deve rejeitar hosts externos ou de rebinding', () => {
      assert.strictEqual(isValidHostHeader('evil.example.com'), false);
      assert.strictEqual(isValidHostHeader('attacker.local'), false);
      assert.strictEqual(isValidHostHeader('192.168.1.100:4100'), false);
    });

    it('deve retornar 403 se Host header for hostil (DNS rebinding)', async () => {
      const token = getSessionToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: 'evil.example.com',
          'x-contextos-token': token,
        },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body, /Host não autorizado/i);
    });
  });

  describe('3.2 Autenticação Obrigatória para Rotas /api/*', () => {
    it('deve permitir acesso sem token apenas na rota de bootstrap', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.ok(json.token, 'Deve retornar o token de sessão');
      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie, 'Deve emitir Set-Cookie com ctxos_session');
      assert.match(String(setCookie), /Max-Age=43200/i, 'Cookie deve conter Max-Age=43200 alinhado com 12h de sessão');
    });

    it('deve recusar com 401 chamadas a /api/* sem token de sessão', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: '127.0.0.1:4100',
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.match(res.body, /Não autorizado|Sessão inválida/i);
    });

    it('deve recusar com 401 chamadas com token de sessão falso', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: '127.0.0.1:4100',
          'x-contextos-token': 'token-falso-invalido-1234567890',
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.match(res.body, /Não autorizado|Sessão inválida/i);
    });

    it('deve autorizar acesso via header X-ContextOS-Token válido', async () => {
      const token = getSessionToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: '127.0.0.1:4100',
          'x-contextos-token': token,
        },
      });

      assert.strictEqual(res.statusCode, 200);
    });

    it('deve autorizar acesso via cookie ctxos_session válido (usado por EventSource/SSE)', async () => {
      const token = getSessionToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: '127.0.0.1:4100',
          cookie: `ctxos_session=${token}; other_cookie=123`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
    });
  });

  describe('3.3 Hardening do Bootstrap e Proteção de Sessão (Fase 1 - S1, S5)', () => {
    it('deve rejeitar Host header ausente na função isValidHostHeader', () => {
      assert.strictEqual(isValidHostHeader(undefined), false);
      assert.strictEqual(isValidHostHeader(''), false);
    });

    it('deve recusar bootstrap com 403 se Origin for de porta local diferente não autorizada (ex: 3000 ou 9999)', async () => {
      const res3000 = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
          origin: 'http://localhost:3000',
        },
      });
      assert.strictEqual(res3000.statusCode, 403);

      const res9999 = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
          origin: 'http://127.0.0.1:9999',
        },
      });
      assert.strictEqual(res9999.statusCode, 403);
    });

    it('deve permitir bootstrap com 200 se Origin for da mesma origem ou Vite dev (5173)', async () => {
      const resSameOrigin = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
          origin: 'http://127.0.0.1:4100',
        },
      });
      assert.strictEqual(resSameOrigin.statusCode, 200);

      const resVite = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
          origin: 'http://localhost:5173',
        },
      });
      assert.strictEqual(resVite.statusCode, 200);

      const resVite5174 = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
          origin: 'http://localhost:5174',
        },
      });
      assert.strictEqual(resVite5174.statusCode, 200);
    });

    it('não deve registrar ou expor /api/test-leak-error quando em produção (S5)', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const prodApp = await buildApp();
        await prodApp.ready();
        const res = await prodApp.inject({
          method: 'GET',
          url: '/api/test-leak-error',
          headers: {
            host: '127.0.0.1:4100',
            'x-contextos-token': getSessionToken(),
          },
        });
        assert.strictEqual(res.statusCode, 404);
        await prodApp.close();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('3.4 Security Headers e Rate Limiting (Fase 4 - S6)', () => {
    it('deve incluir cabeçalhos estritos de segurança nas respostas HTTP', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: '127.0.0.1:4100',
          'x-contextos-token': getSessionToken(),
        },
      });

      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
      assert.ok(res.headers['x-frame-options'] === 'DENY' || res.headers['x-frame-options'] === 'SAMEORIGIN');
      assert.ok(res.headers['referrer-policy'] === 'no-referrer' || res.headers['referrer-policy'] === 'strict-origin-when-cross-origin');
    });

    it('deve impor HTTP 429 (Too Many Requests) com Retry-After sob rajada de requisições em /api/auth/*', async () => {
      let triggered429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/status',
          headers: {
            host: '127.0.0.1:4100',
            'x-contextos-token': getSessionToken(),
          },
        });
        if (res.statusCode === 429) {
          triggered429 = true;
          assert.ok(res.headers['retry-after']);
          break;
        }
      }
      assert.strictEqual(triggered429, true, 'Deve disparar 429 após exceder 30 requisições/min em auth');
    });
  });

  describe('3.5 Fase 2: Sessão, Cookie, CORS e Rotas Canônicas (S1, C2, C12)', () => {
    it('2.1 parseCookies deve preservar valores contendo o caractere = (C12)', async () => {
      const { parseCookies } = await import('./session.js');
      const parsed = parseCookies('auth=token=123==; theme=dark; session=a=b=c');
      assert.strictEqual(parsed['auth'], 'token=123==');
      assert.strictEqual(parsed['theme'], 'dark');
      assert.strictEqual(parsed['session'], 'a=b=c');
    });

    it('2.2 Bootstrap deve emitir cookie com Path=/api, Max-Age correspondente ao TTL canônico de 12h (SESSION_TTL_SEC) (S1)', async () => {
      const { SESSION_TTL_SEC } = await import('./session.js');
      const res = await app.inject({
        method: 'GET',
        url: '/api/session/bootstrap',
        headers: {
          host: '127.0.0.1:4100',
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const setCookie = res.headers['set-cookie'] as string;
      assert.ok(setCookie, 'Set-Cookie deve estar presente');
      assert.match(setCookie, new RegExp(`Max-Age=${SESSION_TTL_SEC}`, 'i'), 'Deve conter Max-Age correspondente a SESSION_TTL_SEC (43200s)');
      assert.match(setCookie, /Path=\/api/i, 'Cookie deve ser restrito ao path /api');
    });

    it('2.3 Bootstrap deve ser desativado quando CONTEXT_OS_DESKTOP=1', async () => {
      const prevDesktop = process.env.CONTEXT_OS_DESKTOP;
      process.env.CONTEXT_OS_DESKTOP = '1';
      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/session/bootstrap',
          headers: {
            host: '127.0.0.1:4100',
          },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.match(res.body, /desktop/i);
      } finally {
        if (prevDesktop !== undefined) {
          process.env.CONTEXT_OS_DESKTOP = prevDesktop;
        } else {
          delete process.env.CONTEXT_OS_DESKTOP;
        }
      }
    });

    it('2.4 Origem não permitida em CORS deve retornar 403 JSON e NÃO 500 (C2)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
        headers: {
          host: '127.0.0.1:4100',
          origin: 'https://malicious-site.example.com',
          'x-contextos-token': getSessionToken(),
        },
      });
      assert.strictEqual(res.statusCode, 403, `Esperado 403 mas retornou ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.match(json.error, /origem|CORS/i);
    });

    it('2.5 Token expirado deve retornar 401 com reason: "expired" (S1, C2)', async () => {
      const sessionModule = await import('./session.js') as any;
      if (typeof sessionModule._setSessionExpiryForTesting === 'function') {
        const token = sessionModule.getSessionToken();
        sessionModule._setSessionExpiryForTesting(Date.now() - 1000); // Expirado no passado

        const res = await app.inject({
          method: 'GET',
          url: '/api/repos',
          headers: {
            host: '127.0.0.1:4100',
            'x-contextos-token': token,
          },
        });

        assert.strictEqual(res.statusCode, 401);
        const json = JSON.parse(res.body);
        assert.strictEqual(json.reason, 'expired');
        assert.match(json.error, /expirada/i);

        sessionModule._resetSessionForTesting(); // Restaura token fresco
      } else {
        assert.fail('_setSessionExpiryForTesting ainda não implementado (RED)');
      }
    });

    it('2.5.1 POST /api/session/refresh deve renovar token expirado (inclusive com CONTEXT_OS_DESKTOP=1) e rejeitar token inválido', async () => {
      const sessionModule = await import('./session.js') as any;
      const prevDesktop = process.env.CONTEXT_OS_DESKTOP;
      process.env.CONTEXT_OS_DESKTOP = '1';

      try {
        // 1. Rejeita sem token
        const missingRes = await app.inject({
          method: 'POST',
          url: '/api/session/refresh',
          headers: { host: '127.0.0.1:4100' },
        });
        assert.strictEqual(missingRes.statusCode, 401);

        // 2. Rejeita token falso
        const invalidRes = await app.inject({
          method: 'POST',
          url: '/api/session/refresh',
          headers: {
            host: '127.0.0.1:4100',
            'x-contextos-token': 'token-falso-que-nao-existe',
          },
        });
        assert.strictEqual(invalidRes.statusCode, 401);

        // 3. Renova token expirado com sucesso
        const expiredToken = sessionModule.getSessionToken();
        sessionModule._setSessionExpiryForTesting(Date.now() - 1000);

        const refreshRes = await app.inject({
          method: 'POST',
          url: '/api/session/refresh',
          headers: {
            host: '127.0.0.1:4100',
            'x-contextos-token': expiredToken,
          },
        });
        assert.strictEqual(refreshRes.statusCode, 200);
        const json = JSON.parse(refreshRes.body);
        assert.ok(json.token, 'Deve retornar novo token');
        assert.notStrictEqual(json.token, expiredToken, 'Deve rotacionar o token expirado');
        assert.strictEqual(json.authenticated, true);

        // 4. Novo token deve funcionar normalmente em rotas protegidas
        const apiRes = await app.inject({
          method: 'GET',
          url: '/api/repos',
          headers: {
            host: '127.0.0.1:4100',
            'x-contextos-token': json.token,
          },
        });
        assert.notStrictEqual(apiRes.statusCode, 401);
      } finally {
        if (prevDesktop !== undefined) {
          process.env.CONTEXT_OS_DESKTOP = prevDesktop;
        } else {
          delete process.env.CONTEXT_OS_DESKTOP;
        }
        sessionModule._resetSessionForTesting();
      }
    });

    it('2.6 GET /api/health deve responder 200 e GET /health deve redirecionar (C12)', async () => {
      const resApiHealth = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { host: '127.0.0.1:4100' },
      });
      assert.strictEqual(resApiHealth.statusCode, 200);
      const json = JSON.parse(resApiHealth.body);
      assert.strictEqual(json.status, 'ok');

      const resHealth = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { host: '127.0.0.1:4100' },
      });
      assert.strictEqual(resHealth.statusCode, 301);
      assert.strictEqual(resHealth.headers.location, '/api/health');
    });

    it('2.7 Rota de depuração /api/test-leak-error não deve existir em produção (retorna 404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/test-leak-error',
        headers: {
          host: '127.0.0.1:4100',
          'x-contextos-token': getSessionToken(),
        },
      });
      assert.strictEqual(res.statusCode, 404, 'Rota de teste deve retornar 404 em produção');
    });

    it('2.8 Rate limiters de IA e RAG devem estar exportados e configurados com 60 req/min', async () => {
      const rateLimitModule = await import('./rate-limit.js');
      assert.ok(rateLimitModule.aiRateLimiter, 'aiRateLimiter deve estar exportado');
      assert.ok(rateLimitModule.ragRateLimiter, 'ragRateLimiter deve estar exportado');
      assert.strictEqual(rateLimitModule.aiRateLimiter.max, 60);
      assert.strictEqual(rateLimitModule.ragRateLimiter.max, 60);
    });
  });
});


