# SAC Inteligente Backend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SAC Inteligente Peruzzo backend MVP with NestJS, Prisma, PostgreSQL, token-protected n8n integration endpoints, and automated tests for the critical lifecycle flows.

**Architecture:** Create a modular NestJS API from the current documentation-only workspace. Keep domain rules in focused modules (`stores`, `attendances`, `cases`, `media`, `satisfaction`, `auth`) with Prisma as the persistence boundary and service-level helpers for status transitions/protocol generation. The backend stores structured lifecycle state only; n8n owns conversation flow and synthesis.

**Tech Stack:** Node.js, TypeScript, NestJS, Prisma, PostgreSQL, Jest, Supertest, class-validator, class-transformer.

---

## References

- Spec: `docs/superpowers/specs/2026-05-24-sac-inteligente-backend-mvp-design.md`
- Domain glossary: `CONTEXT.md`
- Consolidated scope: `PROJECT-SCOPE.md`
- Decision log: `GRILL-QA.md`

## Implementation Notes

- The current directory has documentation only and is not a Git repository yet.
- Use `npm` unless the user explicitly asks for another package manager.
- Use TDD for domain-heavy behavior: write tests before service/controller implementation.
- Keep commits small after each task once Git is initialized.
- All endpoints require the integration token unless a task explicitly says otherwise.
- Do not implement a frontend, admin store CRUD, internal media storage, per-category `details`, or global `GET /sac-cases` list.

## Target File Structure

```text
D:\Projetos\siac_new\
  package.json
  tsconfig.json
  tsconfig.build.json
  nest-cli.json
  jest.config.ts
  jest.e2e.config.ts
  docker-compose.yml
  .gitignore
  .env.example
  .env.test.example
  src\
    main.ts
    app.module.ts
    configure-app.ts
    prisma\
      prisma.module.ts
      prisma.service.ts
    common\
      auth\
        integration-token.guard.ts
        integration-token.guard.spec.ts
      logging\
        request-logging.interceptor.ts
      filters\
        http-exception.filter.ts
      validation\
        parse-date-range.ts
    stores\
      stores.module.ts
      stores.controller.ts
      stores.service.ts
      dto\
        store-response.dto.ts
    attendances\
      attendances.module.ts
      attendances.controller.ts
      attendances.service.ts
      attendance-presenter.ts
      dto\
        create-attendance.dto.ts
        update-attendance.dto.ts
        list-attendances-query.dto.ts
    cases\
      cases.module.ts
      cases.controller.ts
      cases.service.ts
      case-transition.service.ts
      protocol.service.ts
      dto\
        create-case.dto.ts
        update-case-status.dto.ts
        cancel-case.dto.ts
        mark-protocol-sent.dto.ts
    media\
      media.module.ts
      media.controller.ts
      media.service.ts
      dto\
        create-media.dto.ts
    satisfaction\
      satisfaction.module.ts
      satisfaction.controller.ts
      satisfaction.service.ts
      dto\
        create-satisfaction-response.dto.ts
  prisma\
    schema.prisma
    seed.ts
  test\
    helpers\
      app.ts
      database.ts
      auth.ts
      fixtures.ts
    e2e\
      stores.e2e-spec.ts
      attendances.e2e-spec.ts
      cases.e2e-spec.ts
      media.e2e-spec.ts
      satisfaction.e2e-spec.ts
      reads.e2e-spec.ts
  docs\
    api-examples\
      sac-inteligente.http
```

---

### Task 1: Bootstrap Node/Nest Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `nest-cli.json`
- Create: `jest.config.ts`
- Create: `jest.e2e.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env.test.example`
- Create: `src/main.ts`
- Create: `src/app.module.ts`
- Create: `src/configure-app.ts`

- [ ] **Step 1: Initialize Git**

Run:

```powershell
git init
git add CONTEXT.md PROJECT-SCOPE.md GRILL-QA.md docs
git commit -m "docs: capture sac inteligente mvp scope"
```

Expected: Git repository initialized and documentation committed.

- [ ] **Step 2: Initialize npm**

Run:

```powershell
npm init -y
```

Expected: `package.json` exists.

- [ ] **Step 3: Install runtime dependencies**

Run:

```powershell
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config @prisma/client class-transformer class-validator reflect-metadata rxjs
```

Expected: dependencies added.

- [ ] **Step 4: Install dev dependencies**

Run:

