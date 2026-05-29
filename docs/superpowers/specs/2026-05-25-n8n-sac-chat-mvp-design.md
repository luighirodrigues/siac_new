# n8n SAC Chat MVP Design

## Goal

Build the first n8n workflow for the SAC Inteligente chat, connecting DKW WhatsApp events to the existing backend. The MVP must let the IA queue receive customer messages, create or reuse Attendances, register media, classify and collect data with one main AI agent, create Cases when ready, send the Protocol to the customer, and transfer the conversation to the human queue.

This spec covers the n8n chat workflow shape and responsibilities. The backend contract remains the source of truth for persisted domain state.

## Source Documents

- `docs/superpowers/specs/2026-05-24-sac-inteligente-backend-mvp-design.md`
- `PROJECT-SCOPE.md`
- `GRILL-QA.md`

## Non-Goals

- No frontend changes.
- No backend schema changes for the MVP workflow.
- No backend storage of raw messages.
- No partial satisfaction draft in the backend.
- No AI response while the conversation is in the human queue.
- No direct AI tool calls that mutate backend state.
- No DKW-specific hard dependency inside the backend.

## Queue Model

DKW controls which queue emits events to which n8n webhook.

### IA Queue

The IA queue sends customer messages to the main SAC AI webhook:

```text
/webhook/peruzzo-siac-ai
```

This workflow owns the automated customer conversation until it either closes the Attendance without Case or creates a Case and transfers the conversation to the human queue.

### Human Queue

The human queue does not send customer messages to the AI webhook. This prevents the AI from replying while a person is handling the customer.

When a Case is created, the IA workflow sends the Protocol to the customer, marks the Protocol as sent in the backend, and transfers the DKW conversation to the human queue.

When the human finishes the treatment, an external DKW/n8n operation marks the Case as resolved and moves the conversation to the evaluation queue, or the evaluation flow resolves the Case before collecting satisfaction if the Attendance is still waiting for resolution.

### Evaluation Queue

The evaluation queue uses a separate webhook:

```text
/webhook/peruzzo-siac-avaliacao
```

The evaluation workflow is intentionally simple. It receives only satisfaction replies, stores partial rating state in n8n Data Store, asks whether the problem was solved, and sends the complete satisfaction response to the backend.

The first satisfaction prompt may be sent by another simple DKW mechanism. The evaluation webhook does not need to initiate the first prompt automatically.

### Closed Cycle

After satisfaction is completed or timed out, the backend closes the Attendance. If the customer sends a new message later, DKW moves the conversation back to the IA queue. The IA workflow uses the same stable `externalConversationId`; the backend creates a new Attendance because the previous one is terminal.

## Incoming DKW Payload

The IA webhook currently receives a DKW event shaped like:

```json
{
  "body": {
    "key": "3EB0624A91132828208226",
    "externalId": "false_261971748368625@lid_3EB0624A91132828208226",
    "fromMe": false,
    "text": "ola",
    "jid": "555391306989@s.whatsapp.net",
    "type": "conversation",
    "hasMedia": false,
    "msgContact": {
      "id": "555391306989",
      "name": "Luighi Rodrigues"
    },
    "timestamp": 1779724237,
    "sendBySystem": false,
    "socialConnection": {
      "id": 17092,
      "name": "Peruzzo Sac - Development"
    },
    "media": {},
    "queue": {
      "id": 13068,
      "name": "IA"
    }
  }
}
```

The workflow must normalize this raw input before any business decision.

## Normalized Message

The first Set/Code step in n8n should produce this internal shape:

```json
{
  "messageId": "3EB0624A91132828208226",
  "externalConversationId": "dkw:17092:555391306989",
  "contactName": "Luighi Rodrigues",
  "contactPhone": "555391306989",
  "text": "ola",
  "messageType": "conversation",
  "hasMedia": false,
  "media": {},
  "fromMe": false,
  "sendBySystem": false,
  "timestamp": 1779724237,
  "queueId": 13068,
  "queueName": "IA"
}
```

Rules:

