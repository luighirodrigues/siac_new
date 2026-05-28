# n8n SAC Chat MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first n8n MVP workflows that connect DKW WhatsApp queue events to the SAC Inteligente backend, starting with the IA queue chat flow and leaving the Evaluation queue flow ready as a follow-up.

**Architecture:** Use two separate n8n workflows: one for the IA queue and one for the Evaluation queue. The IA workflow is hybrid: deterministic n8n nodes normalize, guard, validate, call the backend, send messages, and transfer queues; one main AI agent only interprets and returns structured JSON. The backend remains the source of truth for Attendance, Case, Media, Protocol, and Satisfaction state.

**Tech Stack:** n8n Webhook, Set, IF, Switch, HTTP Request, Code, OpenAI/AI Agent node, n8n Data Store, DKW HTTP/API nodes, NestJS backend API.

---

## References

- Spec: `docs/superpowers/specs/2026-05-25-n8n-sac-chat-mvp-design.md`
- Backend spec: `docs/superpowers/specs/2026-05-24-sac-inteligente-backend-mvp-design.md`
- Domain scope: `PROJECT-SCOPE.md`
- Decision log: `GRILL-QA.md`

## Scope

This plan starts with the IA queue workflow because the user wants to begin with the customer service chat. The Evaluation workflow is planned at the end, but implementation can wait until the IA flow is working end to end.

Out of scope for this plan:

- Backend code changes.
- Frontend/internal dashboard.
- Real store CSV seeding.
- Backend storage of raw chat messages.
- Backend partial satisfaction draft storage.

## n8n Artifacts

Recommended n8n workflow names:

- `Peruzzo SIAC - IA Atendimento MVP`
- `Peruzzo SIAC - Avaliacao MVP`

Recommended exported workflow files after each workflow is stable:

- `docs/n8n/peruzzo-siac-ia-atendimento.workflow.json`
- `docs/n8n/peruzzo-siac-avaliacao.workflow.json`

Recommended docs/checklists:

- `docs/n8n/peruzzo-siac-test-fixtures.md`
- `docs/n8n/peruzzo-siac-agent-prompt.md`

## Environment and Credentials

Configure these n8n environment variables or credentials before wiring the workflow:

```text
SIAC_BACKEND_BASE_URL=http://backend-host:3000
SIAC_BACKEND_TOKEN=<same value as N8N_INTEGRATION_TOKEN>
DKW_IA_QUEUE_NAME=IA
DKW_HUMAN_QUEUE_NAME=Humano
DKW_EVALUATION_QUEUE_NAME=Avaliacao
```

Use one HTTP credential or reusable header setup for backend calls:

```http
Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
Content-Type: application/json
```

---

### Task 1: Create IA Workflow Skeleton

**Artifacts:**
- Create n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`
- Create later export: `docs/n8n/peruzzo-siac-ia-atendimento.workflow.json`

- [x] **Step 1: Create the workflow**

In n8n, create workflow `Peruzzo SIAC - IA Atendimento MVP`.

Expected: empty workflow exists and is inactive.

- [x] **Step 2: Add Webhook node**

Add Webhook node:

```text
Name: Webhook IA - DKW
HTTP Method: POST
Path: peruzzo-siac-ai
Response Mode: Respond Immediately
Response Code: 200
```

Expected webhook URL:

```text
/webhook/peruzzo-siac-ai
```

- [ ] **Step 3: Add first manual test fixture**

Use this payload in the n8n webhook test panel:

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

Expected: webhook receives one item.

- [ ] **Step 4: Save workflow**

Save the workflow but keep it inactive until the end-to-end test passes.

---

### Task 2: Normalize DKW Payload

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

- [x] **Step 1: Add Code node after Webhook**

Add Code node:

```text
Name: Normalize DKW Message
Mode: Run Once for Each Item
```

Use this JavaScript:

```javascript
const body = $json.body ?? $json;
const socialConnectionId = body.socialConnection?.id;
const contactId = body.msgContact?.id;
const raw = {
  ...body,
  socialConnection: body.socialConnection
    ? {
        id: body.socialConnection.id,
        name: body.socialConnection.name
      }
    : undefined
};

return {
  messageId: String(body.key ?? ''),
  externalConversationId: `dkw:${socialConnectionId}:${contactId}`,
  contactName: body.msgContact?.name ?? '',
  contactPhone: String(contactId ?? ''),
  text: body.text ?? '',
  messageType: body.type ?? '',
  hasMedia: Boolean(body.hasMedia),
  media: body.media ?? {},
  fromMe: Boolean(body.fromMe),
  sendBySystem: Boolean(body.sendBySystem),
  timestamp: body.timestamp ?? null,
  queueId: body.queue?.id ?? null,
  queueName: body.queue?.name ?? '',
  raw
};
```

- [x] **Step 2: Execute the fixture**

Run the webhook test payload.

Expected output:

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

- [x] **Step 3: Add guard for required IDs**

Add IF node:

```text
Name: Has Required Conversation IDs?
Condition:
- externalConversationId is not empty
- messageId is not empty
```

False branch:

```text
Stop and Error, or respond/log internally.
```

Expected: valid fixture follows true branch.

---

### Task 3: Add Message Safety Guards

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

- [x] **Step 1: Add IF node for self/system messages**

Add IF node:

```text
Name: Ignore Self/System Messages?
Condition:
- fromMe equals true OR
- sendBySystem equals true
```

True branch: end workflow without backend call.

False branch: continue.

- [x] **Step 2: Add queue guard**

Add IF node:

```text
Name: Is IA Queue?
Condition:
- queueName equals {{$env.DKW_IA_QUEUE_NAME}}
```

False branch: end workflow without backend call.

Expected: fixture with `queueName = IA` continues.

- [x] **Step 3: Test ignored self message**

Use same fixture with:

```json
{
  "fromMe": true
}
```

Expected: workflow ends before `POST /sac-attendances`.

---

### Task 4: Create or Reuse Attendance

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`
- Requires running backend and valid token.

