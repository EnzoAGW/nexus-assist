import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const TEST_DB = /^test-.*\.db(-wal|-shm)?$/;

function purge(): void {
    const dir = path.resolve(process.cwd(), "data");
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
        if (!TEST_DB.test(name)) continue;
        try {
            rmSync(path.join(dir, name), { force: true });
        } catch {
            // ainda em uso: a próxima execução limpa
        }
    }
}

export default function setup(): () => void {
    purge();
    return purge;
}