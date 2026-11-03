# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras num chat; o agent consulta os chamados dele, busca na central de ajuda, prepara chamados para confirmação, atualiza ou reabre chamados existentes e transfere para um analista quando precisa. O analista tem um console próprio para assumir, responder, devolver ao agent e encerrar.

A parte central do projeto é a **transparência**: cada resposta do agent mostra o que ele fez (chips de ação) e, sob demanda, o que entendeu, com que segurança, por quê, quais regras determinísticas se aplicaram, e quanto custou em tokens e tempo.

> Decisões, alternativas descartadas e medições estão em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Sumário

1. [Como rodar](#como-rodar)
2. [Contas e cenários de demonstração](#contas-e-cenários-de-demonstração)
3. [Arquitetura](#arquitetura)
4. [Como o agent decide o que fazer](#como-o-agent-decide-o-que-fazer)
5. [Transparência](#transparência)
6. [Como garanti a qualidade das decisões](#como-garanti-a-qualidade-das-decisões)
7. [Modelo de linguagem: escolha e custo](#modelo-de-linguagem-escolha-e-custo)
8. [Segurança e privacidade](#segurança-e-privacidade)
9. [Principais trade-offs](#principais-trade-offs)
10. [O que eu faria com mais tempo](#o-que-eu-faria-com-mais-tempo)
11. [Deploy](#deploy)
12. [Uso de IA no desenvolvimento](#uso-de-ia-no-desenvolvimento)

---

## Como rodar

**Requisitos:** Node.js 22 e uma chave de API gratuita de um provedor de LLM (veja [Modelo de linguagem](#modelo-de-linguagem-escolha-e-custo)). Não há banco para instalar: os dados ficam em um arquivo SQLite local.

```bash
npm install
cp .env.example .env        # no PowerShell: Copy-Item .env.example .env
```

Edite o `.env`:

1. **`SESSION_SECRET`**: gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. **`LLM_API_KEY`**: chave do provedor escolhido. No Groq (padrão recomendado), crie em `console.groq.com/keys`; é gratuito e não pede cartão.

Depois:

```bash
npm run db:reset            # cria o banco e carrega os dados de exemplo (apaga tudo que existir)
npm run dev                 # http://localhost:3000
```

Entre com qualquer conta da [seção de demonstração](#contas-e-cenários-de-demonstração) e **qualquer senha**.

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `SESSION_SECRET` | obrigatória | Assina o cookie de sessão (32+ caracteres) |
| `LLM_PROVIDER` | `groq` | `groq`, `gemini`, `openrouter`, `ollama`, `openai` ou `anthropic` |
| `LLM_MODEL` | `qwen/qwen3.8-27b` | ID do modelo no provedor (confira a lista do console do provedor: os IDs mudam) |
| `LLM_API_KEY` | obrigatória, exceto com `ollama` | Chave do provedor |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Só com `LLM_PROVIDER=ollama` |
| `DATABASE_URL` | `file:./data/nexo.db` | Arquivo SQLite (libSQL) |
| `MAX_MESSAGES_PER_SESSION` | `30` | Limite de mensagens por sessão de login |
| `TICKETS_FAILURE_RATE` | `0` | De 0 a 1: probabilidade de cada chamada ao sistema de chamados falhar (simula o legado instável) |
| `SHOW_DEMO_ACCOUNTS` | `true` | Mostra as contas de demonstração na tela de login |

A configuração do LLM só é validada quando o modelo é usado pela primeira vez: uma chave ausente não derruba login, banco nem testes.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (o `next lint` foi removido no Next 16) |
| `npm run typecheck` | TypeScript estrito |
| `npm test` | Suíte de testes (Vitest), sem chamar o modelo |
| `npm run db:reset` | Recria o banco e o seed. **Destrutivo** |
| `npm run eval:classifier` | Avalia o classificador de intenção com o modelo real (17 casos) |
| `npm run turn:smoke -- "mensagem" email` | Roda um turno completo do agent e imprime o trace |
| `npm run agent:smoke` | Valida Mastra + provedor + tool calling |
| `npm run api:smoke` | Login + chat com streaming contra o servidor |
| `npm run console:smoke` | Segurança e fluxo do analista contra o servidor |

Os scripts `api:smoke` e `console:smoke` precisam do `npm run dev` rodando em outro terminal e alteram o banco: rode `npm run db:reset` antes de repeti-los.

---

## Contas e cenários de demonstração

Qualquer senha. Os dados são relativos ao momento do `db:reset`, então "vencido" e "reabrível" nunca envelhecem.

| Conta | Papel | O que demonstra |
|---|---|---|
| `diego.ramos@nexo.com.br` | Funcionário | Conta "limpa": dúvida respondida pela central (VPN erro 809), abertura de chamado do início ao fim |
| `bruno.tavares@nexo.com.br` | Funcionário | `INC-20298` (VPN no Windows 11) **vencido**: consulta oferece falar com um analista |
| `ana.souza@nexo.com.br` | Funcionário | Vários chamados: `INC-20311` vencido, `INC-20150` reabrível (resolvido há 4 dias), `INC-20044` não reabrível (9 dias). A conversa dela já está **na fila do analista** |
| `carla.mendes@nexo.com.br` | Funcionário | Chamado **crítico** (`INC-20322`) já transferido; também tem um chamado parecido com o da Ana (teste de privacidade) |
| `elisa.prado@nexo.com.br` | Funcionário | Conversa já **assumida** pela Marina |
| `gabriela.rocha@nexo.com.br` | Funcionário | Conversa transferida porque o **agent não teve segurança** (confiança 31%) |
| `rafael.lima@nexo.com.br` | Analista N2 | Console do analista |
| `marina.costa@nexo.com.br` | Analista N1 | Segundo analista (para testar o conflito de "assumir") |

### Roteiro sugerido

| Faça | Esperado |
|---|---|
| Diego: "Minha VPN dá erro 809, o que faço?" | Responde pelo artigo da central, **sem abrir chamado**, e pergunta a versão do Windows (a regra do artigo depende dela). Chips: *entendeu o pedido · buscou na central de ajuda* |
| Diego: "Preciso de um segundo monitor para trabalhar em casa" e responda às opções rápidas | Rascunho com tipo, categoria, **prioridade com prazo** e quem é afetado. **Confirmar** cria o chamado; antes disso nada é criado |
| Em qualquer resposta: **Ver detalhes da decisão** | O que entendeu, intenção, confiança, por quê, ações com tempo, regras em português, modelo, latência e tokens |
| Bruno: "Como está o INC-20298?" | Card com **prazo vencido** e os botões *Falar com um analista · Adicionar informações · Não, obrigado* |
| Ana (com o console aberto em outra janela como Rafael) | A tela se atualiza sozinha em até 4 s quando o analista assume, responde e devolve |
| Rafael e Marina assumem a mesma conversa ao mesmo tempo | Um vence; o outro recebe "a conversa mudou de estado" e a tela se atualiza |
| Funcionário tenta abrir `/console`, ou analista tenta o `/chat` | Redirecionamento (e 403 na API) |
| Pedir o chamado da Carla estando logado como Ana | O agent diz que só vê os chamados do próprio funcionário; a consulta é filtrada na query |
| `TICKETS_FAILURE_RATE=1` no `.env` e reiniciar | Sistema de chamados "fora do ar": avisos amigáveis, histórico continua carregando, nada é criado em duplicidade |

---

## Arquitetura

O princípio que organiza tudo: **o LLM interpreta e conversa; o código garante as regras.** Privacidade, confirmação antes de escrever, prazos, reabertura, duplicidade, prioridade, pausa do agent e limite de mensagens são código determinístico e testado. O modelo nunca recebe o e-mail do usuário como parâmetro e nenhuma ferramenta dele grava um chamado.

```
 Navegador                        Servidor (Next.js, TypeScript estrito)
┌───────────────┐   HTTP / SSE   ┌─────────────────────────────────────────────────────────────┐
│ features/     │ ─────────────▶ │ app/api/*            rotas finas: sessão, validação, erros │
│ components/   │ ◀───────────── │   │                                                         │
│ lib/client/   │                │ server/              serialização explícita, stream do chat │
│ (reducers,    │                │   │                                                         │
│  SSE, parser) │                │ agent/               turn/  fluxo, guardrails, confirmação  │
└───────────────┘                │   │                  llm/   porta do modelo + adaptador Mastra
                                 │   │                  tools/ ações do turno (sem LLM)       │
                                 │ services/            chamados, central, conversas, console, │
                                 │   │                  usuários, legado instável (retry)      │
                                 │ db/                  Drizzle + libSQL (SQLite)              │
                                 │ lib/domain/          regras puras (sem Next, banco ou LLM)  │
                                 └─────────────────────────────────────────────────────────────┘
```

Dependências em uma direção só: `domain ← services ← agent ← server ← app`. `lib/client` depende apenas de tipos do domínio e dos DTOs.

```
src/
├── app/                 páginas e rotas: (employee)/chat, perfil · (analyst)/console · login · api/
├── features/            telas: login, chat, console, profile
├── components/          base de UI (botão, campo, shell, logo)
├── lib/
│   ├── domain/          TypeScript puro
│   │   ├── model/       enums, schemas Zod, DecisionTrace, contrato de UI
│   │   ├── rules/       prioridade, prazos (SLA), duplicidade, reabertura, estados, confiança
│   │   └── utils/       horas úteis, normalização de texto, formatação
│   ├── client/          lógica pura da interface (reducers, SSE, markdown, clientes de API)
│   └── auth/            sessão JWT em cookie httpOnly, rate limit, guards
├── services/            chamados, central de ajuda, conversas, console do analista, usuários, legado
├── agent/
│   ├── tools/           ações do turno, gravador do trace, nomes das ferramentas
│   ├── llm/             porta do modelo, configuração, adaptador do Mastra, prompts, classificação
│   ├── turn/            orquestrador (runTurn), guardrails, pré-busca, histórico, confirmação
│   └── testing/         ambiente de teste e LLM falso
├── server/              DTOs, stream do chat, botões Confirmar/Cancelar
└── db/                  schema, seed, utilitários de teste
scripts/                 smokes e avaliação com o modelo real
```

**Serviço de chamados simulado, separado do agent:** `services/tickets.ts` é o único caminho para ler ou escrever chamados. Toda chamada passa por `callLegacySystem` (`services/legacy.ts`), que simula a instabilidade do sistema legado e faz retry com backoff exponencial.

**Persistência:** conversas, mensagens (com trace e elementos de UI), chamados, rascunho pendente e **o estado de cada conversa** (com o agent, na fila, com um analista, encerrada) ficam no SQLite e sobrevivem a reinício.

---

## Como o agent decide o que fazer

Cada mensagem passa por seis etapas (`src/agent/turn/run-turn.ts`):

```
mensagem
  1. Conversa com analista ou na fila?   → só registra a mensagem; o agent não responde      (código)
  2. Limite de 30 mensagens por sessão?  → bloqueia, sem chamar o modelo                      (código)
  3. Classificar                          → intenção, entendimento, confiança, porquê        (LLM, saída estruturada Zod)
  4. Rotear                               → transferir / fora de escopo / confirmar / agent  (código)
  5. Consultar (pré-busca)                → central de ajuda e chamados do funcionário       (código)
  6. Responder, com as ferramentas da intenção, em streaming                                  (LLM)
  → grava a mensagem com o DecisionTrace (ações, regras, tokens, latência)
```

### Roteamento (etapa 4): função pura, testada

| Situação | Decisão |
|---|---|
| Confiança < 0,55 | **Transfere para um analista** com resumo ("o agent não teve segurança") |
| Pedido de analista (inclui o botão da oferta) | Transfere |
| Fora de TI (RH, financeiro, facilities) | Redireciona, **sem chamar o modelo principal** |
| "Sim" digitado com rascunho pendente e confiança ≥ 0,8 | Executa o rascunho |
| "Sim" digitado com confiança entre 0,55 e 0,8 | Pede para usar o botão Confirmar |
| Qualquer outra | Agent com as ferramentas da intenção |

### O que o código consulta antes do modelo (etapa 5)

| Intenção | Consultas |
|---|---|
| Dúvida | Central de ajuda |
| Abrir chamado | Central de ajuda **e** chamados do funcionário (para não duplicar) |
| Consultar / atualizar | O chamado citado (`INC-123`) ou, sem número, a lista |

"Buscar antes de abrir" e "não duplicar" são regras de negócio; por isso não dependem de o modelo lembrar. Um teste real mostrou o modelo pulando essas buscas quando elas eram ferramentas dele.

### Ferramentas do modelo

Só três, e só as da intenção: `askUser` (opções rápidas), `proposeTicket` e `proposeTicketUpdate`. **Nenhuma grava nada**: elas preparam um rascunho validado (Zod) que fica pendente no banco. A criação, a atualização ou a reabertura só acontecem quando o funcionário confirma (botão ou "sim" com alta confiança), pela mesma função (`executePending`), de forma atômica (duplo clique nunca cria dois chamados).

### Regras do Anexo A e onde vivem

| Regra | Onde |
|---|---|
| Prioridade (impacto × urgência), com o motivo | `lib/domain/rules/priority.ts`: tabela de regras ordenada; o resultado inclui o `ruleId` |
| Prazos 1 h / 4 h úteis / 3 dias úteis / 5 dias úteis | `rules/sla.ts` + `utils/business-time.ts` (8h às 18h, seg a sex; crítico em horas corridas) |
| "Vencido" não é status: é derivado | `isOverdue` |
| Sem duplicidade | `rules/duplicates.ts` + `services/tickets.ts` (`createTicket` devolve `duplicate`) |
| Reabrir resolvido em até 7 dias | `rules/ticket-rules.ts` |
| Transferência: pedido, crítico, vencido, baixa confiança | `turn/guardrails.ts` e `turn/confirm.ts` (crítico transfere após criar) |
| Privacidade | Filtro na query SQL (`services/tickets.ts`, `services/conversations.ts`) |
| Escopo só TI | Classificação + redirecionamento sem modelo |
| Agent pausado com o analista | `lib/domain/rules/conversation-state.ts` |

---

## Transparência

Duas camadas, na tela do funcionário **e** do analista:

1. **Chips acima de cada resposta:** "entendeu o pedido", "buscou na central de ajuda", "consultou seus chamados", "classificou a prioridade".
2. **"Ver detalhes da decisão":** o que o agent entendeu, intenção, **confiança** (com as mesmas faixas que o roteamento usa), por quê, cada ação com resumo e duração, **regras aplicadas em português** (por exemplo "Impede uma pessoa de trabalhar", "Verificou chamados parecidos antes de abrir um novo"), motivo de transferência, modelo, latência e **tokens por turno**.

Os botões Confirmar e Cancelar também geram trace ("sem modelo", 0 tokens, regra `explicit-confirmation`): mesmo as ações que não passam pelo modelo são explicáveis. Tudo isso é gravado no banco (`messages.trace`), então reabrir a conversa outro dia mostra o mesmo histórico.

---

## Como garanti a qualidade das decisões

**1. Regras de negócio testadas sem o modelo.** A suíte (mais de 150 testes, `npm test`) cobre prazos em horas úteis, prioridade, duplicidade, reabertura, estados da conversa, privacidade, concorrência (dois analistas assumindo, duplo clique em Confirmar, limite de mensagens), legado instável, e o orquestrador do turno inteiro.

**2. O orquestrador é testado com um LLM falso.** O modelo fica atrás de uma interface (`LlmPort`); os testes de comportamento do agent (pausa, limite, transferência por baixa confiança, confirmação digitada, cota esgotada, consultas antes do modelo) rodam em milissegundos, sem rede e sem custo, com o resto do fluxo executando de verdade contra um banco real temporário.

**3. Avaliação do classificador com o modelo real** (`npm run eval:classifier`): 17 casos com a intenção esperada, incluindo respostas curtas que dependem do contexto ("Só eu"), confirmação com rascunho pendente, recusa educada e uma tentativa de injeção de prompt. Na primeira rodada: **16 de 17**, com ~0,5 a 0,7 s por classificação. O erro (`"isso aí"` classificado como conversa com 90% de confiança) levou a um ajuste no prompt, e é também a prova de que **confiança alta não é correção**, o que justifica o limiar de 0,8 para ações de escrita.

**4. Smokes com o servidor real:** `turn:smoke` (trace de um turno completo), `api:smoke` (streaming real), `console:smoke` (autorização 401/403, conflito 409, fluxo do analista).

**5. Portões de verificação:** `lint`, `typecheck` (estrito, com `noUncheckedIndexedAccess`), `test` e `build`. O lint já pegou um problema real (efeito disparando buscas e estado em cascata no console), corrigido no código em vez de desligar a regra.

**Bugs que a própria verificação encontrou** (todos corrigidos, com teste): a consulta interna de chamados mostrava uma lista na tela sem o funcionário pedir; uma regra de prazo vencido aparecia no trace sem ter sido aplicada; consulta com um único chamado não mostrava o card. Está tudo em `docs/DECISIONS.md`.

---

## Modelo de linguagem: escolha e custo

**Provedor padrão: Groq, modelo `qwen/qwen3.8-27b`.** Requisito: gratuito. Escolhido por **latência medida** e por funcionar em laço de ferramentas:

| Provedor / modelo | Resultado |
|---|---|
| Gemini 3.x (rota nativa) | Funciona em tool calling, mas **142 a 295 s por chamada**, sem erros e sem retries (plano gratuito) |
| Gemini 3.x (endpoint OpenAI-compatível) | Falha em laço de ferramentas: exige repassar as *thought signatures* |
| Gemini 2.5 | Indisponível para contas novas |
| Groq `gpt-oss-120b` | Falha na 2ª chamada: modelo de raciocínio devolve `reasoning_content`, que o provedor rejeita na volta |
| **Groq `qwen/qwen3.8-27b`** | **~1 s por chamada; tool calling íntegro** |
| Ollama (local) | Suportado por configuração; depende do hardware |

A troca de provedor é só `LLM_PROVIDER`/`LLM_MODEL`/`LLM_API_KEY` no `.env`; o acoplamento ao Mastra está em um único arquivo (`src/agent/llm/model.ts`).

**Privacidade:** planos gratuitos de alguns provedores podem usar o conteúdo para melhorar produtos. Aceitável aqui porque todos os dados são fictícios; com dados reais de funcionários, usar Ollama local ou um plano sem retenção.

**Custo por conversa (medido, em tokens de entrada por mensagem):**

| Situação | Tokens | Chamadas ao modelo |
|---|---|---|
| Dúvida respondida pela central | ~500 a 900 | 2 |
| Consulta de chamados | ~1.300 a 1.400 | 2 |
| Abertura de chamado (com pergunta de impacto) | ~3.000 | 2 |

Uma sessão cheia de 30 mensagens fica, por estimativa, na casa de 30 a 90 mil tokens. Alavancas para reduzir, já mapeadas: histórico de 10 para 6 mensagens, instruções mais curtas, pergunta de impacto determinística, cache de classificação. O custo também é contido por: limite de 30 mensagens por sessão, rate limit por IP no login, `maxRetries: 0` (retries automáticos queimam cota gratuita em silêncio), `maxSteps` fixo e fora-de-escopo/transferência/confirmação **sem chamar o modelo principal**.

**Cota esgotada é um estado esperado:** o chat responde com mensagem amigável e oferece falar com um analista, em vez de quebrar.

---

## Segurança e privacidade

- **Chamados de um funcionário nunca chegam a outro, em camadas:** (1) filtro `WHERE ... requester_email = ?` na própria query; (2) o e-mail vem da sessão no servidor e **nenhuma ferramenta do agent aceita e-mail como parâmetro**, então um prompt injection não consegue apontar para outra pessoa; (3) chamado alheio e chamado inexistente devolvem a mesma resposta (não permite enumerar IDs); (4) o cliente nunca informa o ID da conversa; (5) DTOs de saída são listas explícitas de campos.
- **Sessão:** JWT assinado em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção. O papel que vale é o do **banco**, recarregado a cada ação sensível, não o do cookie.
- **Autorização de verdade nas rotas e nos serviços** (`requireUser`, `requireAnalyst`); o proxy de rotas é só experiência de uso. Funcionário recebe 403 no console; analista recebe 403 no chat (testado contra o servidor).
- **Login:** mensagem única para "e-mail inexistente" e "senha errada"; rate limit por IP + e-mail (5 falhas em 10 min, `429` com `Retry-After`); redirecionamento pós-login só para destinos conhecidos.
- **Saída do modelo nunca vira HTML:** o renderizador de Markdown devolve dados e a tela só cria nós de texto (testado com `<img onerror>`).
- **Segredos fora do código:** tudo em `.env` (ignorado pelo Git), com `.env.example` documentado; variáveis validadas com Zod na inicialização. Erros inesperados nunca expõem stack trace ou detalhe interno ao cliente.
- **Autenticação de demonstração isolada:** o PRD manda aceitar qualquer senha; está concentrada em `services/users.ts` (`authenticate`) e é o único ponto a trocar por SSO/hash.

---

## Principais trade-offs

| Decisão | Ganho | Custo |
|---|---|---|
| Duas chamadas ao modelo por mensagem (classificar + responder) | Trace honesto, roteamento determinístico, economia nos casos sem modelo principal | Mais tokens por mensagem |
| Consultas feitas pelo código antes do modelo | Regras de negócio garantidas; menos passos de ferramenta | Pode consultar sem necessidade (resposta curta repete a busca) |
| Ferramentas só preparam rascunho | O modelo não consegue escrever nada | Confirmar exige um passo a mais para o funcionário |
| Duplicidade por sobreposição de tokens (limiar 0,6, mínimo 2 termos) | Simples, previsível e explicável no trace | Não entende sinônimos ("lento" x "travando") |
| Busca na central por palavras-chave com pesos | Determinística, sem dependência externa | Carrega todos os artigos (ok para 8, não para milhares) |
| SQLite/libSQL | Zero instalação; sobrevive a reinício; mesmo driver do Mastra | Exige volume persistente no deploy |
| Atualização por *polling* (4 s no chat, 4-5 s no console) | Funciona atrás de qualquer proxy; simples | Não é instantâneo |
| Prazo parte de `lastUpdatedAt`; complemento do funcionário **não** reinicia o prazo, só a reabertura | Impede "zerar" um chamado vencido escrevendo nele | Regra que o PRD não define explicitamente |
| Sem feriados e com fuso fixo (UTC-3) | Sem dependência externa | Feriados contam como dia útil |
| Streaming por SSE sobre POST, sem retomada | Simples | Conexão que cai no meio recarrega o histórico |

---

## O que eu faria com mais tempo

- **Busca e duplicidade semânticas:** embeddings (ou FTS5) na central de ajuda e na detecção de duplicidade, com o LLM desempatando candidatos.
- **Fallback entre provedores de LLM** quando a cota de um acaba; cache de classificação; resumo de histórico em conversas longas.
- **Pergunta de impacto determinística** (sem passar pelo modelo) para reduzir o custo da abertura de chamado.
- **Notificação em tempo real** (SSE) para o console e para o chat com analista, no lugar de *polling*; retomada de stream.
- **Leitura por analista** (mensagens "não lidas" de verdade), nome do analista em todas as mensagens, e disponibilidade do analista alterando o roteamento.
- **Edição do rascunho campo a campo**, em vez de pedir ao agent um novo rascunho.
- **Feriados e fuso configurável** no cálculo de prazos; pausar o prazo enquanto se espera o funcionário.
- **Sessões revogáveis** (tabela ou lista de revogação) e SSO/OIDC no lugar da autenticação de demonstração; rate limit compartilhado (Redis) para várias instâncias.
- **Regra de lint** (`no-restricted-imports`) para impedir dependências na direção errada entre as camadas; pipeline de CI rodando lint, typecheck, testes e build.
- **Observabilidade:** exportar os traces para uma ferramenta de monitoramento e medir taxa de transferência, de duplicidade evitada e de abandono do rascunho.

---

## Deploy

**Não realizado nesta entrega** (é um diferencial opcional). O caminho planejado:

- **Plataforma com disco persistente** (Railway, Fly.io ou Render), porque o SQLite precisa de volume; em Vercel o arquivo não persiste. Alternativa: Turso (libSQL hospedado), trocando só `DATABASE_URL`.
- Variáveis na plataforma: `SESSION_SECRET` **novo** (nunca reutilizar o local), `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `DATABASE_URL`.
- **Proteção de custo:** o limite de 30 mensagens por sessão, o rate limit de login e a cota do plano gratuito já limitam o abuso; para múltiplas instâncias, mover o rate limit para um armazenamento compartilhado.
- Manter `SHOW_DEMO_ACCOUNTS=true` apenas para a avaliação; rodar `npm run db:reset` uma vez no ambiente.

Link do deploy: _não publicado_.

---

## Uso de IA no desenvolvimento

O projeto foi desenvolvido em conjunto com um assistente de IA (Claude), arquivo por arquivo, com cada decisão registrada em [`docs/DECISIONS.md`](docs/DECISIONS.md). O assistente propôs o código; as medições (latência por provedor, tokens por turno, resultados de lint, testes e smokes) foram feitas no ambiente real e várias propostas foram revistas por causa delas (troca de provedor, pré-busca em código, correção da limpeza dos testes no Windows). Todo o código está coberto pela suíte e pelos portões de verificação descritos acima e pode ser explicado e alterado ao vivo; o mapa "pedido de mudança → arquivo" está no final do `DECISIONS.md`.
