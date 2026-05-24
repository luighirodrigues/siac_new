# SAC Inteligente Backend MVP Design

## Goal

Build the backend MVP for SAC Inteligente Peruzzo using NestJS, Prisma, and PostgreSQL, exposing a token-protected API for n8n to register attendances, cases, media, satisfaction responses, stores, and basic support reads.

## Source Documents

- `CONTEXT.md`: domain vocabulary and term boundaries.
- `PROJECT-SCOPE.md`: consolidated MVP behavior.
- `GRILL-QA.md`: decision log with resolved questions.

These documents are the source of truth for domain rules. This spec organizes them into implementation boundaries.

## Non-Goals

- No frontend in the MVP.
- No administrative CRUD for stores.
- No full conversation log in the backend.
- No per-category `details` JSON for cases.
- No global case list endpoint in the MVP.
- No user authentication for internal staff yet.
- No internal media storage requirement in the MVP.

## Architecture

Use a modular NestJS backend with Prisma as the database access layer and PostgreSQL as persistence. The API is primarily consumed by n8n and protected by one integration token configured by environment.

The backend stores structured lifecycle records, not the WhatsApp/DKW conversation itself. The DKW/n8n flow owns conversation handling, field collection, classification prompts, and partial satisfaction state. The backend owns durable domain state, protocol generation, idempotency, status transitions, validation, and support reads.

## Core Modules

### App and Infrastructure

- NestJS application bootstrap.
- Prisma module and PostgreSQL connection.
- Global validation pipe.
- Integration token guard for all MVP endpoints.
- Structured technical logging with request id, endpoint, status, duration, and origin where practical.

### Stores

Stores are seeded in the database and exposed to n8n for classification.

Fields:

- `id`
- `internalStoreCode`
- `name`
- `city`
- `state`
- `address`
- `active`
- `aliases`

Rules:

- `internalStoreCode` is required and globally unique.
- `GET /stores` returns all active stores by default, without pagination.
- `GET /stores` requires the integration token.
- Store data comes from the database. CSV seed format can be finalized later.
- Inactive stores remain valid for historical case reads but cannot be used in new cases.

### Attendances

An Attendance is the lifecycle record for one SAC cycle.

Statuses:

- `started`
- `collecting_data`
- `waiting_resolution`
- `pesquisa_satisfacao`
- `fechado`
- `cancelled`

Key fields:

- `id`
- `externalConversationId`
- `status`
- `detectedCategory`
- `lastSummary`
- `closedAt`
- `closedWithoutSatisfaction`
- `cancellationReason`
- `satisfactionRequestedAt`
- `satisfactionRespondedAt`
- timestamps

Rules:

- One open Attendance per `externalConversationId`.
- Open statuses are `started`, `collecting_data`, `waiting_resolution`, and `pesquisa_satisfacao`.
- `fechado` and `cancelled` are terminal for the current cycle.
- `POST /sac-attendances` is idempotent by open `externalConversationId`.
- Creating a new Attendance returns `201` and `reused: false`.
- Reusing an open Attendance returns `200` and `reused: true`.
- Both creation and reuse return the full Attendance detail shape.
- Reuse may update structured data such as `lastSummary` and media, but the backend does not store the last raw message or `lastMessageAt`.
- Closing without a Case requires `detectedCategory` and `lastSummary`.
- `PATCH /sac-attendances/:id` accepts only narrow transitions in the MVP:
  - cancel in `started` or `collecting_data`
  - close without Case for orientative categories
  - close without satisfaction from `pesquisa_satisfacao`
- Case-driven transitions happen through Case endpoints.
- Cancelling an Attendance requires `cancellationReason`.
- Attendance cancellation reasons:
  - `customer_gave_up`
  - `operational_duplicate`
  - `invalid_message`
  - `spam`
  - `timeout`
  - `other`
- If `cancellationReason` is `other`, `lastSummary` must explain it.
- Cancelling an Attendance fills `closedAt`.

### Cases

A Case is the structured SAC record that receives a Protocol.

Statuses:

- `registered`
- `sent_to_dkw`
- `in_resolution`
- `resolved`
- `cancelled`

Categories that generate Cases:

- `DENUNCIA`
- `MAU_ATENDIMENTO`
- `ESTRUTURA_OPERACAO`
- `PRODUTO_ESTRAGADO`
- `PRODUTO_AVARIA`
- `PRODUTO_EM_FALTA`
- `PRECO_PRODUTO`

Categories that do not generate Cases in the normal flow:

- `RH`
- `DP`
- `CURRICULO`
- `FORNECEDOR`
- `INFORMACAO_LOJA`

Key fields:

- `id`
- `attendanceId`
- `protocol`
- `category`
- `description`
- `status`
- `storeId`
- `rawStoreMention`
- `needsHumanReview`
- `missingRequiredFields`
- `riskFlag`
- `riskReasons`
- `caseCancellationReason`
- `sentToDkwAt`
- `resolvedAt`
- `cancelledAt`
- `protocolSentToCustomerAt`
- `replacedByCaseId`
- timestamps

Rules:

- A Case always belongs to exactly one Attendance.
- An Attendance can have at most one non-cancelled Case.
- Cancelled Cases can remain in the same Attendance history for operational correction.
- `POST /sac-cases` refuses creation if the Attendance already has a non-cancelled Case.
- `POST /sac-cases` is allowed only when Attendance is `started` or `collecting_data`.
- `POST /sac-cases` must reject categories that do not generate Cases in the normal flow: `RH`, `DP`, `CURRICULO`, `FORNECEDOR`, and `INFORMACAO_LOJA`.
- `POST /sac-cases` can create `registered` by default or `sent_to_dkw` when `markAsSentToDkw: true`.
- Creating any Case moves the Attendance to `waiting_resolution`.
- `description` is required, synthesized by n8n, minimum 10 characters after trim, maximum 2000 characters.
- No per-category `details` JSON in the MVP.
- Category-specific minimum fields guide n8n collection and synthesis into `description`.
- `missingRequiredFields` uses a closed set:
  - `denuncianteName`
  - `cpfDenunciante`
  - `productImage`
  - `storeId`
  - `purchaseOrOccurrenceDate`
  - `productName`
  - `affectedArea`
  - `approximateDate`
  - `priceInfo`
- `description` is not allowed in `missingRequiredFields`.
- When `missingRequiredFields` is non-empty, backend normalizes `needsHumanReview` to `true`.
- n8n must only send `missingRequiredFields` after attempting to collect the field or after the customer says they do not have/cannot provide it.
- The reason for missing fields is explained in `description`, not in a separate structure.
- `storeId` and `rawStoreMention` live only on Case, not Attendance.
- New Cases cannot use inactive stores.

### Protocols

Rules:

- Protocol is generated when the Case is created.
- Format: `SAC-YYYYMMDD-000001`.
- Date uses `America/Sao_Paulo`.
- Daily sequence must be unique and increasing, but does not need to be gapless.
- Full protocol has a global unique database constraint.
- Each Case has its own Protocol.
- A replacement Case gets a new Protocol.
- If the old Protocol was already sent to the customer, n8n must tell the customer the new valid Protocol.
- `protocolSentToCustomerAt` is filled idempotently and never overwritten once present.

### Case Transitions

Rules:

- Marking `sent_to_dkw` is idempotent if already `sent_to_dkw`, preserving original `sentToDkwAt`.
- Marking `sent_to_dkw` is allowed from `registered`.
- Marking `sent_to_dkw` fails from `resolved` or `cancelled`.
- Marking `in_resolution` is idempotent if already `in_resolution`.
- `registered -> in_resolution` and `sent_to_dkw -> in_resolution` are allowed.
- Marking `in_resolution` fails from `resolved` or `cancelled`.
- `in_resolution` has no timestamp in the MVP because the exact start is not reliable.
- Marking `resolved` is idempotent if already resolved.
- Marking `resolved` is allowed from `registered`, `sent_to_dkw`, or `in_resolution`; `sent_to_dkw -> resolved` may happen without passing through `in_resolution`.
- Marking `resolved` fails from `cancelled`.
- Resolving sets `resolvedAt`, moves Attendance to `pesquisa_satisfacao`, and fills `satisfactionRequestedAt`.
- If a previous retry left the Attendance inconsistent, resolving may repair it without changing existing `resolvedAt`.
- Cancel Case only before `resolved`.
- Case cancellation reasons:
  - `operational_duplicate`
  - `created_by_mistake`
  - `wrong_routing`
  - `other`
- Timeout never cancels a Case.
- A Case cancelled by correction can allow the Attendance to return to `collecting_data`.
- If cancelling a Case leaves no useful demand in the Attendance, backend cancels the Attendance too with an appropriate `cancellationReason`.
- If cancelling by `created_by_mistake` or `wrong_routing` and a valid demand remains, backend can move Attendance back to `collecting_data`.
- If a replacement Case is created and there is exactly one cancelled Case without `replacedByCaseId`, backend links it automatically.
- If there are multiple candidates, n8n must disambiguate or backend refuses by ambiguity.