- [x] **Step 1: Add HTTP Request node**

Add HTTP Request node:

```text
Name: Backend - Create or Reuse Attendance
Method: POST
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
Body Content Type: JSON
```

Body:

```json
{
  "externalConversationId": "={{$json.externalConversationId}}"
}
```

Note: `lastSummary` is intentionally omitted here so a later IA-generated summary is not overwritten on reused Attendances.

- [x] **Step 2: Preserve normalized message**

Configure the HTTP node or add a Merge node so later nodes have both:

```json
{
  "message": "<normalized message>",
  "attendance": "<backend response body>"
}
```

If using Code after HTTP, normalize to:

```javascript
return {
  message: $('Normalize DKW Message').item.json,
  attendance: $json
};
```

- [x] **Step 3: Test with greeting**

Run the original fixture.

Expected:

- backend returns `201` with `reused: false`, or `200` with `reused: true`;
- response contains `id`, `status`, `cases`, `media`, and `satisfactionResponse`.

---

### Task 5: Handle Satisfaction State Before Media or AI

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

Note: satisfaction replies should normally arrive in the separate Evaluation webhook (`/webhook/peruzzo-siac-avaliacao`), not in this IA webhook. This guard is defensive only: if DKW misroutes a message to IA while the Attendance is already in `pesquisa_satisfacao`, the IA workflow must not attach media, call the AI agent, or create a Case.

- [x] **Step 1: Add IF node after Attendance**

Add IF node:

```text
Name: Attendance In Satisfaction?
Condition:
- attendance.status equals pesquisa_satisfacao
```

True branch:

```text
Send DKW message asking for a valid satisfaction answer.
End workflow.
```

Message:

```text
Para finalizar sua avaliacao, envie uma nota de 1 a 5 ou responda a pergunta da pesquisa. Se preferir, aguarde a mensagem de avaliacao.
```

- [x] **Step 2: Verify no media is attached in satisfaction**

Create or simulate an Attendance in `pesquisa_satisfacao` for the same `externalConversationId`, then send a media payload.

Expected:

- workflow does not call `POST /sac-media`;
- workflow does not call AI agent;
- workflow sends only satisfaction guidance.

---

### Task 6: Register Media When Applicable

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

- [x] **Step 1: Add Code node to find active Case**

Add Code node:

```text
Name: Select Active Case
Mode: Run Once for Each Item
```

Code:

```javascript
const attendance = $json.attendance;
const activeCase = (attendance.cases ?? []).find((caseItem) => caseItem.status !== 'cancelled') ?? null;

return {
  ...$json,
  activeCase
};
```

- [x] **Step 2: Add IF node for media**

Add IF node:

```text
Name: Has Media?
Condition:
- message.hasMedia equals true
```

False branch: continue to stores.

- [ ] **Step 3: Add HTTP Request node for media**

Deferred: media registration will be finished after the customer message/AI response flow is working. For now, continue developing and testing through the no-media branch.

True branch HTTP node:

```text
Name: Backend - Register Media
Method: POST
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-media
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
Body Content Type: JSON
```

Body:

```json
{
  "attendanceId": "={{$json.attendance.id}}",
  "caseId": "={{$json.activeCase ? $json.activeCase.id : undefined}}",
  "externalMediaId": "={{$json.message.media?.id || $json.message.messageId}}",
  "storageProvider": "external",
  "sourceUrl": "={{$json.message.media?.url || undefined}}",
  "mimeType": "={{$json.message.media?.mimeType || undefined}}",
  "size": "={{$json.message.media?.size || undefined}}",
  "purpose": "={{$json.message.media?.purpose || undefined}}"
}
```

Important n8n detail: if the HTTP node sends `undefined` as literal text, use a Code node before the HTTP request to build the body and omit empty optional fields.

- [ ] **Step 4: Build media body safely if needed**

Use Code node:

```text
Name: Build Media Request Body
```

```javascript
const media = $json.message.media ?? {};
const body = {
  attendanceId: $json.attendance.id,
  externalMediaId: String(media.id ?? $json.message.messageId),
  storageProvider: 'external'
};

if ($json.activeCase?.id) body.caseId = $json.activeCase.id;
if (media.url) body.sourceUrl = media.url;
if (media.mimeType) body.mimeType = media.mimeType;
if (typeof media.size === 'number') body.size = media.size;
if (media.purpose) body.purpose = media.purpose;

return {
  ...$json,
  mediaRequestBody: body
};
```

Then send:

```json
={{$json.mediaRequestBody}}
```

- [ ] **Step 5: Re-fetch Attendance after media registration**

After `Backend - Register Media`, add HTTP Request node:

```text
Name: Backend - Refresh Attendance After Media
Method: GET
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances/{{$json.attendance.id}}
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
```

Then add Code node:

```text
Name: Merge Refreshed Attendance
```

Code:

