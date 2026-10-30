import { createMastraLlm } from "../src/agent/llm/mastra-adapter";
import { runTurn } from "../src/agent/turn/run-turn";
import { services } from "../src/services/index";

const [message = "Meu teclado parou de funcionar e preciso entregar um relatório hoje", email = "bruno.tavares@nexo.com.br"] =
    process.argv.slice(2);

async function main() {
    const conv = await services.conversations.getOrCreateForUser(email);
    if (conv.state !== "with_agent") {
        console.log(`Conversa de ${email} está em "${conv.state}". Rode "npm run db:reset" ou use outro usuário.`);
        return;
    }
    await services.conversations.startSession(email, conv.id);

    const llm = createMastraLlm();
    console.log(`> ${email} (${llm.modelId}): ${message}\n`);

    for await (const ev of runTurn({ llm, services }, { userEmail: email, conversationId: conv.id, text: message })) {
        if (ev.type === "text") process.stdout.write(ev.delta);
        else if (ev.type === "agent_message") {
            console.log("\n\n--- TRACE ---\n" + JSON.stringify(ev.message.trace, null, 2));
            console.log("--- UI ---\n" + JSON.stringify(ev.message.ui));
        } else if (ev.type !== "user_message") console.log(`[${ev.type}]`, JSON.stringify(ev));
    }
}

main().catch((err) => {
    console.error("FALHOU:", err);
    process.exit(1);
});