### Media

Media are records of files sent by the customer.

Key fields:

- `id`
- `attendanceId`
- `caseId`
- `externalMediaId`
- `sourceUrl`
- `storageProvider`
- `storageStatus`
- `internalObjectKey`
- `mimeType`
- `size`
- `purpose`
- timestamps

Rules:

- Before a Case exists, media belongs to Attendance.
- After a Case exists, new media belongs to Case and keeps `attendanceId`.
- Attendance detail returns all media in the cycle, including media linked to Cases or cancelled Cases.
- Media is stored as external references and metadata in the MVP.
- The model is ready for future internal storage.
- `externalMediaId` plus source is idempotent.
- Expired/inaccessible external media does not invalidate a Case retroactively.
- Media in `pesquisa_satisfacao` is not attached; n8n asks the customer to send a valid satisfaction answer.
- Media without text can create or update Attendance if it has `externalConversationId`, but does not create a Case by itself.

Initial media purposes:

- `productImage`
- `receiptImage`
- `storePhoto`
- `other`

### Satisfaction

Satisfaction belongs to Attendance, not Case.

Endpoint:

- `POST /sac-attendances/:attendanceId/satisfaction-response`

Payload:

- `problemResolvedByCustomer`
- `rating`
- `comment`

Rules:

- One Satisfaction Response per Attendance.
- It can only be received in `pesquisa_satisfacao`.
- `rating` is integer 1 to 5.
- `problemResolvedByCustomer` is required.
- `comment` is optional.
- n8n collects satisfaction in two moments:
  - rating
  - whether the problem was resolved from customer perspective
- Backend receives only the complete payload.
- Backend does not store partial satisfaction drafts.
- Receiving a complete response fills `satisfactionRespondedAt`, closes the Attendance, and sets `closedAt`.
- Timeout after 24h without complete satisfaction closes Attendance with `closedWithoutSatisfaction: true`.
- `closedWithoutSatisfaction` is valid only from `pesquisa_satisfacao`.
- `closedAt` is enough for no-response closure; no extra no-response timestamp is needed.

### Risk

Risk belongs to Case, not Attendance.

Rules:

- `riskReasons` closed set:
  - `social_media`
  - `lawyer`
  - `procon`
  - `press`
  - `customer_loss_threat`
  - `public_exposure`
  - `other`
- `riskFlag: true` requires at least one reason.
- If reasons are present and `riskFlag` is false or absent, backend normalizes to `riskFlag: true`.
- Risk does not automatically mean `needsHumanReview`.
- Risk only forces a Case when the demand maps to a treatable SAC category.
- Risk outside SAC scope is stored only in Attendance `lastSummary` when no Case exists.

### Read Endpoints

Required MVP reads:

- `GET /stores`
- `GET /sac-attendances`
- `GET /sac-attendances/:id`
- `GET /sac-attendances/by-external-conversation/:externalConversationId`
- `GET /sac-cases/:id`
- `GET /sac-cases/by-protocol/:protocol`

Rules:

- Reads require the same integration token in the MVP.
- `GET /sac-attendances/by-external-conversation/:externalConversationId` returns only the most recent open Attendance.
- Open statuses for that endpoint are `started`, `collecting_data`, `waiting_resolution`, and `pesquisa_satisfacao`.
- If no open Attendance exists for the external conversation, it returns `404`.
- The endpoint returns the same full detail shape as `GET /sac-attendances/:id`.
- `GET /sac-attendances` filters:
  - `status`
  - `externalConversationId`
  - `createdFrom`
  - `createdTo`
  - `hasCase`
- `GET /sac-attendances` is paginated with `page` and `limit`.
- Default `limit` is 20, maximum is 100.
- Attendance detail returns Attendance, all linked Cases, all media in the cycle, and Satisfaction Response if present.
- Case detail returns full Case plus summarized Attendance.
- Search by protocol finds cancelled Cases too.
- Search by protocol is case-insensitive and trims spaces, but requires hyphens.
- If a cancelled Case has a replacement, protocol search includes `replacedBy: { caseId, protocol, status }`.
- No global `GET /sac-cases` list in the MVP.

## Write Endpoints

All write endpoints require the integration token.

### `POST /sac-attendances`

Creates or reuses an open Attendance for an external conversation.

Minimum payload:

```json
{
  "externalConversationId": "dkw-conversation-id",
  "lastSummary": "Resumo operacional opcional"
}
```

