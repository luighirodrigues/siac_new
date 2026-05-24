# SAC Inteligente Peruzzo - Perguntas e Respostas do Alinhamento

Este arquivo registra as perguntas feitas durante o alinhamento do projeto e as respostas/decisoes confirmadas. Ele serve como material de continuidade caso o trabalho seja retomado em outro ambiente.

## Perguntas Respondidas

### 1. Um Atendimento pode gerar quantos Chamados?

**Resposta atualizada:** No MVP, um Atendimento pode ter no maximo um Chamado nao cancelado. Chamados Cancelados por correcao operacional podem permanecer no historico do mesmo Atendimento.

### 2. Se o n8n receber novo evento da mesma conversa DKW, atualiza ou cria Atendimento?

**Resposta confirmada:** Enquanto houver Atendimento nao fechado para a mesma Conversa Externa, o backend deve atualizar/reaproveitar o Atendimento existente. Depois que o Atendimento for fechado, uma nova mensagem/demanda deve criar outro Atendimento.

### 3. Qual termo usar para fim de Chamado: finalizado, resolvido ou fechado?

**Resposta confirmada:** Usar Chamado `resolved` para indicar que a tratativa do SAC foi concluida. O Atendimento depois vai para `pesquisa_satisfacao` e, por fim, `fechado`.

### 4. Chamado resolvido significa que a empresa deu tratativa final, mesmo se o cliente nao ficou satisfeito?

**Resposta confirmada:** Sim. Resolvido significa que nao ha mais acao pendente para o SAC naquele Chamado. A satisfacao do cliente e separada.

### 5. Pesquisa de Satisfacao entra no MVP ou so o status?

**Resposta confirmada:** Entra no MVP como recebimento de resposta enviada pelo n8n.

### 6. Quais status finais do Atendimento?

**Resposta confirmada:** Status do Atendimento no MVP:

- `started`
- `collecting_data`
- `waiting_resolution`
- `pesquisa_satisfacao`
- `fechado`
- `cancelled`

`case_registered` foi removido depois, pois o Atendimento vai direto para `waiting_resolution` quando o Chamado e criado.

### 7. Quais status do Chamado?

**Resposta confirmada:** Status do Chamado no MVP:

- `registered`
- `sent_to_dkw`
- `in_resolution`
- `resolved`
- `cancelled`

Quando o atendente finaliza a tratativa e envia o cliente para pesquisa, o Chamado vai para `resolved` e o Atendimento para `pesquisa_satisfacao`.

### 8. A pergunta "o problema foi resolvido?" pertence ao Atendimento ou a Resposta de Satisfacao?

**Resposta confirmada:** Pertence a Resposta de Satisfacao, como percepcao do cliente. Nao altera o status do Chamado.

### 9. Resposta de Satisfacao fica fora do MVP ou o modelo/endpoint ja deve existir?

**Resposta confirmada:** Deve existir endpoint no MVP para o n8n enviar a pesquisa.

### 10. Pode haver mais de uma Resposta de Satisfacao por Atendimento?

**Resposta confirmada:** Nao. Cada Atendimento pode ter no maximo uma Resposta de Satisfacao. Duplicidade deve ser recusada com `409 Conflict`.

### 11. Qual escala da nota de satisfacao?

**Resposta confirmada:** Inteiro de 1 a 5.

### 12. Comentario da pesquisa entra no MVP?

**Resposta confirmada:** O backend deve aceitar `comment` opcional no MVP, mas o n8n inicial nao precisa enviar.

### 13. Ao receber Resposta de Satisfacao, o backend fecha o Atendimento automaticamente?

**Resposta confirmada:** Sim. Receber a Resposta de Satisfacao encerra o ciclo do Atendimento e muda para `fechado`.

### 14. A Resposta de Satisfacao so pode ser recebida em `pesquisa_satisfacao`?

**Resposta confirmada:** Sim. O backend deve recusar se o Atendimento estiver em outro status.

### 15. Qual endpoint e payload para a pesquisa?

**Resposta confirmada:**

```http
POST /sac-attendances/:attendanceId/satisfaction-response
```

Payload:

```json
{
  "problemResolvedByCustomer": true,
  "rating": 5,
  "comment": "Atendimento muito bom"
}
```

`comment` e opcional.

### 16. Quem muda o Chamado para `resolved`?

**Resposta confirmada:** O n8n chama a API para mudar o Chamado para `resolved`. Ao aplicar essa mudanca, o backend move automaticamente o Atendimento vinculado para `pesquisa_satisfacao`.

### 17. Quando o n8n cria o Chamado, o Atendimento vai para qual status?

**Resposta confirmada:** Vai automaticamente para `waiting_resolution`, porque o caso ja entra na fila humana.

### 18. Remover `case_registered` dos status do Atendimento?

**Resposta confirmada:** Sim. A existencia do Chamado e o status `registered` do Chamado ja representam esse fato.

### 19. Quais status aceitam novos eventos da mesma Conversa Externa sem criar outro Atendimento?

**Resposta confirmada:** Atualiza o mesmo Atendimento quando estiver em:

- `started`
- `collecting_data`
- `waiting_resolution`
- `pesquisa_satisfacao`

Cria novo Atendimento quando o anterior estiver em:

- `fechado`
- `cancelled`

### 20. `POST /sac-attendances` deve ser idempotente por `externalConversationId`?

**Resposta confirmada:** Sim. Se ja existir Atendimento nao encerrado para a mesma Conversa Externa, o backend deve retornar o Atendimento existente.

### 21. Reaproveitar Atendimento existente no `POST /sac-attendances` e sucesso normal?

**Resposta confirmada:** Sim. Criacao nova retorna `201 Created` com `reused: false`; reaproveitamento retorna `200 OK` com `reused: true`.

### 22. Chamado tambem deve ter idempotencia?

**Resposta confirmada:** Sim, de forma rigida. `POST /sac-cases` deve retornar `409 Conflict` se o Atendimento ja possuir Chamado nao cancelado.

### 23. Em quais status o Atendimento pode criar Chamado?

**Resposta confirmada:** Somente em `started` ou `collecting_data`. Depois da criacao do Chamado, o backend move o Atendimento para `waiting_resolution`.

### 24. Atendimento cancelado precisa de motivo?

**Resposta confirmada:** Sim. Deve existir `cancellationReason`, incluindo o motivo `timeout`.

Motivos iniciais:

- `customer_gave_up`
- `operational_duplicate`
- `invalid_message`
- `spam`
- `timeout`
- `other`

### 25. Quem decide timeout?

**Resposta corrigida e confirmada:** A DKW detecta quando o cliente fica mais de 24 horas sem responder e chama um webhook no n8n. O n8n traduz isso para o backend.

### 26. Timeout de 24h vira `cancelled` ou `fechado`?

**Resposta confirmada:** Em `started` ou `collecting_data`, timeout vira `cancelled` com `cancellationReason: "timeout"`.

### 27. Timeout pode cancelar em qualquer etapa?

**Resposta confirmada:** Nao. Timeout nao pode cancelar Atendimento em `waiting_resolution`, porque o atendente pode ter orientado o cliente a aguardar retorno em outro dia.

Em `pesquisa_satisfacao`, ausencia de resposta nao vira cancelamento; vira fechamento sem satisfacao coletada.

### 28. Como tratar timeout em `pesquisa_satisfacao`?

**Resposta confirmada:** Fechar o Atendimento com `closedWithoutSatisfaction: true`, nao cancelar.

### 29. Como o n8n pede fechamento sem satisfacao?

**Resposta confirmada:**

```http
PATCH /sac-attendances/:id
```

```json
{
  "status": "fechado",
  "closedWithoutSatisfaction": true
}
```

O backend so deve aceitar `closedWithoutSatisfaction: true` quando o Atendimento estiver em `pesquisa_satisfacao`.

### 30. As 12 categorias do PRD continuam exatamente as mesmas?

**Resposta confirmada:** Sim, sem categoria livre e sem `OUTROS`.

Categorias:

- `DENUNCIA`
- `MAU_ATENDIMENTO`
- `ESTRUTURA_OPERACAO`
- `PRODUTO_ESTRAGADO`
- `PRODUTO_AVARIA`
- `PRODUTO_EM_FALTA`
- `RH`
- `DP`
- `CURRICULO`
- `FORNECEDOR`
- `PRECO_PRODUTO`
- `INFORMACAO_LOJA`

### 31. Se a IA nao conseguir classificar com confianca, o que fazer?

**Resposta confirmada:** O n8n deve escolher a categoria mais provavel dentro das 12, criar Chamado com `needsHumanReview: true` e seguir o fluxo. Nao existe `OUTROS`.

### 32. Deve haver endpoint para corrigir categoria do Chamado depois?

**Resposta final confirmada:** Nao no MVP. A correcao de categoria fica como necessidade futura.

### 33. Quem chamaria o endpoint de correcao?

**Resposta final confirmada:** O endpoint nao estara disponivel no MVP.

### 34. `needsHumanReview: true` pode permanecer ate o fim no MVP?

**Resposta confirmada:** Sim. Ele nao bloqueia o fluxo e serve como marcador de baixa confianca para analise futura.

### 35. Para `DENUNCIA`, nome e CPF do denunciante sao obrigatorios?

**Resposta confirmada:** Sim. Campos minimos:

- nome do denunciante
- CPF do denunciante
- descricao
- loja ou local relacionado

Campos opcionais:

