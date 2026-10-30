# Registro de decisões

Estrutura: **Decisão** (o que fizemos), **Por quê**, **Trade-off / limitação**.
Tags: [README] entra no README · [ENTREVISTA] ponto de conversa ao vivo · [MAIS TEMPO] item de "o que faria com mais tempo".

---

## Passo 1 · Setup e stack

**Next.js (App Router) full-stack em TypeScript, sem back-end em Python.**
- Por quê: o PRD exige TypeScript estrito e agent em Mastra/LangGraph.js (ambos TS). Route Handlers fazem o papel de back-end; a separação interface / agent / serviços é por pastas e módulos. [README]
- Trade-off: abrimos mão de Python, mas ganhamos um único runtime, deploy simples e "rodar com poucos comandos".

**Tipagem estrita acima do padrão** (`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`). [ENTREVISTA]

**Variáveis de ambiente validadas com Zod na inicialização (`src/lib/env.ts`).**
- Por quê: falha rápida com mensagem clara, em vez de quebrar no meio de uma conversa. Chaves só em `.env`; `.env.example` documentado. [README]

**LLM configurável por env (`LLM_PROVIDER`), Ollama como padrão de desenvolvimento.**
- Por quê: custo zero e privacidade (dados de funcionários não saem da máquina); o agent não depende de um provedor. [README]
- Ollama é acessado via `@ai-sdk/openai` com `baseURL` (API compatível com OpenAI), sem pacote específico. O `ollama-ai-provider` foi descartado: peer dependency em zod 3 e feito para versões antigas do AI SDK.
- Trade-off: modelos locais pequenos erram mais em tool calling e têm latência alta sem GPU. Mitigação: regras críticas ficam em código, não no modelo. [README]
- [MAIS TEMPO] Avaliar um provedor hospedado para o deploy, já que o Ollama local não roda em Vercel/Railway.

**libSQL (SQLite) + Drizzle.**
- Por quê: sem servidor para instalar, persiste em arquivo (sobrevive a reinício), mesmo driver que o Mastra usa para memória. [README]
- Trade-off: SQLite em Vercel não persiste; para deploy, usar volume (Railway/Fly/Render) ou Turso.

**Peer dependencies:** `@types/node@22` alinhado ao Node 22 (exigência do Vitest 5) e `ollama-ai-provider` removido. Evitamos `--legacy-peer-deps`.

---

## Passo 2 · Domínio (`src/lib/domain`, TypeScript puro)

**Princípio central: o LLM decide, o código garante.** O domínio não importa Next, banco nem LLM. [README] [ENTREVISTA]

**Prioridade como tabela de regras ordenada** (em vez de `if`s em cascata).
- Cada regra tem `id`, condição, prioridade e motivo; a primeira que casa vence. O resultado inclui `ruleId`, que vai para o painel de transparência. [README] [ENTREVISTA]
- Por quê: a tabela espelha o Anexo A, é testável por regra e fácil de alterar ao vivo (mudar uma linha ou a ordem).
- Quem decide a prioridade é o código. O LLM só coleta as respostas (`blocksWork`, `deadlineToday`, impacto).
- "Não sei" no impacto não escala para crítica sozinho.

**Prazos em horas úteis (`business-time.ts`).**
- Expediente seg a sex, 8h às 18h; um dia útil = 10 horas úteis (3 dias úteis = 30h). Fuso fixo UTC-3 (Brasil sem horário de verão desde 2019, sem dependência externa).
- Crítica usa horas corridas (plantão 24h, Anexo B). As demais, horas úteis.
- O prazo parte de `lastUpdatedAt` ("vale para a primeira resposta e para cada atualização"). [README]
- "Vencido" **não é status**, é derivado por função pura (`isOverdue`). Resolvido/encerrado nunca vence; aguardando analista continua contando.
- [MAIS TEMPO] Feriados; pausar o prazo enquanto se espera o funcionário; fuso configurável.

**Estado da conversa como enum explícito** (`with_agent`, `awaiting_analyst`, `with_analyst`, `closed`) com tabela de transições válidas. Pausa do agent e console dependem só disso. [README]

