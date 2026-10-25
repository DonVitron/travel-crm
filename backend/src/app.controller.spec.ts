import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  const dataSource = { query: vi.fn() };

  beforeEach(async () => {
    dataSource.query.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return "Hello World!"', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });

  it('reports service health', () => {
    expect(appController.getHealth()).toEqual({
      status: 'ok',
      service: 'travel-crm-backend',
    });
  });

  it('reports database connected', async () => {
    dataSource.query.mockResolvedValue([{ databaseConnected: 1 }]);
    await expect(appController.getDatabaseHealth()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
  });

  it('returns 503 when the database is down', async () => {
    dataSource.query.mockRejectedValue(new Error('down'));
    await expect(appController.getDatabaseHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