- data/horario
- nome do envolvido
- funcao do envolvido
- descricao fisica
- anexos

### 36. Se o cliente recusar CPF em denuncia, cria Chamado?

**Resposta confirmada:** Sim, depois de reforcar que a denuncia nao e anonima. Criar Chamado `DENUNCIA` com `needsHumanReview: true` e `missingRequiredFields: ["cpfDenunciante"]`.

### 37. `missingRequiredFields` deve ser geral para qualquer categoria?

**Resposta confirmada:** Sim. Lista de strings no Chamado para indicar campos minimos nao obtidos.

### 38. Campos minimos para categorias de produto e imagem obrigatoria?

**Resposta confirmada:**

`PRODUTO_ESTRAGADO`:

- loja
- produto
- data da compra ou ocorrencia
- descricao do problema
- imagem do produto

`PRODUTO_AVARIA`:

- loja
- produto
- data da compra ou ocorrencia
- descricao da avaria
- imagem do produto

Se imagem faltar em `PRODUTO_ESTRAGADO` ou `PRODUTO_AVARIA`, criar Chamado mesmo assim com `missingRequiredFields: ["productImage"]`.

`PRODUTO_EM_FALTA`:

- loja
- produto procurado
- data da visita ou tentativa

`PRECO_PRODUTO`:

- loja
- produto
- preco informado ou divergencia percebida
- data da ocorrencia

Imagem e opcional para `PRODUTO_EM_FALTA` e `PRECO_PRODUTO`.

### 39. Cupom fiscal e obrigatorio para produto estragado ou avariado?

**Resposta confirmada:** Nao. Cupom fiscal e opcional no MVP.

### 40. Campos minimos para `MAU_ATENDIMENTO`?

**Resposta confirmada:**

Minimos:

- loja
- data aproximada
- descricao do ocorrido

Opcionais:

- horario aproximado
- setor ou local do atendimento
- nome do funcionario

### 41. O que e `ESTRUTURA_OPERACAO` e quais campos minimos?

**Resposta confirmada:** Categoria para problemas de estrutura fisica ou funcionamento operacional da loja, como limpeza, filas, carrinhos, estacionamento, banheiros, climatizacao, organizacao, iluminacao, seguranca, equipamentos ou fluxo operacional.

Campos minimos:

- loja
- area ou local afetado
- descricao do problema
- data ou momento aproximado

### 42. `RH`, `DP` e `CURRICULO` criam Chamado?

**Resposta confirmada:** Nao. Sao orientacoes sem Chamado no fluxo normal. Apenas o Atendimento e registrado.

### 43. Depois de orientar em `RH`, `DP` ou `CURRICULO`, qual status do Atendimento?

**Resposta confirmada:** `fechado`, sem pesquisa de satisfacao. Registrar `detectedCategory` e `lastSummary`.

### 44. `FORNECEDOR` cria Chamado?

**Resposta confirmada:** Nao. Tambem e orientacao sem Chamado no fluxo normal.

### 45. `INFORMACAO_LOJA` cria Chamado?

**Resposta confirmada:** Nao, quando for duvida informativa e a IA conseguir responder com base validada. Fecha o Atendimento sem pesquisa.

Se a informacao nao estiver validada ou o cliente pedir algo que a IA nao pode responder, encaminha para humano sem criar Chamado automaticamente quando for apenas duvida informativa.

### 46. Quais categorias geram Chamado no fluxo normal?

**Resposta confirmada:**

Geram Chamado:

- `DENUNCIA`
- `MAU_ATENDIMENTO`
- `ESTRUTURA_OPERACAO`
- `PRODUTO_ESTRAGADO`
- `PRODUTO_AVARIA`
- `PRODUTO_EM_FALTA`
- `PRECO_PRODUTO`

Nao geram Chamado no fluxo normal:

- `RH`
- `DP`
- `CURRICULO`
- `FORNECEDOR`
- `INFORMACAO_LOJA`

### 47. Categorias sem Chamado precisam de status intermediario?

**Resposta confirmada:** Nao. O Atendimento vai direto para `fechado` apos orientacao/resposta do n8n, preservando `detectedCategory` e `lastSummary`.

### 48. `POST /sac-cases` deve recusar categorias que nao geram Chamado?

**Resposta confirmada:** Sim. Deve recusar `RH`, `DP`, `CURRICULO`, `FORNECEDOR` e `INFORMACAO_LOJA`.

### 49. Se `INFORMACAO_LOJA` virar reclamacao, muda para `ESTRUTURA_OPERACAO`?

**Resposta confirmada:** Sim. Duvida sobre loja e `INFORMACAO_LOJA`; reclamacao sobre realidade/funcionamento da loja vira `ESTRUTURA_OPERACAO`.

### 50. Risco reputacional pertence a Atendimento ou Chamado?

**Resposta confirmada:** No MVP, `riskFlag` e `riskReasons` pertencem ao Chamado, nao ao Atendimento.

### 51. Categoria informativa/orientativa com risco reputacional deve criar Chamado?

**Resposta confirmada:** Sim. Risco reputacional transforma o fluxo em caso tratavel pelo SAC. Deve criar Chamado com `riskFlag: true`, usando a categoria tratavel mais proxima da causa real.

### 52. Qual a regra de vinculo de midias?

**Pergunta feita:** No PRD, midia pode estar vinculada a Atendimento e/ou Chamado. Qual regra usar?

**Resposta confirmada:**

- Antes de existir Chamado, midia fica vinculada ao Atendimento.
- Depois que o Chamado for criado, novas midias ficam vinculadas ao Chamado e tambem devem manter `attendanceId` para rastreabilidade.
- O endpoint de consulta por Atendimento deve retornar todas as midias do ciclo, inclusive as vinculadas ao Chamado.

### 53. Imagem obrigatoria enviada antes do Chamado conta como `productImage`?

**Pergunta feita:** Se uma imagem obrigatoria de produto for enviada antes da criacao do Chamado, ela deve contar como `productImage` valida quando o Chamado for criado, mesmo estando vinculada inicialmente ao Atendimento?

**Resposta confirmada:** Sim. A regra de validacao deve considerar todas as midias do ciclo do Atendimento. Se o cliente enviou a imagem durante a coleta de dados, o Chamado de `PRODUTO_ESTRAGADO` ou `PRODUTO_AVARIA` nao deve marcar `missingRequiredFields: ["productImage"]`.

### 54. Midias precisam de finalidade no MVP?

**Pergunta feita:** Se o cliente enviar varias midias no mesmo Atendimento, precisamos classificar o papel de cada uma, por exemplo `productImage`, `receiptImage`, `storePhoto`, `other`, ou basta guardar todas como midias genericas?

**Resposta confirmada:** No MVP, guardar midia generica com metadados basicos, mas permitir um campo opcional de finalidade, como `purpose`. Para validacao, basta existir pelo menos uma midia com `purpose: "productImage"` ou, se o n8n ainda nao enviar `purpose`, pelo menos uma imagem no ciclo para satisfazer `productImage`.

### 55. Midia deve ser armazenada internamente no MVP?

**Pergunta feita:** O backend deve baixar/armazenar o arquivo da midia em storage proprio, ou no MVP basta guardar a referencia externa enviada pela DKW/n8n, como URL, ID externo e metadados?

**Resposta confirmada:** No MVP, guardar referencia externa e metadados, mas modelar a midia como registro independente da forma de armazenamento. O registro deve estar preparado para migracao futura para storage interno, com campos como `externalMediaId`, `sourceUrl`, `storageProvider`, `storageStatus`, `internalObjectKey`, `mimeType`, `size`, `purpose`, `attendanceId` e `caseId` opcional.

O resto do sistema nao deve depender diretamente da URL da DKW. Deve pedir a midia ao backend, que decide se entrega referencia externa, URL assinada interna ou outro formato quando houver armazenamento proprio.

### 56. URL externa expirada invalida o Chamado?

**Pergunta feita:** Se a URL externa da midia expirar ou ficar inacessivel, o Chamado deve continuar valido mesmo assim?

**Resposta confirmada:** Sim. Midia inacessivel nao deve invalidar retroativamente o Chamado nem recolocar `productImage` em `missingRequiredFields`. O backend deve preservar o fato historico de que a midia foi recebida, via registro da Midia e metadados, e marcar apenas o estado de acesso, por exemplo `storageStatus: "unavailable"` ou outro indicador equivalente de URL externa expirada.

### 57. `externalMediaId` deve ser idempotente?

**Pergunta feita:** O `externalMediaId` enviado pela DKW/n8n deve ser idempotente? Ou seja: se o mesmo evento de midia chegar duas vezes, o backend deve reaproveitar a mesma Midia em vez de criar duplicata?

**Resposta confirmada:** Sim. O backend deve tratar `externalMediaId` junto com a origem da midia como chave idempotente. Se o mesmo arquivo chegar novamente para o mesmo ciclo, deve retornar ou reaproveitar o registro existente, evitando duplicidade em reprocessamentos do n8n ou reenvios de webhook da DKW.

### 58. Midia sem texto pode criar Atendimento?

**Pergunta feita:** Se chegar uma midia sem texto, ela sozinha pode criar um novo Atendimento, ou so deve ser anexada quando ja existir Atendimento aberto para a mesma Conversa Externa?