```powershell
npm install -D typescript ts-node ts-jest jest @types/jest supertest @types/supertest @nestjs/testing @nestjs/cli prisma eslint prettier
```

Expected: dev dependencies added.

- [ ] **Step 5: Create TypeScript, Nest, and Jest config**

Add `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true,
    "strictPropertyInitialization": false
  }
}
```

Add `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

Add `nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

Add `jest.config.ts`:

```ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  testEnvironment: 'node',
  passWithNoTests: true,
};

export default config;
```

Add `jest.e2e.config.ts`:

```ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/test/e2e/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
};

export default config;
```

- [ ] **Step 6: Create shared app configuration and bootstrap**

Add `src/configure-app.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
```

Add `src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```

Add `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

- [ ] **Step 7: Add scripts and env example**

Update `package.json` scripts:

```json
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config jest.e2e.config.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

Add `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/siac_new?schema=public"
N8N_INTEGRATION_TOKEN="change-me"
PORT=3000
```

Add `.env.test.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/siac_new_test?schema=public"
N8N_INTEGRATION_TOKEN="test-token"
PORT=3001
```

Add `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.test
```

- [ ] **Step 8: Verify bootstrap**

Run:

```powershell
npm run build
npm test
```

Expected: build succeeds; Jest passes even before test files exist because `passWithNoTests` is enabled.

- [ ] **Step 9: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json jest.config.ts jest.e2e.config.ts .gitignore .env.example .env.test.example src
git commit -m "chore: bootstrap nest backend"
```

---

### Task 2: Add Local PostgreSQL and Prisma Foundation

**Files:**
- Create: `docker-compose.yml`
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/prisma/prisma.module.ts`
- Create: `src/prisma/prisma.service.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Add Docker Compose for local PostgreSQL**

Add `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: siac_new_postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: siac_new
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 2: Start PostgreSQL**

Run:

```powershell
docker compose up -d
```

Expected: PostgreSQL container is running.

- [ ] **Step 3: Create test database**

Run:

```powershell
docker exec siac_new_postgres createdb -U postgres siac_new_test
```

Expected: test database exists. If it already exists, continue.

- [ ] **Step 4: Create local env files**

Run:

```powershell
Copy-Item .env.example .env
Copy-Item .env.test.example .env.test
```

Expected: local `.env` and `.env.test` exist and are ignored by Git.

- [ ] **Step 5: Initialize Prisma**

Run:

```powershell
npx prisma init
```

Expected: Prisma folder exists. Preserve `.env.example`; do not commit real `.env`.

- [ ] **Step 6: Write Prisma schema**

Define enums and models for:

- `Store`
- `Attendance`
- `SacCase`
- `Media`
- `SatisfactionResponse`
- `ProtocolSequence`

Required enum groups:

```prisma
enum AttendanceStatus {
  started
  collecting_data
  waiting_resolution
  pesquisa_satisfacao
  fechado
  cancelled
}

enum CaseStatus {
  registered
  sent_to_dkw
  in_resolution
  resolved
  cancelled
}

enum AttendanceCategory {
  DENUNCIA
  MAU_ATENDIMENTO
  ESTRUTURA_OPERACAO
  PRODUTO_ESTRAGADO
  PRODUTO_AVARIA
  PRODUTO_EM_FALTA
  RH
  DP
  CURRICULO
  FORNECEDOR
  PRECO_PRODUTO
  INFORMACAO_LOJA
}
```

Use JSON fields for arrays where Prisma/Postgres support is simplest:

- `Store.aliases Json`
- `SacCase.missingRequiredFields Json`
- `SacCase.riskReasons Json`

Add constraints:

- `Store.internalStoreCode` unique.
- `SacCase.protocol` unique.
- `Media` unique on `[storageProvider, externalMediaId]`.
- `SatisfactionResponse.attendanceId` unique.
- `ProtocolSequence.protocolDate` unique.

- [ ] **Step 7: Add Prisma module**

Add `src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Add `src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Import `PrismaModule` in `AppModule`.

- [ ] **Step 8: Add seed skeleton**

