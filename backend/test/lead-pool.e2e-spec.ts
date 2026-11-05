import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { ClientsService } from '../src/clients/clients.service.js';

/**
 * Full-stack test against a REAL database (needs the DB_* and JWT_SECRET
 * environment variables, with all migrations applied). It creates its own
 * users, leads and clients with a unique tag and deletes them afterwards.
 */
describe('Lead pool (e2e, real database)', () => {
  let app: INestApplication;
  let db: DataSource;

  const tag = `pooltest${Date.now()}`;
  const password = 'Passw0rd!test';
  const userIds: number[] = [];
  const token: Record<string, string> = {};
  const id: Record<string, number> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });

  async function createUser(
    key: string,
    role: 'admin' | 'agent',
    status: 'active' | 'suspended' = 'active',
  ) {
    const email = `${key}.${tag}@example.com`;
    const hash = await bcrypt.hash(password, 4);
    const result = (await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES (?, ?, ?, ?, ?)`,
      [email, hash, `${key} ${tag}`, role, status],
    )) as { insertId: number };

    id[key] = Number(result.insertId);
    userIds.push(id[key]);

    if (status === 'active') {
      const login = await http().post('/auth/login').send({ email, password });
      token[key] = login.body.accessToken;
    }
  }

  async function createPoolLead(extra: Record<string, unknown> = {}) {
    const res = await http()
      .post('/leads')
      .set(as('admin'))
      .send({ customerName: `Lead ${tag}`, ...extra });
    expect(res.status).toBe(201);
    return res.body.data as Record<string, any>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0); // one real server, so concurrent requests share it
    db = app.get(DataSource);

    await createUser('admin', 'admin');
    await createUser('agentA', 'agent');
    await createUser('agentB', 'agent');
    await createUser('agentC', 'agent');
    await createUser('gone', 'agent', 'suspended');
  });

  afterAll(async () => {
    if (userIds.length) {
      const marks = userIds.map(() => '?').join(',');
      await db.query(`DELETE FROM leads WHERE customer_name LIKE ?`, [
        `%${tag}%`,
      ]);
      await db.query(`DELETE FROM clients WHERE full_name LIKE ?`, [
        `%${tag}%`,
      ]);
      await db.query(`DELETE FROM users WHERE id IN (${marks})`, userIds);
    }
    await app.close();
  });

  it('admin-created leads go to the pool by default, with a client', async () => {
    const lead = await createPoolLead({
      customerEmail: `ana.${tag}@example.com`,
    });

    expect(lead.assignedAgentId).toBeNull();
    expect(lead.assignedAt).toBeNull();
    expect(Number(lead.clientId)).toBeGreaterThan(0);
  });

  it('agent-created leads belong to that agent', async () => {
    const res = await http()
      .post('/leads')
      .set(as('agentA'))
      .send({ customerName: `Mine ${tag}` });

    expect(res.status).toBe(201);
    expect(String(res.body.data.assignedAgentId)).toBe(String(id.agentA));
    expect(res.body.data.assignedAt).not.toBeNull();
  });

  it('pool listing hides contact details', async () => {
    const lead = await createPoolLead({
      customerEmail: `secret.${tag}@example.com`,
      customerPhone: '+1 555 010 0199',
    });

    const res = await http().get('/leads/pool').set(as('agentA'));
    expect(res.status).toBe(200);

    const found = res.body.data.find((l: any) => l.id === lead.id);
    expect(found).toBeDefined();
    expect(found.customerEmail).toBeUndefined();
    expect(found.customerPhone).toBeUndefined();
    expect(found.customerName).toBe(`Lead ${tag}`);
  });

  it('pool leads are not in any agent list or count until claimed', async () => {
    const lead = await createPoolLead();

    const list = await http().get('/leads?page=1').set(as('agentB'));
    expect(list.body.data.some((l: any) => l.id === lead.id)).toBe(false);

    const patch = await http()
      .patch(`/leads/${lead.id}`)
      .set(as('agentB'))
      .send({ status: 'contacted' });
    expect(patch.status).toBe(404);
  });

  it('same email -> one client; same phone without email -> one client', async () => {
    const email = `repeat.${tag}@example.com`;
    const a = await createPoolLead({ customerEmail: email.toUpperCase() });
    const b = await createPoolLead({ customerEmail: email });
    expect(b.clientId).toBe(a.clientId);

    const c = await createPoolLead({ customerPhone: '+1 (555) 010-7777' });
    const d = await createPoolLead({ customerPhone: '1 555 010 7777' });
    // different "+": +1... vs 1... are different numbers, so NOT merged
    expect(d.clientId).not.toBe(c.clientId);

    const e = await createPoolLead({ customerPhone: '+1 555-010-7777' });
    expect(e.clientId).toBe(c.clientId);

    // no contact details at all -> nothing to match on
    const f = await createPoolLead();
    const g = await createPoolLead();
    expect(g.clientId).not.toBe(f.clientId);
  });

  it('simultaneous leads for one brand-new email create exactly one client', async () => {
    const email = `race.${tag}@example.com`;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        http()
          .post('/leads')
          .set(as('admin'))
          .send({ customerName: `Race ${tag}`, customerEmail: email }),
      ),
    );

    expect(results.every((r) => r.status === 201)).toBe(true);

    const clients = (await db.query(
      `SELECT id FROM clients WHERE email = ?`,
      [email],
    )) as unknown[];
    expect(clients).toHaveLength(1);

    const clientIds = new Set(results.map((r) => r.body.data.clientId));
    expect(clientIds.size).toBe(1);
  });

  it('client lock: heavy parallel find-or-create never duplicates a client', async () => {
    // Hammers the service directly (many more parallel callers than the HTTP
    // test can produce) over many rounds, each with a brand-new email.
    const clients = app.get(ClientsService);

    for (let round = 0; round < 15; round++) {
      const email = `lock${round}.${tag}@example.com`;

      const clientIds = await Promise.all(
        Array.from({ length: 20 }, () =>
          clients.runInClientTransaction(
            { fullName: `Lock ${tag}`, email, phone: null },
            async (_manager, clientId) => clientId,
          ),
        ),
      );

      const rows = (await db.query(`SELECT id FROM clients WHERE email = ?`, [
        email,
      ])) as unknown[];

      expect(rows).toHaveLength(1);
      expect(new Set(clientIds).size).toBe(1);
    }
  });

  it('exactly one of many simultaneous claims wins; the rest get 409', async () => {
    const lead = await createPoolLead();
    const claimers = ['agentA', 'agentB', 'agentC'];

    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        http()
          .post(`/leads/${lead.id}/claim`)
          .set(as(claimers[i % claimers.length])),
      ),
    );

    const winners = results.filter((r) => r.status === 201);
    const losers = results.filter((r) => r.status === 409);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(14);

    const [row] = (await db.query(
      `SELECT assigned_agent_id AS agentId FROM leads WHERE id = ?`,
      [lead.id],
    )) as Array<{ agentId: number }>;
    expect(String(row.agentId)).toBe(String(winners[0].body.data.assignedAgentId));
  });

  it('a claimed lead shows up for its owner only, and leaves the pool', async () => {
    const lead = await createPoolLead();
    await http().post(`/leads/${lead.id}/claim`).set(as('agentA')).expect(201);

    const pool = await http().get('/leads/pool').set(as('agentB'));
    expect(pool.body.data.some((l: any) => l.id === lead.id)).toBe(false);

    const mine = await http().get('/leads').set(as('agentA'));
    expect(mine.body.data.some((l: any) => l.id === lead.id)).toBe(true);

    await http()
      .patch(`/leads/${lead.id}`)
      .set(as('agentB'))
      .send({ status: 'won' })
      .expect(404);
    await http()
      .patch(`/leads/${lead.id}`)
      .set(as('agentA'))
      .send({ status: 'contacted' })
      .expect(200);
  });

  it('claiming an unknown lead is 404', async () => {
    await http().post('/leads/999999999/claim').set(as('agentA')).expect(404);
  });

  it('only admins can release, reassign, or list stale leads', async () => {
    const lead = await createPoolLead();
    await http().post(`/leads/${lead.id}/claim`).set(as('agentA')).expect(201);

    await http().post(`/leads/${lead.id}/release`).set(as('agentA')).expect(403);
    await http()
      .post(`/leads/${lead.id}/reassign`)
      .set(as('agentA'))
      .send({ agentId: id.agentB })
      .expect(403);
    await http().get('/leads/stale').set(as('agentA')).expect(403);
    await http().post(`/leads/${lead.id}/release`).expect(401);
  });

  it('admin can release a lead back to the pool, once', async () => {
    const lead = await createPoolLead();
    await http().post(`/leads/${lead.id}/claim`).set(as('agentA')).expect(201);

    const released = await http()
      .post(`/leads/${lead.id}/release`)
      .set(as('admin'));
    expect(released.status).toBe(201);
    expect(released.body.data.assignedAgentId).toBeNull();

    await http().post(`/leads/${lead.id}/release`).set(as('admin')).expect(409);
    await http().post(`/leads/${lead.id}/claim`).set(as('agentB')).expect(201);
  });

  it('admin can reassign to an active agent only', async () => {
    const lead = await createPoolLead();
    await http().post(`/leads/${lead.id}/claim`).set(as('agentA')).expect(201);

    const moved = await http()
      .post(`/leads/${lead.id}/reassign`)
      .set(as('admin'))
      .send({ agentId: id.agentB });
    expect(moved.status).toBe(201);
    expect(String(moved.body.data.assignedAgentId)).toBe(String(id.agentB));

    await http()
      .post(`/leads/${lead.id}/reassign`)
      .set(as('admin'))
      .send({ agentId: id.gone })
      .expect(400);
    await http()
      .post(`/leads/${lead.id}/reassign`)
      .set(as('admin'))
      .send({ agentId: id.admin })
      .expect(400); // admins are not agents
    await http()
      .post(`/leads/${lead.id}/reassign`)
      .set(as('admin'))
      .send({})
      .expect(400);
    await http()
      .post('/leads/999999999/reassign')
      .set(as('admin'))
      .send({ agentId: id.agentB })
      .expect(404);
  });

  it('stale report lists claimed, idle, open leads for admins', async () => {
    const idle = await createPoolLead();
    const fresh = await createPoolLead();
    const done = await createPoolLead();
    const unclaimed = await createPoolLead();

    for (const lead of [idle, fresh, done]) {
      await http().post(`/leads/${lead.id}/claim`).set(as('agentC')).expect(201);
    }
    await http()
      .patch(`/leads/${done.id}`)
      .set(as('agentC'))
      .send({ status: 'won' })
      .expect(200);

    await db.query(
      `UPDATE leads SET last_activity_at = DATE_SUB(NOW(), INTERVAL 3 DAY)
       WHERE id IN (?, ?, ?)`,
      [idle.id, done.id, unclaimed.id],
    );

    const res = await http().get('/leads/stale?hours=24').set(as('admin'));
    expect(res.status).toBe(200);

    const ids = res.body.data.map((l: any) => l.id);
    expect(ids).toContain(idle.id); // claimed + idle
    expect(ids).not.toContain(fresh.id); // recently active
    expect(ids).not.toContain(done.id); // won
    expect(ids).not.toContain(unclaimed.id); // in pool, not "stale"

    const row = res.body.data.find((l: any) => l.id === idle.id);
    expect(row.assignedAgentName).toContain('agentC');

    await http().get('/leads/stale?hours=0').set(as('admin')).expect(400);
    await http().get('/leads/stale?hours=abc').set(as('admin')).expect(400);
  });

  it('working a lead refreshes its activity time', async () => {
    const lead = await createPoolLead();
    await http().post(`/leads/${lead.id}/claim`).set(as('agentA')).expect(201);
    await db.query(
      `UPDATE leads SET last_activity_at = DATE_SUB(NOW(), INTERVAL 3 DAY)
       WHERE id = ?`,
      [lead.id],
    );

    await http()
      .patch(`/leads/${lead.id}`)
      .set(as('agentA'))
      .send({ status: 'contacted' })
      .expect(200);

    const res = await http().get('/leads/stale?hours=24').set(as('admin'));
    expect(res.body.data.map((l: any) => l.id)).not.toContain(lead.id);
  });

  it('agents still cannot assign leads to others when creating', async () => {
    await http()
      .post('/leads')
      .set(as('agentA'))
      .send({ customerName: `Nope ${tag}`, assignedAgentId: id.agentB })
      .expect(403);
  });

  it('admin can create a lead directly for an agent', async () => {
    const lead = await createPoolLead({ assignedAgentId: id.agentB });
    expect(String(lead.assignedAgentId)).toBe(String(id.agentB));
  });
});