**Resposta confirmada:** Midia sem texto pode criar um Atendimento apenas se vier com `externalConversationId` e nao houver Atendimento aberto. Esse Atendimento deve ficar em `started` ou `collecting_data`, com `lastSummary` indicando que uma midia foi recebida sem contexto textual. Se ja houver Atendimento aberto, a midia deve entrar no ciclo existente. A midia isolada nao deve forcar criacao de Chamado sem contexto minimo.

### 59. Midia sem texto apos Atendimento encerrado abre novo Atendimento?

**Pergunta feita:** Se a midia sem texto vier depois que o Atendimento anterior ja esta `fechado` ou `cancelled`, ela deve abrir um novo Atendimento mesmo sem contexto?

**Resposta confirmada:** Sim. Deve seguir a regra ja definida para eventos da mesma Conversa Externa apos encerramento. O novo Atendimento nasce sem Chamado, com status `started` ou `collecting_data`, e depende de mensagens futuras para ganhar contexto. Se depois vier texto explicando a midia, esse mesmo Atendimento deve ser atualizado.

### 60. Midia recebida em `pesquisa_satisfacao` deve ser anexada?

**Pergunta feita:** Se chegar uma midia depois que o Atendimento esta em `pesquisa_satisfacao`, ela deve ser tratada como parte da pesquisa, anexada ao ciclo anterior, ou como comeco de nova demanda?

**Resposta confirmada:** A midia deve ser ignorada para fins de anexo ao Atendimento ou Chamado. Em `pesquisa_satisfacao`, a tratativa humana ja terminou e nao faz sentido anexar nova imagem ao ciclo. O n8n deve responder solicitando novamente que o cliente envie uma nota/resposta valida para a pesquisa de satisfacao.

### 61. Texto invalido em `pesquisa_satisfacao` altera o ciclo?

**Pergunta feita:** Se o cliente em `pesquisa_satisfacao` mandar texto que nao e nota nem resposta valida, por exemplo "quero mandar uma foto" ou "nao entendi", o backend deve registrar isso em algum lugar ou o n8n so responde pedindo a nota novamente?

**Resposta confirmada:** O n8n deve responder pedindo uma resposta valida, e o backend nao deve criar Resposta de Satisfacao nem mudar status. Se houver necessidade de rastreabilidade minima, pode atualizar `lastSummary` ou registrar evento bruto da conversa fora do modelo principal, sem afetar Atendimento, Chamado ou Midia.

### 62. Pesquisa de Satisfacao sera coletada em um ou dois momentos?

**Pergunta feita:** Na Pesquisa de Satisfacao, se o cliente enviar so a nota, por exemplo "5", mas nao responder explicitamente se o problema foi resolvido na percepcao dele, o n8n pode inferir `problemResolvedByCustomer` ou deve pedir complemento?

**Resposta corrigida e confirmada:** A Pesquisa de Satisfacao sera coletada em dois momentos. Primeiro o n8n pergunta e coleta a nota. Logo depois, pergunta se o problema foi resolvido na percepcao do cliente. O backend deve receber a Resposta de Satisfacao completa apenas quando o n8n tiver a nota e a resposta sobre resolucao do problema.

### 63. Backend precisa guardar rascunho parcial da Pesquisa de Satisfacao?

**Pergunta feita:** Entre o cliente responder a nota e responder se o problema foi resolvido, o backend precisa guardar algum rascunho parcial da pesquisa?

**Resposta confirmada:** Nao no MVP. O estado parcial da Pesquisa de Satisfacao fica no n8n. Para o backend, o Atendimento continua em `pesquisa_satisfacao` ate chegar o payload completo no endpoint `POST /sac-attendances/:attendanceId/satisfaction-response`.

### 64. Timeout apos nota parcial da Pesquisa de Satisfacao fecha como sem satisfacao?

**Pergunta feita:** Se o cliente responde a nota, mas nunca responde se o problema foi resolvido, como o timeout da Pesquisa de Satisfacao deve fechar o Atendimento?

**Resposta confirmada:** Se o n8n nao conseguiu montar a Resposta de Satisfacao completa, o backend deve fechar como `closedWithoutSatisfaction: true`, mesmo que uma nota parcial tenha sido coletada no n8n. Para o backend, satisfacao so existe quando ha payload completo.

### 65. Qual timeout da Pesquisa de Satisfacao?

**Pergunta feita:** Qual deve ser o timeout da Pesquisa de Satisfacao apos o envio da pesquisa pelo n8n?

**Resposta confirmada:** Manter o padrao operacional de 24 horas, controlado pela DKW/n8n. Se apos 24 horas o cliente nao completar a pesquisa, o n8n chama o backend para fechar o Atendimento como `fechado` com `closedWithoutSatisfaction: true`.

### 66. Backend deve guardar quando a Pesquisa de Satisfacao foi enviada?

**Pergunta feita:** O backend deve guardar quando a Pesquisa de Satisfacao foi enviada, por exemplo `satisfactionRequestedAt`, ou isso fica so no n8n/DKW?

**Resposta confirmada:** Sim. O backend deve guardar `satisfactionRequestedAt` para auditoria e para explicar fechamentos sem satisfacao. O campo deve ser preenchido quando o Chamado muda para `resolved` e o Atendimento entra em `pesquisa_satisfacao`.

### 67. Backend deve guardar quando a Pesquisa de Satisfacao foi respondida?

**Pergunta feita:** Quando a Resposta de Satisfacao completa chega, o backend tambem deve guardar `satisfactionRespondedAt`?

**Resposta confirmada:** Sim. O backend deve preencher `satisfactionRespondedAt` no Atendimento ao criar a Resposta de Satisfacao e fechar o ciclo. Isso permite medir o tempo de resposta da pesquisa e diferenciar pesquisa enviada de pesquisa respondida.

### 68. Fechamento sem satisfacao precisa de timestamp especifico?

**Pergunta feita:** Se o Atendimento for fechado sem satisfacao por timeout, devemos guardar tambem quando isso aconteceu, por exemplo `satisfactionClosedWithoutResponseAt`, ou basta `closedAt` + `closedWithoutSatisfaction: true`?

**Resposta confirmada:** Basta `closedAt` + `closedWithoutSatisfaction: true`. Com `satisfactionRequestedAt`, `closedAt` e o booleano ja e possivel medir tempo e entender o motivo sem criar campo redundante.

### 69. Atendimento fechado com Resposta de Satisfacao deve ter `closedAt`?

**Pergunta feita:** O Atendimento fechado normalmente com Resposta de Satisfacao tambem deve ter `closedAt` preenchido no mesmo momento?

**Resposta confirmada:** Sim. Todo Atendimento Fechado deve ter `closedAt`, independentemente de fechar com Resposta de Satisfacao, sem satisfacao ou por orientacao sem Chamado. Para fechamento com resposta, `closedAt` pode ser igual a `satisfactionRespondedAt`.

### 70. Atendimento Cancelado deve preencher `closedAt` ou `cancelledAt`?

**Pergunta feita:** Atendimento Cancelado tambem deve preencher `closedAt`, ou precisa de um timestamp separado como `cancelledAt`?

**Resposta confirmada:** Usar `closedAt` tambem para `cancelled`, porque Atendimento Cancelado e um encerramento excepcional do ciclo. O motivo fica em `cancellationReason`. Nao criar `cancelledAt` no MVP para evitar duplicidade.

### 71. Chamado Cancelado deve usar `closedAt` ou timestamps proprios?

**Pergunta feita:** Chamado Cancelado tambem deve usar `closedAt`, ou o Chamado precisa de um campo proprio como `resolvedAt`/`closedAt` separado do Atendimento?

**Resposta confirmada:** O Chamado deve ter timestamps proprios, separados do Atendimento. No MVP, usar `resolvedAt` quando o Chamado vai para `resolved` e `cancelledAt` quando vai para `cancelled`. O `closedAt` fica no Atendimento, porque o ciclo do Atendimento pode continuar em Pesquisa de Satisfacao mesmo depois do Chamado Resolvido.

### 72. Chamado precisa de timestamps para envio e inicio de tratativa?

**Pergunta feita:** Quando o Chamado muda para `sent_to_dkw` ou `in_resolution`, precisamos guardar timestamps proprios como `sentToDkwAt` e `resolutionStartedAt`?

**Resposta confirmada:** Guardar `sentToDkwAt`, porque ajuda auditoria de encaminhamento. Nao guardar `resolutionStartedAt` no MVP, pois nao ha como informar com confianca quando a tratativa humana comecou. O status `in_resolution` pode existir sem timestamp especifico de inicio.

### 73. Status `in_resolution` ainda e necessario no MVP?

**Pergunta feita:** O status `in_resolution` ainda e necessario no MVP se nao conseguimos saber exatamente quando a tratativa humana comecou?

**Resposta confirmada:** Sim. Manter `in_resolution` como status operacional informado pelo n8n/DKW quando souber que o caso esta em tratativa, mesmo sem timestamp. Ele diferencia `sent_to_dkw` de um caso ja assumido ou em trabalho, mas nao e obrigatorio para chegar em `resolved`; um Chamado pode ir de `sent_to_dkw` direto para `resolved` se esse for o fluxo real recebido.

### 74. `POST /sac-cases` pode criar Chamado ja enviado para DKW?

**Pergunta feita:** Quando o Chamado e criado, ele ja nasce como `registered` e depois o n8n chama outro endpoint para marcar `sent_to_dkw`, ou o `POST /sac-cases` ja pode criar e marcar como enviado no mesmo passo?