Returns full Attendance detail with `reused: false` and HTTP `201` when created, or `reused: true` and HTTP `200` when reused.

### `PATCH /sac-attendances/:id`

Handles the narrow Attendance transitions allowed in the MVP.

Cancel payload:

```json
{
  "status": "cancelled",
  "cancellationReason": "timeout",
  "lastSummary": "Obrigatorio quando cancellationReason for other"
}
```

Close without Case payload:

```json
{
  "status": "fechado",
  "detectedCategory": "INFORMACAO_LOJA",
  "lastSummary": "Cliente recebeu informacao validada da loja."
}
```

Close without satisfaction payload:

```json
{
  "status": "fechado",
  "closedWithoutSatisfaction": true
}
```

### `POST /sac-cases`

Creates a Case for an eligible Attendance.

Minimum payload shape:

```json
{
  "attendanceId": "attendance-id",
  "category": "PRODUTO_ESTRAGADO",
  "description": "Descricao sintetizada pelo n8n.",
  "storeId": "store-id",
  "rawStoreMention": "loja da rua x",
  "needsHumanReview": false,
  "missingRequiredFields": [],
  "riskFlag": false,
  "riskReasons": [],
  "markAsSentToDkw": false
}
```

Returns the created Case with generated `protocol`.

### `PATCH /sac-cases/:id/status`

Applies idempotent Case status transitions except cancellation.

Payload:

```json
{
  "status": "sent_to_dkw"
}
```

Allowed target statuses:

- `sent_to_dkw`
- `in_resolution`
- `resolved`

### `POST /sac-cases/:id/cancel`

Cancels a Case before resolution.

Payload:

```json
{
  "caseCancellationReason": "wrong_routing",
  "lastSummary": "Opcional para explicar a correcao.",
  "returnAttendanceToCollectingData": true
}
```

If `returnAttendanceToCollectingData` is true, backend may move Attendance back to `collecting_data` only when the cancellation reason and current state allow correction. If false or no useful demand remains, backend cancels the Attendance too.

### `POST /sac-cases/:id/protocol-sent`

Marks that n8n sent the Protocol to the customer.

Payload:

```json
{
  "sentAt": "2026-05-24T12:00:00.000Z"
}
```

If `protocolSentToCustomerAt` is already filled, return success without overwriting it.

### `POST /sac-media`

Registers media metadata idempotently.

Payload:

```json
{
  "attendanceId": "attendance-id",
  "caseId": "case-id-or-null",
  "externalMediaId": "dkw-media-id",
  "storageProvider": "external",
  "sourceUrl": "https://example.com/media.jpg",
  "mimeType": "image/jpeg",
  "size": 123456,
  "purpose": "productImage"
}
```

`caseId` is optional before a Case exists. When present, backend validates that the Case belongs to the same Attendance.
If `storageProvider` is omitted in the MVP, backend defaults it to `external`. Idempotency uses `storageProvider` plus `externalMediaId`.

## API Error Principles

- Invalid token returns `401`.
- Invalid transition returns `409` or `400` depending on whether it is state conflict or malformed request.
- Duplicate non-cancelled Case creation returns `409`.
- Duplicate Satisfaction Response returns `409`.
- Unknown store returns `400`.
- Inactive store on new Case returns `400`.
- Unknown resource returns `404`.
- Validation errors should return clear field-level messages where practical.

## Testing Strategy

Use automated tests at three levels:

1. Unit tests for pure status/validation helpers where extracted.
2. Service tests for protocol generation, idempotency, transitions, and normalization.
3. HTTP/e2e tests for critical n8n flows:
   - create/reuse Attendance
   - create Case and generate Protocol
   - mark sent/resolved idempotently
   - create media idempotently
   - create Satisfaction Response and close Attendance
   - close without Case
   - close without satisfaction
   - read by protocol including replacement
   - reject invalid token

## Implementation Phases

1. Bootstrap NestJS, Prisma, PostgreSQL, config, validation, and test setup.
2. Create Prisma schema, migrations, enums, and seed path for Stores.
3. Implement integration token guard.
4. Implement Stores read endpoint.
5. Implement Attendance creation/reuse and constrained patch transitions.
6. Implement Case creation, protocol generation, and case transitions.
7. Implement Media model and idempotent registration.
8. Implement Satisfaction Response.
9. Implement read endpoints.
10. Add e2e tests and example requests for n8n.

## Open Questions

None for MVP implementation. Detailed CSV seed format can be decided later when the real/test store file is available.