```javascript
const base = $('Build Media Request Body').item.json;

return {
  ...base,
  attendance: $json
};
```

If there is no media, the workflow should continue with the current envelope from `Select Active Case`. If there is media, it should continue with `Merge Refreshed Attendance`. The next task should receive one item with the same envelope shape:

```json
{
  "message": {},
  "attendance": {},
  "activeCase": null
}
```

- [ ] **Step 6: Re-select active Case after refresh**

After the media/no-media branches merge, run `Select Active Case` again or ensure `activeCase` is recalculated from the refreshed Attendance.

Expected: the AI context sees media registered in the current message.

- [ ] **Step 7: Test media-only payload**

Expected:

- Attendance is created or reused;
- Media is registered;
- Case is not created from media alone.

---

### Task 7: Fetch Stores and Build AI Context

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

MVP decision: fetch active stores before the main AI decision and include them in context. This keeps the AI node deterministic and avoids granting HTTP tools to the agent. A later optimization can filter stores before the AI or add a backend store-search endpoint if the store list becomes too large.

- [x] **Step 1: Add HTTP Request node**

Add HTTP Request node:

```text
Name: Backend - List Stores
Method: GET
URL: {{$env.SIAC_BACKEND_BASE_URL}}/stores
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
```

Expected: returns active stores with `id`, `internalStoreCode`, `name`, `city`, `state`, `address`, `aliases`.

- [x] **Step 2: Add Code node to build AI context**

Add Code node:

```text
Name: Build SAC Agent Context
Mode: Run Once for All Items
```

Code:

```javascript
const base = $items('Select Active Case')[0].json;
const inputItems = $input.all();
const firstJson = inputItems[0]?.json;
const stores = Array.isArray(firstJson)
  ? firstJson
  : Array.isArray(firstJson?.data)
    ? firstJson.data
    : Array.isArray(firstJson?.stores)
      ? firstJson.stores
      : inputItems.map((item) => item.json);

return [{
  json: {
  message: base.message,
  attendance: base.attendance,
  activeCase: base.activeCase,
  stores,
  allowedCategories: [
    'DENUNCIA',
    'MAU_ATENDIMENTO',
    'ESTRUTURA_OPERACAO',
    'PRODUTO_ESTRAGADO',
    'PRODUTO_AVARIA',
    'PRODUTO_EM_FALTA',
    'RH',
    'DP',
    'CURRICULO',
    'FORNECEDOR',
    'PRECO_PRODUTO',
    'INFORMACAO_LOJA'
  ],
  caseCategories: [
    'DENUNCIA',
    'MAU_ATENDIMENTO',
    'ESTRUTURA_OPERACAO',
    'PRODUTO_ESTRAGADO',
    'PRODUTO_AVARIA',
    'PRODUTO_EM_FALTA',
    'PRECO_PRODUTO'
  ],
  orientativeCategories: [
    'RH',
    'DP',
    'CURRICULO',
    'FORNECEDOR',
    'INFORMACAO_LOJA'
  ],
  missingRequiredFieldsAllowed: [
    'denuncianteName',
    'cpfDenunciante',
    'productImage',
    'storeId',
    'purchaseOrOccurrenceDate',
    'productName',
    'affectedArea',
    'approximateDate',
    'priceInfo'
  ],
  riskReasonsAllowed: [
    'social_media',
    'lawyer',
    'procon',
    'press',
    'customer_loss_threat',
    'public_exposure',
    'other'
  ]
  }
}];
```

- [x] **Step 3: Verify context size**

Run once with stores loaded.

Expected:

- output includes normalized message, attendance, activeCase, stores, and rule lists;
- no raw headers or tokens are included.
- `stores` is one array, not one n8n item per store.

---

### Task 8: Add Main SAC AI Agent

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`
- Create later doc: `docs/n8n/peruzzo-siac-agent-prompt.md`

- [x] **Step 1: Add AI Agent or OpenAI Chat node**

Add AI node:

```text
Name: SAC Main Agent
Input: output from Build SAC Agent Context
Output: JSON only
Temperature: low
Agent Type: Tools Agent
```

- [x] **Step 2: Use system prompt**

Prompt:

```text
Use the validated system prompt from `docs/n8n/peruzzo-siac-agent-prompt.md`.
```

- [x] **Step 3: Provide user/context message**

Use the JSON output from `Build SAC Agent Context` as the user message:

```text
Analise este contexto e retorne somente o JSON de decisao:
{{ JSON.stringify($json) }}
```

- [x] **Step 4: Test greeting**

Input text: `ola`

Expected AI action:

```json
{
  "action": "ask_more_info"
}
```

Expected `replyToCustomer`: asks how SAC can help.

---

### Task 9: Parse and Validate AI Output

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

- [x] **Step 1: Add Code node after AI**

Add Code node:

```text
Name: Validate SAC Agent Decision
Mode: Run Once for Each Item
```

Code:

```javascript
const raw = typeof $json === 'string' ? $json : ($json.output ?? $json.text ?? $json.response ?? $json);
let decision;

try {
  decision = typeof raw === 'string' ? JSON.parse(raw) : raw;
} catch (error) {
  decision = {
    action: 'safe_fallback',
    category: null,
    replyToCustomer: 'Nao consegui entender sua mensagem. Pode me explicar novamente o que aconteceu?',
    lastSummary: 'Falha ao interpretar resposta estruturada da IA.',
    caseDraft: null,
    needsHumanReview: true,
    missingRequiredFields: [],
    riskFlag: false,
    riskReasons: []
  };
}