**Resposta confirmada:** Permitir os dois. Por padrao, `POST /sac-cases` cria o Chamado como `registered`. Se o n8n ja encaminhou para DKW no mesmo fluxo, pode enviar um campo como `markAsSentToDkw: true`, e o backend cria o Chamado ja como `sent_to_dkw` com `sentToDkwAt`.

### 75. Criar Chamado ja `sent_to_dkw` muda o status do Atendimento?

**Pergunta feita:** Quando `POST /sac-cases` criar o Chamado ja como `sent_to_dkw`, o Atendimento continua indo para `waiting_resolution`, certo?

**Resposta confirmada:** Sim. O Atendimento continua indo para `waiting_resolution`, porque a partir da criacao/envio do Chamado a proxima pendencia e a tratativa humana. `sent_to_dkw` e detalhe do estado do Chamado.

### 76. Marcar `sent_to_dkw` repetidamente deve ser idempotente?

**Pergunta feita:** Se o n8n tentar marcar como `sent_to_dkw` um Chamado que ja esta `sent_to_dkw`, isso deve ser erro ou operacao idempotente?

**Resposta confirmada:** Deve ser operacao idempotente. Retornar sucesso com o Chamado atual e nao alterar `sentToDkwAt`, preservando o primeiro envio. Deve dar erro apenas se o Chamado ja estiver `resolved` ou `cancelled`.

### 77. Marcar `in_resolution` repetidamente deve ser idempotente?

**Pergunta feita:** Marcar `in_resolution` repetidamente tambem deve ser idempotente?

**Resposta confirmada:** Sim. Se o Chamado ja esta `in_resolution`, retornar sucesso sem efeitos extras. Tambem permitir `registered -> in_resolution` e `sent_to_dkw -> in_resolution`, porque o evento de assumido pode chegar sem o evento explicito de envio. Bloquear se o Chamado ja estiver `resolved` ou `cancelled`.

### 78. Marcar `resolved` repetidamente deve ser idempotente?

**Pergunta feita:** Marcar `resolved` repetidamente deve ser idempotente tambem?

**Resposta confirmada:** Sim, com cuidado. Se o Chamado ja esta `resolved`, retornar sucesso sem recriar pesquisa nem alterar `resolvedAt` ou `satisfactionRequestedAt`. Se ainda nao houve transicao do Atendimento para `pesquisa_satisfacao` por falha anterior, o backend pode reparar a inconsistencia movendo o Atendimento para `pesquisa_satisfacao` e preenchendo `satisfactionRequestedAt` se ainda estiver ausente. Bloquear se o Chamado estiver `cancelled`.

### 79. Quando Chamado Cancelado deve ser permitido?

**Pergunta feita:** Chamado Cancelado deve ser permitido em quais situacoes no MVP?

**Resposta confirmada:** Permitir cancelar Chamado apenas antes de `resolved`, por motivo operacional como duplicidade, criacao indevida ou erro de encaminhamento. Se o Atendimento nao tiver outro caminho util apos o cancelamento do Chamado, o backend deve cancelar o Atendimento junto, usando `cancellationReason: "operational_duplicate"` ou `"other"` conforme o caso. Chamado Cancelado e Atendimento Cancelado continuam sendo conceitos distintos.

### 80. Quais motivos de cancelamento do Chamado existem no MVP?

**Pergunta feita:** Quais motivos especificos de cancelamento do Chamado vamos aceitar no MVP? Se o Atendimento der timeout, o que deve acontecer com o Chamado?

**Resposta confirmada:** Usar um campo separado do `cancellationReason` do Atendimento, por exemplo `caseCancellationReason`, com conjunto fechado inicial: `operational_duplicate`, `created_by_mistake`, `wrong_routing` e `other`.

Timeout pertence ao ciclo do Atendimento/cliente e nunca deve cancelar Chamado. Se o timeout ocorrer antes de criar Chamado, cancela apenas o Atendimento. Em `waiting_resolution`, timeout nao cancela Atendimento nem Chamado. Em `pesquisa_satisfacao`, timeout fecha o Atendimento com `closedWithoutSatisfaction: true` e o Chamado permanece `resolved`.

### 81. Chamado cancelado pode permitir novo Chamado no mesmo Atendimento?

**Pergunta feita:** Se o Chamado for cancelado por `created_by_mistake` ou `wrong_routing`, o Atendimento deve sempre ser cancelado junto, ou pode voltar para `collecting_data` para o n8n criar um Chamado correto depois?

**Resposta confirmada:** Permitir voltar para `collecting_data` quando ainda existe uma demanda valida no mesmo Atendimento. Nesse caso, o Chamado cancelado por criacao indevida ou roteamento errado nao conta para o limite de um Chamado do Atendimento, pois foi uma correcao operacional. Se nao houver demanda valida restante, cancelar tambem o Atendimento.

### 82. Atendimento pode ter multiplos Chamados no historico?

**Pergunta feita:** Para essa excecao, o backend deve permitir multiplos Chamados vinculados ao mesmo Atendimento no banco, desde que no maximo um esteja ativo/nao cancelado?

**Resposta confirmada:** Sim. No MVP, um Atendimento pode ter no maximo um Chamado nao cancelado. Chamados Cancelados por correcao operacional podem permanecer no historico do mesmo Atendimento, com `caseCancellationReason`, `cancelledAt` e, quando houver substituicao, `replacedByCaseId`.

### 83. `replacedByCaseId` deve ser obrigatorio?

**Pergunta feita:** Quando um Chamado Cancelado for substituido por outro, o vinculo `replacedByCaseId` deve ser obrigatorio?

**Resposta confirmada:** Obrigatorio apenas quando o cancelamento resultar em novo Chamado no mesmo Atendimento. Se o Chamado for cancelado e o Atendimento tambem for cancelado, `replacedByCaseId` fica nulo.

### 84. Chamado cancelado bloqueia novo `POST /sac-cases`?

**Pergunta feita:** Enquanto existe um Chamado Cancelado sem substituicao e o Atendimento voltou para `collecting_data`, `POST /sac-cases` deve permitir criar o novo Chamado mesmo ja havendo historico de Chamado cancelado?

**Resposta confirmada:** Sim. A checagem de duplicidade do `POST /sac-cases` deve procurar Chamado nao cancelado no Atendimento. Chamados cancelados por correcao operacional nao bloqueiam nova criacao.

### 85. Quem preenche `replacedByCaseId`?

**Pergunta feita:** Se o novo Chamado substitui um cancelado, quem preenche `replacedByCaseId`: o backend automaticamente ao criar o novo Chamado, ou o n8n precisa informar?

**Resposta confirmada:** O backend deve preencher automaticamente quando houver exatamente um Chamado Cancelado sem `replacedByCaseId` no mesmo Atendimento. Se houver mais de um candidato, o n8n deve informar qual esta sendo substituido ou o backend deve recusar por ambiguidade.

### 86. Midias de Chamado Cancelado contam para novo Chamado?

**Pergunta feita:** Quando um Chamado e cancelado e o Atendimento volta para `collecting_data`, as midias que estavam vinculadas ao Chamado Cancelado devem continuar disponiveis para o novo Chamado?

**Resposta confirmada:** Sim, desde que pertencam ao mesmo ciclo do Atendimento. Elas continuam no historico e podem contar para validacao do novo Chamado, porque o cliente ja enviou aquelas evidencias. O novo Chamado nao precisa mover as midias; a consulta e a validacao devem olhar todas as midias do Atendimento, incluindo as vinculadas ao Chamado Cancelado.

### 87. Chamado substituto reaproveita Protocolo antigo?

**Pergunta feita:** Quando o Chamado Cancelado e substituido por um novo Chamado, o Protocolo antigo deve ser preservado no historico, e o novo Chamado deve gerar um novo Protocolo?

**Resposta confirmada:** Sim. Cada Chamado tem seu proprio Protocolo. O Protocolo antigo fica preservado no Chamado Cancelado para auditoria, mas o novo Chamado gera um novo Protocolo. O cliente deve receber e usar apenas o Protocolo do Chamado valido mais recente.

### 88. Cliente deve ser avisado quando Protocolo for substituido?

**Pergunta feita:** Se o cliente ja recebeu o Protocolo do Chamado Cancelado e depois ele foi substituido, o n8n deve avisar o cliente sobre o novo protocolo?

**Resposta confirmada:** Sim, quando o Protocolo antigo ja tiver sido informado ao cliente. A mensagem deve deixar claro que houve correcao operacional e que o Protocolo valido agora e o novo. Se o Protocolo antigo ainda nao foi enviado ao cliente, nao precisa avisar sobre a substituicao.

### 89. Backend precisa saber se o Protocolo foi informado ao cliente?

**Pergunta feita:** O backend precisa saber se o Protocolo ja foi informado ao cliente, por exemplo com `protocolSentToCustomerAt`?

**Resposta confirmada:** Sim. Guardar `protocolSentToCustomerAt` no Chamado, preenchido pelo n8n quando ele enviar o Protocolo ao cliente. Sem esse campo, a regra de aviso sobre substituicao de Protocolo nao pode ser automatizada com seguranca.

### 90. Informar `protocolSentToCustomerAt` deve ser idempotente?

**Pergunta feita:** Quando o n8n informa `protocolSentToCustomerAt`, essa operacao deve ser idempotente?

**Resposta confirmada:** Sim. Se `protocolSentToCustomerAt` ainda estiver vazio, preencher com o horario informado ou com o horario do backend. Se ja estiver preenchido, retornar sucesso sem sobrescrever, preservando o primeiro momento em que o cliente recebeu o Protocolo.

