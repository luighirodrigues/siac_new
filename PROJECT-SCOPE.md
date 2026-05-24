# SAC Inteligente Peruzzo - Escopo Consolidado

Este documento registra ajustes de escopo decididos durante o alinhamento do projeto. O PRD original continua sendo a base, e este arquivo complementa os pontos refinados.

## Ajustes Confirmados

### Atendimento, Chamado e Conversa Externa

- Um Atendimento pode existir sem Chamado.
- No MVP, um Atendimento pode ter no maximo um Chamado nao cancelado.
- A Conversa Externa da DKW pode originar mais de um Atendimento ao longo do tempo.
- Enquanto o Atendimento anterior nao estiver fechado, novos eventos da mesma Conversa Externa atualizam o Atendimento existente.
- Depois que o Atendimento for fechado, uma nova demanda deve criar outro Atendimento, mesmo que venha da mesma Conversa Externa.
- Eventos da mesma Conversa Externa atualizam o Atendimento existente quando ele estiver em `started`, `collecting_data`, `waiting_resolution` ou `pesquisa_satisfacao`.
- Eventos da mesma Conversa Externa devem criar novo Atendimento quando o Atendimento anterior estiver em `fechado` ou `cancelled`.
- `POST /sac-attendances` deve ser idempotente por Conversa Externa aberta: se ja existir Atendimento nao encerrado para o mesmo `externalConversationId`, o backend deve retornar o Atendimento existente em vez de criar duplicado.
- Quando `POST /sac-attendances` criar novo Atendimento, deve retornar `201 Created` com `reused: false`.
- Quando `POST /sac-attendances` reaproveitar Atendimento aberto existente, deve retornar `200 OK` com `reused: true`.
- `POST /sac-attendances` deve retornar o detalhe completo do Atendimento tanto na criacao nova quanto no reaproveitamento, com listas vazias quando aplicavel.
- Quando `POST /sac-attendances` reaproveitar Atendimento aberto, pode atualizar campos estruturados enviados pelo n8n, como `lastSummary` e midias se houver. Idempotencia significa nao criar outro Atendimento, nao ignorar dados relevantes do ciclo.
- O backend nao precisa salvar ultima mensagem nem `lastMessageAt` no MVP. O fluxo da conversa e independente do backend; o backend registra apenas dados uteis e importantes para rastreabilidade estruturada, protocolo e estado do ciclo.
- Manter `lastSummary` no Atendimento, porque ele nao e log de conversa; e um resumo operacional do estado do ciclo. Deve ser opcional e sobrescrito pelo n8n quando houver resumo util.
- No MVP, manter `lastSummary` somente no Atendimento. O Chamado nao precisa de `lastSummary`; se for necessario texto descritivo do caso, usar `description` no Chamado.

### Status do Atendimento

Status confirmados para o MVP:

- `started`
- `collecting_data`
- `waiting_resolution`
- `pesquisa_satisfacao`
- `fechado`
- `cancelled`

Atendimentos cancelados devem permitir registrar `cancellationReason`. Motivos previstos inicialmente: `customer_gave_up`, `operational_duplicate`, `invalid_message`, `spam`, `timeout`, `other`.

Cancelamento de Atendimento exige `cancellationReason`. Se for `other`, `lastSummary` deve explicar.

O timeout por inatividade de cliente e detectado pela DKW. Quando o cliente ficar mais de 24 horas sem responder, a DKW deve acionar um webhook no n8n; o n8n entao solicita ao backend o cancelamento do Atendimento com status `cancelled` e motivo `timeout`.

Timeout por inatividade nao deve cancelar Atendimento em `waiting_resolution`, porque nessa etapa o SAC humano pode ter orientado o cliente a aguardar retorno em outro dia. Caso a DKW envie webhook de inatividade enquanto o Atendimento estiver em `waiting_resolution`, o backend deve preservar o Atendimento aberto.

Timeout por inatividade pode cancelar Atendimento em `started` ou `collecting_data`.

Quando o Atendimento estiver em `pesquisa_satisfacao`, ausencia de resposta nao deve virar `cancelled`. O backend deve fechar o Atendimento com `closedWithoutSatisfaction: true`, preservando que o Chamado ja foi resolvido e apenas a pesquisa nao foi respondida.

O timeout da Pesquisa de Satisfacao deve seguir o padrao operacional de 24 horas, controlado pela DKW/n8n. Se apos 24 horas o cliente nao completar a pesquisa, o n8n deve chamar o backend para fechar o Atendimento como `fechado` com `closedWithoutSatisfaction: true`.

O backend deve guardar `satisfactionRequestedAt` no Atendimento para auditoria. Esse campo deve ser preenchido quando o Chamado muda para `resolved` e o Atendimento entra em `pesquisa_satisfacao`.

Quando a Resposta de Satisfacao completa chegar, o backend deve preencher `satisfactionRespondedAt` no Atendimento ao criar a resposta e fechar o ciclo.

Fechamento sem satisfacao nao precisa de timestamp especifico alem de `closedAt`. Para esse caso, bastam `closedAt`, `closedWithoutSatisfaction: true` e `satisfactionRequestedAt`.

Todo Atendimento Fechado deve ter `closedAt`, independentemente de fechar com Resposta de Satisfacao, sem satisfacao ou por orientacao sem Chamado. Para fechamento com Resposta de Satisfacao, `closedAt` pode ser igual a `satisfactionRespondedAt`.