const context = $('Build SAC Agent Context').item.json;
const allowedActions = ['ask_more_info', 'close_without_case', 'create_case', 'satisfaction_misdirected', 'safe_fallback'];
const allowedCategories = context.allowedCategories;
const caseCategories = context.caseCategories;
const orientativeCategories = context.orientativeCategories;
const allowedMissing = context.missingRequiredFieldsAllowed;
const allowedRisk = context.riskReasonsAllowed;
const errors = [];

if (!allowedActions.includes(decision.action)) errors.push('invalid action');
if (decision.category && !allowedCategories.includes(decision.category)) errors.push('invalid category');
if (!decision.replyToCustomer || typeof decision.replyToCustomer !== 'string') errors.push('missing replyToCustomer');
if (!decision.lastSummary || typeof decision.lastSummary !== 'string') errors.push('missing lastSummary');

if (decision.action === 'create_case') {
  decision.caseDraft = decision.caseDraft ?? {};
  decision.caseDraft.missingRequiredFields = decision.caseDraft.missingRequiredFields ?? decision.missingRequiredFields ?? [];
  decision.caseDraft.needsHumanReview = decision.caseDraft.needsHumanReview ?? decision.needsHumanReview ?? false;
  decision.caseDraft.riskFlag = decision.caseDraft.riskFlag ?? decision.riskFlag ?? false;
  decision.caseDraft.riskReasons = decision.caseDraft.riskReasons ?? decision.riskReasons ?? [];
}

const attendanceStatus = context.attendance.status;
const hasActiveCase = Boolean(context.activeCase);

if (decision.action === 'create_case') {
  if (!['started', 'collecting_data'].includes(attendanceStatus)) errors.push('attendance status cannot create case');
  if (hasActiveCase) errors.push('attendance already has active case');
  if (!caseCategories.includes(decision.category)) errors.push('category cannot create case');
  if (!decision.caseDraft) errors.push('missing caseDraft');
  const description = decision.caseDraft?.description?.trim() ?? '';
  if (description.length < 10 || description.length > 2000) errors.push('invalid description length');
}

if (decision.action === 'close_without_case') {
  if (!orientativeCategories.includes(decision.category)) errors.push('category cannot close without case');
  if (!decision.lastSummary || decision.lastSummary.trim().length < 10) errors.push('close_without_case requires useful lastSummary');
}

const missing = decision.caseDraft?.missingRequiredFields ?? decision.missingRequiredFields ?? [];
if (!Array.isArray(missing)) errors.push('missingRequiredFields must be array');
if (Array.isArray(missing)) {
  for (const field of missing) {
    if (!allowedMissing.includes(field)) errors.push(`invalid missingRequiredField: ${field}`);
  }
  if (missing.includes('description')) errors.push('description cannot be missingRequiredField');
}

const riskReasons = decision.caseDraft?.riskReasons ?? decision.riskReasons ?? [];
if (!Array.isArray(riskReasons)) errors.push('riskReasons must be array');
if (Array.isArray(riskReasons)) {
  for (const reason of riskReasons) {
    if (!allowedRisk.includes(reason)) errors.push(`invalid riskReason: ${reason}`);
  }
}

const riskFlag = Boolean(decision.caseDraft?.riskFlag ?? decision.riskFlag);
if (riskFlag && riskReasons.length === 0) errors.push('riskFlag requires riskReasons');

if (attendanceStatus === 'pesquisa_satisfacao' && ['create_case', 'close_without_case'].includes(decision.action)) {
  errors.push('cannot mutate SAC flow during satisfaction');
}

if (errors.length > 0) {
  decision = {
    action: 'safe_fallback',
    category: null,
    replyToCustomer: 'Nao consegui confirmar todas as informacoes. Pode me explicar novamente o que aconteceu?',
    lastSummary: `Decisao da IA rejeitada pelo validador: ${errors.join('; ')}`,
    caseDraft: null,
    needsHumanReview: true,
    missingRequiredFields: [],
    riskFlag: false,
    riskReasons: []
  };
}

if (decision.caseDraft?.missingRequiredFields?.length) {
  decision.caseDraft.needsHumanReview = true;
}

if (decision.caseDraft?.riskReasons?.length) {
  decision.caseDraft.riskFlag = true;
}