### 91. Quando o Protocolo deve ser gerado?

**Pergunta feita:** O Protocolo deve ser gerado no momento da criacao do Chamado, mesmo que ele ainda esteja apenas `registered`, ou so quando for enviado para DKW/cliente?

**Resposta confirmada:** Gerar no momento da criacao do Chamado. Assim o Chamado ja nasce rastreavel internamente. O envio ao cliente e outro marco, controlado por `protocolSentToCustomerAt`.

### 92. Qual formato do Protocolo no MVP?

**Pergunta feita:** Qual formato o Protocolo deve ter no MVP?

**Resposta confirmada:** Usar formato legivel, unico e ordenavel por data: `SAC-YYYYMMDD-000001`, como `SAC-20260524-000123`. O contador pode ser diario. Internamente, o backend continua usando o UUID/ID do Chamado como chave real; o Protocolo e identificador humano.

### 93. Contador do Protocolo usa qual timezone?

**Pergunta feita:** O contador do Protocolo deve ser diario por data local de Sao Paulo, certo?

**Resposta confirmada:** Sim. Como a operacao e brasileira e o formato carrega data, usar `America/Sao_Paulo` para formar `YYYYMMDD` e reiniciar o contador diario. Isso evita Protocolo com dia incorreto perto da meia-noite em UTC.

### 94. Sequencia diaria do Protocolo precisa ser sem buracos?

**Pergunta feita:** A sequencia diaria do Protocolo precisa ser sem buracos, ou apenas unica e crescente?

**Resposta confirmada:** A sequencia precisa ser apenas unica e crescente. Nao prometer sequencia sem buracos, porque falhas ou transacoes concorrentes podem reservar numero e depois abortar. Para auditoria, unicidade importa mais que continuidade perfeita.

### 95. Protocolo deve ter unicidade global?

**Pergunta feita:** O Protocolo deve ser unico globalmente mesmo com contador diario, certo?

**Resposta confirmada:** Sim. A combinacao `SAC-YYYYMMDD-sequencia` deve ter constraint unica global no banco. Mesmo que a sequencia reinicie por dia, o Protocolo completo nunca pode repetir.

### 96. Prefixo do Protocolo deve carregar informacao da loja?

**Pergunta feita:** O prefixo `SAC` fica fixo ou precisa carregar alguma informacao da loja/unidade?

**Resposta confirmada:** O prefixo `SAC` fica fixo no MVP. Nao colocar loja no Protocolo, porque a loja pode estar incerta durante a coleta ou pode ser corrigida depois. A loja deve ficar como campo do Chamado, nao embutida no identificador humano.

### 97. Como a Loja deve ser identificada?

**Pergunta feita:** A IA precisa identificar a loja pelas informacoes que o cliente passar, comparar com a listagem no banco e assinalar depois no `POST`?

**Resposta confirmada:** Sim. A IA deve tentar identificar a Loja a partir das informacoes fornecidas pelo cliente, comparar com a listagem de lojas cadastradas no banco e enviar a Loja assinalada no `POST` de criacao ou atualizacao aplicavel. Loja nao deve ser tratada como texto livre quando houver correspondencia na listagem validada.

### 98. Chamado pode ser criado sem Loja confiavel?

**Pergunta feita:** Se a IA nao conseguir identificar a Loja com confianca a partir do que o cliente informou, o Chamado deve ser criado mesmo assim?

**Resposta confirmada:** Sim, quando a categoria gera Chamado e a loja e campo minimo. Se houver uma Loja provavel com baixa confianca, enviar `storeId` provavel e `needsHumanReview: true`. Se nao houver correspondencia nenhuma, criar sem `storeId`, com `needsHumanReview: true` e `missingRequiredFields: ["storeId"]` ou equivalente.

### 99. Backend deve guardar mencao original da Loja?

**Pergunta feita:** O backend deve aceitar tambem o texto original usado para inferir a Loja, por exemplo `storeMention`, alem do `storeId`?

**Resposta confirmada:** Sim. Guardar `rawStoreMention` para preservar a fala original do cliente usada na inferencia da Loja. Isso ajuda revisao humana quando a IA nao tem confianca ou quando escolheu uma loja provavel.

### 100. Backend deve guardar confianca da inferencia da Loja?

**Pergunta feita:** O backend deve guardar tambem uma confianca da inferencia de Loja, como `storeConfidence`, ou basta `needsHumanReview`?

**Resposta confirmada:** Nao precisa guardar `storeConfidence` no MVP. A necessidade de revisao deve ser representada por `needsHumanReview`, e `rawStoreMention` preserva contexto suficiente para revisao humana.

### 101. Loja pertence ao Atendimento ou ao Chamado?

**Pergunta feita:** A Loja deve pertencer ao Atendimento, ao Chamado, ou aos dois?

**Resposta confirmada:** No MVP, `storeId` e `rawStoreMention` devem ficar somente no Chamado. O Atendimento nao precisa armazenar Loja.

### 102. Fluxo sem Chamado persiste Loja estruturada?

**Pergunta feita:** Em fluxos sem Chamado, como `INFORMACAO_LOJA`, se o cliente perguntar sobre uma loja especifica, o backend deve apenas guardar isso em `lastSummary`, sem `storeId` estruturado?

**Resposta confirmada:** Sim. O n8n pode usar a listagem de lojas para responder, mas como nao ha Chamado, o backend nao precisa persistir `storeId`. Para rastreabilidade minima, `lastSummary` pode registrar que o cliente perguntou sobre determinada loja.

### 103. Como a listagem de Lojas sera gerenciada no MVP?

**Pergunta feita:** A listagem de Lojas deve ser gerenciada pelo backend com endpoint proprio, ou no MVP pode ser uma tabela/semente fixa consultada pelo n8n/backend?

**Resposta confirmada:** No MVP, usar tabela no backend com seed inicial e endpoint de leitura para o n8n consultar lojas ativas. Nao precisa CRUD administrativo agora. Isso fornece uma fonte unica validada sem abrir gestao administrativa antes da hora.

### 104. Quais campos minimos uma Loja precisa ter?

**Pergunta feita:** Quais campos minimos uma Loja precisa ter nessa tabela do backend?

**Resposta confirmada:** A Loja deve ter `id`, `internalStoreCode`, `name`, `city`, `state`, `address`, `active` e aliases para busca, por exemplo `aliases: string[]`. O `internalStoreCode` representa o codigo interno usado pelo Peruzzo para identificar lojas.

### 105. `internalStoreCode` deve ser unico e obrigatorio?

**Pergunta feita:** `internalStoreCode` deve ser unico e obrigatorio para toda Loja ativa?

**Resposta confirmada:** Sim. `internalStoreCode` deve ser obrigatorio e unico globalmente, nao apenas entre Lojas ativas, para evitar reuso acidental de codigo em loja inativa e confusao historica em Chamados antigos.

### 106. n8n deve enviar `storeId` ou `internalStoreCode` no Chamado?

**Pergunta feita:** O n8n deve enviar `storeId` ou pode enviar `internalStoreCode` no `POST /sac-cases`?

**Resposta confirmada:** O n8n deve enviar `storeId`, porque ele tera acesso a listagem de Lojas do backend para identificar qual Loja corresponde ao relato do cliente. O `internalStoreCode` fica no cadastro da Loja, mas nao precisa ser aceito como identificador de vinculo no `POST /sac-cases` no MVP.

### 107. Endpoint de Lojas retorna apenas ativas por padrao?

**Pergunta feita:** O endpoint de listagem de Lojas para o n8n deve retornar apenas lojas ativas por padrao?

**Resposta confirmada:** Sim. `GET /stores` deve retornar apenas Lojas com `active: true` por padrao. Se no futuro for necessario consultar inativas para auditoria ou administracao, isso deve ser feito por filtro explicito. O n8n de classificacao deve trabalhar apenas com Lojas ativas.

### 108. Chamado antigo deve retornar Loja inativa?

**Pergunta feita:** Se um Chamado antigo aponta para uma Loja que depois foi inativada, as consultas do Chamado devem continuar retornando os dados historicos da loja?

**Resposta confirmada:** Sim. O vinculo `storeId` continua valido mesmo se a Loja ficar inativa. Em respostas de Chamado, retornar a Loja vinculada normalmente, possivelmente com `active: false`. A regra de apenas ativas vale para listagem de escolha/classificacao, nao para historico.

### 109. `storeId` inativo pode ser usado em novo Chamado?

**Pergunta feita:** Se o `storeId` enviado no `POST /sac-cases` apontar para uma Loja inativa, o backend deve aceitar ou recusar?

**Resposta confirmada:** Recusar no MVP. O n8n deve classificar usando apenas Lojas ativas. Lojas inativas podem aparecer em historico, mas nao devem ser vinculadas a novos Chamados. Retornar `400 Bad Request` com erro claro de Loja inativa.

### 110. Dados de Loja e aliases vêm do banco?

**Pergunta feita:** `aliases` de Loja devem ser editaveis no seed/codigo por enquanto, ou precisam vir de banco como dado normal?

**Resposta confirmada:** Todos os dados de Loja devem vir do banco, incluindo aliases. O seed inicial das Lojas sera feito a partir de um CSV fornecido para popular a tabela. No MVP, sem CRUD administrativo, atualizacoes podem ser feitas por nova carga/seed/migration conforme necessario.

### 111. Precisamos fechar formato do CSV de Lojas agora?