Atendimento Cancelado tambem deve preencher `closedAt`, porque representa encerramento excepcional do ciclo. O motivo do cancelamento fica em `cancellationReason`; nao e necessario criar `cancelledAt` no MVP.

O n8n deve solicitar fechamento sem satisfacao pelo endpoint de atualizacao do Atendimento:

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

### Status do Chamado

Status confirmados para o MVP:

- `registered`
- `sent_to_dkw`
- `in_resolution`
- `resolved`
- `cancelled`

O Chamado deve ter timestamps proprios, separados do Atendimento. No MVP, usar `resolvedAt` quando o Chamado vai para `resolved` e `cancelledAt` quando vai para `cancelled`. O `closedAt` pertence ao Atendimento, porque o ciclo do Atendimento pode continuar em Pesquisa de Satisfacao mesmo depois do Chamado Resolvido.

O Chamado deve guardar `sentToDkwAt` quando mudar para `sent_to_dkw`, para auditoria do encaminhamento. Nao deve haver `resolutionStartedAt` no MVP, pois nao ha fonte confiavel para o momento exato em que a tratativa humana comecou.

Marcar um Chamado como `sent_to_dkw` deve ser idempotente quando ele ja estiver em `sent_to_dkw`: retornar sucesso com o Chamado atual e preservar o `sentToDkwAt` original. A transicao para `sent_to_dkw` deve falhar se o Chamado ja estiver `resolved` ou `cancelled`.

Manter `in_resolution` como status operacional informado pelo n8n/DKW quando souber que o caso esta em tratativa, mesmo sem timestamp especifico. Esse status diferencia `sent_to_dkw` de caso ja assumido ou em trabalho, mas nao e etapa obrigatoria para chegar em `resolved`; um Chamado pode ir de `sent_to_dkw` direto para `resolved` se esse for o fluxo real recebido.

Marcar um Chamado como `in_resolution` deve ser idempotente quando ele ja estiver em `in_resolution`, retornando sucesso sem efeitos extras. Tambem devem ser permitidas as transicoes `registered -> in_resolution` e `sent_to_dkw -> in_resolution`, porque o evento de assumido pode chegar sem o evento explicito de envio. A transicao deve falhar se o Chamado ja estiver `resolved` ou `cancelled`.

Quando o atendente conclui a tratativa e envia o cliente para pesquisa de satisfacao, o Chamado passa para `resolved` e o Atendimento passa para `pesquisa_satisfacao`.

O n8n deve solicitar a mudanca do Chamado para `resolved`. Ao aplicar essa mudanca, o backend deve mover automaticamente o Atendimento vinculado para `pesquisa_satisfacao`.

Marcar um Chamado como `resolved` deve ser idempotente quando ele ja estiver em `resolved`: retornar sucesso sem recriar pesquisa nem alterar `resolvedAt` ou `satisfactionRequestedAt`. Se ainda nao houve transicao do Atendimento para `pesquisa_satisfacao` por falha anterior, o backend pode reparar a inconsistencia movendo o Atendimento para `pesquisa_satisfacao` e preenchendo `satisfactionRequestedAt` se ainda estiver ausente. A transicao deve falhar se o Chamado estiver `cancelled`.

Ao criar um Chamado, o backend deve mover automaticamente o Atendimento para `waiting_resolution`, pois o caso ja entra na fila humana de atendimento.

Por padrao, `POST /sac-cases` cria o Chamado com status `registered`. Se o n8n ja encaminhou o Chamado para a DKW no mesmo fluxo, pode enviar um campo como `markAsSentToDkw: true`, e o backend deve criar o Chamado ja como `sent_to_dkw` preenchendo `sentToDkwAt`.

Mesmo quando `POST /sac-cases` cria o Chamado ja como `sent_to_dkw`, o Atendimento deve ir para `waiting_resolution`, porque a proxima pendencia e a tratativa humana. `sent_to_dkw` e detalhe do estado do Chamado.

`POST /sac-cases` deve recusar duplicidade: se o Atendimento ja possuir Chamado nao cancelado, a API deve retornar `409 Conflict`.

`POST /sac-cases` so pode criar Chamado quando o Atendimento estiver em `started` ou `collecting_data`. Depois da criacao, o backend move o Atendimento para `waiting_resolution`.

Cancelar Chamado deve ser permitido apenas antes de `resolved`, por motivo operacional como duplicidade, criacao indevida ou erro de encaminhamento. Se o Atendimento nao tiver outro caminho util apos o cancelamento do Chamado, o backend deve cancelar o Atendimento junto, usando `cancellationReason: "operational_duplicate"` ou `"other"` conforme o caso. Chamado Cancelado e Atendimento Cancelado continuam sendo conceitos distintos.

O motivo de cancelamento do Chamado deve ficar em campo separado do `cancellationReason` do Atendimento, por exemplo `caseCancellationReason`. Motivos iniciais: `operational_duplicate`, `created_by_mistake`, `wrong_routing` e `other`.

Timeout pertence ao ciclo do Atendimento/cliente e nunca deve cancelar Chamado. Se o timeout ocorrer antes de criar Chamado, cancela apenas o Atendimento. Em `waiting_resolution`, timeout nao cancela Atendimento nem Chamado. Em `pesquisa_satisfacao`, timeout fecha o Atendimento com `closedWithoutSatisfaction: true` e o Chamado permanece `resolved`.