- `messageId` comes from `body.key`.
- `externalConversationId` uses `dkw:{socialConnection.id}:{msgContact.id}`.
- `contactName` comes from `body.msgContact.name`.
- `contactPhone` comes from `body.msgContact.id`.
- `text` comes from `body.text`, defaulting to an empty string when absent.
- `queueId` and `queueName` must be separate fields.
- `body.externalId` must not be used as `externalConversationId`, because it may identify a specific message rather than the stable external conversation.

## IA Workflow Architecture

The IA workflow uses a hybrid design:

- deterministic n8n nodes handle guards, backend calls, validation, and routing;
- one main AI agent handles interpretation, response writing, classification, data collection decisions, store matching suggestions, summary synthesis, and Case draft creation;
- the AI agent never calls the backend directly.

High-level flow:

```text
Webhook IA
-> Normalize payload
-> Guard: ignore fromMe/sendBySystem/non-IA queue
-> POST /sac-attendances
-> If Attendance is pesquisa_satisfacao: do not attach media or create Case; route to satisfaction guidance
-> If media and Attendance is not pesquisa_satisfacao: POST /sac-media
-> GET /stores
-> Build AI context
-> Main SAC AI agent returns structured JSON
-> Deterministic validation
-> Switch by action
   -> ask_more_info
   -> answer_without_case
   -> close_without_case
   -> create_case
   -> satisfaction_misdirected
   -> safe_fallback
```

## Backend Calls

All backend calls use the integration token configured in n8n credentials or environment.

### Create or Reuse Attendance

Call:

```http
POST /sac-attendances
```

Payload:

```json
{
  "externalConversationId": "dkw:17092:555391306989",
  "lastSummary": "Resumo operacional opcional produzido pelo n8n"
}
```

The workflow should call this early for every valid customer message in the IA queue. The backend decides whether to create a new Attendance or reuse the current open one.

### Register Media

If `hasMedia` is true, call:

```http
POST /sac-media
```

Payload should include:

```json
{
  "attendanceId": "attendance-id",
  "caseId": "active-case-id-when-present",
  "externalMediaId": "message-or-media-id",
  "storageProvider": "external",
  "sourceUrl": "media-url-if-present",
  "mimeType": "media-mime-if-present",
  "size": 123456,
  "purpose": "productImage"
}
```

Rules:

- Media is registered before the AI decision so it can count as context.
- Before registering media, inspect the Attendance returned by `POST /sac-attendances`.
- Media in `pesquisa_satisfacao` must not be attached; the workflow should ask for a valid satisfaction answer instead.
- If the Attendance has one active Case, include that Case id in `caseId` and also keep `attendanceId`.
- If there is no active Case yet, omit `caseId` and link the media only to the Attendance.
- Media without text must not create a Case by itself.

### List Stores

Call:

```http
GET /stores
```

The AI agent receives active stores and may propose `storeId` plus `rawStoreMention`.

Store matching rules:

- use store name, aliases, city, address, and `internalStoreCode` as matching signals;
- send `storeId` when confident enough;
- if a likely store exists with low confidence, send `storeId`, preserve `rawStoreMention`, and set `needsHumanReview: true`;
- if no store can be matched, omit `storeId`, set `missingRequiredFields: ["storeId"]`, and explain in `description` when creating a Case.

### Create Case

Call:

```http
POST /sac-cases
```

Only after deterministic validation passes.

The workflow sends:

```json
{
  "attendanceId": "attendance-id",
  "category": "PRODUTO_ESTRAGADO",
  "description": "Descricao sintetizada pelo n8n.",
  "storeId": "store-id-or-omitted",
  "rawStoreMention": "fala original do cliente",
  "needsHumanReview": false,
  "missingRequiredFields": [],
  "riskFlag": false,
  "riskReasons": [],
  "markAsSentToDkw": true
}
```

After a successful response, the workflow must:

1. send the Protocol to the customer;
2. call `POST /sac-cases/:id/protocol-sent`;
3. transfer the DKW conversation to the human queue.

