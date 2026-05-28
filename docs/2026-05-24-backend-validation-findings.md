# Backend MVP - Falhas Encontradas na Validacao

Data: 2026-05-24

Este arquivo consolida os achados da validacao do backend MVP do SAC Inteligente Peruzzo contra a spec aprovada:

- `docs/superpowers/specs/2026-05-24-sac-inteligente-backend-mvp-design.md`
- `PROJECT-SCOPE.md`
- `GRILL-QA.md`

## Resultado da Validacao

O backend esta executavel e boa parte dos testes passa, mas ainda nao deve ser considerado aprovado para merge/producao.

Verificacoes locais realizadas:

- `npm run build`: passou
- `npx prisma validate`: passou
- `npm test`: passou, 10/10
- `npm run test:e2e`: falhou em paralelo, 1 teste com HTTP 500
- `npx jest --config jest.e2e.config.ts --runInBand`: passou, 132/132

Conclusao: ha problemas de contrato, concorrencia/idempotencia e isolamento de testes. O fato de e2e passar em serial e falhar em paralelo indica vazamento de estado ou corrida no banco de teste.

## Achados

### 1. Alta - Idempotencia de Atendimento nao e segura contra concorrencia

Arquivos:

- `src/attendances/attendances.service.ts`
- `prisma/schema.prisma`

Problema:

`POST /sac-attendances` faz uma busca por Atendimento aberto e depois cria um novo registro se nao encontrar. Como nao ha garantia no banco para impedir mais de um Atendimento aberto por `externalConversationId`, duas chamadas concorrentes podem criar dois Atendimentos abertos para a mesma Conversa Externa.

Impacto:

Quebra a regra central do MVP: deve existir no maximo um Atendimento aberto por `externalConversationId`.

Correcao esperada:

- Proteger a invariavel no banco e/ou em transacao segura.
- Em PostgreSQL, considerar indice unico parcial para Atendimentos abertos por `externalConversationId`.
- O service deve tratar conflito de concorrencia e retornar/reaproveitar o Atendimento aberto existente.
- Adicionar teste concorrente para duas chamadas simultaneas ao mesmo `externalConversationId`.

### 2. Alta - Regra de um Chamado nao cancelado por Atendimento nao esta protegida contra corrida

Arquivos:

- `src/cases/cases.service.ts`
- `prisma/schema.prisma`

Problema:

O service verifica se ja existe Chamado nao cancelado antes de criar outro, mas a regra nao parece estar protegida por constraint no banco. Duas chamadas concorrentes podem passar pela verificacao e criar dois Chamados ativos para o mesmo Atendimento.

Impacto:

Quebra a regra do MVP: um Atendimento pode ter no maximo um Chamado nao cancelado.

Correcao esperada:

- Adicionar protecao no banco para impedir mais de um Chamado nao cancelado por Atendimento.
- Em PostgreSQL, considerar indice unico parcial por `attendanceId` quando `status <> 'cancelled'`.
- Tratar erro de constraint retornando `409 Conflict`.
- Adicionar teste concorrente para criacao duplicada de Chamado.

### 3. Alta/Media - `GET /sac-attendances` usa `offset`, mas a spec pede `page` + `limit`

Arquivos:

- `src/attendances/dto/list-attendances-query.dto.ts`
- `src/attendances/attendances.service.ts`
- `test/e2e/attendances.e2e-spec.ts`

Problema:

A spec define paginacao com `page` e `limit`, mas a implementacao usa `offset`. Os testes atuais nao validam o comportamento de `page=2`.

Impacto:

Contrato da API diverge do combinado para n8n/suporte/frontend futuro.

Correcao esperada:

- Trocar `offset` por `page` no DTO e no service.
- Calcular `skip = (page - 1) * limit`.
- Manter `limit=20` como padrao e `limit=100` como maximo.
- Adicionar teste e2e com `page=2&limit=...`.

### 4. Media - Cancelamento de Chamado diverge da spec

Arquivos:

- `src/cases/dto/cancel-case.dto.ts`
- `src/cases/case-transition.service.ts`

Problema:

A implementacao aceita uma flag nao prevista na spec, `cancelAttendanceIfNoUsefulDemand`, e nao aceita/persiste `lastSummary` do cancelamento. A spec previa payload com `caseCancellationReason`, `lastSummary` opcional e `returnAttendanceToCollectingData`.

Impacto:

O contrato do endpoint fica diferente do combinado e o contexto de correcao operacional pode ser perdido.

Correcao esperada:

- Alinhar DTO com a spec.
- Usar `returnAttendanceToCollectingData` como flag de retorno para `collecting_data`.
- Aceitar `lastSummary` opcional e persistir no Atendimento quando fizer sentido.
- Validar que `returnAttendanceToCollectingData: true` so e permitido para `created_by_mistake` ou `wrong_routing`.
- Quando nao houver demanda util, cancelar tambem o Atendimento com `closedAt` e `cancellationReason` apropriado.
- Ajustar testes e2e para o payload correto.