Quando um Chamado for cancelado por `created_by_mistake` ou `wrong_routing` e ainda houver uma demanda valida no mesmo Atendimento, o backend pode mover o Atendimento de volta para `collecting_data` para permitir a criacao de um Chamado correto. Nesse caso, o Chamado cancelado por criacao indevida ou roteamento errado nao conta para o limite de um Chamado do Atendimento, pois foi uma correcao operacional. Se nao houver demanda valida restante, o Atendimento deve ser cancelado junto.

No MVP, um Atendimento pode ter no maximo um Chamado nao cancelado. Chamados Cancelados por correcao operacional podem permanecer no historico do mesmo Atendimento, com `caseCancellationReason`, `cancelledAt` e, quando houver substituicao, `replacedByCaseId`.

`replacedByCaseId` e obrigatorio apenas quando o cancelamento de um Chamado resultar em novo Chamado no mesmo Atendimento. Se o Chamado for cancelado e o Atendimento tambem for cancelado, `replacedByCaseId` fica nulo.

A checagem de duplicidade do `POST /sac-cases` deve procurar apenas Chamado nao cancelado no Atendimento. Chamados cancelados por correcao operacional nao bloqueiam nova criacao.

Quando um novo Chamado substituir um Chamado Cancelado, o backend deve preencher `replacedByCaseId` automaticamente se houver exatamente um Chamado Cancelado sem `replacedByCaseId` no mesmo Atendimento. Se houver mais de um candidato, o n8n deve informar qual esta sendo substituido ou o backend deve recusar por ambiguidade.

Cada Chamado deve ter seu proprio Protocolo. Quando um Chamado Cancelado for substituido por um novo Chamado, o Protocolo antigo fica preservado no Chamado Cancelado para auditoria, mas o novo Chamado gera um novo Protocolo. O cliente deve receber e usar apenas o Protocolo do Chamado valido mais recente.

O Protocolo deve ser gerado no momento da criacao do Chamado, mesmo que o status inicial ainda seja `registered`. O envio ao cliente e um marco separado, controlado por `protocolSentToCustomerAt`.

O formato do Protocolo no MVP deve ser legivel, unico e ordenavel por data: `SAC-YYYYMMDD-000001`, como `SAC-20260524-000123`. O contador pode ser diario. Internamente, o backend continua usando o UUID/ID do Chamado como chave real; o Protocolo e identificador humano.

O contador diario do Protocolo deve usar a data local de `America/Sao_Paulo` para formar `YYYYMMDD` e reiniciar a sequencia diaria.

A sequencia diaria do Protocolo precisa ser unica e crescente, mas nao precisa ser sem buracos. Falhas ou transacoes concorrentes podem reservar numero e depois abortar; para auditoria, unicidade importa mais que continuidade perfeita.

A combinacao completa do Protocolo (`SAC-YYYYMMDD-sequencia`) deve ter constraint unica global no banco. Mesmo que a sequencia reinicie por dia, o Protocolo completo nunca pode repetir.

O prefixo `SAC` deve ficar fixo no MVP. A loja nao deve ser embutida no Protocolo, porque pode estar incerta durante a coleta ou pode ser corrigida depois. A loja deve ficar como campo do Chamado.

Se o Protocolo do Chamado Cancelado ja tiver sido informado ao cliente e o Chamado for substituido, o n8n deve avisar o cliente que houve correcao operacional e que o Protocolo valido agora e o novo. Se o Protocolo antigo ainda nao foi enviado ao cliente, nao e necessario avisar sobre a substituicao.

O Chamado deve guardar `protocolSentToCustomerAt`, preenchido pelo n8n quando ele enviar o Protocolo ao cliente. Esse campo permite decidir com seguranca se o cliente precisa ser avisado sobre substituicao de Protocolo.

Informar `protocolSentToCustomerAt` deve ser uma operacao idempotente. Se o campo ainda estiver vazio, preencher com o horario informado pelo n8n ou com o horario do backend. Se ja estiver preenchido, retornar sucesso sem sobrescrever, preservando o primeiro momento em que o cliente recebeu o Protocolo.

Chamados podem conter `missingRequiredFields`, uma lista de campos minimos que nao foram obtidos antes do encaminhamento humano. Quando vazia ou ausente, considera-se que os minimos esperados foram coletados.

`missingRequiredFields` deve aceitar apenas valores de um conjunto fechado. Conjunto inicial do MVP: `denuncianteName`, `cpfDenunciante`, `productImage`, `storeId`, `purchaseOrOccurrenceDate`, `productName`, `affectedArea`, `approximateDate` e `priceInfo`. Mesmo que o backend nao valide todos por categoria, deve validar que os nomes enviados existem no conjunto permitido, evitando strings soltas.

`description` nao deve entrar em `missingRequiredFields`. Sem `description` util, o Chamado nao deve ser criado; ela e pre-condicao dura do `POST /sac-cases`.

Quando `missingRequiredFields` nao estiver vazio, o backend deve normalizar `needsHumanReview` para `true`, porque campo minimo faltante exige atencao do SAC humano.

O n8n deve validar se o cliente nao forneceu o campo porque nao tem ou nao consegue fornecer, como uma foto do produto, ou se o campo esta faltando porque o fluxo ainda nao perguntou. O prompt/agente do n8n deve ser robusto para tentar coletar os campos minimos antes de criar Chamado com `missingRequiredFields`.

No MVP, nao criar estrutura extra para motivo de campo faltante, como `missingRequiredFieldReasons`. O motivo deve ser explicado na `description`, por exemplo "cliente informou que nao possui imagem" ou "cliente recusou informar CPF".

`description` deve ser obrigatorio para categorias que geram Chamado, porque e o relato estruturado minimo que o SAC humano precisa. Ele pode ser gerado/sintetizado pelo n8n a partir da conversa, sem ser texto bruto do cliente.

