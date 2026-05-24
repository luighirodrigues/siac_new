# SAC Inteligente Peruzzo

Este contexto define a linguagem do SAC Inteligente Peruzzo. Ele existe para manter claro o limite entre a conversa operacional no WhatsApp/DKW e os registros estruturados usados para rastreabilidade, protocolo e analise futura.

## Language

**Atendimento**:
Registro inicial de uma demanda recebida pelo SAC Inteligente. Um **Atendimento** pode existir sem **Chamado**, mas no MVP pode ter no maximo um **Chamado** nao cancelado; enquanto nao estiver fechado, novos eventos da mesma conversa externa atualizam o mesmo **Atendimento**.
_Avoid_: Conversa, ticket inicial, atendimento DKW

**Chamado**:
Registro estruturado criado quando um **Atendimento** ja tem classificacao e dados suficientes para gerar protocolo. No MVP, cada **Chamado** pertence a exatamente um **Atendimento**, e **Chamados Cancelados** por correcao operacional podem permanecer no historico do mesmo **Atendimento**.
_Avoid_: Ticket, caso, reclamacao

**Chamado Resolvido**:
**Chamado** cuja tratativa pelo SAC foi concluida e nao possui mais acao pendente para a equipe. Resolvido nao significa necessariamente que o cliente ficou satisfeito ou concordou com a solucao.
_Avoid_: Chamado fechado, chamado finalizado

**Chamado Enviado para DKW**:
**Chamado** que ja foi sincronizado ou encaminhado para a DKW para tratativa operacional pelo SAC humano.
_Avoid_: Atendimento enviado, handoff concluido

**Chamado em Resolucao**:
**Chamado** que esta em tratativa pelo SAC humano. Quando o atendente conclui a tratativa e envia o **Atendimento** para **Pesquisa de Satisfacao**, o **Chamado** passa a ser **Chamado Resolvido**.
_Avoid_: Pesquisa de satisfacao, chamado fechado

**Pesquisa de Satisfacao**:
Etapa do **Atendimento** apos a resolucao do **Chamado**, usada para coletar a percepcao do cliente sobre a tratativa. A satisfacao do cliente e separada da resolucao operacional do **Chamado**.
_Avoid_: Resolucao, fechamento

**Resposta de Satisfacao**:
Retorno do cliente durante a **Pesquisa de Satisfacao**, composto pela informacao se o problema foi resolvido na percepcao do cliente, uma nota de 1 a 5 e comentario opcional. A **Resposta de Satisfacao** pertence ao **Atendimento**, nao ao **Chamado**; no MVP, cada **Atendimento** pode ter no maximo uma **Resposta de Satisfacao** e sua chegada encerra o ciclo do **Atendimento**.
_Avoid_: Avaliacao do chamado, nota do chamado

**Midia**:
Arquivo enviado pelo cliente durante o ciclo do **Atendimento**; antes de existir **Chamado**, pertence ao **Atendimento**, e depois da criacao do **Chamado** pertence ao **Chamado** mantendo vinculo ao **Atendimento** para rastreabilidade.
_Avoid_: Anexo solto, arquivo da conversa

**Finalidade da Midia**:
Papel opcional de uma **Midia** no ciclo do **Atendimento**, como imagem de produto, cupom fiscal, foto da loja ou outro anexo.
_Avoid_: Tipo do arquivo, categoria da midia

**Atendimento Fechado**:
**Atendimento** cujo ciclo terminou apos a etapa aplicavel de pesquisa de satisfacao. Uma nova demanda futura deve criar outro **Atendimento**, ainda que venha da mesma **Conversa Externa**.
_Avoid_: Chamado fechado, conversa resolvida

**Atendimento Fechado Sem Satisfacao**:
**Atendimento Fechado** sem **Resposta de Satisfacao**, porque o cliente nao respondeu a pesquisa. Nao e um **Atendimento Cancelado**, pois o **Chamado** ja foi resolvido.
_Avoid_: Cancelado por timeout, pesquisa cancelada

**Atendimento em Coleta de Dados**:
**Atendimento** em que a IA ou o fluxo automatizado ainda esta coletando as informacoes necessarias para classificar e registrar o **Chamado**.
_Avoid_: Atendimento em aberto, triagem

**Atendimento Aguardando Resolucao**:
**Atendimento** que ja possui **Chamado** registrado, mas cuja tratativa ainda depende do SAC humano. Essa etapa pode durar horas ou dias.
_Avoid_: Pesquisa de satisfacao, fechado

**Atendimento Cancelado**:
**Atendimento** encerrado de forma excepcional antes do fechamento normal do ciclo.
_Avoid_: Fechado, resolvido

**Motivo de Cancelamento**:
Explicacao do encerramento excepcional de um **Atendimento Cancelado**, como desistência, duplicidade operacional, mensagem invalida, spam ou timeout.
_Avoid_: Status de cancelamento, observacao solta

