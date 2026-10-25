import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { ClientsController } from './clients/clients.controller.js';
import { ClientsService } from './clients/clients.service.js';
import type { AuthenticatedUser } from './common/authenticated-request.js';
import { LeadsController } from './leads/leads.controller.js';
import { LeadsService } from './leads/leads.service.js';
import type { EntityManager } from 'typeorm';

/**
 * Exercises real routing, validation and SQL parameter order with the
 * database mocked out. Guards the module split against regressions.
 */
describe('HTTP routes (mocked database)', () => {
  let app: INestApplication;
  let clientsService: ClientsService;
  let runInClientTransaction: ReturnType<typeof vi.spyOn>;
  let currentUser: AuthenticatedUser;
  const query = vi.fn();

  const admin: AuthenticatedUser = { id: '1', email: 'a@x.com', role: 'admin' };
  const agent: AuthenticatedUser = { id: '7', email: 'g@x.com', role: 'agent' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LeadsController, ClientsController],
      providers: [
        LeadsService,
        ClientsService,
        { provide: DataSource, useValue: { query } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    clientsService = app.get(ClientsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    query.mockReset();
    currentUser = agent;

    // Client find-or-create needs a real transaction; the real-database e2e
    // suite covers it. Here it just hands the work a client id and the mock.
    runInClientTransaction = vi
      .spyOn(clientsService, 'runInClientTransaction')
      .mockImplementation(async (_contact, work) =>
        work({ query } as unknown as EntityManager, 3),
      );
  });

  it('GET /leads/count is not swallowed by an :id route', async () => {
    query.mockResolvedValueOnce([{ total: '4' }]);
    const res = await request(app.getHttpServer()).get('/leads/count');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 4 });
    expect(query.mock.calls[0][1]).toEqual(['7']);
  });

  it('GET /leads scopes agents to their own leads and pages correctly', async () => {
    query.mockResolvedValueOnce([{ total: '12' }]).mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer()).get('/leads?page=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 12, page: 2, totalPages: 2 });
    expect(query.mock.calls[1][1]).toEqual(['7', 10, 10]);
  });

  it('GET /leads gives admins an unscoped query', async () => {
    currentUser = admin;
    query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
    await request(app.getHttpServer()).get('/leads').expect(200);
    expect(query.mock.calls[1][1]).toEqual([10, 0]);
  });

  it('GET /leads rejects a bad page', async () => {
    await request(app.getHttpServer()).get('/leads?page=abc').expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('POST /leads validates before touching the database', async () => {
    await request(app.getHttpServer()).post('/leads').send({}).expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('POST /leads forbids agents assigning to someone else', async () => {
    await request(app.getHttpServer())
      .post('/leads')
      .send({ customerName: 'Ana', assignedAgentId: 99 })
      .expect(403);
  });

  it('POST /leads creates a lead assigned to the agent, linked to a client', async () => {
    query
      .mockResolvedValueOnce({ insertId: 55 })
      .mockResolvedValueOnce([{ id: 55, customerName: 'Ana' }]);
    const res = await request(app.getHttpServer())
      .post('/leads')
      .send({ customerName: 'Ana', customerEmail: 'ANA@x.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(55);
    expect(query.mock.calls[0][0]).toContain('NOW()'); // assigned_at set
    expect(query.mock.calls[0][1]).toEqual(['7', 3, 'Ana', 'ana@x.com', null, null]);
    expect(runInClientTransaction).toHaveBeenCalledWith(
      { fullName: 'Ana', email: 'ana@x.com', phone: null },
      expect.any(Function),
    );
  });

  it('POST /leads by an admin with no agent puts the lead in the pool', async () => {
    currentUser = admin;
    query
      .mockResolvedValueOnce({ insertId: 56 })
      .mockResolvedValueOnce([{ id: 56 }]);
    await request(app.getHttpServer())
      .post('/leads')
      .send({ customerName: 'Pool Person' })
      .expect(201);
    expect(query.mock.calls[0][0]).not.toContain('NOW()'); // no assigned_at
    expect(query.mock.calls[0][1][0]).toBeNull();
  });

  it('GET /leads/pool is open to agents and is not scoped to them', async () => {
    query.mockResolvedValueOnce([{ total: '2' }]).mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer()).get('/leads/pool');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(query.mock.calls[1][0]).toContain('assigned_agent_id IS NULL');
    expect(query.mock.calls[1][0]).not.toContain('customer_email');
    expect(query.mock.calls[1][1]).toEqual([10, 0]);
  });

  it('POST /leads/:id/claim succeeds when the update changes a row', async () => {
    query
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ id: 5, assignedAgentId: 7 }]);
    const res = await request(app.getHttpServer()).post('/leads/5/claim');
    expect(res.status).toBe(201);
    expect(query.mock.calls[0][0]).toContain('assigned_agent_id IS NULL');
    expect(query.mock.calls[0][1]).toEqual(['7', '5']);
  });

  it('POST /leads/:id/claim is 409 if already claimed, 404 if missing', async () => {
    query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([{ id: 5 }]);
    await request(app.getHttpServer()).post('/leads/5/claim').expect(409);

    query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([]);
    await request(app.getHttpServer()).post('/leads/6/claim').expect(404);

    await request(app.getHttpServer()).post('/leads/abc/claim').expect(400);
  });

  it('release, reassign and stale are admin-only', async () => {
    const server = app.getHttpServer();
    await request(server).post('/leads/5/release').expect(403);
    await request(server).post('/leads/5/reassign').send({ agentId: 8 }).expect(403);
    await request(server).get('/leads/stale').expect(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('admin release: 201, then 409 when already in the pool', async () => {
    currentUser = admin;
    query
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ id: 5, assignedAgentId: null }]);
    await request(app.getHttpServer()).post('/leads/5/release').expect(201);

    query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([{ id: 5 }]);
    await request(app.getHttpServer()).post('/leads/5/release').expect(409);
  });

  it('admin reassign validates the agent id and the agent', async () => {
    currentUser = admin;
    await request(app.getHttpServer())
      .post('/leads/5/reassign')
      .send({ agentId: 'x' })
      .expect(400);

    query.mockResolvedValueOnce([{ id: 5 }]).mockResolvedValueOnce([]); // lead ok, agent not active
    await request(app.getHttpServer())
      .post('/leads/5/reassign')
      .send({ agentId: 8 })
      .expect(400);
  });

  it('GET /leads/stale validates hours and passes them to the query', async () => {
    currentUser = admin;
    await request(app.getHttpServer()).get('/leads/stale?hours=0').expect(400);

    query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
    await request(app.getHttpServer()).get('/leads/stale?hours=48').expect(200);
    expect(query.mock.calls[0][1]).toEqual([48]);
    expect(query.mock.calls[1][1]).toEqual([48, 10, 0]);
  });

  it('PATCH /leads/:id rejects an invalid status', async () => {
    await request(app.getHttpServer())
      .patch('/leads/5')
      .send({ status: 'bogus' })
      .expect(400);
  });

  it('PATCH /leads/:id returns 404 for a lead the agent does not own', async () => {
    query.mockResolvedValueOnce([]);
    await request(app.getHttpServer())
      .patch('/leads/5')
      .send({ status: 'won' })
      .expect(404);
    expect(query.mock.calls[0][1]).toEqual(['5', '7']);
  });

  it('PATCH /leads/:id/details updates and returns the lead', async () => {
    query
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([{ id: 5, customerName: 'New' }]);
    const res = await request(app.getHttpServer())
      .patch('/leads/5/details')
      .send({ customerName: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.data.customerName).toBe('New');
  });

  it('GET /clients keeps SQL parameters in placeholder order for agents', async () => {
    query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([]);
    await request(app.getHttpServer()).get('/clients?search=ana').expect(200);

    // count: scope agent id, then three search patterns
    expect(query.mock.calls[0][1]).toEqual(['7', '%ana%', '%ana%', '%ana%']);
    // list: JOIN agent id, scope agent id, three patterns, limit, offset
    expect(query.mock.calls[1][1]).toEqual([
      '7', '7', '%ana%', '%ana%', '%ana%', 10, 0,
    ]);
  });

  it('GET /clients rejects an over-long search', async () => {
    await request(app.getHttpServer())
      .get(`/clients?search=${'a'.repeat(201)}`)
      .expect(400);
  });

  it('GET /clients/:id returns 404 when not visible and 400 when malformed', async () => {
    query.mockResolvedValueOnce([]);
    await request(app.getHttpServer()).get('/clients/9').expect(404);
    await request(app.getHttpServer()).get('/clients/abc').expect(400);
  });

  it('GET /clients/:id returns the client with its leads', async () => {
    currentUser = admin;
    query
      .mockResolvedValueOnce([{ id: 9, fullName: 'Ana' }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const res = await request(app.getHttpServer()).get('/clients/9');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 9, leadCount: 2 });
  });
});