Se `description` estiver vazia ou inutil, o backend deve bloquear a criacao do Chamado. Diferente de CPF, imagem ou loja, sem descricao o SAC humano nao tem caso para tratar. O n8n deve manter o Atendimento em `collecting_data` e pedir ao cliente uma explicacao minima.

O backend deve validar `description` com minimo de 10 caracteres apos `trim` e maximo de 2000 caracteres. O n8n deve sintetizar antes de enviar, evitando transcricao gigante.

No MVP, nao criar `details` estruturado por categoria. O n8n deve sintetizar os dados relevantes na `description`, mantendo a descricao curta e estruturada. `missingRequiredFields` continua indicando campos minimos que faltaram.

Os campos minimos por categoria orientam o n8n na coleta e sintese da `description`. O backend valida apenas o contrato estrutural: `category`, `description`, `storeId` quando informado, valores permitidos em `missingRequiredFields`, `needsHumanReview` e vinculos basicos de Midia. O backend nao precisa inferir sozinho todos os campos faltantes por categoria.

O n8n deve validar os campos minimos e tentar coletar o que esta faltando antes de criar o Chamado. Se o cliente informar que nao tem ou nao consegue fornecer um campo solicitado, como imagem do produto, o n8n pode prosseguir e criar o Chamado com o campo em `missingRequiredFields`. O backend valida o contrato estrutural, mas nao precisa inferir sozinho todos os campos faltantes por categoria.

Quando o n8n criar Chamado com `missingRequiredFields`, a `description` deve explicar quando o cliente declarou nao ter ou nao conseguir fornecer um campo minimo. Isso ajuda o SAC humano a entender que o campo faltante foi tentado, nao simplesmente esquecido pelo fluxo.

### Resposta de Satisfacao

A pesquisa de satisfacao entra no MVP como recebimento de resposta enviada pelo n8n.

Endpoint confirmado:

```http
POST /sac-attendances/:attendanceId/satisfaction-response
```

Payload confirmado:

```json
{
  "problemResolvedByCustomer": true,
  "rating": 5,
  "comment": "Atendimento muito bom"
}
```

Regras confirmadas:

- A Resposta de Satisfacao pertence ao Atendimento.
- Cada Atendimento pode ter no maximo uma Resposta de Satisfacao.
- `rating` e obrigatorio e deve ser um numero inteiro de 1 a 5.
- `problemResolvedByCustomer` e obrigatorio.
- `comment` e opcional.
- O n8n nao precisa enviar `comment` no fluxo inicial do MVP.
- A Pesquisa de Satisfacao sera coletada pelo n8n em dois momentos: primeiro a nota, depois a informacao se o problema foi resolvido na percepcao do cliente.
- O backend deve receber a Resposta de Satisfacao completa apenas quando o n8n tiver `rating` e `problemResolvedByCustomer`.
- O backend nao precisa guardar rascunho parcial da Pesquisa de Satisfacao no MVP. O estado parcial entre a nota e a resposta sobre resolucao fica no n8n.
- Se o n8n nao conseguir montar a Resposta de Satisfacao completa antes do timeout da pesquisa, o backend deve fechar o Atendimento como `closedWithoutSatisfaction: true`, mesmo que uma nota parcial tenha sido coletada no n8n.
- A Resposta de Satisfacao so pode ser recebida quando o Atendimento estiver em `pesquisa_satisfacao`.
- Ao receber a Resposta de Satisfacao, o backend fecha automaticamente o Atendimento.
- Se ja existir Resposta de Satisfacao para o Atendimento, o backend deve recusar duplicidade.

### Midias

Antes de existir Chamado, midias enviadas pelo cliente devem ficar vinculadas ao Atendimento.

Depois que o Chamado for criado, novas midias devem ficar vinculadas ao Chamado e tambem manter `attendanceId` para rastreabilidade do ciclo.

O endpoint de consulta por Atendimento deve retornar todas as midias do ciclo, inclusive as vinculadas ao Chamado.

A validacao de campos obrigatorios deve considerar todas as midias do ciclo do Atendimento. Se o cliente enviar imagem de produto durante a coleta de dados, antes da criacao do Chamado, essa midia conta como `productImage` valida para `PRODUTO_ESTRAGADO` e `PRODUTO_AVARIA`.

Se um Chamado for cancelado e o Atendimento voltar para `collecting_data`, as midias vinculadas ao Chamado Cancelado continuam disponiveis dentro do mesmo ciclo do Atendimento e podem contar para validacao de um novo Chamado. O novo Chamado nao precisa mover as midias; a consulta e a validacao devem olhar todas as midias do Atendimento, incluindo as vinculadas ao Chamado Cancelado.

No MVP, midias devem ser armazenadas de forma generica com metadados basicos, mas podem receber um campo opcional `purpose` para indicar finalidade. Finalidades iniciais previstas: `productImage`, `receiptImage`, `storePhoto` e `other`.

Para validacao de `productImage`, o backend deve aceitar uma midia com `purpose: "productImage"` ou, enquanto o n8n ainda nao enviar `purpose`, qualquer imagem existente no ciclo do Atendimento.

No MVP, o backend deve guardar referencia externa e metadados da midia, sem obrigatoriedade de baixar o arquivo para storage proprio.