return {
  context,
  decision,
  validationErrors: errors
};
```

- [x] **Step 2: Test invalid JSON**

Temporarily force AI output to:

```text
ola mundo
```

Expected:

- action becomes `safe_fallback`;
- no backend Case creation occurs.

- [x] **Step 3: Test invalid create_case status**

Use an Attendance in `waiting_resolution`.

Expected:

- validator converts `create_case` into `safe_fallback`.

---

### Task 10: Route Decisions

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

- [x] **Step 1: Add Switch node**

Add Switch node:

```text
Name: Route SAC Decision
Value: {{$json.decision.action}}
Cases:
- ask_more_info
- close_without_case
- create_case
- satisfaction_misdirected
- safe_fallback
```

- [x] **Step 2: Add DKW send-message placeholder for ask_more_info**

Add HTTP Request or DKW node:

```text
Name: DKW - Send Ask More Info
```

Payload depends on DKW API. Use:

```json
{
  "jid": "={{$json.context.message.raw.jid}}",
  "text": "={{$json.decision.replyToCustomer}}"
}
```

Expected: customer receives only the AI message.

Important: DKW send nodes often replace `$json` with the DKW API response. Any branch that needs to continue after sending a message must add a Code/Merge node that restores the previous envelope from `Validate SAC Agent Decision`.

MVP memory decision: after sending `ask_more_info`, restore the decision envelope and patch the Attendance to `collecting_data` with the AI-generated `lastSummary`. This gives the next customer message access to a short conversation summary without storing raw chat messages.

- [x] **Step 3: Reuse same send-message node pattern**

Create send-message nodes for:

- `safe_fallback`
- `satisfaction_misdirected`

Expected: no backend mutation beyond Attendance/Media for these actions.

---

### Task 11: Close Attendance Without Case

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

MVP decision: orientative attendances closed without Case do not trigger satisfaction research. Satisfaction is reserved for the Case/human-resolution flow and can be expanded later if product wants feedback on simple guidance.

- [x] **Step 1: Send customer response**

In `close_without_case` branch, first send:

```json
{
  "jid": "={{$json.context.message.raw.jid}}",
  "text": "={{$json.decision.replyToCustomer}}"
}
```

- [x] **Step 2: Restore decision envelope after DKW send**

Add Code node after the DKW send node:

```text
Name: Restore Close Without Case Envelope
```

Code:

```javascript
return $('Validate SAC Agent Decision').item.json;
```

- [x] **Step 3: Patch Attendance**

Add HTTP Request node:

```text
Name: Backend - Close Attendance Without Case
Method: PATCH
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances/{{$json.context.attendance.id}}
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
Body Content Type: JSON
```

Body:

```json
{
  "status": "fechado",
  "detectedCategory": "={{$json.decision.category}}",
  "lastSummary": "={{$json.decision.lastSummary}}"
}
```

- [x] **Step 4: Test orientative flow**

Payload text:

```text
qual o horario da loja centro?
```

Expected:

- AI chooses `INFORMACAO_LOJA` if it can answer from validated store context;
- customer receives answer;
- Attendance is closed with no Case.

---

### Task 12: Create Case, Send Protocol, Mark Sent, Transfer to Human

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

- [x] **Step 1: Build Case payload**

Add Code node in `create_case` branch:

```text
Name: Build Create Case Payload
```

Code:

```javascript
const { context, decision } = $json;
const draft = decision.caseDraft;

const body = {
  attendanceId: context.attendance.id,
  category: decision.category,
  description: draft.description,
  needsHumanReview: Boolean(draft.needsHumanReview),
  missingRequiredFields: draft.missingRequiredFields ?? [],
  riskFlag: Boolean(draft.riskFlag),
  riskReasons: draft.riskReasons ?? [],
  markAsSentToDkw: draft.markAsSentToDkw !== false
};

if (draft.storeId) body.storeId = draft.storeId;
if (draft.rawStoreMention) body.rawStoreMention = draft.rawStoreMention;

return {
  ...$json,
  createCaseBody: body
};
```

- [x] **Step 2: POST Case**

Add HTTP Request node:

```text
Name: Backend - Create Case
Method: POST
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-cases
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
Body Content Type: JSON
Body: {{$json.createCaseBody}}
```

Expected: returns Case with `id`, `protocol`, and `status`.

- [x] **Step 3: Preserve created Case**

After `Backend - Create Case`, add Code node:

```text
Name: Preserve Created Case
```

Code:

```javascript
return {
  ...$('Build Create Case Payload').item.json,
  createdCase: $json
};
```

- [x] **Step 4: Send Protocol to customer**

Add DKW send-message node:

```json
{
  "jid": "={{$json.context.message.raw.jid}}",
  "text": "={{$json.decision.replyToCustomer + '\\n\\nSeu protocolo e: ' + $json.createdCase.protocol}}"
}
```

Expected: customer receives Protocol.

- [x] **Step 5: Restore created Case envelope after DKW send**

Add Code node:

```text
Name: Restore Created Case Envelope
```

Code:

```javascript
return $('Preserve Created Case').item.json;
```

- [x] **Step 6: Mark Protocol sent**

Add HTTP Request node:

```text
Name: Backend - Mark Protocol Sent
Method: POST
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-cases/{{$json.createdCase.id}}/protocol-sent
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
Body Content Type: JSON
```

Body:

```json
{
  "sentAt": "={{new Date().toISOString()}}"
}
```

- [x] **Step 7: Restore envelope after protocol-sent**

After `Backend - Mark Protocol Sent`, restore the same envelope if the DKW transfer node needs `context`:

```javascript
return $('Restore Created Case Envelope').item.json;
```

- [x] **Step 8: Create/update DKW atendimento card**

Before changing the queue, create or update the DKW atendimento/contact card in the human board/column:

```text
Name: DKW - Create Atendimento Card
Target column: Aguardando atendimento
```

Recommended metadata/body fields:

```json
{
  "name": "={{$json.context.message.contactName}}",
  "phone": "={{$json.context.message.contactPhone}}",
  "Descricao": "={{$json.createCaseBody.description}}",
  "Protocolo": "={{$json.createdCase.protocol}}",
  "CaseId": "={{$json.createdCase.id}}"
}
```

After the DKW card/contact call, preserve the response and restore the SAC envelope:

```javascript
const dkwContact = Array.isArray($json) ? $json[0] : $json;