**Pergunta feita:** Qual formato minimo esse CSV de seed das Lojas deve ter?

**Resposta confirmada:** Nao precisamos nos apegar ao formato do CSV agora; ele sera detalhe de seed/teste posterior. Por enquanto, basta manter no modelo de Loja os campos definidos, especialmente nome, endereco/rua e `internalStoreCode`, junto dos demais campos previstos.

### 112. Inferencia de Loja deve considerar endereco/rua?

**Pergunta feita:** Para identificar a Loja, o n8n deve considerar tambem rua/endereco como sinal forte, alem de nome, cidade e aliases?

**Resposta confirmada:** Sim. A listagem retornada por `GET /stores` deve incluir endereco/rua, e a IA pode usar isso junto de nome, cidade e aliases para comparar com o texto do cliente. O backend valida apenas o `storeId` recebido; a inferencia fica no n8n/IA.

### 113. `GET /stores` precisa de paginacao?

**Pergunta feita:** `GET /stores` precisa retornar paginacao, ou pode retornar todas as lojas ativas de uma vez no MVP?

**Resposta confirmada:** Pode retornar todas as Lojas ativas de uma vez no MVP. A lista completa e mais util para inferencia pelo n8n/IA, e o volume esperado e pequeno. Paginacao ou filtros podem ser adicionados futuramente se necessario.

### 114. `GET /stores` precisa de autenticacao?

**Pergunta feita:** `GET /stores` precisa exigir autenticacao/token para o n8n?

**Resposta confirmada:** Sim. Mesmo sendo uma lista simples, ela expoe dados operacionais internos. No MVP, proteger com o mesmo mecanismo dos webhooks/endpoints do n8n, por exemplo API key ou bearer token de integracao.

### 115. Endpoints do n8n usam token unico ou tokens por escopo?

**Pergunta feita:** Os endpoints chamados pelo n8n devem usar um unico token de integracao no MVP, ou tokens separados por finalidade, tipo `stores-read`, `attendance-write`, `case-write`?

**Resposta confirmada:** No MVP, usar um unico token de integracao do n8n, enviado por header e configuravel por ambiente. Tokens por escopo podem ficar para depois. O fluxo fica concentrado no n8n, que conversa com o backend; futuramente o frontend sera acessivel somente dentro da empresa.

### 116. Token unico protege todos os endpoints de integracao?

**Pergunta feita:** Esse token unico do n8n deve proteger tambem os endpoints de escrita, como criar Atendimento, criar Chamado, atualizar status e enviar Resposta de Satisfacao?

**Resposta confirmada:** Sim. No MVP, todos os endpoints de integracao usados pelo n8n devem exigir o mesmo token. Endpoints publicos sem token nao devem existir nesse backend; a entrada publica e WhatsApp/DKW/n8n, nao a API diretamente.

### 117. Backend precisa de auditoria funcional das chamadas do n8n?

**Pergunta feita:** O backend deve registrar algum log/auditoria minima das chamadas do n8n, por exemplo `integrationSource`, timestamp e endpoint, ou isso fica so nos logs tecnicos?

**Resposta confirmada:** Nao precisa criar modelo de auditoria funcional separado no MVP. Logs tecnicos estruturados bastam, com request id, endpoint, status, duracao e origem `n8n`. Para eventos de dominio importantes, os proprios campos e timestamps definidos ja fornecem auditoria funcional.

### 118. MVP precisa de endpoints de leitura para futuro frontend interno?

**Pergunta feita:** Para o futuro frontend interno, os endpoints de leitura de Atendimentos e Chamados ja precisam existir no MVP, ou agora basta a integracao n8n/backend?

**Resposta confirmada:** Criar pelo menos leituras basicas no MVP: buscar Atendimento por id, listar Atendimentos com filtros simples, buscar Chamado por id e por Protocolo. Mesmo sem frontend pronto, isso ajuda teste, suporte e validacao do fluxo. Nao incluir telas/admin nem filtros avancados agora.

### 119. Endpoints de leitura usam mesmo token no MVP?

**Pergunta feita:** Esses endpoints de leitura tambem devem usar o mesmo token do n8n no MVP, ou ja precisamos separar um token futuro para frontend interno?

**Resposta confirmada:** No MVP, usar o mesmo token de integracao para simplificar, se apenas o n8n/suporte tecnico for usar. Quando o frontend interno existir, criar autenticacao propria de usuario interno. Nao antecipar isso agora.

### 120. Quais filtros entram em `GET /sac-attendances`?

**Pergunta feita:** Quais filtros simples entram em `GET /sac-attendances` no MVP?

**Resposta confirmada:** Incluir filtros `status`, `externalConversationId`, `createdFrom`, `createdTo` e `hasCase`. Busca textual e filtros avancados ficam para depois. Ordenacao padrao: mais recentes primeiro.

### 121. `GET /sac-attendances` deve ser paginado?

**Pergunta feita:** `GET /sac-attendances` deve ser paginado no MVP?

**Resposta confirmada:** Sim. Atendimentos podem crescer rapido. Usar paginacao simples com `page` e `limit` no MVP, com limite maximo para evitar respostas gigantes.

### 122. Qual limite maximo em `GET /sac-attendances`?

**Pergunta feita:** Qual `limit` maximo para `GET /sac-attendances`?

**Resposta confirmada:** Usar `limit=20` como padrao e `limit=100` como maximo. Isso e suficiente para suporte/teste e evita consultas pesadas.

### 123. Detalhe de Atendimento retorna agregado completo?

**Pergunta feita:** `GET /sac-attendances/:id` deve retornar o Chamado, Midias e Resposta de Satisfacao embutidos?

**Resposta confirmada:** Sim. No MVP, retornar o agregado util do ciclo: dados do Atendimento, lista de Chamados vinculados, midias do ciclo e Resposta de Satisfacao se existir. Isso facilita suporte e reduz multiplas chamadas. A listagem deve retornar resumo; o detalhe retorna completo.

### 124. Detalhe de Atendimento inclui Chamados Cancelados?

**Pergunta feita:** A lista de Chamados dentro do detalhe do Atendimento deve incluir tambem Chamados Cancelados?

**Resposta confirmada:** Sim. Como ha historico de Chamados cancelados por correcao operacional, o detalhe do Atendimento deve mostrar todos, incluindo cancelados, ordenados por criacao. O Chamado valido pode ser destacado como o nao cancelado.

### 125. Detalhe de Chamado retorna Atendimento resumido?

**Pergunta feita:** `GET /sac-cases/:id` deve retornar o Atendimento resumido junto?

**Resposta confirmada:** Sim. Retornar dados do Chamado completo e um resumo do Atendimento vinculado, como `attendanceId`, `status`, `externalConversationId`, `createdAt` e `closedAt`. Para ciclo completo, usar `GET /sac-attendances/:id`.

### 126. Busca por Protocolo encontra Chamado Cancelado?

**Pergunta feita:** `GET /sac-cases/by-protocol/:protocol` deve aceitar protocolos de Chamados Cancelados tambem?

**Resposta confirmada:** Sim. Busca por Protocolo deve encontrar qualquer Chamado, inclusive cancelado, porque Protocolo antigo pode ter sido informado ao cliente ou estar em auditoria. A resposta deve deixar claro o `status` e, se houver, `replacedByCaseId` e Protocolo substituto.

### 127. Busca por Protocolo antigo inclui Protocolo substituto?

**Pergunta feita:** Quando um Chamado Cancelado tem `replacedByCaseId`, a resposta da busca por protocolo antigo deve incluir o protocolo do Chamado substituto?

**Resposta confirmada:** Sim. Incluir algo como `replacedBy: { caseId, protocol, status }`, para suporte conseguir orientar o cliente com o Protocolo valido atual sem fazer outra consulta.

### 128. Busca por Protocolo deve normalizar entrada?

**Pergunta feita:** `GET /sac-cases/by-protocol/:protocol` deve tratar protocolo com diferenca de maiusculas/minusculas, espacos ou hifens?

**Resposta confirmada:** Aceitar case-insensitive e remover espacos nas bordas, mas exigir os hifens no MVP. Exemplo: `sac-20260524-000123` funciona. `SAC20260524000123` fica para busca futura mais flexivel.

### 129. MVP precisa de listagem global de Chamados?

**Pergunta feita:** O backend deve expor tambem `GET /sac-cases` com filtros/listagem, ou no MVP basta buscar por id/protocolo e listar pelo Atendimento?

**Resposta confirmada:** No MVP, basta buscar Chamado por id ou Protocolo e acessar Chamados pelo detalhe do Atendimento. Listagem global de Chamados com filtros pode esperar o frontend interno, porque ainda nao ha uso operacional claro.

### 130. Precisa consultar Atendimento por `externalConversationId`?

**Pergunta feita:** Precisamos de endpoint para consultar Atendimento por `externalConversationId`?

**Resposta confirmada:** Sim. Criar endpoint como `GET /sac-attendances/by-external-conversation/:externalConversationId`, retornando o Atendimento aberto mais recente se existir, ou `404` se nao houver Atendimento aberto. Isso ajuda o n8n a depurar e reconciliar estado sem depender apenas do `POST /sac-attendances` idempotente.

### 131. Consulta por `externalConversationId` retorna aberto ou historico?

**Pergunta feita:** Esse endpoint por `externalConversationId` deve retornar so Atendimento aberto, ou permitir buscar historico completo daquela conversa externa?