Mesmo usando referencia externa no MVP, a midia deve ser modelada como registro independente da forma de armazenamento, preparado para migracao futura para storage interno. Campos previstos: `externalMediaId`, `sourceUrl`, `storageProvider`, `storageStatus`, `internalObjectKey`, `mimeType`, `size`, `purpose`, `attendanceId` e `caseId` opcional.

O restante do sistema nao deve depender diretamente da URL da DKW. O acesso a midia deve passar pelo backend, que pode resolver a origem adequada conforme `storageProvider` e `storageStatus`.

Se a URL externa expirar ou ficar inacessivel, o Chamado deve continuar valido. A indisponibilidade futura da midia nao deve recolocar `productImage` em `missingRequiredFields`; o backend deve preservar o fato historico de que a midia foi recebida e atualizar apenas o estado de acesso da Midia, como `storageStatus: "unavailable"` ou indicador equivalente.

O backend deve tratar `externalMediaId` junto com a origem da midia como chave idempotente. Se o mesmo arquivo chegar novamente para o mesmo ciclo, o registro de Midia existente deve ser retornado ou reaproveitado, evitando duplicidade em reprocessamentos do n8n ou reenvios de webhook da DKW.

Midia sem texto pode criar um Atendimento apenas se vier com `externalConversationId` e nao houver Atendimento aberto. Esse Atendimento deve ficar em `started` ou `collecting_data`, com `lastSummary` indicando que uma midia foi recebida sem contexto textual. Se ja houver Atendimento aberto, a midia deve ser anexada ao ciclo existente.

Midia isolada nao deve forcar criacao de Chamado sem contexto minimo.

Se a midia sem texto vier depois que o Atendimento anterior ja esta `fechado` ou `cancelled`, deve seguir a regra de eventos da mesma Conversa Externa apos encerramento e abrir novo Atendimento. Esse novo Atendimento nasce sem Chamado, com status `started` ou `collecting_data`, e pode ser atualizado por mensagens futuras que expliquem a midia.

Quando o Atendimento estiver em `pesquisa_satisfacao`, midias recebidas nao devem ser anexadas ao Atendimento nem ao Chamado. A tratativa humana ja foi encerrada nessa etapa; o n8n deve ignorar a midia como anexo e responder solicitando novamente uma nota/resposta valida para a pesquisa de satisfacao.

Quando o Atendimento estiver em `pesquisa_satisfacao` e o cliente enviar texto que nao representa resposta valida da pesquisa, o n8n deve pedir novamente uma resposta valida. O backend nao deve criar Resposta de Satisfacao nem alterar status. Se houver necessidade de rastreabilidade minima, pode atualizar `lastSummary` ou registrar evento bruto da conversa fora do modelo principal, sem afetar Atendimento, Chamado ou Midia.

### Risco Reputacional

No MVP, `riskFlag` e `riskReasons` pertencem ao Chamado, nao ao Atendimento.

O Chamado deve ser marcado com `riskFlag: true` quando houver mencao a rede social, advogado, Procon, imprensa, ameaca de deixar de ser cliente ou situacao com potencial de exposicao publica.

`riskReasons` deve usar conjunto fechado no MVP: `social_media`, `lawyer`, `procon`, `press`, `customer_loss_threat`, `public_exposure` e `other`. Se usar `other`, a `description` pode explicar o contexto.

`riskFlag: true` exige pelo menos um item em `riskReasons`. Se `riskFlag: false`, `riskReasons` deve estar vazio ou ausente. O backend pode normalizar vazio para `[]`.

Se `riskReasons` vier preenchido mas `riskFlag` vier `false` ou ausente, o backend deve inferir e normalizar para `riskFlag: true`.

`needsHumanReview` nao deve ser usado automaticamente para risco reputacional. Risco ja tem `riskFlag` e `riskReasons`. `needsHumanReview` indica que a IA/coleta precisa de conferencia por baixa confianca, categoria duvidosa, Loja provavel ou campo minimo faltante.

Se uma interacao de categoria normalmente informativa ou de orientacao trouxer risco reputacional, o fluxo deve criar Chamado com `riskFlag: true`, usando a categoria tratavel mais proxima da causa real. Exemplo: uma queixa sobre informacao/funcionamento de loja deve ser classificada como `ESTRUTURA_OPERACAO`.

Quando risco reputacional transformar uma interacao que normalmente seria orientativa/informativa em Chamado, a categoria deve ser uma das categorias trataveis que ja geram Chamado: `DENUNCIA`, `MAU_ATENDIMENTO`, `ESTRUTURA_OPERACAO`, `PRODUTO_ESTRAGADO`, `PRODUTO_AVARIA`, `PRODUTO_EM_FALTA` ou `PRECO_PRODUTO`. Nunca criar Chamado com `RH`, `DP`, `CURRICULO`, `FORNECEDOR` ou `INFORMACAO_LOJA`, mesmo com risco.

Risco reputacional so deve forcar Chamado quando a demanda puder ser mapeada para uma categoria tratavel do SAC. `riskFlag` aumenta prioridade/atencao, mas nao muda o escopo do SAC. Se a demanda e de RH, fornecedor ou curriculo sem causa tratavel pelo SAC, o fluxo deve orientar e fechar sem Chamado, registrando `lastSummary`.

Em fluxos sem Chamado mas com ameaca/risco fora do escopo do SAC, guardar apenas em `lastSummary`. `riskFlag` pertence ao Chamado, nao ao Atendimento. Se nao ha Chamado, nao criar risco estruturado no MVP.

