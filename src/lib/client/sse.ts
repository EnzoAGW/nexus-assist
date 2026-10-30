export interface SseEvent {
  event: string;
  data: unknown;
}
export interface SseMessage {
  event: string;
  data: unknown;
}

export const encodeSse = ({ event, data }: SseEvent): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Transmite eventos ao cliente. Se o cliente desconectar, a fonte continua sendo consumida até o fim:
 * o turno do agent termina e fica gravado no banco, só deixa de ser enviado.
 */
export function sseResponse(source: AsyncIterable<SseEvent>, onError: (err: unknown) => SseEvent): Response {
  const encoder = new TextEncoder();
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: SseEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          open = false; // o cliente já foi embora
        }
      };

      void (async () => {
        try {
          for await (const e of source) send(e);
        } catch (err) {
          send(onError(err));
        } finally {
          if (open) {
            try {
              controller.close();
            } catch {
              // já fechado
            }
          }
        }
      })();
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) data.push(line.slice(6));
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) as unknown };
  } catch {
    return null; // bloco malformado é ignorado, o stream continua
  }
}

/** Parser incremental: aceita pedaços quebrados em qualquer ponto. */
export function createSseParser() {
  let buffer = "";
  return {
    push(chunk: string): SseMessage[] {
      buffer += chunk;
      const out: SseMessage[] = [];
      for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
        const message = parseBlock(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (message) out.push(message);
      }
      return out;
    },
  };
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}