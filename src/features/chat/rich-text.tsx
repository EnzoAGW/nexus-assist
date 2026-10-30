import { parseMarkdown, type Inline } from "@/lib/client/markdown";

function Line({ parts }: { parts: Inline[] }) {
    return (
        <>
            {parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <span key={i}>{p.text}</span>))}
        </>
    );
}

export function RichText({ text }: { text: string }) {
    return (
        <div className="space-y-2 text-sm leading-relaxed">
            {parseMarkdown(text).map((b, i) =>
                b.type === "ul" ? (
                    <ul key={i} className="list-disc space-y-1 pl-5">
                        {b.items.map((item, j) => (
                            <li key={j}><Line parts={item} /></li>
                        ))}
                    </ul>
                ) : (
                    <p key={i}>
                        {b.lines.map((line, j) => (
                            <span key={j}>{j > 0 && <br />}<Line parts={line} /></span>
                        ))}
                    </p>
                ),
            )}
        </div>
    );
}