Exemplo: se o cliente pergunta horario da loja, recebe resposta, mas ameaca postar nas redes porque "ninguem atende telefone", isso vira Chamado `ESTRUTURA_OPERACAO` com `riskFlag: true`, pois a causa real passou a ser reclamacao sobre funcionamento/atendimento operacional da loja.

Exemplo: se um candidato manda curriculo e ameaca expor a empresa porque nunca foi chamado, continuar sem Chamado no MVP, a menos que haja reclamacao tratavel concreta alem da frustracao com selecao. Registrar em `lastSummary` e orientar o canal correto. Se houver acusacao concreta, como discriminacao ou mau atendimento em loja, pode virar `DENUNCIA` ou `MAU_ATENDIMENTO` com risco.

Exemplo: se fornecedor ameaca Procon porque nao recebeu pagamento, continuar sem Chamado no MVP e orientar canal de fornecedor/financeiro, salvo se houver reclamacao concreta de atendimento/conduta em loja ou denuncia. Risco reputacional so vira Chamado quando existe causa tratavel pelo SAC; nao deve encaixar artificialmente uma demanda de fornecedor em categoria tratavel.

### Categorias

As categorias do MVP formam um conjunto fechado:

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

Nao havera categoria livre nem categoria `OUTROS` no MVP.

Categorias que geram Chamado no fluxo normal do MVP:

- `DENUNCIA`
- `MAU_ATENDIMENTO`
- `ESTRUTURA_OPERACAO`
- `PRODUTO_ESTRAGADO`
- `PRODUTO_AVARIA`
- `PRODUTO_EM_FALTA`
- `PRECO_PRODUTO`

Categorias que nao geram Chamado no fluxo normal do MVP:

- `RH`
- `DP`
- `CURRICULO`
- `FORNECEDOR`
- `INFORMACAO_LOJA`

Para categorias que nao geram Chamado, o Atendimento deve ir direto para `fechado` apos a orientacao ou resposta do n8n, preservando `detectedCategory` e `lastSummary`.

Para fechar Atendimento sem Chamado, o backend deve exigir `detectedCategory` e `lastSummary`, preservando por que o Atendimento foi fechado sem gerar Protocolo.

`detectedCategory` no Atendimento pode aceitar todas as 12 categorias. Para fluxos com Chamado, pode ser igual a categoria do Chamado se o n8n quiser registrar; para fechamento sem Chamado, e obrigatoria. No MVP, exigir apenas no fechamento sem Chamado.

Fechamento sem Chamado deve usar `PATCH /sac-attendances/:id` com `status: "fechado"`, `detectedCategory` e `lastSummary`. O backend deve validar que nao existe Chamado nao cancelado e que a categoria e uma das que nao geram Chamado no fluxo normal, salvo se houver fechamento administrativo futuro.

No MVP, `PATCH /sac-attendances/:id` deve aceitar poucas transicoes: cancelar em `started`/`collecting_data`; fechar sem Chamado com categoria orientativa; fechar sem satisfacao quando o Atendimento esta em `pesquisa_satisfacao`. Transicoes causadas por Chamado devem acontecer pelos endpoints do Chamado, nao pelo PATCH do Atendimento.

`POST /sac-cases` deve recusar categorias que nao geram Chamado no fluxo normal: `RH`, `DP`, `CURRICULO`, `FORNECEDOR` e `INFORMACAO_LOJA`.

Quando a IA nao conseguir classificar com confianca, o n8n deve escolher a categoria mais provavel dentro das 12 categorias, criar o Chamado com `needsHumanReview: true` e encaminhar para tratativa humana na DKW.

No MVP, nao havera endpoint de atualizacao parcial para corrigir categoria do Chamado. A correcao de categoria fica como necessidade futura.

No MVP, `needsHumanReview: true` nao bloqueia o fluxo do Chamado. Ele pode permanecer verdadeiro ate o fim do ciclo e servira como marcador de baixa confianca para analise futura.

Campos minimos para `DENUNCIA`:

- nome do denunciante
- CPF do denunciante
- descricao
- loja ou local relacionado

Campos opcionais para `DENUNCIA`:

- data/horario
- nome do envolvido
- funcao do envolvido
- descricao fisica
- anexos

Se o cliente se recusar a informar CPF em uma denuncia, o n8n deve reforcar que a denuncia pelo canal nao e anonima. Se ainda assim houver recusa, o n8n deve criar Chamado `DENUNCIA` com `needsHumanReview: true` e `missingRequiredFields: ["cpfDenunciante"]`.

Campos minimos para `PRODUTO_ESTRAGADO`:

- loja
- produto
- data da compra ou ocorrencia
- descricao do problema
- imagem do produto

Campos minimos para `PRODUTO_AVARIA`:

- loja
- produto
- data da compra ou ocorrencia
- descricao da avaria
- imagem do produto

Se o cliente nao enviar imagem em `PRODUTO_ESTRAGADO` ou `PRODUTO_AVARIA`, o n8n deve criar o Chamado mesmo assim com `missingRequiredFields: ["productImage"]`.

Cupom fiscal e opcional para `PRODUTO_ESTRAGADO` e `PRODUTO_AVARIA` no MVP.

Campos minimos para `PRODUTO_EM_FALTA`:

- loja
- produto procurado
- data da visita ou tentativa

Campos minimos para `PRECO_PRODUTO`:

- loja
- produto
- preco informado ou divergencia percebida
- data da ocorrencia

Para `PRODUTO_EM_FALTA` e `PRECO_PRODUTO`, imagem e opcional no MVP.

Campos minimos para `MAU_ATENDIMENTO`:

- loja
- data aproximada
- descricao do ocorrido

