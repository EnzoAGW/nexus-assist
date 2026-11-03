# Registro de decisões

Cada item segue: **Decisão**, **Por quê**, **Trade-off** (quando há). Onde houve medição, ela está citada. A seção final é um mapa de "pedido de mudança ao vivo → arquivo".

## Índice

1. [Princípios](#1-princípios)
2. [Stack, ambiente e ferramentas](#2-stack-ambiente-e-ferramentas)
3. [Escolha do modelo de linguagem](#3-escolha-do-modelo-de-linguagem)
4. [Domínio](#4-domínio)
5. [Persistência e dados de exemplo](#5-persistência-e-dados-de-exemplo)
6. [Serviços](#6-serviços)
7. [Autenticação e papéis](#7-autenticação-e-papéis)
8. [O agent](#8-o-agent)
9. [API](#9-api)
10. [Interface: chat do funcionário](#10-interface-chat-do-funcionário)
11. [Interface: console do analista](#11-interface-console-do-analista)
12. [Qualidade e testes](#12-qualidade-e-testes)
13. [Organização do código e convenções](#13-organização-do-código-e-convenções)
14. [Limitações conhecidas e próximos passos](#14-limitações-conhecidas-e-próximos-passos)
15. [Mapa para a entrevista](#15-mapa-para-a-entrevista)

---

## 1. Princípios

**O LLM interpreta e conversa; o código garante as regras.** Privacidade, confirmação antes de escrever, prazos, reabertura, duplicidade, prioridade, pausa do agent e limite de mensagens são código determinístico e testado. O domínio (`lib/domain`) não importa Next, banco nem LLM.

**Medir antes de decidir.** As escolhas de provedor de modelo, de pré-busca em código e de limpeza dos testes vieram de números, não de palpite (seções 3, 8 e 12).

**Falhar de forma segura e explicável.** Saída do modelo inválida vira confiança 0 e transferência para um analista; cota esgotada vira mensagem amigável com oferta de analista; sistema de chamados fora vira aviso e não duplicação.

**Tudo que o agent faz é visível.** Mesmo as ações que não passam pelo modelo (botões Confirmar e Cancelar) geram trace.

---

## 2. Stack, ambiente e ferramentas

**Next.js (App Router) full-stack em TypeScript, sem back-end em Python.**
- Por quê: o PRD exige TypeScript com tipagem estrita e agent em Mastra ou LangGraph.js (ambos TS). Route Handlers fazem o papel de back-end; a separação interface / agent / serviços é por módulos, não por linguagens.
- Trade-off: abrimos mão de Python; ganhamos um runtime só, deploy simples e "rodar com poucos comandos".

**Tipagem estrita acima do padrão:** `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. `array[0]` vira `T | undefined`, o que elimina uma classe de bugs.

**Configuração validada com Zod, dividida em duas.** `lib/env.ts` valida o que o app inteiro precisa (banco, segredo de sessão, limites); `agent/llm/config.ts` valida o LLM **sob demanda**, na primeira vez que o modelo é usado.
- Por quê: validar a chave do LLM na importação do `env.ts` fazia o login e os testes falharem por uma chave que eles não usam. Cada módulo valida só o que precisa e falha com mensagem clara.
- Trade-off: chave de LLM ausente só é detectada na primeira conversa. Alternativa: chamar `getLlmConfig()` no boot do servidor.

**libSQL (SQLite) + Drizzle.** Zero instalação, persiste em arquivo (sobrevive a reinício), mesmo driver da memória do Mastra. Trade-off: SQLite em Vercel não persiste; o deploy usa volume (Railway/Fly/Render) ou Turso.

**Dependências sem `--legacy-peer-deps`:** `@types/node@22` alinhado ao Node 22 (exigência do Vitest 5); `ollama-ai-provider` descartado (peer em zod 3 e feito para versões antigas do AI SDK). Depois da escolha do modelo, `@ai-sdk/openai` e `@ai-sdk/anthropic` deixaram de ser necessários: o Mastra resolve os provedores pela própria configuração.

**Cache Components do Next desligado.**
- Evidência: com o modo ligado, o `next build` tentava pré-renderizar os `GET` sem parâmetros que leem o cookie e registrava `HANGING_PROMISE_REJECTION`; nosso `catch` genérico engolia isso como erro inesperado. Além disso, toda página que lê cookie ou banco exigiria `<Suspense>` e as rotas não aceitam `runtime`/`dynamic`.
- Por quê: o app é inteiramente autenticado e dinâmico; não há o que cachear.
- Alternativa documentada, se um dia for ligado: `await connection()` antes de `cookies()` em `getSession`.

**Ferramentas de verificação.**
- `next lint` não existe no Next 16 (o script interpretava "lint" como diretório do projeto): o script chama `eslint .`.
- Os tipos gerados em `.next` ficam velhos quando uma rota é movida ou apagada; apagar `.next` antes do `typecheck` resolve.
- Scripts sem `import` colidem no escopo global do TypeScript (`main` duplicado): `export {}` no topo (ou `moduleDetection: "force"` no tsconfig).
- `npm run build` faz parte da verificação, porque typecheck e testes não enxergam a configuração das rotas do Next.

---

## 3. Escolha do modelo de linguagem

**Requisito: gratuito.** Todos os provedores testados falam a API compatível com OpenAI, então há um único caminho de código (`agent/llm/model.ts`); trocar de provedor é mudar `LLM_PROVIDER`, `LLM_MODEL` e `LLM_API_KEY` no `.env`. O modelo é configurado pelo objeto nativo do Mastra (`{ id, url, apiKey }`).

**Por que o objeto nativo e não instâncias do AI SDK:** o `LanguageModelV4` do `ai@7` não é aceito pelo tipo `Agent` do Mastra 1.80 (erro de tipo em `doGenerate`/`stream`). A configuração nativa evita o descompasso de versões e reduz dependências. O campo `api` fica sem valor para usar Chat Completions, que todos aceitam (a API Responses não, no Ollama e no Gemini).

**O que foi testado, com o smoke de uma tool real (não só um "oi"):**

| Opção | Resultado |
|---|---|
| Ollama (local) | Suportado, mas depende do hardware; não era opção de deploy |
| Gemini 3.x, endpoint OpenAI-compatível | **Falha** em laço de ferramentas: 400 "missing thought_signature" na 2ª chamada |
| Gemini 2.5 | **Indisponível** para contas novas (404) |
| Gemini 3.x, rota nativa `google/` | Funciona, mas **142 s e 295 s por chamada**, sem erro e sem retries (`maxRetries: 0`) |
| Groq `openai/gpt-oss-120b` | **Falha** na 2ª chamada: modelo de raciocínio devolve `reasoning_content`, que o provedor rejeita na volta |
| **Groq `qwen/qwen3.8-27b`** | **5,4 s na partida fria e ~1 s na seguinte; tool calling íntegro** |
| OpenRouter `:free` | 50 req/dia: não dá nem para um teste de avaliador |
| Cerebras | Exige cartão: não é gratuito |

**Decisão: Groq com `qwen/qwen3.8-27b`.** Foi a única combinação gratuita com tool calling íntegro e latência de chat.

**Lições que ficam:** (1) modelos de raciocínio e laços de ferramentas se atrapalham por campos que só existem neles (`reasoning_content`, `thought_signature`); para um agent baseado em tools, preferir modelo sem raciocínio, que ainda economiza tokens; (2) retries automáticos mascaram erro e latência com cota gratuita: medir sem retries antes de escolher; (3) modelos gratuitos são aposentados sem aviso: o smoke com tool é o teste de aceitação ao trocar.

**Privacidade:** o plano gratuito de alguns provedores pode usar o conteúdo para melhorar produtos. Aceitável aqui porque todos os dados são fictícios. Com dados reais: Ollama local ou plano sem retenção.

**Cota como risco principal.** Limites gratuitos mudam sem aviso, e o de tokens por minuto costuma estourar antes do de requisições. Mitigações: prompts enxutos, trace com tokens por turno, tratamento de 429 com mensagem amigável, 30 mensagens por sessão, rate limit por IP. Próximo passo: cadeia de fallback entre provedores.

---

## 4. Domínio

**Organizado por papel:** `model/` (vocabulário e formatos: enums, schemas, `DecisionTrace`, contrato de UI), `rules/` (regras do Anexo A) e `utils/` (tempo, texto, formatação). Quem lê acha a regra pelo nome do negócio.

**Prioridade como tabela de regras ordenada, não `if`s em cascata** (`rules/priority.ts`).
- Cada regra tem `id`, condição, prioridade e motivo; a primeira que casa vence. O resultado inclui `ruleId`, que alimenta o painel de transparência.
- Por quê: a tabela espelha o Anexo A, é testável por regra e fácil de alterar (uma linha ou a ordem).
- Quem decide a prioridade é o **código**; o LLM só coleta as respostas do funcionário (`blocksWork`, `deadlineToday`, impacto). "Não sei" no impacto não escala para crítica sozinho.

**Prazos em horas úteis** (`utils/business-time.ts`, `rules/sla.ts`).
- Expediente seg a sex, 8h às 18h; um dia útil = 10 horas úteis (3 dias úteis = 30 h). Fuso fixo UTC-3 (Brasil sem horário de verão desde 2019, sem dependência externa).
- Crítica usa horas corridas (plantão 24 h, Anexo B). As demais, horas úteis.
- O prazo parte de `lastUpdatedAt` ("vale para a primeira resposta e para cada atualização").
- **"Vencido" não é status: é derivado** (`isOverdue`). Resolvido e encerrado nunca vencem; aguardando analista continua contando.
- Limitações: sem feriados; sem pausa do prazo enquanto se espera o funcionário; fuso fixo.

**Estado da conversa como enum explícito** (`with_agent`, `awaiting_analyst`, `with_analyst`, `closed`) com tabela de transições válidas (`rules/conversation-state.ts`). A pausa do agent e o console dependem só disso; a tela usa as mesmas funções que o servidor.

**Mensagens com papel** (`user | agent | analyst | system`): o console mostra analista e notas de sistema, e o agent é ignorado fora de `with_agent`.

**Regras puras e testadas:** reabertura em até 7 dias (`canReopen`), acesso por dono (`canAccessTicket`), rascunho validado por Zod (`ticketDraftSchema` = "todo chamado precisa de título, descrição, tipo, categoria, prioridade e afetado").

**Limiares de confiança como constantes de domínio** (`rules/confidence.ts`): 0,55 (abaixo, transfere) e 0,8 (confirmação digitada). O roteamento e o painel de transparência usam os mesmos números.

**Motivo de transferência como dado** (`rules/handoff.ts`: `HANDOFF`, `handoffKind`), não texto solto. A lista do console marca "Pediu um analista", "Chamado crítico" ou "Agent sem segurança" (história 2 do analista). Quem grava e quem lê usam as mesmas constantes, com teste; um seed com texto livre quebrava o marcador. Próximo passo: coluna `handoff_kind` no banco.

---

## 5. Persistência e dados de exemplo

**`DecisionTrace` persistido em cada mensagem do agent** (`messages.trace`): o que entendeu, intenção, confiança, raciocínio, ações (tool, rótulo, status, resumo, duração), regras aplicadas, motivo de transferência, modelo, latência e **tokens** (`usage`). A UI mostra chips e o detalhe; reabrir a conversa outro dia mostra o mesmo histórico.

**Ação pendente de confirmação no banco** (`conversations.pendingAction`). Impõe no código "só cria ou atualiza depois da confirmação": o botão só referencia a conversa e o servidor executa o que está salvo. O LLM não consegue gravar sozinho.

**Conversa x sessão separadas.** A conversa vive para sempre (história 6, "voltar outro dia"); o limite de 30 mensagens é por sessão (`sessionMessageCount`, zera no login).

**Elementos de UI nas mensagens** (`messages.ui = { elements: UiElement[] }`) reconstroem o histórico idêntico. O contrato (`model/ui.ts`) é um schema Zod único entre quem grava (agent) e quem lê (tela), validado elemento a elemento ao ler: um elemento desconhecido é descartado, nunca quebra a tela.

**Seed com datas relativas ao momento da execução:** os cenários de vencido e reabrível não envelhecem. Cenários cobertos: `INC-20311` vencido; `INC-20150` reabrível (4 dias); `INC-20044` não reabrível (9 dias); chamados de Carla, Bruno e Diego para privacidade; artigos que testam a regra Windows 10 x 11 e uma requisição que exige aprovação (Acrobat Pro); e conversas de demonstração para o console (fila por pedido, fila por chamado crítico, atendimento em andamento, e "agent sem segurança"). O seed é destrutivo (`db:reset`), e o README avisa.

---

## 6. Serviços

**Fábricas que recebem `db`** (`createTicketService(db, opts)`). Os testes usam um banco temporário real, sem mock; o app usa o real. `services/index.ts` é o único ponto de composição.

**Privacidade em camadas.**
1. O filtro está na própria query SQL (`WHERE id = ? AND requester_email = ?`).
2. O e-mail vem da sessão, nunca de parâmetro do LLM: nenhuma função do agent aceita outro e-mail, então um prompt injection não consegue ler o chamado de outra pessoa.
3. Chamado alheio e inexistente devolvem o mesmo `null`: não permite enumerar IDs.
4. O analista só acessa dados de outros funcionários via `requireAnalyst`, validado no banco.

**Duplicidade é regra de código** (`rules/duplicates.ts`).
- Similaridade por sobreposição de tokens normalizados (sem acento, stopwords, stemming leve), limiar 0,6 e mínimo de 2 termos em comum (evita falso positivo só com "notebook"). Ativo → atualizar; resolvido há até 7 dias → reabrir; mais antigo ou encerrado → chamado novo.
- O agent não consegue duplicar mesmo se tentar: `createTicket` devolve `duplicate`.
- Limitação: não entende sinônimos ("lento" x "travando"). Próximo passo: embeddings, com o LLM desempatando.

**Atualização do funcionário não reinicia o prazo; só a reabertura reinicia.** Senão bastaria escrever "ainda não resolveu" para um chamado nunca vencer. É uma interpretação que o PRD não define explicitamente.

**Sistema legado instável tratado em um só lugar** (`services/legacy.ts`, `callLegacySystem`).
- Falha simulada por `TICKETS_FAILURE_RATE`, retry com backoff exponencial (200 ms, 400 ms), 3 tentativas, e `TicketSystemUnavailableError` ao desistir.
- A falha simulada ocorre **antes** da operação, então repetir uma escrita nunca duplica nada. Só erros transitórios são repetidos.

**Concorrência tratada no banco, não em memória.**
- Estados da conversa com compare-and-set (`UPDATE ... WHERE state = ?`): dois analistas clicando em "Assumir", só um vence.
- `takePendingAction` atômico: duplo clique em "Confirmar" nunca cria dois chamados.
- Limite de 30 mensagens com incremento atômico (`UPDATE ... WHERE count < limit`).
- ID de chamado com retry em violação de unicidade.
- Limitação: `getOrCreateForUser` não tem trava contra duas abas criando conversas ao mesmo tempo.

**Central de ajuda com busca determinística por palavras-chave** (pesos: keywords 3, título 2, conteúdo 1; piso `MIN_SCORE`). Devolve os termos que casaram para o trace. Trade-off: carrega todos os artigos (ok para 8, não para milhares). Próximo passo: FTS5 ou embeddings.

**Console do analista como serviço de leitura próprio** (`services/analyst-console.ts`); as ações reutilizam `conversations.ts`, que já tem compare-and-set e checagem de dono.
- Fila ordenada por urgência de atenção: na fila (a mais antiga primeiro), depois as assumidas por mim, depois as com o agent; encerradas só na aba própria.
- "Mensagens sem resposta" no lugar de "não lidas": conta as mensagens do funcionário depois da última resposta, sem rastrear leitura por analista.
- Busca sem curingas do usuário (`%` e `_` viram espaço). Limitação: o `LIKE` do SQLite só ignora maiúsculas em ASCII.
- Escala: a prévia usa uma consulta por conversa listada (máx. 100); para milhares, agrupar com função de janela.
- A disponibilidade do analista é informativa: grava o estado, mas ainda não altera o roteamento.

---

## 7. Autenticação e papéis

**Cookie `httpOnly` com JWT assinado (HS256, `jose`), sem tabela de sessões.** O JavaScript do navegador nunca lê o token; `SameSite=Lax` barra CSRF em POSTs de outros sites. "Manter-me conectado" controla a duração: 30 dias; desmarcado, vira cookie de sessão do navegador (JWT de 8 h). Trade-off: não dá para revogar uma sessão específica antes de expirar; mitigado recarregando o usuário do banco em toda ação sensível. Próximo passo: tabela de sessões ou lista de revogação.

**O papel que vale é o do banco, não o do cookie.** `requireUser(role)` recarrega o usuário a cada requisição; o cookie só diz "quem".

**Proxy é só UX; autorização real fica nos handlers e serviços.** Rotas `/api` não passam pelo proxy de propósito. Um bug no proxy não expõe dados, porque cada handler e cada serviço se autoprotege (defesa em profundidade).

**Autenticação de demonstração isolada em `authenticate`.** O PRD manda aceitar qualquer senha; a troca por SSO ou hash fica em uma função só. Mensagem de erro igual para "e-mail inexistente" e "senha errada".

**Rate limit de falhas por IP + e-mail** (5 em 10 min, `429` com `Retry-After`), em memória, com relógio injetável (testável). Limitação: não é compartilhado entre instâncias, e o IP vem de `x-forwarded-for` (confiável só atrás do proxy da plataforma).

**Novo login zera o limite de 30 mensagens** (a conversa continua a mesma): é a leitura literal de "por sessão". Quem desloga e loga recomeça o contador; o rate limit por IP e a cota do provedor cobrem o abuso.

**Erros mapeados em um lugar só** (`describeError`): 401/403, `RuleError` 404/403/409, legado fora 503, validação 400, inesperado 500 genérico. Serve às respostas JSON e ao evento `error` do stream; nenhum detalhe interno chega ao cliente.

---

## 8. O agent

### 8.1 Pipeline

**Seis etapas por mensagem** (`agent/turn/run-turn.ts`): pausa do agent → limite da sessão → classificar → rotear → consultar → responder, e gravar a mensagem com o trace.

**`runTurn` é um gerador de eventos** (`user_message`, `text`, `agent_message`, `blocked`, `paused`). O mesmo código serve ao streaming da UI e aos testes. A mensagem final já vem gravada, com trace e UI; o cliente substitui o texto transmitido por ela, então a tela mostra sempre o que está no banco.

**`LlmPort`: o modelo fica atrás de uma interface; o Mastra é um adaptador** (`llm/mastra-adapter.ts`). As decisões do agent são testadas com um LLM falso que pode chamar as ações reais: dezenas de testes de comportamento sem gastar uma chamada de modelo, e trocar de framework mexe em um arquivo.

### 8.2 Classificação e roteamento

**Classificação separada, com saída estruturada Zod, em temperatura 0.** Entrega "o que entendeu / intenção / confiança / por quê" como dado, não como texto do modelo. A `Classification` nasce do schema (`z.infer`): validação e tipo nunca divergem. Se a saída não valida, a confiança é 0 e o roteamento transfere para um analista (falha segura).
- Trade-off: duas chamadas ao modelo por mensagem. Mitigação: prompts curtos, histórico de 10 mensagens, e fora de escopo, transferência e confirmação **não chamam o modelo principal**.

**Roteamento por função pura** (`turn/guardrails.ts`): confiança < 0,55 transfere; pedido de analista transfere; fora de escopo redireciona; "sim" digitado com rascunho pendente só é aceito com confiança ≥ 0,8, senão pede o botão; o resto vai ao agent com as ferramentas da intenção. A confirmação digitada exige mais certeza porque é uma escrita.

**O modelo só vê as ferramentas da intenção** (0 a 2 em vez de 3). Menos opções = tool calling mais confiável em modelos pequenos, e uma consulta nunca expõe ferramenta de escrita.

### 8.3 O código consulta, o modelo conversa (pré-busca)

**Medição que motivou:** no primeiro turno real, o agent pulou a busca na central e a consulta aos chamados (o prompt mandava, o modelo não fez) e gastou 3.154 tokens de entrada em uma mensagem.

**Decisão:** as consultas viram **pré-busca em código** (`turn/prefetch.ts`: `planPrefetch` + `runPrefetch`), e o resultado entra no contexto do modelo. O modelo passa a ver só `askUser`, `proposeTicket` e `proposeTicketUpdate`.
- Por quê: "buscar antes de abrir" e "não duplicar" são regras de negócio e não podem depender de o modelo lembrar. Também elimina ciclos de chamada de ferramenta e funciona melhor com modelos pequenos.
- Os chips "consultou seus chamados" e "buscou na central de ajuda" aparecem sempre, como no protótipo; chamado vencido oferece o analista por código.
- Uma mensagem com número de chamado (`INC-123`, o que a seleção na UI envia) busca esse chamado direto.
- Trade-off: consulta mesmo quando o modelo talvez não precisasse. Próximo passo: pular a pré-busca quando o rascunho já está em andamento.

**Consulta interna e exibição são decisões separadas.** Bug encontrado por teste: a pré-busca de chamados (necessária para detectar duplicidade) também empurrava um card `ticket_list` para a tela, e o funcionário veria uma lista de todos os seus chamados sem ter pedido. O plano de pré-busca agora carrega `showCards`. Da mesma família: a regra `sla-overdue` só entra no trace quando a lista é exibida (um trace que diz "aplicei" sem ter aplicado é pior que um trace vazio); e uma consulta com um único chamado mostra o card dele, não uma lista.

### 8.4 Ferramentas e confirmação

**As ferramentas nunca escrevem chamados.** `proposeTicket` e `proposeTicketUpdate` só gravam o rascunho pendente. O LLM não consegue criar, atualizar nem reabrir nada sozinho.

**Prioridade decidida em código:** o modelo informa só as respostas do funcionário; `derivePriority` decide e devolve `ruleId`.

**Confirmação em um único lugar** (`turn/confirm.ts`, `executePending`), usada pelo botão e pela confirmação digitada. `takePendingAction` é atômico; se a escrita falha (legado fora), o rascunho volta e dá para tentar de novo. O resultado de cada desfecho (criado, duplicado, atualizado, reaberto, fora da janela de 7 dias, encerrado, não encontrado) tem texto, elementos de UI, ações do trace e regras.

**Chamado crítico:** o rascunho é confirmado normalmente e a **transferência acontece depois da criação**, para que o analista receba o caso já com número e prazo de 1 hora.

**Chamado vencido:** o agent reconhece o atraso e oferece o analista pelos botões *Falar com um analista / Adicionar informações / Não, obrigado*, montados pelo código; a transferência acontece quando o funcionário aceita.

**Resumo da transferência determinístico** (entendimento do agent + últimas 3 mensagens do funcionário): não gasta modelo e não pode inventar.

**Ações como funções puras** (`tools/actions.ts`), com as ferramentas do Mastra como casca fina (`tools/mastra-tools.ts`): privacidade, duplicidade, reabertura e legado fora se testam sem LLM. O `userEmail` vem do servidor e nunca é parâmetro de nenhuma ferramenta.

### 8.5 Cota e erros do modelo

**Cota esgotada é um estado esperado, não um erro.** `LlmUnavailableError` (429, 5xx, rede) vira mensagem amigável com oferta de analista; erros de configuração (400, 401, 404) continuam sendo exceções reais. `maxRetries: 0` e `maxSteps` fixo evitam retries empilhados e cortes silenciosos do laço de ferramentas.

**Sistema de chamados fora vira resultado estruturado para o modelo** (`unavailable`), não exceção: o trace registra a ação com erro e uma mensagem segura, e o chat avisa em vez de quebrar.

### 8.6 Transparência

**Duas camadas, como pede o PRD.** Chips de ação acima de cada resposta; e o painel "Ver detalhes da decisão" com o que entendeu, intenção, **confiança** (com as mesmas faixas do roteamento), por quê, ações com resumo e duração, **regras aplicadas em português** (cada `ruleId` tem um texto; regra desconhecida aparece pelo id: melhor técnico do que escondido), motivo de transferência, modelo, latência e tokens por turno.

**Avaliação de qualidade versionada** (`npm run eval:classifier`): 17 casos com intenção esperada, taxa de acerto, latência e tokens, incluindo um caso adversarial (injeção de prompt pedindo chamados de outra pessoa; a privacidade é garantida em código, não no modelo). Primeira rodada: 16/17, ~0,5 a 0,7 s por chamada, com um ponto fora da curva de 10 s (suspeita: fila ou limite do provedor). O único erro (`"isso aí"` como `smalltalk` com 0,90) foi corrigido no prompt, restringindo `smalltalk` a cumprimento, agradecimento e recusa educada. **Confiança alta não é correção**: a rede de segurança por confiança não pega erros confiantes.

**Custo por conversa:** o trace grava tokens de entrada e saída e o número de chamadas por turno. Medido: ~500 a 900 tokens de entrada em uma dúvida respondida pela central, ~1.300 a 1.400 em uma consulta de chamados, ~3.000 em uma abertura de chamado (o laço de ferramentas reenvia contexto a cada passo). Alavancas se o limite do provedor apertar: histórico de 10 para 6 mensagens, instruções mais curtas, pergunta de impacto determinística.

---

## 9. API

**O cliente nunca informa o ID da conversa nem o e-mail.** O servidor usa a conversa aberta do usuário da sessão; não existe parâmetro que permita apontar para a conversa de outra pessoa. Privacidade por construção, não por validação.

**Streaming por SSE, e o turno termina mesmo que o cliente desconecte** (`lib/sse.ts`). O servidor continua consumindo o gerador e só deixa de enviar; a mensagem do agent e o trace ficam gravados, e ao voltar o funcionário vê a resposta no histórico (testado com cancelamento do leitor). Medição com o servidor quente: primeiro texto em ~1,4 s, 78 a 87 eventos de texto por resposta (streaming real). Trade-off: sem retomada com `Last-Event-ID`; se a conexão cair, a UI recarrega o histórico.

**Serialização explícita** (`server/serialize.ts`): lista dos campos que saem para o cliente, então uma coluna nova no banco não vaza sem alguém decidir. O chamado não inclui o e-mail do solicitante; a mensagem não inclui o ID da conversa; o analista não recebe o rascunho pendente nem o contador de sessão do funcionário.

**Botões Confirmar e Cancelar não passam pelo modelo**, não gastam as 30 mensagens e geram trace ("sem modelo", 0 tokens). A mesma função de execução atende o botão e a confirmação digitada.

**Histórico resiliente:** `GET /api/chat` carrega a conversa mesmo com o sistema de chamados fora (devolve `tickets: null`, e a tela mostra um aviso no lugar dos cards).

**Rotas do console** (`/api/console/*`) exigem `requireUser("analyst")` e o serviço revalida com `requireAnalyst`: duas camadas. Assumir, devolver, encerrar e responder reutilizam as regras do serviço (e seus 403 e 409).

**O smoke contra o servidor real pegou uma suposição errada minha e a API estava certa:** depois de devolver ao agent, a conversa não pode ser reassumida direto (a tabela de transições só permite `with_agent → awaiting_analyst | closed`); o servidor respondeu 409. O smoke passou a verificar a recusa.

**Smokes em Node (`api:smoke`, `console:smoke`) em vez de `curl`:** o escape de aspas muda entre Git Bash, PowerShell 5.1 e 7 e corrompia o JSON (o servidor devolvia 400 corretamente). O script também mede quando cada evento do stream chega.

---

## 10. Interface: chat do funcionário

**Lógica de formulário e de chat fora dos componentes.** `validateLogin`/`submitLogin` (com `fetch` injetável) e o reducer do chat são funções puras, testadas sem navegador (o Vitest roda em Node). O componente só liga estado e eventos.

**Estado do chat como reducer puro, e a regra de "o que está clicável" em seletores testados.** Só o **último** rascunho com ação pendente aceita Confirmar/Editar/Cancelar; opções rápidas e seleção de chamado só valem na última mensagem, quando o agent é quem responde e nada está em andamento. Impede clicar em botões de turnos antigos. Envio otimista, falha, limite de sessão, consulta periódica e botões são ações do reducer.

**Streaming agrupado por frame** (`createFrameBatcher`): ~80 eventos de texto por resposta viram cerca de uma atualização por frame.

**Markdown mínimo e seguro** (`lib/client/markdown.ts`): negrito, listas e quebras, devolvidos como dado; a tela só renderiza nós de texto, então HTML do modelo nunca vira marcação (testado com `<img onerror>`). O prompt também pede texto simples. Próximo passo: biblioteca com sanitização, se o escopo crescer.

**Conversa com analista se atualiza sozinha** (consulta a cada 4 s enquanto o estado não é `with_agent`), e a consulta nunca interfere em um envio em andamento. Trade-off: *polling* em vez de WebSocket: simples, funciona atrás de qualquer proxy. Próximo passo: notificação por SSE.

**Resiliência na tela:** o texto volta ao campo se o envio falha; sistema de chamados fora mostra aviso em vez de cards quebrados; sessão expirada leva ao login; carregamento, vazio, erro de carga e erro de envio têm estados próprios.

**Editar o rascunho** pré-preenche o campo ("Quero corrigir o rascunho: ") e o agent gera um novo rascunho que substitui o pendente: uma única fonte de verdade para o rascunho (o servidor), sem formulário paralelo para validar. Próximo passo: edição campo a campo.

**Login:** o redirecionamento pós-login usa lista permitida (`/chat` ou `/console`), mesmo vindo do nosso servidor (sem *open redirect*); `Retry-After` vira texto ("tente de novo em N minutos"); as contas de demonstração ficam atrás de `SHOW_DEMO_ACCOUNTS`; o painel de marca afirma só o que o sistema sustenta (em vez dos números ilustrativos do protótipo); "Esqueci minha senha" e "Fale com o time de TI" são stubs declarados como tais.

**Acessibilidade e responsivo:** rótulos associados, `aria-live`/`role="alert"`, foco visível, painel de decisão com `aria-expanded`; sem biblioteca de ícones e com fontes do sistema (o build não precisa de rede).

---

## 11. Interface: console do analista

**A tela deriva os botões das regras do domínio, não de condições próprias** (`lib/client/console-rules.ts`). `availableActions` usa `canTransition` e `analystMayReply`, as mesmas funções que o servidor aplica: a tela oferece exatamente o que a API aceitaria; a API continua recusando o resto (403/409), porque a tela é conveniência e não segurança. Se dois analistas assumem a mesma conversa, o compare-and-set garante um vencedor e o outro vê "a conversa mudou de estado" e a tela se atualiza.

**Transparência também para o analista (história 2).** As respostas do agent aparecem com os mesmos chips e o "Ver detalhes da decisão": o analista vê por que o agent não teve segurança (confiança, raciocínio, regra `low-confidence`) antes de assumir. O resumo da transferência fica no topo com o marcador do motivo.

**Atualização periódica (lista 5 s, conversa 4 s), com três cuidados:** pausa com a aba oculta, não acumula consultas e descarta respostas de consultas antigas.

**`react-hooks/set-state-in-effect` achou um problema real, e corrigimos o código em vez de desligar a regra.** Antes: o componente iniciava buscas em `useEffect` e guardava o resultado em cinco `useState` com dois contadores de sequência espalhados. Depois: `useLiveResource` + `liveReducer` (puro, testado): o dado e o erro carregam a **chave** a que pertencem e a tela os lê já filtrados, então trocar de conversa nunca mostra a anterior, sem reset síncrono em efeito. A lista usa "stale-while-revalidate" (mantém a anterior até a nova chegar); a conversa não. Conversa removida (404) e sessão expirada são estados derivados.

**Chamado em foco por heurística explícita, testada em tabela:** o último chamado citado na conversa; senão o vencido; senão o primeiro ativo. O analista troca com um clique.

**Encerrar é irreversível, então pede confirmação inline** (sem `window.confirm`); assumir e devolver são reversíveis e não pedem.

**Responsivo sem biblioteca:** abaixo de `lg` a lista e a conversa alternam; abaixo de `xl` o painel de chamados vira uma gaveta. O título da aba mostra a fila (`(3) Console`).

---

## 12. Qualidade e testes

**Camadas de verificação:** `lint`, `typecheck` (estrito), `test` (sem chamar o modelo) e `build`; mais quatro smokes e a avaliação do classificador, que usam o modelo e o servidor reais.

**Testes de comportamento sem modelo:** o `LlmPort` e o ambiente de teste (`agent/testing`) permitem testar o orquestrador inteiro (pausa, limite, transferência, confirmação, cota esgotada, pré-busca) com um banco real temporário e um LLM falso.

**Testes que travam as decisões acima:** privacidade (chamado alheio é igual a inexistente; só analista lê outros), duplicidade, reabertura em 7 dias, concorrência (compare-and-set, duplo clique, limite), legado instável, SSE (cancelamento do cliente não impede gravar), markdown (HTML vira texto), reducer do chat, regras do console, `describeError` (erro inesperado não vaza a mensagem interna).

**Bancos temporários no Windows: uma tentativa de limpeza e purga no `globalSetup`.** O libSQL só libera o arquivo quando o processo termina, então apagar depois de cada teste dá `EBUSY`. A primeira correção (retry com `fs.rm`) piorou: o atraso cresce a cada tentativa (~5,5 s por arquivo), levando testes de centenas de milissegundos a 5-13 s e estourando o timeout do hook (suíte de ~90 s). Agora o `cleanup` tenta uma vez e ignora a falha, e um `globalSetup` apaga os `data/test-*` antes e depois da execução, quando nenhum worker os segura: a suíte caiu para ~11 s. Medir antes de "consertar com espera" revelou que a causa era o próprio retry.

**Bugs encontrados pela verificação (todos corrigidos, com teste):** lista de chamados exibida sem o funcionário pedir; regra `sla-overdue` no trace sem ter sido aplicada; consulta com um único chamado sem card; motivo de transferência do seed que não casava com o marcador do console; `ChatMessage` incompatível com o tipo do Mastra (convertido na fronteira); estado em cascata no console (lint).

---

## 13. Organização do código e convenções

**Domínio por papel (`model/`, `rules/`, `utils/`) e agent em camadas com dependência em uma direção: `tools ← llm ← turn`.**
- `tools/`: o que o agent pode fazer (ações, gravador do trace, nomes das ferramentas). Não conhece modelo nem fluxo.
- `llm/`: tudo do modelo (porta, configuração, adaptador, prompts, schema da classificação).
- `turn/`: o fluxo de uma mensagem (orquestrador, guardrails, pré-busca, histórico, confirmação); é o único que junta as outras duas.
- `ToolName` vive em `tools/names.ts` para o import não voltar de `tools` para `turn`.
- Próximo passo: regra de lint (`no-restricted-imports`) para impedir dependências na direção errada.

**Sem barrel files (`index.ts`):** imports explícitos, mais fáceis de seguir e sem ciclos escondidos.

**Convenção de tipos.**
- Dado que cruza fronteira (saída do LLM, HTTP, JSON do banco): schema Zod e `z.infer`, sem interface escrita à mão, para a validação em tempo de execução e o tipo nunca divergirem.
- Contrato interno entre módulos: `interface`. União, interseção e tipo derivado: `type`. Tipo de fábrica de serviço: `ReturnType<typeof createX>`.
- Sem prefixo `I` e sem interface de serviço separada da implementação: a injeção do `db` nas fábricas cumpre esse papel nos testes.
- Próximo passo: impor o estilo com `consistent-type-definitions` no ESLint.

**Reorganização por script** (move de arquivos e reescrita de imports) depois de um commit limpo: reversível, e o git preserva o histórico como renomeação.

---

## 14. Limitações conhecidas e próximos passos

| Área | Limitação | Próximo passo |
|---|---|---|
| Prazos | Sem feriados; sem pausa enquanto se espera o funcionário; fuso fixo | Calendário de feriados e fuso configurável |
| Duplicidade e busca | Não entende sinônimos; central carrega todos os artigos | Embeddings ou FTS5, com o LLM desempatando |
| Modelo | Cota gratuita é o risco principal; mensagem que falha por cota consome 1 das 30 | Fallback entre provedores; reembolsar o contador em falha de cota; cache de classificação; resumo de histórico |
| Custo | ~3.000 tokens de entrada na abertura de chamado | Pergunta de impacto determinística; histórico de 6 mensagens |
| Tempo real | Polling de 4-5 s; stream sem retomada | SSE de notificação; retomada com `Last-Event-ID` |
| Console | "Sem resposta" no lugar de "não lidas"; mensagens antigas de analista sem nome; disponibilidade informativa; uma consulta por conversa listada | Leitura por analista; nome em todas as mensagens; roteamento por disponibilidade; função de janela |
| Transferência | Tipo do motivo inferido do texto | Coluna `handoff_kind` |
| Autenticação | Sessão não revogável antes de expirar; rate limit em memória; IP por `x-forwarded-for` | Tabela de sessões; Redis; SSO/OIDC |
| Conversas | Sem trava contra duas abas criando conversas | Restrição única parcial no banco |
| Rascunho | Editar gera novo rascunho via agent | Edição campo a campo |
| Qualidade | Avaliação do classificador cobre 17 casos | Ampliar o conjunto; avaliar também as respostas do agent (não só a intenção); CI |
| Observabilidade | Trace só no banco | Exportar para monitoramento; métricas de transferência, duplicidade evitada e abandono |
| Deploy | Não realizado | Plataforma com volume persistente ou Turso (ver README) |

---

## 15. Mapa para a entrevista

Pedido de mudança ao vivo, e onde mexer.

| Se pedirem... | Arquivo |
|---|---|
| Mudar uma regra de prioridade ou a ordem delas | `src/lib/domain/rules/priority.ts` (tabela `RULES`) |
| Mudar prazos de SLA | `src/lib/domain/rules/sla.ts` (tabela `SLA`) |
| Mudar horário comercial / considerar feriados | `src/lib/domain/utils/business-time.ts` |
| Mudar a janela de reabertura (7 dias) | `src/lib/domain/rules/ticket-rules.ts` (`REOPEN_WINDOW_DAYS`) |
| Ajustar o rigor da duplicidade | `src/lib/domain/rules/duplicates.ts` (`DUPLICATE_THRESHOLD`, `MIN_SHARED_TOKENS`) |
| Mudar os limiares de confiança (transferir / confirmar) | `src/lib/domain/rules/confidence.ts` |
| Mudar o limite de mensagens por sessão | `.env` (`MAX_MESSAGES_PER_SESSION`) |
| Adicionar uma categoria ou tipo de chamado | `src/lib/domain/model/enums.ts` e os rótulos que a usam |
| Mudar quais ferramentas cada intenção enxerga | `src/agent/turn/guardrails.ts` (`TOOLSET`) |
| Fazer o agent consultar outra coisa antes de responder | `src/agent/turn/prefetch.ts` (`planPrefetch`) |
| Mudar tom, regras ou o que o modelo diz | `src/agent/llm/prompts.ts` |
| Adicionar uma nova intenção | `src/lib/domain/model/trace.ts` (`INTENTS`), `llm/prompts.ts`, `turn/guardrails.ts`, `client/decision-labels.ts` |
| Mudar os textos fixos (transferência, fora de escopo) | `src/agent/turn/run-turn.ts` (`TEXT`) |
| Mudar o que acontece ao confirmar | `src/agent/turn/confirm.ts` |
| Trocar de provedor ou modelo | `.env`; endpoints em `src/agent/llm/model.ts` |
| Mudar os chips e o painel de transparência | `src/agent/tools/actions.ts` (rótulos), `src/lib/client/decision-labels.ts`, `src/features/chat/decision-panel.tsx` |
| Simular o sistema de chamados fora do ar | `.env` (`TICKETS_FAILURE_RATE`); retry em `src/services/legacy.ts` |
| Adicionar um artigo na central de ajuda | `src/db/seed-data.ts` (`ARTICLES`); pesos em `src/services/knowledge-base.ts` |
| Mudar o rate limit do login | `src/app/api/auth/login/route.ts` |
| Mudar o intervalo de atualização das telas | `src/features/chat/chat-view.tsx` (`POLL_MS`), `src/features/console/console-view.tsx` |
| Adicionar uma aba de filtro no console | `src/lib/domain/model/console.ts` e `src/services/analyst-console.ts` |
| Mudar quais botões o analista vê | `src/lib/client/console-rules.ts` (`availableActions`) |
| Provar a privacidade | `src/services/tickets.test.ts`, `src/agent/tools/actions.test.ts`, `npm run console:smoke` |
| Ver uma decisão do agent de ponta a ponta | `npm run turn:smoke -- "mensagem" email` |