### 5. Media - Midia idempotente pode falhar em concorrencia

Arquivos:

- `src/media/media.service.ts`
- `prisma/schema.prisma`

Problema:

Existe unique index para `storageProvider + externalMediaId`, mas o service aparentemente usa fluxo read-then-create sem tratar conflito. Em chamadas paralelas, uma delas pode receber erro de unique constraint em vez de retornar a Midia existente.

Impacto:

Quebra idempotencia real do endpoint de midias sob retry/reprocessamento.

Correcao esperada:

- Tratar erro de unique constraint e buscar/retornar o registro existente.
- Ou usar upsert seguro, se adequado ao modelo.
- Adicionar teste concorrente ou teste que simule conflito de unique constraint.

### 6. Media - Suites e2e de `cases` e `reads` nao isolam banco entre testes

Arquivos:

- `test/e2e/cases.e2e-spec.ts`
- `test/e2e/reads.e2e-spec.ts`
- `test/helpers/database.ts`

Problema:

As suites `cases` e `reads` usam o banco compartilhado `siac_new_test`, mas nao fazem reset consistente entre testes. Outras suites ja usam `resetDatabase(...)`.

Impacto:

Os testes ficam dependentes de ordem/estado. Isso explica `npm run test:e2e` falhar em paralelo e passar com `--runInBand`.

Correcao esperada:

- Usar `resetDatabase(...)` em `beforeEach` ou isolar os dados de cada teste.
- Se a suite continuar compartilhando estado por design, documentar e rodar e2e com `--runInBand`; ainda assim, preferir isolamento.
- Ajustar script `test:e2e` se a decisao for serializar.

### 7. Baixa/Media - Shape de `replacedBy` diverge da spec

Arquivos:

- `src/cases/cases.service.ts`
- `test/e2e/reads.e2e-spec.ts`

Problema:

A spec pede:

```json
{
  "replacedBy": {
    "caseId": "...",
    "protocol": "...",
    "status": "..."
  }
}
```

A implementacao retorna `id` em vez de `caseId`, e o teste atual codifica esse shape incorreto.

Impacto:

Contrato de leitura por protocolo antigo fica diferente do aprovado.

Correcao esperada:

- Alterar response para `replacedBy.caseId`.
- Ajustar teste e2e para exigir `caseId`.

### 8. Media - Logging nao registra requests que terminam em erro

Arquivo:

- `src/common/logging/request-logging.interceptor.ts`

Problema:

O interceptor loga apenas no caminho de sucesso. Requests que terminam em exception, como 401, 400 e 500, nao geram log estruturado.

Impacto:

Enfraquece o requisito de log tecnico com request id, endpoint, status, duracao e origem.

Correcao esperada:

- Usar `tap` + `catchError` ou `finalize` para registrar sucesso e erro.
- Garantir que o status final ou erro seja refletido no log.
- Adicionar teste unitario simples do interceptor, se viavel.

### 9. Media - Cobertura incompleta para validadores de conjuntos fechados

Arquivos:

- `src/cases/dto/create-case.dto.ts`
- `test/e2e/cases.e2e-spec.ts`

Problema:

A DTO parece validar os conjuntos fechados de `missingRequiredFields` e `riskReasons`, mas os testes nao enviam valores invalidos para provar isso.

Impacto:

Uma regressao que afrouxe esses validadores poderia passar despercebida.

Correcao esperada:

- Adicionar teste e2e para `missingRequiredFields: ["campoInvalido"]`.
- Adicionar teste e2e para `riskReasons: ["motivoInvalido"]`.
- Esperar HTTP 400 com mensagem clara.

## Ordem Recomendada de Correcao

1. Isolar suites e2e ou serializar oficialmente `test:e2e`.
2. Corrigir paginacao `page` + `limit`.
3. Corrigir shape de `replacedBy.caseId`.
4. Alinhar cancelamento de Chamado com a spec.
5. Corrigir idempotencia concorrente de Atendimento.
6. Corrigir idempotencia concorrente de Chamado.
7. Corrigir idempotencia concorrente de Midia.
8. Ajustar logging para registrar erros.
9. Adicionar testes de conjuntos fechados para `riskReasons` e `missingRequiredFields`.

## Criterio de Aceite Apos Correcao

Rodar e obter sucesso em:

```powershell
npm run build
npx prisma validate
npm test
npm run test:e2e
```

Se a decisao for executar e2e serialmente:

```powershell
npx jest --config jest.e2e.config.ts --runInBand
```

Nesse caso, atualizar `package.json` para deixar o comportamento oficial claro.

