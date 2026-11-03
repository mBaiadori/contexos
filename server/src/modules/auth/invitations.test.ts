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

  it('Deve rejeitar aceite quando não autenticado no GitHub', async () => {
    await assert.rejects(
      async () => {
        await invitationsService.acceptInvitation({ type: 'repository' });
      },
      {
        message: /autenticado no GitHub/i,
      }
    );
  });

  it('Deve rejeitar recusa quando não autenticado no GitHub', async () => {
    await assert.rejects(
      async () => {
        await invitationsService.declineInvitation({ type: 'org' });
      },
      {
        message: /autenticado no GitHub/i,
      }
    );
  });
});