**Mensagens com papel** (`user | agent | analyst | system`): o console mostra analista e notas de sistema.

**Regras de negócio puras e testadas:** reabertura em até 7 dias (`canReopen`), acesso por dono (`canAccessTicket`), rascunho validado por Zod (`ticketDraftSchema` = "todo chamado precisa de título, descrição, tipo, categoria, prioridade e afetado").

---

## Passo 3 · Banco e seed

**`DecisionTrace` persistido em cada mensagem do agent.** [README] [ENTREVISTA] (critério mais importante do PRD)
- Campos: o que entendeu, intenção, confiança (0 a 1), raciocínio, ações (tool, rótulo, status, resumo, duração), regras aplicadas, motivo de transferência, modelo e latência.
- A UI mostra os chips de ações acima da resposta e o detalhe ao expandir. Reabrir a conversa outro dia mostra o mesmo histórico.

**Ação pendente de confirmação (`pendingAction`) guardada no banco.**
- Por quê: impõe no código a regra "só cria ou atualiza depois da confirmação". O botão Confirmar só referencia a conversa; o servidor executa o que está salvo. O LLM não consegue gravar sozinho. [README] [ENTREVISTA]

**Conversa x sessão separadas.** A conversa vive para sempre (história 6, "voltar outro dia"); o limite de 30 mensagens é por sessão (`sessionMessageCount`, zera no login).

**Campo `ui` (JSON) nas mensagens** guarda cards, opções rápidas e rascunho, para reconstruir o histórico idêntico.

**Seed com datas relativas ao momento da execução.** Os cenários de vencido e reabrível não envelhecem. Cenários cobertos:
INC-20311 vencido · INC-20150 reabrível (4 dias) · INC-20044 não reabrível (9 dias) · chamados de Carla/Bruno/Diego para privacidade · artigos que testam a regra Win10 x Win11 e requisição que exige aprovação.
- Trade-off: o seed é destrutivo (`db:reset` apaga tudo). Avisar no README.

---

## Passo 4 · Serviços (`src/services`)

**Serviços como fábricas que recebem `db`.** Testes usam banco temporário real, sem mock; o app usa o real. `services/index.ts` é o único ponto de composição. [README]

**Privacidade em duas camadas.** [README] [ENTREVISTA]
1. O filtro está na própria query SQL (`WHERE id = ? AND requester_email = ?`).
2. O e-mail vem da sessão, nunca de parâmetro do LLM. Mesmo um prompt injection não consegue ler o chamado de outra pessoa, porque nenhuma função aceita outro e-mail.
- Chamado alheio e chamado inexistente retornam o mesmo `null`: não permite enumerar IDs.
- Analista só acessa dados de outros funcionários via `requireAnalyst`, validado no banco.

**Duplicidade é regra de código (`findDuplicates`).** [README] [ENTREVISTA]
- Similaridade por sobreposição de tokens normalizados (sem acento, stopwords, stemming leve), limiar 0,6 e mínimo de 2 termos em comum (evita falso positivo só com "notebook"). Ativo → atualizar; resolvido há até 7 dias → reabrir; mais antigo ou encerrado → chamado novo.
- O agent não consegue duplicar mesmo se tentar: `createTicket` devolve `duplicate`.
- Limitação: não entende sinônimos ("lento" x "travando"). [MAIS TEMPO] Embeddings, com o LLM desempatando os candidatos.

**Atualização do funcionário não reinicia o prazo; só a reabertura reinicia.** Senão bastaria escrever "ainda não resolveu" para um chamado nunca vencer. [ENTREVISTA]

**Sistema legado instável tratado em um só lugar (`callLegacySystem`).** [README] [ENTREVISTA]
- Falha simulada por `TICKETS_FAILURE_RATE`, retry com backoff exponencial (200 ms, 400 ms), 3 tentativas, e `TicketSystemUnavailableError` ao desistir (a UI mostra erro amigável e oferece analista).
- A falha simulada ocorre antes da operação, então repetir uma escrita nunca duplica nada. Só erros transitórios são repetidos.