Campos opcionais para `MAU_ATENDIMENTO`:

- horario aproximado
- setor ou local do atendimento
- nome do funcionario

`ESTRUTURA_OPERACAO` cobre problemas de estrutura fisica ou funcionamento operacional da loja, como limpeza, filas, carrinhos, estacionamento, banheiros, climatizacao, organizacao, iluminacao, seguranca, equipamentos ou fluxo operacional.

Campos minimos para `ESTRUTURA_OPERACAO`:

- loja
- area ou local afetado
- descricao do problema
- data ou momento aproximado

Categorias `RH`, `DP`, `CURRICULO` e `FORNECEDOR` nao geram Chamado no fluxo normal do MVP, pois representam orientacoes ou direcionamentos sem reclamacao em si. O backend deve manter apenas o Atendimento para rastreabilidade do contato.

Depois da orientacao do n8n em `RH`, `DP`, `CURRICULO` ou `FORNECEDOR`, o Atendimento deve ser fechado sem pesquisa de satisfacao. O Atendimento deve preservar `detectedCategory` e `lastSummary`.

`INFORMACAO_LOJA` nao deve gerar Chamado quando a IA conseguir responder com base validada. O Atendimento deve ser fechado sem pesquisa, preservando `detectedCategory` e `lastSummary`.

Se a informacao de loja nao estiver validada ou o cliente pedir algo que a IA nao pode responder, o fluxo deve encaminhar para humano sem criar Chamado automaticamente quando for apenas duvida informativa.

Se uma interacao inicialmente parecida com `INFORMACAO_LOJA` trouxer reclamacao sobre a realidade ou funcionamento da loja, deve ser classificada como `ESTRUTURA_OPERACAO` e pode gerar Chamado.

### Lojas

A listagem de Lojas deve ficar em tabela no backend com seed inicial no MVP. O backend deve expor endpoint de leitura para o n8n consultar lojas ativas. Nao precisa haver CRUD administrativo de Lojas no MVP.

Todos os dados de Loja devem vir do banco, incluindo aliases. O seed inicial das Lojas sera feito a partir de um CSV fornecido para popular a tabela. No MVP, sem CRUD administrativo, atualizacoes podem ser feitas por nova carga/seed/migration conforme necessario.

O formato exato do CSV de seed das Lojas nao precisa ser fechado agora; ele sera detalhe de teste/carga posterior. Por enquanto, o importante e manter no modelo de Loja os campos definidos, especialmente nome, endereco/rua e `internalStoreCode`, junto dos demais campos previstos.

Para identificar a Loja, o n8n/IA deve considerar nome, cidade, aliases e endereco/rua como sinais de inferencia. A listagem retornada por `GET /stores` deve incluir endereco/rua. O backend valida apenas o `storeId` recebido; a inferencia fica no n8n/IA.

`GET /stores` deve retornar apenas Lojas com `active: true` por padrao. Se no futuro for necessario consultar inativas para auditoria ou administracao, isso deve ser feito por filtro explicito. O n8n de classificacao deve trabalhar apenas com Lojas ativas.

No MVP, `GET /stores` pode retornar todas as Lojas ativas de uma vez, sem paginacao. A lista completa e mais util para inferencia pelo n8n/IA, e o volume esperado e pequeno. Paginacao ou filtros podem ser adicionados futuramente se necessario.

`GET /stores` deve exigir autenticacao/token de integracao. Mesmo sendo uma lista simples, expoe dados operacionais internos. No MVP, proteger com o mesmo mecanismo dos webhooks/endpoints do n8n, por exemplo API key ou bearer token de integracao.

No MVP, os endpoints chamados pelo n8n devem usar um unico token de integracao, enviado por header e configuravel por ambiente. Tokens por escopo podem ficar para depois. O fluxo fica concentrado no n8n, que conversa com o backend; futuramente o frontend sera acessivel somente dentro da empresa.

Todos os endpoints de integracao usados pelo n8n devem exigir o mesmo token no MVP, incluindo criar Atendimento, criar Chamado, atualizar status, listar Lojas e enviar Resposta de Satisfacao. Endpoints publicos sem token nao devem existir nesse backend; a entrada publica e WhatsApp/DKW/n8n, nao a API diretamente.

Nao precisa criar modelo de auditoria funcional separado para chamadas do n8n no MVP. Logs tecnicos estruturados bastam, com request id, endpoint, status, duracao e origem `n8n`. Para eventos de dominio importantes, os proprios campos e timestamps definidos ja fornecem auditoria funcional.

O MVP deve incluir leituras basicas para suporte e validacao: buscar Atendimento por id, listar Atendimentos com filtros simples, buscar Chamado por id e buscar Chamado por Protocolo. Nao incluir telas/admin nem filtros avancados agora.

`GET /sac-cases/:id` deve retornar dados completos do Chamado e um resumo do Atendimento vinculado, como `attendanceId`, `status`, `externalConversationId`, `createdAt` e `closedAt`. Para ciclo completo, usar `GET /sac-attendances/:id`.

`GET /sac-cases/by-protocol/:protocol` deve encontrar qualquer Chamado, inclusive cancelado. A resposta deve deixar claro o `status` e, se houver, `replacedByCaseId` e Protocolo substituto.

Quando um Chamado Cancelado tiver `replacedByCaseId`, a resposta da busca por Protocolo antigo deve incluir o substituto, por exemplo `replacedBy: { caseId, protocol, status }`, para suporte conseguir orientar o cliente com o Protocolo valido atual sem outra consulta.