**Resposta confirmada:** No MVP, por padrao retornar apenas o Atendimento aberto mais recente, porque e o caso que o n8n precisa para decidir continuidade. Historico completo por Conversa Externa pode ser obtido por `GET /sac-attendances?externalConversationId=...`.

### 132. Quais status contam como Atendimento aberto?

**Pergunta feita:** Quais status contam como "Atendimento aberto" nesse endpoint?

**Resposta confirmada:** Os mesmos status ja definidos para reaproveitamento: `started`, `collecting_data`, `waiting_resolution` e `pesquisa_satisfacao`. `fechado` e `cancelled` nao contam como aberto.

### 133. Consulta por `externalConversationId` retorna detalhe completo?

**Pergunta feita:** O endpoint por `externalConversationId` deve retornar o detalhe completo do Atendimento ou so um resumo?

**Resposta confirmada:** Retornar o mesmo detalhe completo de `GET /sac-attendances/:id`, porque o n8n pode precisar saber status, Chamado, midias e satisfacao para decidir o proximo passo. Como retorna no maximo um registro, o peso e aceitavel.

### 134. `POST /sac-attendances` retorna detalhe completo?

**Pergunta feita:** `POST /sac-attendances`, quando reaproveitar atendimento aberto (`reused: true`), deve retornar tambem o detalhe completo ou so o resumo?

**Resposta confirmada:** Retornar o detalhe completo tambem. O n8n acabou de enviar um evento e precisa saber exatamente em que ponto do ciclo esta. Para criacao nova (`201`), retornar o mesmo formato completo, com listas vazias quando aplicavel.

### 135. Reaproveitar Atendimento aberto atualiza dados de acompanhamento?

**Pergunta feita:** Quando `POST /sac-attendances` recebe novo evento para um Atendimento ja aberto, ele deve atualizar `lastSummary`/ultima mensagem, ou so retornar o existente?

**Resposta atualizada:** Deve atualizar dados estruturados relevantes enviados pelo n8n, como `lastSummary` e midia se houver. Idempotencia aqui significa nao criar outro Atendimento, nao ignorar dados importantes do ciclo. Nao salvar ultima mensagem nem `lastMessageAt` no MVP.

### 136. Backend deve guardar ultima mensagem ou `lastMessageAt`?

**Pergunta feita:** O Atendimento deve guardar `lastMessageAt` como horario da mensagem/evento na DKW, ou horario em que o backend recebeu o POST?

**Resposta corrigida e confirmada:** Nao precisamos salvar ultima mensagem nem `lastMessageAt` no MVP. O fluxo da conversa e independente do backend; o backend deve registrar apenas dados uteis e importantes para rastreabilidade estruturada, protocolo e estado do ciclo.

### 137. Atendimento deve manter `lastSummary`?

**Pergunta feita:** Ainda faz sentido manter `lastSummary` no Atendimento, ou o backend deve guardar so status/dados estruturados e deixar qualquer resumo no n8n/DKW?

**Resposta confirmada:** Manter `lastSummary`, porque ele nao e log de conversa; e um resumo operacional do estado do ciclo. Ajuda suporte e leitura sem armazenar mensagem por mensagem. Deve ser opcional e sobrescrito pelo n8n quando houver resumo util.

### 138. Chamado tambem precisa de `lastSummary`?

**Pergunta feita:** `lastSummary` deve ficar so no Atendimento, ou o Chamado tambem precisa de um resumo proprio?

**Resposta confirmada:** No MVP, manter `lastSummary` somente no Atendimento. O Chamado nao precisa de `lastSummary`; se for necessario texto descritivo do caso, usar `description` no Chamado.

### 139. Chamado deve ter `description` obrigatorio?

**Pergunta feita:** O Chamado deve ter `description` obrigatorio para todas as categorias que geram Chamado?

**Resposta confirmada:** Sim. `description` deve ser obrigatorio para categorias que geram Chamado, porque e o relato estruturado minimo que o SAC humano precisa. Ele pode ser gerado/sintetizado pelo n8n a partir da conversa, sem ser texto bruto do cliente.

### 140. Chamado pode ser criado sem `description` util?

**Pergunta feita:** Se o n8n nao conseguir montar uma `description` util, deve criar Chamado mesmo assim com `missingRequiredFields: ["description"]`, ou bloquear criacao?

**Resposta confirmada:** Bloquear criacao se `description` estiver vazia ou inutil. Diferente de CPF, imagem ou loja, sem descricao o SAC humano nao tem caso para tratar. O n8n deve continuar em `collecting_data` pedindo ao cliente uma explicacao minima.

### 141. Backend deve validar tamanho de `description`?

**Pergunta feita:** O backend deve validar tamanho minimo/maximo de `description`?

**Resposta confirmada:** Sim. Usar validacao simples: minimo 10 caracteres apos `trim` para evitar vazio disfarcado, e maximo de 2000 caracteres para evitar transcricao gigante. O n8n deve sintetizar antes de enviar.

### 142. Chamado precisa de `details` estruturado por categoria?

**Pergunta feita:** Alem de `description`, devemos guardar campos especificos por categoria em colunas/JSON, por exemplo produto, data da ocorrencia, area afetada, nome do funcionario?

**Resposta confirmada:** Nao no MVP. Nao criar `details` por categoria. O n8n deve sintetizar os dados relevantes na `description`, mantendo a descricao curta e estruturada. `missingRequiredFields` continua indicando campos minimos que faltaram.

### 143. Campos minimos por categoria orientam o n8n?

**Pergunta feita:** Se nao teremos `details`, os campos minimos por categoria que ja definimos servem como orientacao para o n8n coletar e sintetizar, mas o backend so valida alguns campos estruturados gerais, certo?

**Resposta atualizada:** Sim. O backend valida o contrato estrutural: `category`, `description`, `storeId` quando informado, valores permitidos em `missingRequiredFields`, `needsHumanReview` e vinculos basicos de Midia. Os demais minimos por categoria orientam o n8n e aparecem sintetizados na `description`; o backend nao precisa inferir sozinho todos os campos faltantes por categoria.

### 144. Quem valida e preenche `missingRequiredFields`?

**Pergunta feita:** O backend deve validar automaticamente que `missingRequiredFields` contem `productImage` quando nao houver midia em `PRODUTO_ESTRAGADO` ou `PRODUTO_AVARIA`, ou apenas aceitar o que o n8n mandar?

**Resposta corrigida e confirmada:** O n8n deve validar os campos minimos e tentar coletar o que esta faltando antes de criar o Chamado. Se o cliente informar que nao tem ou nao consegue fornecer um campo solicitado, como imagem do produto, o n8n pode prosseguir e criar o Chamado com o campo em `missingRequiredFields`. O backend valida o contrato estrutural, mas nao precisa inferir sozinho todos os campos faltantes por categoria.

### 145. `description` deve explicar campos em `missingRequiredFields`?

**Pergunta feita:** Quando o n8n cria Chamado com `missingRequiredFields`, ele deve tambem refletir na `description` que o cliente declarou nao ter ou nao conseguir fornecer aquele dado?

**Resposta confirmada:** Sim. A `description` deve explicar quando o cliente declarou nao ter ou nao conseguir fornecer um campo minimo. Isso ajuda o SAC humano a entender que o campo faltante foi tentado, nao simplesmente esquecido pelo fluxo.

### 146. `missingRequiredFields` deve ter conjunto fechado?

**Pergunta feita:** `missingRequiredFields` deve aceitar apenas valores de um conjunto fechado?

**Resposta confirmada:** Sim. Para o MVP, usar conjunto fechado inicial: `cpfDenunciante`, `productImage`, `storeId`, `purchaseOrOccurrenceDate`, `productName`, `affectedArea`, `approximateDate` e `priceInfo`. Mesmo que o backend nao valide todos por categoria, deve validar que os nomes enviados existem no conjunto permitido, evitando strings soltas.

### 147. `missingRequiredFields` precisa de `denuncianteName`?

**Pergunta feita:** Precisamos incluir `denuncianteName` ou equivalente em `missingRequiredFields` para denuncia sem nome?

**Resposta confirmada:** Sim. Como nome do denunciante e minimo para `DENUNCIA`, incluir `denuncianteName` no conjunto fechado. Se o cliente se recusar a informar, o n8n pode seguir com `missingRequiredFields: ["denuncianteName"]`, possivelmente junto com `cpfDenunciante`.

### 148. `description` pode entrar em `missingRequiredFields`?

**Pergunta feita:** Devemos incluir `description` no conjunto permitido de `missingRequiredFields`?

**Resposta confirmada:** Nao. Sem `description` util, o Chamado nao deve ser criado. `description` nao deve ser representavel como campo faltante; ela e pre-condicao dura do `POST /sac-cases`.

### 149. `missingRequiredFields` obriga `needsHumanReview`?

**Pergunta feita:** Se `missingRequiredFields` vier com valores, o backend deve obrigar `needsHumanReview: true`?

**Resposta confirmada:** Sim. Campo minimo faltante significa que o SAC humano precisa olhar com atencao. O backend pode normalizar `needsHumanReview` para `true` quando `missingRequiredFields` nao estiver vazio.

O n8n deve ser responsavel por validar se o cliente nao forneceu o campo porque nao tem ou nao consegue fornecer, como uma foto do produto, ou se o campo esta faltando porque o fluxo ainda nao perguntou. O prompt/agente do n8n deve ser robusto para tentar coletar os campos minimos antes de criar Chamado com `missingRequiredFields`.

