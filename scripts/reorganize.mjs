// Move arquivos e reescreve os imports (alias "@/..." e relativos). Uso: node scripts/reorganize.mjs [--dry]
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry");

const D = "src/lib/domain";
const A = "src/agent";
const MOVES = {
    // domínio
    ...Object.fromEntries(["enums", "schemas", "trace", "trace.test"].map((f) => [`${D}/${f}.ts`, `${D}/model/${f}.ts`])),
    ...Object.fromEntries(
        ["priority", "sla", "ticket-rules", "duplicates", "conversation-state"].flatMap((f) => [
            [`${D}/${f}.ts`, `${D}/rules/${f}.ts`],
            [`${D}/${f}.test.ts`, `${D}/rules/${f}.test.ts`],
        ]),
    ),
    ...Object.fromEntries(
        ["business-time", "text"].flatMap((f) => [
            [`${D}/${f}.ts`, `${D}/utils/${f}.ts`],
            [`${D}/${f}.test.ts`, `${D}/utils/${f}.test.ts`],
        ]),
    ),
    [`${D}/format.ts`]: `${D}/utils/format.ts`,
    // agent/tools
    [`${A}/actions.ts`]: `${A}/tools/actions.ts`,
    [`${A}/actions.test.ts`]: `${A}/tools/actions.test.ts`,
    [`${A}/tools.ts`]: `${A}/tools/mastra-tools.ts`,
    [`${A}/turn.ts`]: `${A}/tools/recorder.ts`,
    // agent/llm
    [`${A}/llm.ts`]: `${A}/llm/port.ts`,
    [`${A}/llm.test.ts`]: `${A}/llm/port.test.ts`,
    [`${A}/llm-config.ts`]: `${A}/llm/config.ts`,
    [`${A}/llm-config.test.ts`]: `${A}/llm/config.test.ts`,
    [`${A}/model.ts`]: `${A}/llm/model.ts`,
    [`${A}/mastra-llm.ts`]: `${A}/llm/mastra-adapter.ts`,
    [`${A}/prompts.ts`]: `${A}/llm/prompts.ts`,
    [`${A}/classification.ts`]: `${A}/llm/classification.ts`,
    // agent/turn
    ...Object.fromEntries(
        ["run-turn", "guardrails", "history", "confirm", "prefetch"].flatMap((f) => [
            [`${A}/${f}.ts`, `${A}/turn/${f}.ts`],
            [`${A}/${f}.test.ts`, `${A}/turn/${f}.test.ts`],
        ]),
    ),
    // agent/testing
    [`${A}/testing.ts`]: `${A}/testing/helpers.ts`,
};

const abs = (p) => path.resolve(ROOT, p);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const posix = (p) => p.split(path.sep).join("/");
const noExt = (p) => p.replace(/\.tsx?$/, "");

function listFiles(dir) {
    const full = abs(dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(full, e.name);
        if (e.isDirectory()) return e.name === "node_modules" ? [] : listFiles(rel(p));
        return /\.tsx?$/.test(e.name) ? [p] : [];
    });
}

const files = [...listFiles("src"), ...listFiles("scripts")];
const known = new Set(files);
const move = new Map(Object.entries(MOVES).map(([from, to]) => [abs(from), abs(to)]));

const missing = [...move.keys()].filter((f) => !known.has(f));
if (missing.length > 0) {
    console.error("Arquivos não encontrados (nome diferente do esperado?):\n" + missing.map((f) => "  " + rel(f)).join("\n"));
    process.exit(1);
}

function resolveTarget(fromFile, spec) {
    let base;
    if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
    else return null;
    return [base + ".ts", base + ".tsx", path.join(base, "index.ts")].find((c) => known.has(c)) ?? null;
}

const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2/g;

function rewrite(file, content) {
    const newFile = move.get(file) ?? file;
    let changed = 0;
    const out = content.replace(IMPORT_RE, (match, lead, quote, spec) => {
        const target = resolveTarget(file, spec);
        if (!target) return match;
        const newTarget = noExt(move.get(target) ?? target);
        let newSpec;
        if (spec.startsWith("@/")) {
            newSpec = "@/" + posix(path.relative(path.join(ROOT, "src"), newTarget));
        } else {
            newSpec = posix(path.relative(path.dirname(newFile), newTarget));
            if (!newSpec.startsWith(".")) newSpec = "./" + newSpec;
        }
        if (newSpec === spec) return match;
        changed++;
        return `${lead}${quote}${newSpec}${quote}`;
    });
    return { out, changed };
}

// Calcula tudo em memória antes de tocar no disco.
const plan = files.map((file) => {
    const { out, changed } = rewrite(file, fs.readFileSync(file, "utf8"));
    return { file, newFile: move.get(file) ?? file, out, changed };
});

for (const p of plan) {
    if (p.newFile !== p.file) console.log(`mover   ${rel(p.file)} -> ${rel(p.newFile)} (${p.changed} imports)`);
    else if (p.changed > 0) console.log(`ajustar ${rel(p.file)} (${p.changed} imports)`);
}

if (DRY) {
    console.log("\n(dry-run: nada foi alterado)");
    process.exit(0);
}

for (const p of plan) {
    fs.mkdirSync(path.dirname(p.newFile), { recursive: true });
    fs.writeFileSync(p.newFile, p.out);
    if (p.newFile !== p.file) fs.unlinkSync(p.file);
}
console.log(`\nPronto: ${move.size} arquivos movidos.`);