**Conversa Externa**:
Conversa mantida fora do backend, na DKW, que representa o historico operacional do contato pelo WhatsApp. Uma **Conversa Externa** pode originar mais de um **Atendimento** ao longo do tempo, desde que a demanda anterior tenha sido encerrada.
_Avoid_: Atendimento, chamado, thread

**Protocolo**:
Identificador unico gerado para um **Chamado** e usado como referencia oficial para o cliente e para busca futura.
_Avoid_: Codigo, numero do atendimento

**Loja**:
Unidade operacional do Peruzzo relacionada ao **Chamado**, identificada a partir das informacoes do cliente e validada contra a listagem de lojas do backend.
_Avoid_: Unidade em texto livre, local informado sem validacao

**Categoria de Atendimento**:
Classificacao aprovada para um **Chamado**. No MVP, a categoria deve pertencer ao conjunto fechado definido para o SAC Inteligente, sem categoria livre e sem categoria "outros".
_Avoid_: Tipo livre, assunto livre, outros

**Revisao Humana de Categoria**:
Indicacao de que a categoria atribuida pela IA ao **Chamado** precisa ser conferida ou corrigida por um atendente. A revisao humana nao cria uma categoria nova; ela apenas sinaliza baixa confianca dentro do conjunto fechado de categorias.
_Avoid_: Outros, sem categoria

**Estrutura/Operacao**:
Categoria para problemas de estrutura fisica ou funcionamento operacional da loja, como limpeza, filas, carrinhos, estacionamento, banheiros, climatizacao, organizacao, iluminacao, seguranca, equipamentos ou fluxo operacional.
_Avoid_: Mau atendimento, informacao da loja

**Informacao da Loja**:
Categoria para duvidas informativas sobre dados validados da loja. Quando o cliente relata uma queixa sobre a realidade ou funcionamento da loja, o caso deve ser tratado como **Estrutura/Operacao**, nao como **Informacao da Loja**.
_Avoid_: Reclamacao de loja, estrutura/operacao

**Orientacao Sem Chamado**:
Atendimento em que o cliente recebe direcionamento, mas nao ha reclamacao ou caso tratavel pelo SAC que justifique **Chamado**. No MVP, RH, DP, Curriculo e Fornecedor seguem esse caminho no fluxo normal.
_Avoid_: Chamado informativo, protocolo de orientacao

## Example Dialogue

Dev: "A cliente mandou uma mensagem pelo WhatsApp. Isso ja e um Chamado?"

Especialista: "Nao. Primeiro criamos um Atendimento para registrar a entrada no SAC Inteligente."

Dev: "Quando vira Chamado?"

Especialista: "Quando o fluxo tiver categoria e dados suficientes para registrar o caso e gerar Protocolo."

Dev: "E se a pessoa falar de dois problemas diferentes?"

Especialista: "No MVP, cada Atendimento pode ter no maximo um Chamado nao cancelado. Um novo problema deve entrar como outro Atendimento."

Dev: "E se a mesma conversa da DKW mandar outro evento?"

Especialista: "Se o Atendimento anterior ainda nao estiver fechado, atualizamos ele. Se a demanda anterior ja foi fechada, criamos outro Atendimento para o novo ciclo."

Dev: "Resolvido quer dizer que o cliente ficou satisfeito?"

Especialista: "Nao. Resolvido quer dizer que a tratativa do Chamado acabou. Depois disso o Atendimento vai para pesquisa de satisfacao e so entao pode ser fechado."

Dev: "A nota da pesquisa pertence ao Chamado?"

Especialista: "Nao. Ela pertence ao Atendimento, porque avalia a experiencia do ciclo de atendimento depois da tratativa."

Dev: "A pergunta 'se o problema foi resolvido' muda o status do Chamado?"

Especialista: "Nao. O status do Chamado representa a tratativa do SAC. A resposta do cliente fica na Resposta de Satisfacao."

Dev: "E se o n8n enviar a pesquisa duas vezes para o mesmo Atendimento?"

Especialista: "No MVP, o Atendimento aceita no maximo uma Resposta de Satisfacao. Uma segunda resposta deve ser tratada como duplicidade."

Dev: "Depois que a pesquisa chega, quem fecha o Atendimento?"

Especialista: "O proprio recebimento da Resposta de Satisfacao encerra o ciclo do Atendimento."

Dev: "Se o SAC precisa de alguns dias para resolver, o Atendimento fica fechado?"

Especialista: "Nao. Ele fica aguardando resolucao ate o Chamado ser resolvido. Depois passa para pesquisa de satisfacao e, por fim, fechado."

Dev: "Quando o atendente manda o cliente para pesquisa, o Chamado continua em resolucao?"

Especialista: "Nao. Nesse momento a tratativa do SAC terminou, entao o Chamado fica resolvido e o Atendimento entra em pesquisa de satisfacao."

Dev: "Uma imagem enviada antes do Chamado fica onde?"

Especialista: "Fica vinculada ao Atendimento. Depois que o Chamado existe, novas Midias ficam no Chamado e continuam rastreaveis pelo Atendimento."
