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

/**
 * Exercises real routing, validation and SQL parameter order with the
 * database mocked out. Guards the module split against regressions.
 */
describe('HTTP routes (mocked database)', () => {
  let app: INestApplication;
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    query.mockReset();
    currentUser = agent;
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

  it('POST /leads creates a lead assigned to the agent', async () => {
    query
      .mockResolvedValueOnce({ insertId: 55 })
      .mockResolvedValueOnce([{ id: 55, customerName: 'Ana' }]);
    const res = await request(app.getHttpServer())
      .post('/leads')
      .send({ customerName: 'Ana', customerEmail: 'ANA@x.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(55);
    expect(query.mock.calls[0][1]).toEqual(['7', 'Ana', 'ana@x.com', null, null]);
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
