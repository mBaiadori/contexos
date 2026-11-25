import { FastifyInstance } from 'fastify';
import { governanceService } from './governance.service.js';


function getErrMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function governanceRoutes(fastify: FastifyInstance) {
  // 1. Collaborators List
  fastify.get('/api/governance/collaborators', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.getCollaborators(query.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 2. Invite Collaborator to GitHub + Set Local Clearance Level
  fastify.post('/api/governance/invite', async (request, reply) => {
    const body = request.body as Parameters<typeof governanceService.inviteCollaborator>[0];
    try {
      const result = await governanceService.inviteCollaborator(body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 2.1 Update Collaborator Clearance & Permissions
  fastify.post('/api/governance/clearance', async (request, reply) => {
    const body = request.body as Parameters<typeof governanceService.updateCollaboratorClearance>[0];
    try {
      const result = await governanceService.updateCollaboratorClearance(body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 3. Remove Collaborator
  fastify.delete('/api/governance/collaborators/:username', async (request, reply) => {
    const params = request.params as { username: string };
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.removeCollaborator({
        username: params.username,
        repo: query.repo,
      });
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 5. Branch Protection Status & Configuration
  fastify.get('/api/governance/branch-protection', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.getBranchProtection(query.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post('/api/governance/branch-protection', async (request, reply) => {
    const body = request.body as Parameters<typeof governanceService.applyBranchProtection>[0];
    try {
      const result = await governanceService.applyBranchProtection(body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 6. Quorum Rules (Solo vs Team auto-detection)
  fastify.get('/api/governance/quorum', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.getQuorumRules(query.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post('/api/governance/quorum', async (request, reply) => {
    const body = request.body as Parameters<typeof governanceService.updateQuorumRules>[0];
    try {
      const result = await governanceService.updateQuorumRules(body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 7. Governance Departments & Vaults
  fastify.get('/api/governance/departments', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const departments = await governanceService.getDepartments(query.repo);
      return reply.send({ departments });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post('/api/governance/departments', async (request, reply) => {
    const body = request.body as {
      departments: Parameters<typeof governanceService.saveDepartments>[0];
      repo?: string;
    };
    try {
      const result = await governanceService.saveDepartments(body.departments, body.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 8. Secret & Confidential Clearance Scanner
  fastify.get('/api/governance/scan-secrets', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.scanRepositorySecrets(query.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 9. Audit Logs
  fastify.get('/api/governance/audit-logs', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.getAuditLogs(query.repo);
      return reply.send({ logs: result });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 10. AI Ephemeral Token & Secure Context Pipe
  fastify.post('/api/governance/ai-token', async (request, reply) => {
    const body = request.body as Parameters<typeof governanceService.createSecureAIToken>[0];
    try {
      const result = governanceService.createSecureAIToken(body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post('/api/governance/secure-ai-context', async (request, reply) => {
    const body = request.body as Parameters<typeof governanceService.getSecureContextForAI>[0];
    try {
      const result = await governanceService.getSecureContextForAI(body);
      if (!result.success) {
        return reply.status(403).send(result);
      }
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 11. Organization Teams
  fastify.get('/api/governance/orgs/:org/teams', async (request, reply) => {
    const params = request.params as { org: string };
    try {
      const teams = await governanceService.getOrgTeams(params.org);
      return reply.send({ teams });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 12. Organization Members
  fastify.get('/api/governance/orgs/:org/members', async (request, reply) => {
    const params = request.params as { org: string };
    try {
      const members = await governanceService.getOrgMembers(params.org);
      return reply.send({ members });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 13. Repo Teams List
  fastify.get('/api/governance/repos/:owner/:repo/teams', async (request, reply) => {
    const params = request.params as { owner: string; repo: string };
    try {
      const teams = await governanceService.getRepoTeams(params.owner, params.repo);
      return reply.send({ teams });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 14. Add/Update Team on Repo
  fastify.put('/api/governance/repos/:owner/:repo/teams/:team_slug', async (request, reply) => {
    const params = request.params as { owner: string; repo: string; team_slug: string };
    const body = (request.body as { org?: string; permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin' }) || {};
    try {
      const result = await governanceService.addTeamToRepo({
        org: body.org || params.owner,
        teamSlug: params.team_slug,
        owner: params.owner,
        repo: params.repo,
        permission: body.permission || 'push',
      });
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 15. Remove Team from Repo
  fastify.delete('/api/governance/repos/:owner/:repo/teams/:team_slug', async (request, reply) => {
    const params = request.params as { owner: string; repo: string; team_slug: string };
    const query = request.query as { org?: string };
    try {
      const result = await governanceService.removeTeamFromRepo({
        org: query.org || params.owner,
        teamSlug: params.team_slug,
        owner: params.owner,
        repo: params.repo,
      });
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 16. Create Organization Team
  fastify.post('/api/governance/orgs/:org/teams', async (request, reply) => {
    const params = request.params as { org: string };
    const body = request.body as { name: string; description?: string; privacy?: 'secret' | 'closed' };
    try {
      const result = await governanceService.createOrgTeam({
        org: params.org,
        name: body.name,
        description: body.description,
        privacy: body.privacy,
      });
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 17. Delete Organization Team
  fastify.delete('/api/governance/orgs/:org/teams/:team_slug', async (request, reply) => {
    const params = request.params as { org: string; team_slug: string };
    try {
      const result = await governanceService.deleteOrgTeam(params.org, params.team_slug);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 18. List Team Members
  fastify.get('/api/governance/orgs/:org/teams/:team_slug/members', async (request, reply) => {
    const params = request.params as { org: string; team_slug: string };
    try {
      const members = await governanceService.getOrgTeamMembers(params.org, params.team_slug);
      return reply.send({ members });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 19. Add Member to Team
  fastify.put('/api/governance/orgs/:org/teams/:team_slug/members/:username', async (request, reply) => {
    const params = request.params as { org: string; team_slug: string; username: string };
    const body = (request.body as { role?: 'member' | 'maintainer' }) || {};
    try {
      const result = await governanceService.addMemberToOrgTeam(
        params.org,
        params.team_slug,
        params.username,
        body.role
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 20. Remove Member from Team
  fastify.delete('/api/governance/orgs/:org/teams/:team_slug/members/:username', async (request, reply) => {
    const params = request.params as { org: string; team_slug: string; username: string };
    try {
      const result = await governanceService.removeMemberFromOrgTeam(
        params.org,
        params.team_slug,
        params.username
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 21. Invite Member to Organization
  fastify.post('/api/governance/orgs/:org/invitations', async (request, reply) => {
    const params = request.params as { org: string };
    const body = request.body as {
      username?: string;
      email?: string;
      role?: 'admin' | 'direct_member' | 'billing_manager';
      team_ids?: number[];
    };
    try {
      const result = await governanceService.inviteOrgMember({
        org: params.org,
        username: body.username,
        email: body.email,
        role: body.role,
        team_ids: body.team_ids,
      });
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 22. Remove Member from Organization
  fastify.delete('/api/governance/orgs/:org/members/:username', async (request, reply) => {
    const params = request.params as { org: string; username: string };
    try {
      const result = await governanceService.removeOrgMember(params.org, params.username);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 23. Effective User Permission
  fastify.get('/api/governance/effective-permission', async (request, reply) => {
    const query = request.query as { repo?: string; org?: string };
    try {
      const result = await governanceService.getEffectiveUserPermission(query.repo, query.org);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  // 24. GitHub Actions Governance Workflow Status & Install
  fastify.get('/api/governance/actions-workflow', async (request, reply) => {
    const query = request.query as { repo?: string };
    try {
      const result = await governanceService.getGovernanceWorkflowStatus(query.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post('/api/governance/actions-workflow', async (request, reply) => {
    const body = request.body as { repo?: string };
    try {
      const result = await governanceService.installGovernanceWorkflow(body?.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });
}


