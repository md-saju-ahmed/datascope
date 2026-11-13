import type { Server } from 'node:http';
import request from 'supertest';
import type { Response } from 'supertest';
import { csrfResponseSchema, loginResponseSchema } from '@datascope/contracts';

export class ApiClient {
  readonly cookies = new Map<string, string>();
  csrf = '';
  constructor(readonly server: Server) {}

  cookie(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private capture(response: Response): void {
    const values: unknown = response.headers['set-cookie'];
    if (!Array.isArray(values)) return;
    for (const value of values) {
      if (typeof value !== 'string') throw new Error('Unexpected cookie');
      const part = value.split(';')[0] ?? '';
      const index = part.indexOf('=');
      this.cookies.set(part.slice(0, index), part.slice(index + 1));
    }
  }

  async login(email: string, password: string): Promise<void> {
    const bootstrap = await request(this.server)
      .get('/api/v1/auth/csrf')
      .set('Cookie', this.cookie())
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    this.capture(bootstrap);
    this.csrf = csrfResponseSchema.parse(bootstrap.body).csrfToken;
    const response = await this.send('post', '/api/v1/auth/login', {
      email,
      password,
    });
    if (response.status !== 200) throw new Error('Test account login failed');
    this.csrf = loginResponseSchema.parse(response.body).csrfToken;
  }

  get(path: string) {
    return request(this.server).get(path).set('Cookie', this.cookie());
  }

  async send(
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body: object = {},
    csrf = this.csrf,
  ): Promise<Response> {
    const agent = request(this.server);
    const response = await agent[method](path)
      .set('Cookie', this.cookie())
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send(body);
    this.capture(response);
    return response;
  }
}