return {
  ...$('Restore Created Case Envelope After Protocol Sent').item.json,
  dkwContact
};
```

Important: prefer the returned DKW `id`, `number`, `lastRemoteJid`, and `socialConnectionId` for the next queue-transfer step. DKW may normalize the phone differently from the incoming `msgContact.id`.

- [x] **Step 9: Move pipeline column and transfer to human queue**

After the atendimento card exists, perform the DKW handoff actions. These can be two side-by-side simple DKW nodes if the API calls are independent:

```text
Name: DKW - Move Pipeline Column
Target column: Aguardando atendimento
Contact/card: use `dkwContact.id` or the card id returned by DKW
```

```text
Name: DKW - Transfer to Human Queue
Target queue: {{$env.DKW_HUMAN_QUEUE_NAME}}
Conversation/contact: use DKW identifiers from the previous card/contact response when available
```

Exact payloads depend on DKW API. Required data likely comes from:

```json
{
  "jid": "={{$json.dkwContact.lastRemoteJid || $json.context.message.raw.jid}}",
  "contactId": "={{$json.dkwContact.id}}",
  "phone": "={{$json.dkwContact.number || $json.context.message.contactPhone}}",
  "socialConnectionId": "={{$json.dkwContact.socialConnectionId || $json.context.message.raw.socialConnection.id}}",
  "externalConversationId": "={{$json.context.message.externalConversationId}}",
  "caseId": "={{$json.createdCase.id}}",
  "protocol": "={{$json.createdCase.protocol}}"
}
```

If the two DKW calls run as sibling branches, add a final restore/merge node for any later steps. If this is the end of the IA workflow, both branches can terminate after successful DKW responses.

- [x] **Step 10: Test create Case happy path**

Fixture text:

```text
Comprei leite estragado na loja centro ontem. O cheiro estava ruim e mandei foto do produto.
```

Expected:

- Attendance created/reused;
- stores fetched;
- AI returns `create_case`;
- backend creates Case;
- customer receives Protocol;
- backend marks Protocol sent;
- DKW atendimento card is created/updated in `Aguardando atendimento`;
- DKW conversation is transferred to human queue.

---

### Task 13: Add Backend Error Branches

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - IA Atendimento MVP`

Implementation order: handle `409 duplicate Case` first because it is the highest-risk retry/re-execution scenario in the current IA happy path. Add broader backend error branches after duplicate Case is safe.

- [x] **Step 1: Configure backend HTTP nodes not to hide response bodies**

For each backend HTTP node, enable error output or continue-on-fail only if the workflow can inspect:

```json
{
  "statusCode": 400,
  "message": "..."
}
```

- [ ] **Step 2: Add centralized error handler branch**

For backend errors:

```text
401: stop and alert internally
400: safe customer prompt only when customer data is malformed or missing
404: re-fetch or alert depending on node
409 duplicate Case: fetch Attendance and route to existing active Case
409 duplicate Satisfaction: stop asking
```

- [x] **Step 3: Add duplicate Case handling**

If `Backend - Create Case` returns 409:

1. call `GET /sac-attendances/by-external-conversation/:externalConversationId`;
2. find active Case;
3. send a safe message saying the request is already registered;
4. transfer to human if still needed.

Expected: no repeated Case creation attempts.

n8n observed error shape for `Backend - Create Case` conflict:

```json
{
  "errorDetails": {
    "httpCode": "409",
    "rawErrorMessage": [
      "409 - \"{...}\""
    ]
  }
}
```

---

### Task 14: Build IA Test Fixtures

**Artifacts:**
- Create: `docs/n8n/peruzzo-siac-test-fixtures.md`

- [ ] **Step 1: Create fixture doc**

Create `docs/n8n/peruzzo-siac-test-fixtures.md` with fixtures for:

```text
1. greeting with no demand
2. orientative category
3. product complaint missing store
4. product complaint with media and store
5. low-confidence store match
6. risk mention in treatable category
7. fromMe=true ignored
8. media-only message
9. invalid/non-IA queue ignored
10. Attendance in pesquisa_satisfacao
```

- [ ] **Step 2: Run each fixture manually in n8n**

For each fixture, record:

```text
Input
Expected branch
Actual branch
Backend records created
Customer message sent
Pass/fail
```

- [ ] **Step 3: Fix workflow issues found by fixtures**

Only adjust workflow behavior. Do not change backend unless a real backend bug is discovered.

---

### Task 15: Export and Save IA Workflow

**Artifacts:**
- Create: `docs/n8n/peruzzo-siac-ia-atendimento.workflow.json`
- Update: `docs/n8n/peruzzo-siac-test-fixtures.md`

- [ ] **Step 1: Export n8n workflow JSON**

In n8n:

```text
Workflow menu -> Download
```

Save as:

```text
docs/n8n/peruzzo-siac-ia-atendimento.workflow.json
```

- [ ] **Step 2: Remove secrets from export**

Verify export does not contain:

```text
SIAC_BACKEND_TOKEN value
DKW token value
OpenAI API key
```

Expected: credentials are referenced by credential id/name only, not raw secret values.

- [ ] **Step 3: Commit IA workflow docs/export**

```powershell
git add docs/n8n/peruzzo-siac-ia-atendimento.workflow.json docs/n8n/peruzzo-siac-test-fixtures.md
git commit -m "docs: add n8n ia atendimento workflow"
```

Only commit when the user wants Git commits; otherwise leave files uncommitted.

---

### Task 16: Build Evaluation Workflow Skeleton

**Artifacts:**
- Create n8n workflow: `Peruzzo SIAC - Avaliacao MVP`
- Create later export: `docs/n8n/peruzzo-siac-avaliacao.workflow.json`

