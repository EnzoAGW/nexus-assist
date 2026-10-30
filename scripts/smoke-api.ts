const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const [message = "Minha VPN dá erro 809, o que faço?", email = "diego.ramos@nexo.com.br"] = process.argv.slice(2);

interface Block {
  event: string;
  data: unknown;
}

function parseBlock(raw: string): Block | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) data.push(line.slice(6));
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join("\n")) as unknown };
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "x", remember: false }),
  });
  console.log(`login: ${login.status}`);
  if (!login.ok) return console.log(await login.text());
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  console.log(`\n> ${email}: ${message}\n`);
  const started = performance.now();
  const at = () => `+${Math.round(performance.now() - started)}ms`.padStart(9);

  const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers, body: JSON.stringify({ text: message }) });
  console.log(`chat: ${res.status} ${res.headers.get("content-type")}`);
  if (!res.ok || !res.body) return console.log(await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textEvents = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = parseBlock(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (!block) continue;

      const d = block.data as Record<string, unknown>;
      if (block.event === "text") {
        textEvents++;
        console.log(`${at()}  text            ${JSON.stringify(d.delta)}`);
      } else if (block.event === "agent_message") {
        const trace = d.trace as { actions: { label: string }[]; usage: unknown } | null;
        console.log(`${at()}  agent_message   chips: ${trace?.actions.map((a) => a.label).join(" · ")}`);
        console.log(`${" ".repeat(9)}                  tokens: ${JSON.stringify(trace?.usage)}`);
      } else {
        console.log(`${at()}  ${block.event.padEnd(15)} ${JSON.stringify(block.data).slice(0, 160)}`);
      }
    }
  }
  console.log(`\neventos de texto: ${textEvents} (mais de 1 = chega em pedaços)`);

  const history = (await (await fetch(`${BASE}/api/chat`, { headers })).json()) as {
    messages?: unknown[];
    tickets?: unknown[] | null;
  };
  console.log(`histórico: ${history.messages?.length ?? "?"} mensagens | chamados: ${history.tickets?.length ?? "indisponível"}`);
}

main().catch((err) => {
  console.error("FALHOU:", err);
  process.exit(1);
});