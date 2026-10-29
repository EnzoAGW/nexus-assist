export interface SseEvent {
  event: string;
  data: unknown;
}

/** JSON.stringify nunca emite quebra de linha crua, então um evento não consegue "escapar" do formato. */
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