Protocol sent payload:

```json
{
  "sentAt": "2026-05-25T12:00:00.000Z"
}
```

`sentAt` should be the moment the DKW send step succeeds. If the workflow cannot provide it, the backend can fill the backend receive time, but the preferred MVP workflow sends the timestamp explicitly.

### Request Satisfaction Without Case

Call:

```http
PATCH /sac-attendances/:id
```

Payload:

```json
{
  "status": "pesquisa_satisfacao",
  "detectedCategory": "INFORMACAO_LOJA",
  "lastSummary": "Cliente recebeu informacao validada da loja e confirmou que nao deseja mais nada."
}
```

Use this only after an orientative answer when the customer confirms that they do not need anything else. The informational answer itself uses `answer_without_case` and keeps the Attendance in `collecting_data`.

## Main AI Agent Contract

The AI agent receives:

- normalized message;
- Attendance detail returned by the backend;
- existing Cases and Media in the Attendance;
- active store list;
- category list and category rules;
- minimum fields per category;
- closed sets for `missingRequiredFields` and `riskReasons`;
- instruction that backend mutation is forbidden.

The AI agent returns only JSON. The n8n workflow must reject non-JSON or invalid JSON.

Allowed actions:

- `ask_more_info`
- `answer_without_case`
- `close_without_case`
- `create_case`
- `satisfaction_misdirected`
- `safe_fallback`

Example for asking more information:

```json
{
  "action": "ask_more_info",
  "category": "PRODUTO_ESTRAGADO",
  "replyToCustomer": "Voce consegue me enviar uma foto do produto e informar em qual loja comprou?",
  "lastSummary": "Cliente relata produto possivelmente estragado; faltam loja e imagem.",
  "caseDraft": null,
  "needsHumanReview": false,
  "missingRequiredFields": [],
  "riskFlag": false,
  "riskReasons": []
}
```

Example for creating a Case:

```json
{
  "action": "create_case",
  "category": "PRODUTO_ESTRAGADO",
  "replyToCustomer": "Obrigado pelas informacoes. Vou encaminhar seu caso para nossa equipe responsavel.",
  "lastSummary": "Cliente relata produto estragado comprado na loja informada e enviou imagem.",
  "caseDraft": {
    "description": "Cliente informa que comprou produto X na loja Y e relata sinais de deterioracao. Enviou imagem do produto.",
    "storeId": "store-id",
    "rawStoreMention": "loja da rua tal",
    "missingRequiredFields": [],
    "needsHumanReview": false,
    "riskFlag": false,
    "riskReasons": [],
    "markAsSentToDkw": true
  }
}
```

## Deterministic Validation

Before executing an action, n8n must validate the AI output.

Hard validations:

- `action` must be in the allowed set.
- `replyToCustomer` must be present for customer-facing actions.
- `category`, when present, must be one of the 12 backend categories.
- `create_case` is allowed only when Attendance status is `started` or `collecting_data`.
- `create_case` is blocked when the Attendance already has a non-cancelled Case.
- `create_case` is allowed only for categories that generate Cases:
  - `DENUNCIA`
  - `MAU_ATENDIMENTO`
  - `ESTRUTURA_OPERACAO`
  - `PRODUTO_ESTRAGADO`
  - `PRODUTO_AVARIA`
  - `PRODUTO_EM_FALTA`
  - `PRECO_PRODUTO`
- `create_case` requires `caseDraft.description` with at least 10 trimmed characters and at most 2000 characters.
- `missingRequiredFields` must use the closed backend set.
- `description` must never appear in `missingRequiredFields`.
- if `missingRequiredFields` is non-empty, force `needsHumanReview: true`.
- `riskReasons` must use the closed backend set.
- if `riskFlag` is true, at least one `riskReasons` item is required.
- if `riskReasons` is non-empty, force `riskFlag: true`.
- if the Attendance is `pesquisa_satisfacao`, do not create Case or attach Media; route to satisfaction guidance.
- if the AI output is invalid, do not mutate backend state beyond the already-created/reused Attendance and already-registered valid Media.