`GET /sac-cases/by-protocol/:protocol` deve aceitar Protocolo de forma case-insensitive e remover espacos nas bordas, mas exigir os hifens no MVP. Exemplo: `sac-20260524-000123` deve funcionar; `SAC20260524000123` fica para busca futura mais flexivel.

No MVP, nao e necessario expor `GET /sac-cases` com listagem global e filtros. Basta buscar Chamado por id, buscar por Protocolo e acessar Chamados pelo detalhe do Atendimento. Listagem global de Chamados pode esperar o frontend interno.

Criar endpoint como `GET /sac-attendances/by-external-conversation/:externalConversationId`, retornando o Atendimento aberto mais recente se existir, ou `404` se nao houver Atendimento aberto. Isso ajuda o n8n a depurar e reconciliar estado sem depender apenas do `POST /sac-attendances` idempotente.

No MVP, esse endpoint por `externalConversationId` deve retornar apenas o Atendimento aberto mais recente. Historico completo por Conversa Externa pode ser obtido por `GET /sac-attendances?externalConversationId=...`.

Para esse endpoint, contam como Atendimento aberto os mesmos status definidos para reaproveitamento: `started`, `collecting_data`, `waiting_resolution` e `pesquisa_satisfacao`. `fechado` e `cancelled` nao contam como aberto.

Esse endpoint por `externalConversationId` deve retornar o mesmo detalhe completo de `GET /sac-attendances/:id`, porque o n8n pode precisar saber status, Chamado, midias e satisfacao para decidir o proximo passo.

`GET /sac-attendances` deve aceitar filtros simples no MVP: `status`, `externalConversationId`, `createdFrom`, `createdTo` e `hasCase`. Busca textual e filtros avancados ficam para depois. Ordenacao padrao: mais recentes primeiro.

`GET /sac-attendances` deve ser paginado no MVP, usando `page` e `limit`, com limite maximo para evitar respostas gigantes.

Em `GET /sac-attendances`, usar `limit=20` como padrao e `limit=100` como maximo.

`GET /sac-attendances/:id` deve retornar o agregado util do ciclo: dados do Atendimento, lista de Chamados vinculados, midias do ciclo e Resposta de Satisfacao se existir. A listagem retorna resumo; o detalhe retorna completo.

A lista de Chamados no detalhe do Atendimento deve incluir tambem Chamados Cancelados, ordenados por criacao. O Chamado valido pode ser destacado como o nao cancelado.

No MVP, os endpoints de leitura tambem devem usar o mesmo token de integracao, se apenas o n8n/suporte tecnico for usar. Quando o frontend interno existir, criar autenticacao propria de usuario interno.

Se um Chamado antigo apontar para uma Loja que depois foi inativada, o vinculo `storeId` continua valido. Consultas do Chamado devem retornar a Loja vinculada normalmente, possivelmente com `active: false`. A regra de apenas ativas vale para listagem de escolha/classificacao, nao para historico.

Se o `storeId` enviado no `POST /sac-cases` apontar para uma Loja inativa, o backend deve recusar no MVP. Lojas inativas podem aparecer em historico, mas nao devem ser vinculadas a novos Chamados. Retornar `400 Bad Request` com erro claro de Loja inativa.

Campos minimos da Loja no MVP: `id`, `internalStoreCode`, `name`, `city`, `state`, `address`, `active` e aliases para busca, por exemplo `aliases: string[]`. O `internalStoreCode` representa o codigo interno usado pelo Peruzzo para identificar lojas.

`internalStoreCode` deve ser obrigatorio e unico globalmente, nao apenas entre Lojas ativas, para evitar reuso acidental de codigo em loja inativa e confusao historica em Chamados antigos.

A IA deve tentar identificar a loja a partir das informacoes fornecidas pelo cliente, comparar com a listagem de lojas cadastradas no banco e enviar a loja assinalada no `POST` de criacao de Chamado ou atualizacao aplicavel do Chamado.

No `POST /sac-cases`, o n8n deve enviar `storeId` para vincular a Loja ao Chamado. O `internalStoreCode` fica no cadastro da Loja, mas nao precisa ser aceito como identificador de vinculo no `POST /sac-cases` no MVP.

Loja nao deve ser tratada como texto livre quando houver correspondencia na listagem validada.

No MVP, `storeId` e `rawStoreMention` devem ficar somente no Chamado. O Atendimento nao precisa armazenar Loja.

Em fluxos sem Chamado, como `INFORMACAO_LOJA`, o n8n pode usar a listagem de lojas para responder, mas o backend nao precisa persistir `storeId`. Para rastreabilidade minima, `lastSummary` pode registrar que o cliente perguntou sobre determinada loja.

Quando a categoria gerar Chamado e a loja for campo minimo, o Chamado pode ser criado mesmo sem Loja confiavel. Se houver uma loja provavel com baixa confianca, o n8n deve enviar `storeId` provavel e `needsHumanReview: true`. Se nao houver correspondencia nenhuma, deve criar sem `storeId`, com `needsHumanReview: true` e `missingRequiredFields: ["storeId"]` ou equivalente.

O backend deve aceitar `rawStoreMention` para preservar a fala original do cliente usada na inferencia da Loja. Esse campo ajuda revisao humana quando a IA nao tem confianca ou quando escolheu uma loja provavel.

O backend nao precisa guardar `storeConfidence` no MVP. A necessidade de revisao deve ser representada por `needsHumanReview`, e `rawStoreMention` preserva contexto suficiente para revisao humana.
