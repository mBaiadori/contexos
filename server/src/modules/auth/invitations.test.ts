import { describe, it } from 'node:test';
import assert from 'node:assert';
import { invitationsService } from './invitations.service.js';

describe('InvitationsService - Gestão de Convites do GitHub', () => {
  it('Deve retornar lista vazia se não autenticado', async () => {
    const res = await invitationsService.getPendingInvitations();
    assert.ok(Array.isArray(res.repository_invitations));
    assert.ok(Array.isArray(res.org_invitations));
    assert.strictEqual(typeof res.total, 'number');
  });

  it('Deve rejeitar aceite quando não autenticado no GitHub ou sem id', async () => {
    await assert.rejects(
      async () => {
        await invitationsService.acceptInvitation({ type: 'repository', id: 12345 });
      },
      {
        message: /(autenticado no GitHub|ID do convite|Falha ao aceitar)/i,
      }
    );
  });

  it('Deve rejeitar recusa quando não autenticado no GitHub ou sem org', async () => {
    await assert.rejects(
      async () => {
        await invitationsService.declineInvitation({ type: 'org', org: 'minha-org' });
      },
      {
        message: /(autenticado no GitHub|organização é obrigatório|Falha ao recusar)/i,
      }
    );
  });
});