Fallback behavior:

- ask the customer for one clear missing piece of information when possible;
- otherwise send a safe message saying the system could not understand and ask the customer to describe the issue again.

## Customer Messaging

The workflow sends messages through DKW after the action is decided.

General rules:

- keep messages short and conversational;
- do not expose internal enum names, backend IDs, or validation terms;
- when asking for missing information, ask for at most two related fields at once;
- when creating a Case, tell the customer that the issue will be sent to the responsible team and provide the Protocol after backend creation;
- after Protocol delivery, transfer to the human queue.

## Human Transfer

Human transfer happens only after a successful Case creation and Protocol delivery attempt.

Recommended order:

1. `POST /sac-cases`
2. Send customer message with Protocol.
3. `POST /sac-cases/:id/protocol-sent`
4. Move DKW conversation to the human queue.

If sending the Protocol fails, the workflow should not mark `protocol-sent`.

If moving to the human queue fails after Protocol delivery, log the failure and alert internally; do not continue AI conversation as if nothing happened.

## Evaluation Workflow

The evaluation workflow is separate from the IA workflow.

High-level flow:

```text
Webhook Avaliacao
-> Normalize payload
-> Guard: ignore fromMe/sendBySystem/non-Avaliacao queue
-> GET /sac-attendances/by-external-conversation/:externalConversationId
-> If Attendance waiting_resolution: PATCH /sac-cases/:id/status with {"status":"resolved"} for the active Case
-> If rating missing: parse rating 1-5, store in n8n Data Store, ask solved question
-> If rating exists: parse solved yes/no
-> POST /sac-attendances/:attendanceId/satisfaction-response
-> clear Data Store key
```

Partial satisfaction state:

- stored in n8n Data Store;
- keyed by `externalConversationId`;
- contains `attendanceId`, `rating`, and timestamp;
- cleared after successful `satisfaction-response` or timeout handling.

The backend receives only complete satisfaction:

```json
{
  "rating": 5,
  "problemResolvedByCustomer": true,
  "comment": "optional"
}
```

## Timeout Handling

Timeouts are triggered by DKW/n8n, not inferred by the backend.

Rules:

- timeout in `started` or `collecting_data`: `PATCH /sac-attendances/:id` to `cancelled` with `cancellationReason: "timeout"`;
- timeout in `waiting_resolution`: do not cancel Attendance or Case;
- timeout in `pesquisa_satisfacao`: `PATCH /sac-attendances/:id` to `fechado` with `closedWithoutSatisfaction: true`;
- timeout after partial rating in n8n Data Store still closes without satisfaction if the solved answer was not collected.

## Error Handling

Backend `401`:

- stop the workflow and alert internally; token/config is wrong.

Backend `400` or validation failure:

- do not retry blindly;
- send a safe customer prompt only if the error indicates missing or malformed customer-provided data;
- otherwise alert internally.

Backend `404`:

- for IA workflow, create/reuse Attendance again if appropriate;
- for evaluation workflow, ask the customer to wait or alert internally because no open Attendance was found.

Backend `409`:

- for duplicate Case, re-fetch Attendance and route based on existing active Case;
- for duplicate satisfaction, stop and avoid asking again.

AI invalid JSON:

- no Case creation;
- send safe fallback and keep Attendance open.

## Testing Strategy

The MVP should be tested in n8n with fixture payloads before connecting to the real DKW queue rules.

Minimum fixtures:

1. greeting with no demand: ask what the customer needs;
2. orientative category: close Attendance without Case;
3. product complaint missing store: ask for store;
4. product complaint with media and store: create Case and transfer;
5. low-confidence store match: create Case with `needsHumanReview`;
6. risk mention in treatable category: create Case with `riskFlag`;
7. message from `fromMe=true`: ignored;
8. media-only message: register Media but do not create Case;
9. satisfaction rating in evaluation webhook: store partial rating;
10. satisfaction solved answer: send complete backend response.

## Open Questions

None for the IA workflow MVP design.
