import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/cx";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
    label: string;
    /** Conteúdo à direita do rótulo (ex.: "Esqueci minha senha"). */
    labelAside?: ReactNode;
    /** Conteúdo dentro do campo, à direita (ex.: mostrar/ocultar senha). */
    trailing?: ReactNode;
};

export function TextField({ label, labelAside, trailing, className, ...input }: Props) {
    const id = useId();
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor={id} className="text-sm font-medium text-slate-700">
                    {label}
                </label>
                {labelAside}
            </div>
            <div className="relative">
                <input
                    {...input}
                    id={id}
                    className={cx(
                        "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition",
                        "placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20",
                        `${trailing && "pr-20"}`,
                        className,
                    )}
                />
                {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
            </div>
        </div>
    );
}