Add `prisma/seed.ts` with two sample stores:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stores = [
    {
      internalStoreCode: '001',
      name: 'Peruzzo Centro',
      city: 'Bagé',
      state: 'RS',
      address: 'Rua exemplo, 100',
      active: true,
      aliases: ['centro', 'loja centro'],
    },
    {
      internalStoreCode: '002',
      name: 'Peruzzo Norte',
      city: 'Bagé',
      state: 'RS',
      address: 'Avenida exemplo, 200',
      active: true,
      aliases: ['norte', 'loja norte'],
    },
  ];

  for (const store of stores) {
    await prisma.store.upsert({
      where: { internalStoreCode: store.internalStoreCode },
      update: store,
      create: store,
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 9: Generate Prisma client**

Run:

```powershell
npx prisma generate
```

Expected: Prisma client generated.

- [ ] **Step 10: Run migration locally**

Run:

```powershell
npx prisma migrate dev --name init
```

Expected: migration succeeds against local PostgreSQL.

- [ ] **Step 11: Run test database migration**

Run:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/siac_new_test?schema=public"; npx prisma migrate deploy
```

Expected: migrations apply to the test database.

- [ ] **Step 12: Verify build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 13: Commit**

```powershell
git add docker-compose.yml prisma src/prisma src/app.module.ts package.json package-lock.json
git commit -m "feat: add prisma data model"
```

---

### Task 3: Add E2E Test Harness

**Files:**
- Create: `test/helpers/app.ts`
- Create: `test/helpers/database.ts`
- Create: `test/helpers/auth.ts`
- Create: `test/helpers/fixtures.ts`

- [ ] **Step 1: Write database helper**

Create `test/helpers/database.ts`:

```ts
import { PrismaService } from '../../src/prisma/prisma.service';

export async function resetDatabase(prisma: PrismaService) {
  await prisma.satisfactionResponse.deleteMany();
  await prisma.media.deleteMany();
  await prisma.sacCase.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.protocolSequence.deleteMany();
  await prisma.store.deleteMany();
}
```

- [ ] **Step 2: Write auth helper**

Create `test/helpers/auth.ts`:

```ts
export const TEST_TOKEN = 'test-token';

export function authHeader() {
  return { Authorization: `Bearer ${TEST_TOKEN}` };
}
```

- [ ] **Step 3: Write fixture helper**

Create `test/helpers/fixtures.ts`:

```ts
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createActiveStore(prisma: PrismaService, code = '001') {
  return prisma.store.create({
    data: {
      internalStoreCode: code,
      name: `Peruzzo ${code}`,
      city: 'Bagé',
      state: 'RS',
      address: `Rua ${code}`,
      active: true,
      aliases: [`loja ${code}`],
    },
  });
}
```

- [ ] **Step 4: Write app helper**

Create `test/helpers/app.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  process.env.N8N_INTEGRATION_TOKEN = 'test-token';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/siac_new_test?schema=public';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}
```

- [ ] **Step 5: Verify helper compilation**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add test/helpers
git commit -m "test: add e2e harness helpers"
```

---

### Task 4: Add Integration Token Guard and Request Logging

**Files:**
- Create: `src/common/auth/integration-token.guard.ts`
- Create: `src/common/auth/integration-token.guard.spec.ts`
- Create: `src/common/logging/request-logging.interceptor.ts`
- Create: `src/common/filters/http-exception.filter.ts`
- Modify: `src/main.ts`
- Modify: `src/configure-app.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write guard tests**

Test cases:

- rejects when header is missing
- rejects when token mismatches
- allows when `Authorization: Bearer <token>` matches `N8N_INTEGRATION_TOKEN`
- allows when `x-integration-token` matches `N8N_INTEGRATION_TOKEN`

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm test -- integration-token.guard.spec.ts
```

Expected: FAIL because guard does not exist.

- [ ] **Step 3: Implement guard**

Guard behavior:

- Read expected token from `ConfigService`.
- Accept `Authorization: Bearer token`.
- Accept `x-integration-token: token`.
- Throw `UnauthorizedException` on missing/invalid token.

- [ ] **Step 4: Register guard globally**

Register `IntegrationTokenGuard` as a global guard in `AppModule` with `APP_GUARD`, so every MVP endpoint is protected unless explicitly marked public in the future.

```ts
import { APP_GUARD } from '@nestjs/core';
import { IntegrationTokenGuard } from './common/auth/integration-token.guard';

providers: [
  {
    provide: APP_GUARD,
    useClass: IntegrationTokenGuard,
  },
]
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- integration-token.guard.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Add request logging interceptor**

Implement a lightweight interceptor that logs method, URL, status, duration, request id, and origin `n8n` when the integration token is present. Keep it technical logging only; do not create a database audit model.

- [ ] **Step 7: Add exception filter**

Implement a consistent error shape for validation/domain errors:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

- [ ] **Step 8: Register logging/filter in shared app configuration**

Register the logging interceptor and exception filter in `src/configure-app.ts`, not directly in `main.ts`, so production bootstrap and e2e tests use the same global app wiring.

- [ ] **Step 9: Run tests and build**

Run:

```powershell
npm test -- integration-token.guard.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/common src/main.ts src/configure-app.ts src/app.module.ts
git commit -m "feat: add integration auth and request logging"
```

---

### Task 5: Implement Stores Read Endpoint

**Files:**
- Create: `src/stores/stores.module.ts`
- Create: `src/stores/stores.controller.ts`
- Create: `src/stores/stores.service.ts`
- Create: `src/stores/dto/store-response.dto.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/stores.e2e-spec.ts`

- [ ] **Step 1: Write e2e tests**

Cover:

- `GET /stores` requires token.
- returns only active stores.
- returns all active stores without pagination.
- includes `id`, `internalStoreCode`, `name`, `city`, `state`, `address`, `active`, `aliases`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- stores.e2e-spec.ts
```

Expected: FAIL with route not found.

- [ ] **Step 3: Implement Stores service/controller**

Use `PrismaService.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } })`.

- [ ] **Step 4: Register module**

Import `StoresModule` in `AppModule`.

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test:e2e -- stores.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/stores src/app.module.ts test/e2e/stores.e2e-spec.ts
git commit -m "feat: expose active stores for n8n"
```

---

### Task 6: Implement Attendance Creation, Reuse, and Reads

**Files:**
- Create: `src/attendances/*`
- Create: `test/e2e/attendances.e2e-spec.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write tests for `POST /sac-attendances`**

Cover:

- requires token
- creates new Attendance with `201` and `reused: false`
- returns full detail shape with empty `cases`, `media`, and null satisfaction
- reuses open Attendance by `externalConversationId` with `200` and `reused: true`
- updates `lastSummary` on reuse
- does not store `lastMessageAt`
- creates a new Attendance when previous one is `fechado`
- creates a new Attendance when previous one is `cancelled`

- [ ] **Step 2: Write tests for `GET /sac-attendances/by-external-conversation/:externalConversationId`**

Cover:

- returns most recent open Attendance detail
- returns `404` when no open Attendance exists
- uses open statuses `started`, `collecting_data`, `waiting_resolution`, `pesquisa_satisfacao`

- [ ] **Step 3: Write tests for `GET /sac-attendances`**

Cover filters:

- `status`
- `externalConversationId`
- `createdFrom`
- `createdTo`
- `hasCase`
- default `limit=20`
- max `limit=100`
- newest first

- [ ] **Step 4: Write tests for `GET /sac-attendances/:id`**

Cover:

- full detail shape
- `404` for unknown id

- [ ] **Step 5: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- attendances.e2e-spec.ts
```

Expected: FAIL with routes not found.

- [ ] **Step 6: Implement DTOs**

DTO rules:

- `externalConversationId` required for create.
- `lastSummary` optional.
- list query validates pagination and filters.

- [ ] **Step 7: Implement presenter**

`attendance-presenter.ts` should produce one stable detail shape:

```ts
{
  id,
  externalConversationId,
  status,
  detectedCategory,
  lastSummary,
  closedAt,
  closedWithoutSatisfaction,
  cancellationReason,
  satisfactionRequestedAt,
  satisfactionRespondedAt,
  cases: [],
  media: [],
  satisfactionResponse: null
}
```

- [ ] **Step 8: Implement service/controller**

Service responsibilities:

- find open Attendance by `externalConversationId`
- create or reuse
- update `lastSummary` only when provided
- list with filters and pagination
- fetch detail by id
- fetch open detail by external conversation id

- [ ] **Step 9: Run tests**

Run:

```powershell
npm run test:e2e -- attendances.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/attendances src/app.module.ts test/e2e/attendances.e2e-spec.ts
git commit -m "feat: implement attendance lifecycle reads"
```

---

### Task 7: Implement Attendance Patch Transitions

**Files:**
- Modify: `src/attendances/attendances.service.ts`
- Modify: `src/attendances/attendances.controller.ts`
- Modify: `src/attendances/dto/update-attendance.dto.ts`
- Test: `test/e2e/attendances.e2e-spec.ts`

- [ ] **Step 1: Add failing tests for cancellation**

Cover:

- cancel from `started`
- cancel from `collecting_data`
- requires `cancellationReason`
- rejects invalid reason
- `other` requires `lastSummary`
- fills `closedAt`
- rejects cancel from `waiting_resolution`
- rejects cancel from `pesquisa_satisfacao`

- [ ] **Step 2: Add failing tests for close without Case**

Cover:

- close with orientative `detectedCategory` and `lastSummary`
- requires `detectedCategory`
- requires `lastSummary`
- rejects category that normally generates Case
- rejects when Attendance has non-cancelled Case
- fills `closedAt`

- [ ] **Step 3: Add failing tests for close without satisfaction**

Cover:

- allowed only from `pesquisa_satisfacao`
- requires `closedWithoutSatisfaction: true`
- fills `closedAt`
- does not create Satisfaction Response

- [ ] **Step 4: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- attendances.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement transition logic**

Keep transition helpers private or extract them if the service gets large.

- [ ] **Step 6: Run tests**

Run:

```powershell
npm run test:e2e -- attendances.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/attendances test/e2e/attendances.e2e-spec.ts
git commit -m "feat: constrain attendance patch transitions"
```

---

### Task 8: Implement Protocol Generation

**Files:**
- Create: `src/cases/protocol.service.ts`
- Test: `src/cases/protocol.service.spec.ts`

- [ ] **Step 1: Write protocol tests**

Cover:

- format `SAC-YYYYMMDD-000001`
- uses `America/Sao_Paulo`
- increments per local day
- sequence can have gaps but never duplicates
- protocol full value is globally unique

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- protocol.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement service**

Use a database transaction:

1. calculate local Sao Paulo date key
2. upsert/lock `ProtocolSequence`
3. increment counter
4. format protocol

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- protocol.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/cases/protocol.service.ts src/cases/protocol.service.spec.ts
git commit -m "feat: generate daily sac protocols"
```

---

### Task 9: Implement Case Creation

**Files:**
- Create: `src/cases/cases.module.ts`
- Create: `src/cases/cases.controller.ts`
- Create: `src/cases/cases.service.ts`
- Create: `src/cases/dto/create-case.dto.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/cases.e2e-spec.ts`

- [ ] **Step 1: Write failing creation tests**

Cover:

- requires token
- creates Case from Attendance in `started`
- creates Case from Attendance in `collecting_data`
- rejects Attendance in `waiting_resolution`
- rejects Attendance in `pesquisa_satisfacao`
- rejects Attendance in `fechado`
- rejects Attendance in `cancelled`
- rejects duplicate non-cancelled Case with `409`
- allows new Case when previous Case is cancelled by correction
- rejects non-Case categories
- rejects inactive `storeId`
- rejects unknown `storeId`
- allows missing `storeId` when `missingRequiredFields` includes `storeId`
- validates active/known store only when `storeId` is provided
- validates `description` min 10 and max 2000
- rejects `description` in `missingRequiredFields`
- validates closed set for `missingRequiredFields`
- normalizes `needsHumanReview` to true when `missingRequiredFields` is non-empty
- validates closed set for `riskReasons`
- rejects `riskFlag: true` with empty `riskReasons`
- normalizes `riskFlag` to true when `riskReasons` is non-empty
- does not automatically set `needsHumanReview` when only risk is present
- generates Protocol on create
- default status is `registered`
- `markAsSentToDkw: true` creates `sent_to_dkw` and fills `sentToDkwAt`
- moves Attendance to `waiting_resolution`

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- cases.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement DTO validation**

Use class-validator for structural checks. Use service-level checks for category/status/store/domain rules.

- [ ] **Step 4: Implement service/controller**

Use a Prisma transaction for:

- duplicate check
- protocol generation
- case creation
- Attendance status update
- optional replacement linking

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test:e2e -- cases.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/cases src/app.module.ts test/e2e/cases.e2e-spec.ts
git commit -m "feat: create sac cases with protocols"
```

---

### Task 10: Implement Case Transitions and Cancellation

**Files:**
- Create: `src/cases/case-transition.service.ts`
- Create: `src/cases/dto/update-case-status.dto.ts`
- Create: `src/cases/dto/cancel-case.dto.ts`
- Modify: `src/cases/cases.controller.ts`
- Modify: `src/cases/cases.service.ts`
- Test: `test/e2e/cases.e2e-spec.ts`

- [ ] **Step 1: Write tests for `PATCH /sac-cases/:id/status`**

Cover:

- `registered -> sent_to_dkw`
- repeated `sent_to_dkw` is idempotent and preserves `sentToDkwAt`
- `sent_to_dkw` fails from `resolved`
- `sent_to_dkw` fails from `cancelled`
- `registered -> in_resolution`
- `sent_to_dkw -> in_resolution`
- repeated `in_resolution` is idempotent
- `in_resolution` fails from `resolved`
- `in_resolution` fails from `cancelled`
- `registered -> resolved`
- `sent_to_dkw -> resolved`
- `in_resolution -> resolved`
- repeated `resolved` is idempotent and preserves `resolvedAt`
- resolving moves Attendance to `pesquisa_satisfacao`
- resolving fills `satisfactionRequestedAt`
- resolving fails from `cancelled`

- [ ] **Step 2: Write tests for inconsistency repair**

Set up Case `resolved` with Attendance still `waiting_resolution`, then repeat resolve.

Expected:

- Attendance moves to `pesquisa_satisfacao`
- `satisfactionRequestedAt` is filled if absent
- existing `resolvedAt` is preserved

- [ ] **Step 3: Write tests for `POST /sac-cases/:id/cancel`**

Cover:

- cancel before resolved
- rejects cancel after resolved
- validates allowed `caseCancellationReason`
- rejects `returnAttendanceToCollectingData: true` for reasons other than `created_by_mistake` or `wrong_routing`
- sets `caseCancellationReason`
- sets `cancelledAt`
- `returnAttendanceToCollectingData: false` cancels Attendance too when no useful demand remains
- `returnAttendanceToCollectingData: true` moves Attendance back to `collecting_data` for `created_by_mistake` or `wrong_routing`
- later Case creation links `replacedByCaseId` automatically when exactly one cancelled candidate exists
- later Case creation fails with ambiguity when more than one cancelled candidate exists and no selector is provided

- [ ] **Step 4: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- cases.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement transition service**

Keep transition matrix explicit and easy to inspect.

- [ ] **Step 6: Run tests**

Run:

```powershell
npm run test:e2e -- cases.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/cases test/e2e/cases.e2e-spec.ts
git commit -m "feat: implement case status transitions"
```

---

### Task 11: Implement Protocol Sent Marker

**Files:**
- Create: `src/cases/dto/mark-protocol-sent.dto.ts`
- Modify: `src/cases/cases.controller.ts`
- Modify: `src/cases/cases.service.ts`
- Test: `test/e2e/cases.e2e-spec.ts`

- [ ] **Step 1: Write tests**

Cover:

- `POST /sac-cases/:id/protocol-sent` fills `protocolSentToCustomerAt`
- accepts optional `sentAt`
- uses backend time if `sentAt` absent
- repeated call returns success and does not overwrite first timestamp
- unknown Case returns `404`

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- cases.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement endpoint**

Preserve first timestamp.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm run test:e2e -- cases.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/cases test/e2e/cases.e2e-spec.ts
git commit -m "feat: track protocol delivery"
```

---

### Task 12: Implement Media Registration

**Files:**
- Create: `src/media/media.module.ts`
- Create: `src/media/media.controller.ts`
- Create: `src/media/media.service.ts`
- Create: `src/media/dto/create-media.dto.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/media.e2e-spec.ts`

- [ ] **Step 1: Write tests**

Cover:

- requires token
- creates Attendance-linked media before Case exists
- creates or reuses an open Attendance from `externalConversationId` when `attendanceId` is absent
- never creates a Case from media alone
- creates Case-linked media after Case exists and keeps `attendanceId`
- validates Case belongs to Attendance
- idempotent by `storageProvider + externalMediaId`
- defaults `storageProvider` to `external`
- supports purposes `productImage`, `receiptImage`, `storePhoto`, `other`
- rejects media attachment while Attendance is `pesquisa_satisfacao`
- expired/inaccessible media status does not affect Case validity

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- media.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement DTO/service/controller**

Do not download media. Store references and metadata only.

DTO rule:

- require either `attendanceId` or `externalConversationId`
- allow optional `caseId`
- default `storageProvider` to `external`
- when `caseId` is provided, validate that the Case belongs to the resolved Attendance

- [ ] **Step 4: Ensure Attendance detail includes all cycle media**

Update `attendance-presenter.ts` to include:

- Attendance-linked media
- Case-linked media
- media linked to cancelled Cases

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test:e2e -- media.e2e-spec.ts attendances.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/media src/attendances test/e2e/media.e2e-spec.ts test/e2e/attendances.e2e-spec.ts
git commit -m "feat: register sac media metadata"
```

---

### Task 13: Implement Satisfaction Response

**Files:**
- Create: `src/satisfaction/satisfaction.module.ts`
- Create: `src/satisfaction/satisfaction.controller.ts`
- Create: `src/satisfaction/satisfaction.service.ts`
- Create: `src/satisfaction/dto/create-satisfaction-response.dto.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/satisfaction.e2e-spec.ts`

- [ ] **Step 1: Write tests**

Cover:

- requires token
- accepts only from Attendance in `pesquisa_satisfacao`
- requires `rating` 1 to 5
- requires `problemResolvedByCustomer`
- accepts optional `comment`
- creates one response
- duplicate response returns `409`
- fills `satisfactionRespondedAt`
- closes Attendance with `status: fechado`
- fills `closedAt`

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- satisfaction.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement service/controller**

Use a transaction to create response and close Attendance.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm run test:e2e -- satisfaction.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/satisfaction src/app.module.ts test/e2e/satisfaction.e2e-spec.ts
git commit -m "feat: record satisfaction responses"
```

---

### Task 14: Implement Case Reads

**Files:**
- Modify: `src/cases/cases.controller.ts`
- Modify: `src/cases/cases.service.ts`
- Test: `test/e2e/reads.e2e-spec.ts`

- [ ] **Step 1: Write tests for `GET /sac-cases/:id`**

Cover:

- requires token
- returns full Case
- includes summarized Attendance (`attendanceId`, `status`, `externalConversationId`, `createdAt`, `closedAt`)
- `404` for unknown id

- [ ] **Step 2: Write tests for `GET /sac-cases/by-protocol/:protocol`**

Cover:

- finds active Case
- finds cancelled Case
- case-insensitive protocol search
- trims spaces
- requires hyphens
- includes `replacedBy` when present

- [ ] **Step 3: Assert no global list route**

Test `GET /sac-cases` returns `404`.

- [ ] **Step 4: Run tests to verify failure**

Run:

```powershell
npm run test:e2e -- reads.e2e-spec.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement reads**

No global list endpoint.

- [ ] **Step 6: Run tests**

Run:

```powershell
npm run test:e2e -- reads.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/cases test/e2e/reads.e2e-spec.ts
git commit -m "feat: add support reads for sac cases"
```

---

### Task 15: Add API Examples for n8n

**Files:**
- Create: `docs/api-examples/sac-inteligente.http`

- [ ] **Step 1: Add example requests**

Include examples for:

- list stores
- create Attendance
- reuse Attendance
- close Attendance without Case
- cancel Attendance
- create Case
- mark Case sent to DKW
- mark Case in resolution
- resolve Case
- cancel Case
- mark Protocol sent
- register media
- send Satisfaction Response
- close without satisfaction
- read Attendance detail
- read Attendance by external conversation
- read Case by id
- read Case by Protocol

- [ ] **Step 2: Verify examples match routes**

Manually compare with controllers and DTOs.

- [ ] **Step 3: Commit**

```powershell
git add docs/api-examples/sac-inteligente.http
git commit -m "docs: add n8n api examples"
```

---

### Task 16: Final Verification Pass

**Files:**
- Modify only if verification finds issues.

- [ ] **Step 1: Run full build**

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run unit tests**

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 3: Run e2e tests**

```powershell
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Check generated Prisma artifacts**

```powershell
npx prisma validate
```

Expected: Prisma schema is valid.

- [ ] **Step 5: Review scope against spec**

Compare implementation against:

```text
docs/superpowers/specs/2026-05-24-sac-inteligente-backend-mvp-design.md
PROJECT-SCOPE.md
```

Expected: No missing MVP endpoint or domain rule.

- [ ] **Step 6: Commit final fixes if any**

```powershell
git status --short
git add .
git commit -m "test: verify sac backend mvp"
```

Only commit if verification required changes.

---

## Execution Recommendation

Use subagent-driven development after this plan is approved:

- One worker for bootstrap/database.
- One worker for Attendance.
- One worker for Case/protocol after database is ready.
- One worker for Media/Satisfaction after core entities exist.
- One worker for reads/examples after endpoints stabilize.

Keep database/schema edits serialized to avoid conflicts.