- [x] **Step 1: Create Webhook Avaliacao**

Add Webhook:

```text
Name: Webhook Avaliacao - DKW
HTTP Method: POST
Path: peruzzo-siac-avaliacao
Response Mode: Respond Immediately
```

- [x] **Step 2: Reuse Normalize DKW Message code**

Copy the same normalization Code node from Task 2.

- [x] **Step 3: Add guards**

Guard:

```text
fromMe/sendBySystem -> ignore
queueName must equal {{$env.DKW_EVALUATION_QUEUE_NAME}}
```

- [x] **Step 4: Query Attendance by external conversation**

HTTP GET:

```text
Name: Backend - Get Attendance By External Conversation
{{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances/by-external-conversation/{{$json.externalConversationId}}
```

Configure the HTTP node so the workflow can branch on `404` instead of crashing invisibly.

- [ ] **Step 5: Handle no open Attendance**

If the backend returns `404`, send a safe message and alert internally:

```text
Nao encontrei uma avaliacao em aberto para esta conversa. Vou pedir para nossa equipe verificar.
```

Expected:

- no satisfaction response is created;
- no Data Store value is written;
- internal alert/log contains `externalConversationId`.

- [x] **Step 6: Wrap evaluation envelope**

After a successful Attendance lookup, add Code node:

```text
Name: Build Evaluation Envelope
```

Code:

```javascript
return {
  message: $('Normalize DKW Message').item.json,
  attendance: $json
};
```

- [ ] **Step 7: Resolve Case if needed**

If Attendance status is `waiting_resolution`, find active Case and call:

```http
PATCH /sac-cases/:id/status
```

Body:

```json
{
  "status": "resolved"
}
```

Expected: backend moves Attendance to `pesquisa_satisfacao`.

After `PATCH /sac-cases/:id/status`, add Code node:

```text
Name: Restore Evaluation Envelope After Resolve
```

Code:

```javascript
return $('Build Evaluation Envelope').item.json;
```

Then re-fetch the Attendance:

```text
Name: Backend - Refresh Attendance After Resolve
Method: GET
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances/{{$json.attendance.id}}
```

Then restore the envelope with the refreshed Attendance:

```javascript
const base = $('Build Evaluation Envelope').item.json;

return {
  ...base,
  attendance: $json
};
```

---

### Task 17: Implement Evaluation Data Store

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - Avaliacao MVP`

- [ ] **Step 1: Create Data Store**

Create n8n Data Store:

```text
Name: siac_satisfaction_partial
Key: externalConversationId
Value:
{
  "attendanceId": "...",
  "rating": 5,
  "createdAt": "ISO timestamp"
}
```

- [ ] **Step 2: Get partial satisfaction state**

After fetching Attendance, add Data Store node:

```text
Name: Data Store - Get Partial Satisfaction
Operation: Get
Data Store: siac_satisfaction_partial
Key: {{$json.message.externalConversationId}}
```

Then add Code node:

```text
Name: Merge Evaluation Partial
```

Code:

```javascript
const base = $('Backend - Get Attendance By External Conversation').item.json;
const value = $json.value ?? null;
const partial = value && Object.keys(value).length > 0 ? value : null;

return {
  message: $('Normalize DKW Message').item.json,
  attendance: $('Build Evaluation Envelope').item.json.attendance ?? base,
  partial
};
```

- [ ] **Step 3: Parse rating**

Add Code node:

```text
Name: Parse Rating
```

```javascript
const text = ($json.message?.text ?? '').trim();
const match = text.match(/^[1-5]$/);

return {
  ...$json,
  parsedRating: match ? Number(match[0]) : null
};
```

- [ ] **Step 4: Branch by partial state**

Add IF/Switch logic:

```text
If partial is null:
  parse and store rating
If partial exists:
  skip rating storage and parse solved answer in Task 18
```

- [ ] **Step 5: If no stored rating and parsed rating is valid**

Store:

```text
Operation: Set/Upsert
Data Store: siac_satisfaction_partial
Key: {{$json.message.externalConversationId}}
```

Value:

```json
{
  "attendanceId": "={{$json.attendance.id}}",
  "rating": "={{$json.parsedRating}}",
  "createdAt": "={{new Date().toISOString()}}"
}
```

After storing, add Code node:

```text
Name: Restore Evaluation Envelope After Rating Store
```

Code:

```javascript
return $('Merge Evaluation Partial').item.json;
```

Then ask:

```text
Obrigado pela nota. O problema foi resolvido? Responda sim ou nao.
```

- [ ] **Step 6: If no stored rating and parsed rating invalid**

Send:

```text
Por favor, envie uma nota de 1 a 5 para avaliarmos o atendimento.
```

No backend mutation.

---

### Task 18: Submit Complete Satisfaction

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - Avaliacao MVP`

- [ ] **Step 1: Parse solved answer**

Only run this task when `partial` exists. If `partial` is null, stay in the rating branch from Task 17.

Add Code node:

```text
Name: Parse Solved Answer
```

```javascript
const text = ($json.message?.text ?? $json.text ?? '').trim().toLowerCase();
const yes = ['sim', 's', 'resolvido', 'foi resolvido', 'resolveu'].includes(text);
const no = ['nao', 'não', 'n', 'nao resolveu', 'não resolveu'].includes(text);

return {
  ...$json,
  parsedProblemResolvedByCustomer: yes ? true : no ? false : null
};
```