**Concorrência tratada no banco, não em memória.**
- Estados da conversa com compare-and-set (`UPDATE ... WHERE state = ?`): dois analistas clicando em "Assumir", só um vence.
- `takePendingAction` atômico: duplo clique em "Confirmar" nunca cria dois chamados.
- Limite de 30 mensagens com incremento atômico (`UPDATE ... WHERE count < limit`).
- ID de chamado com retry em violação de unicidade.
- Limitação: `getOrCreateForUser` não tem trava contra duas abas criando conversas ao mesmo tempo.

**Central de ajuda com busca determinística por palavras-chave** (pesos: keywords 3, título 2, conteúdo 1; piso `MIN_SCORE`). Devolve os termos que casaram para o trace. [README]
- Trade-off: carrega todos os artigos (ok para 8, não para milhares). [MAIS TEMPO] FTS5 ou embeddings.

**Testes:** domínio (prazos, prioridade, duplicidade, reabertura, estados), serviços (privacidade, duplicidade, reabertura, escalonamento, legado instável, transferência, concorrência). 88 testes.

**Ambiente de teste no Windows:** `cleanup` assíncrono com `rm` e retry, porque o libSQL libera o handle do arquivo depois do `close()` e causava `EBUSY`. Falha de limpeza de arquivo temporário não derruba o teste.

---


## Passo 5 · Autenticação e papéis

**Cookie `httpOnly` com JWT assinado (HS256, `jose`), sem tabela de sessões.** [README]
- Por quê: sem estado no servidor, o JavaScript do navegador nunca lê o token, e `SameSite=Lax` barra CSRF em POSTs de outros sites.
- "Manter-me conectado" controla a duração: 30 dias; desmarcado, vira cookie de sessão do navegador (JWT de 8h).
- Trade-off: não dá para revogar uma sessão específica antes de expirar. Mitigação: o usuário é recarregado do banco em toda ação sensível. [MAIS TEMPO] Tabela de sessões ou lista de revogação.

**O papel que vale é o do banco, não o do cookie.** `requireUser(role)` recarrega o usuário a cada requisição; o cookie só diz "quem". [ENTREVISTA]

**Proxy é só UX; autorização real fica nos handlers e serviços.** Rotas `/api` não passam pelo proxy de propósito. Um bug no proxy não expõe dados, porque cada handler e cada serviço se autoprotege (defesa em profundidade). [README] [ENTREVISTA]

**Autenticação de demonstração isolada em `authenticate`.** O PRD manda aceitar qualquer senha; a troca por SSO/hash fica em uma função só. Mensagem de erro igual para "e-mail inexistente" e "senha errada". [MAIS TEMPO] SSO/OIDC.

**Rate limit de falhas por IP + e-mail (5 em 10 min, 429 com `Retry-After`).** Em memória, com relógio injetável (testável). Limitação: não é compartilhado entre instâncias, e o IP vem de `x-forwarded-for` (confiável só atrás do proxy da plataforma). [MAIS TEMPO] Redis/Upstash para o deploy.

**Novo login zera o limite de 30 mensagens (a conversa continua a mesma).** É a leitura literal de "por sessão".
- Limitação assumida: quem desloga e loga de novo recomeça o contador. Para controle de custo, o rate limit por IP e o limite de tokens do deploy cobrem o abuso. [ENTREVISTA]

**Erros mapeados em um lugar só (`errorResponse`).** AuthError 401/403, RuleError 404/403/409, legado fora 503, validação 400, inesperado 500 genérico. Nenhum detalhe interno ou stack trace chega ao cliente. [README]

## Pendências para o README final

- Escolha do modelo e custo por conversa (medir tokens por conversa quando o agent existir).
- Como o agent decide (fluxo: intenção → tools → guardrails → resposta + trace).
- Como garantimos a qualidade das decisões (conjunto de cenários de avaliação sobre os dados do seed).
- Deploy (opcional): provedor de LLM hospedado, persistência, rate limit, chaves.