### 150. Precisa guardar motivo estruturado para campo faltante?

**Pergunta feita:** Alem de marcar `missingRequiredFields`, precisamos diferenciar o motivo da falta, tipo "cliente recusou", "cliente nao possui", "nao aplicavel", ou basta explicar isso na `description`?

**Resposta confirmada:** No MVP, basta explicar na `description`. Nao criar estrutura extra como `missingRequiredFieldReasons` agora. O n8n deve sintetizar frases como "cliente informou que nao possui imagem" ou "cliente recusou informar CPF".

### 151. `needsHumanReview` tambem representa risco reputacional?

**Pergunta feita:** `needsHumanReview` deve ser usado so para baixa confianca/fields faltantes, ou tambem para risco reputacional?

**Resposta confirmada:** Nao usar automaticamente para risco reputacional. Risco ja tem `riskFlag` e `riskReasons` e o caso vai para SAC humano de qualquer forma. `needsHumanReview` deve indicar que a IA/coleta precisa de conferencia por baixa confianca, categoria duvidosa, Loja provavel ou campo minimo faltante. Risco e outra dimensao.

### 152. `riskReasons` deve ter conjunto fechado?

**Pergunta feita:** `riskReasons` deve ter conjunto fechado ou aceitar texto livre?

**Resposta confirmada:** Usar conjunto fechado no MVP: `social_media`, `lawyer`, `procon`, `press`, `customer_loss_threat`, `public_exposure` e `other`. Se usar `other`, a `description` pode explicar o contexto.

### 153. `riskFlag: true` exige `riskReasons`?

**Pergunta feita:** Se `riskFlag: true`, o backend deve exigir pelo menos um `riskReasons`?

**Resposta confirmada:** Sim. `riskFlag: true` exige pelo menos um item em `riskReasons`. Se `riskFlag: false`, `riskReasons` deve estar vazio ou ausente. O backend pode normalizar vazio para `[]`.

### 154. `riskReasons` preenchido implica `riskFlag: true`?

**Pergunta feita:** Se `riskReasons` vier preenchido mas `riskFlag` vier `false` ou ausente, o backend deve inferir `riskFlag: true` ou recusar?

**Resposta confirmada:** Inferir e normalizar para `riskFlag: true`. Se ha motivo de risco, o flag verdadeiro e consequencia.

### 155. Quais categorias usar quando risco transforma orientacao em Chamado?

**Pergunta feita:** Se uma categoria que normalmente nao gera Chamado vira Chamado por risco reputacional, quais categorias trataveis podem ser usadas como "mais proxima"?

**Resposta confirmada:** Limitar as categorias que ja geram Chamado: `DENUNCIA`, `MAU_ATENDIMENTO`, `ESTRUTURA_OPERACAO`, `PRODUTO_ESTRAGADO`, `PRODUTO_AVARIA`, `PRODUTO_EM_FALTA` e `PRECO_PRODUTO`. O n8n escolhe a causa real mais proxima e marca `riskFlag`. Nunca criar Chamado com `RH`, `DP`, `CURRICULO`, `FORNECEDOR` ou `INFORMACAO_LOJA`, mesmo com risco.

### 156. Duvida de horario com ameaca em rede social vira qual categoria?

**Pergunta feita:** Cliente pergunta sobre horario da loja, a IA responde, mas ele ameaca postar nas redes porque "ninguem atende telefone". Isso vira `INFORMACAO_LOJA` fechado ou Chamado `ESTRUTURA_OPERACAO` com risco?

**Resposta confirmada:** Vira Chamado `ESTRUTURA_OPERACAO` com `riskFlag: true`, porque a causa real virou reclamacao sobre funcionamento/atendimento operacional da loja, nao simples duvida informativa.

### 157. Curriculo com ameaca de exposicao vira Chamado?

**Pergunta feita:** Candidato manda curriculo e ameaca "vou expor a empresa porque nunca me chamam". Isso deve virar Chamado ou continuar como `CURRICULO` sem Chamado?

**Resposta confirmada:** Continuar sem Chamado no MVP, a menos que haja uma reclamacao tratavel concreta alem da frustracao com selecao. `CURRICULO`/RH nao gera Chamado e esse risco nao se conecta bem a uma categoria tratavel do SAC. Registrar em `lastSummary` e orientar o canal correto. Se houver acusacao concreta, como discriminacao ou mau atendimento em loja, pode virar `DENUNCIA` ou `MAU_ATENDIMENTO` com risco.

### 158. Fornecedor com ameaca de Procon vira Chamado?

**Pergunta feita:** Fornecedor ameaca Procon porque nao recebeu pagamento. Isso continua `FORNECEDOR` sem Chamado, ou vira alguma categoria tratavel?

**Resposta confirmada:** Continuar sem Chamado no MVP e orientar canal de fornecedor/financeiro, salvo se houver reclamacao concreta de atendimento/conduta em loja ou denuncia. Risco reputacional so vira Chamado quando existe causa tratavel pelo SAC; nao deve encaixar artificialmente uma demanda de fornecedor em categoria tratavel.

### 159. Risco reputacional so forca Chamado se houver categoria tratavel?

**Pergunta feita:** Entao a regra de risco reputacional deve ser: ele so forca Chamado quando a demanda puder ser mapeada para uma das categorias trataveis do SAC?

**Resposta confirmada:** Sim. `riskFlag` aumenta prioridade/atencao, mas nao muda o escopo do SAC. Se a demanda e de RH, fornecedor ou curriculo sem causa tratavel pelo SAC, o fluxo deve orientar e fechar sem Chamado, registrando `lastSummary`.

### 160. Risco fora do escopo sem Chamado fica estruturado no Atendimento?

**Pergunta feita:** Em fluxos sem Chamado mas com ameaca/risco fora do escopo do SAC, devemos guardar algum campo estruturado de risco no Atendimento, ou so `lastSummary`?

**Resposta confirmada:** Guardar apenas em `lastSummary`. `riskFlag` pertence ao Chamado, nao ao Atendimento. Se nao ha Chamado, nao criar risco estruturado no MVP.

### 161. Fechamento sem Chamado exige `detectedCategory`?

**Pergunta feita:** Quando um fluxo sem Chamado e encerrado, por exemplo `RH`, `DP`, `CURRICULO`, `FORNECEDOR` ou `INFORMACAO_LOJA`, o backend deve exigir `detectedCategory`?

**Resposta confirmada:** Sim. Para fechar sem Chamado, o backend deve receber `detectedCategory` e `lastSummary`. Isso preserva por que o Atendimento foi fechado sem gerar Protocolo.

### 162. `detectedCategory` aceita todas as categorias?

**Pergunta feita:** `detectedCategory` no Atendimento deve aceitar todas as 12 categorias, mesmo que algumas gerem Chamado?

**Resposta confirmada:** Sim. `detectedCategory` representa a classificacao detectada no ciclo do Atendimento e pode aceitar todas as 12 categorias. Para fluxos com Chamado, pode ser igual a categoria do Chamado se o n8n quiser registrar; para fechamento sem Chamado, e obrigatoria. No MVP, exigir apenas no fechamento sem Chamado.

### 163. Fechamento sem Chamado usa `PATCH /sac-attendances/:id`?

**Pergunta feita:** Fechamento sem Chamado deve acontecer via `PATCH /sac-attendances/:id` com `status: "fechado"`, `detectedCategory` e `lastSummary`?

**Resposta confirmada:** Sim. Reusar o endpoint de atualizacao do Atendimento. O backend deve validar que nao existe Chamado nao cancelado e que a categoria e uma das que nao geram Chamado no fluxo normal, salvo se houver fechamento administrativo futuro.

### 164. Quais transicoes `PATCH /sac-attendances/:id` aceita?

**Pergunta feita:** Esse `PATCH /sac-attendances/:id` deve aceitar quais transicoes no MVP?

**Resposta confirmada:** Aceitar poucas transicoes no MVP: cancelar em `started`/`collecting_data`; fechar sem Chamado com categoria orientativa; fechar sem satisfacao quando o Atendimento esta em `pesquisa_satisfacao`. Transicoes causadas por Chamado devem acontecer pelos endpoints do Chamado, nao pelo PATCH do Atendimento.

### 165. Cancelamento de Atendimento exige `cancellationReason`?

**Pergunta feita:** Cancelamento de Atendimento em `started`/`collecting_data` deve exigir `cancellationReason` sempre?

**Resposta confirmada:** Sim. Cancelamento de Atendimento exige `cancellationReason`. Manter conjunto ja definido: `customer_gave_up`, `operational_duplicate`, `invalid_message`, `spam`, `timeout` e `other`. Se for `other`, `lastSummary` deve explicar.

### 166. Encerrar grilling do MVP?

**Pergunta feita:** Estamos prontos para encerrar o grilling do MVP aqui e partir para implementacao/ajuste de codigo depois?

**Resposta confirmada:** Sim. As decisoes centrais do MVP estao fechadas. Antes de implementar, revisar os documentos para detectar contradicoes obvias, especialmente nas partes que evoluiram: limite de Chamados por Atendimento, risco reputacional, `missingRequiredFields` e Loja.

## Perguntas Pendentes

Nenhuma pergunta pendente registrada no momento.

## Arquivos Criados/Atualizados Durante o Alinhamento

- [CONTEXT.md](CONTEXT.md)
- [PROJECT-SCOPE.md](PROJECT-SCOPE.md)
- [GRILL-QA.md](GRILL-QA.md)