- [ ] **Step 2: If solved answer invalid**

Send:

```text
Voce pode responder apenas se o problema foi resolvido? Responda sim ou nao.
```

- [ ] **Step 3: POST satisfaction response**

HTTP Request:

```text
Name: Backend - Submit Satisfaction
Method: POST
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances/{{$json.partial.attendanceId}}/satisfaction-response
Authentication/Header:
  Authorization: Bearer {{$env.SIAC_BACKEND_TOKEN}}
```

Configure the HTTP node so the workflow can branch on `409 Conflict` instead of treating it as an unhandled crash.

Body:

```json
{
  "rating": "={{$json.partial.rating}}",
  "problemResolvedByCustomer": "={{$json.parsedProblemResolvedByCustomer}}"
}
```

- [ ] **Step 4: Handle duplicate satisfaction**

If `Backend - Submit Satisfaction` returns `409`, treat it as already completed:

1. restore the envelope from `Parse Solved Answer`;
2. clear the Data Store key for `message.externalConversationId`;
3. stop the flow without asking the customer again.

Optional customer message:

```text
Sua avaliacao ja foi registrada. Obrigado.
```

- [ ] **Step 5: Restore evaluation envelope after satisfaction POST**

Add Code node:

```text
Name: Restore Evaluation Envelope After Satisfaction
```

Code:

```javascript
return $('Parse Solved Answer').item.json;
```

- [ ] **Step 6: Clear Data Store key**

Delete key:

```text
{{$json.message.externalConversationId}}
```

- [ ] **Step 7: Send closing message**

Send:

```text
Obrigado pela avaliacao.
```

- [ ] **Step 8: Export Evaluation workflow**

Save as:

```text
docs/n8n/peruzzo-siac-avaliacao.workflow.json
```

Verify no secrets are present.

---

### Task 19: Implement Satisfaction Timeout Handling

**Artifacts:**
- Modify n8n workflow: `Peruzzo SIAC - Avaliacao MVP`

- [ ] **Step 1: Add timeout trigger or DKW timeout webhook**

Use the DKW/n8n event that indicates 24h without a complete satisfaction answer.

Expected input must include enough data to rebuild:

```json
{
  "externalConversationId": "dkw:17092:555391306989"
}
```

- [ ] **Step 2: Fetch open Attendance**

Call:

```http
GET /sac-attendances/by-external-conversation/:externalConversationId
```

If `404`, clear any Data Store value for that `externalConversationId` and stop.

- [ ] **Step 3: Only close when Attendance is in pesquisa_satisfacao**

Add IF node:

```text
attendance.status equals pesquisa_satisfacao
```

False branch:

```text
Do not close Attendance.
Clear stale partial satisfaction value only if it belongs to a different/closed attendance.
Alert internally if needed.
```

- [ ] **Step 4: Close without satisfaction**

HTTP Request:

```text
Name: Backend - Close Without Satisfaction
Method: PATCH
URL: {{$env.SIAC_BACKEND_BASE_URL}}/sac-attendances/{{$json.attendance.id}}
```

Body:

```json
{
  "status": "fechado",
  "closedWithoutSatisfaction": true
}
```

- [ ] **Step 5: Clear partial satisfaction state**

Delete Data Store key:

```text
{{$json.message.externalConversationId || $json.externalConversationId}}
```

Expected:

- Attendance closes as `fechado`;
- `closedWithoutSatisfaction` is true;
- partial rating state is removed even if the customer had sent only the note.

---

### Task 20: End-to-End Verification

**Artifacts:**
- Update: `docs/n8n/peruzzo-siac-test-fixtures.md`

- [ ] **Step 1: Verify backend is healthy**

Run locally from `D:\Projetos\siac_new`:

```powershell
npm run build
npm test
npm run test:e2e
npx prisma validate
```

Expected: all pass.

- [ ] **Step 2: Verify IA workflow happy path**

Send a realistic product complaint.

Expected:

- Attendance exists;
- Case exists;
- Protocol was sent;
- `protocolSentToCustomerAt` is filled;
- DKW conversation moved to human queue.

- [ ] **Step 3: Verify orientative flow**

Send an informational message that does not require Case.

Expected:

- Attendance closed as `fechado`;
- no Case exists.

- [ ] **Step 4: Verify media handling**

Send media before Case.

Expected:

- Media linked to Attendance;
- no Case created from media alone.

Send media after Case exists and before human transfer only if DKW still routes it to IA.

Expected:

- Media includes `attendanceId` and `caseId`.

- [ ] **Step 5: Verify Evaluation workflow**

Move a resolved/waiting Attendance to Evaluation and send:

```text
5
sim
```

Expected:

- rating is stored after `5`;
- `POST /sac-attendances/:id/satisfaction-response` is called after `sim`;
- Attendance closes as `fechado`;
- Data Store key is cleared.

- [ ] **Step 6: Activate workflows**

Activate workflows only after fixtures pass:

```text
Peruzzo SIAC - IA Atendimento MVP
Peruzzo SIAC - Avaliacao MVP
```

---

## Execution Recommendation

Start with Tasks 1-12 only. That gets the IA queue MVP working from first message to Case creation, Protocol delivery, and human transfer.

Then run Tasks 13-15 to harden errors and export the workflow.

Implement Tasks 16-19 after the human handoff is operational, because Evaluation depends on the human queue/process being clear enough to move conversations into `Avaliacao`.
