import { useEffect, useRef, useState } from "react";
import { Sliders } from "./icons";
import { cx } from "./ui";

/**
 * "Campos": escolher que colunas se veem num editor. A escolha fica no
 * browser de quem a fez (cada um vê o que precisa: o gestor os tempos, o
 * comercial só o essencial).
 */
export default function CamposVisiveis<K extends string>({
  campos,
  visiveis,
  aoMudar,
}: {
  campos: readonly { chave: K; rotulo: string; dica?: string }[];
  visiveis: Record<K, boolean>;
  aoMudar: (v: Record<K, boolean>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const n = campos.filter((c) => visiveis[c.chave]).length;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
          aberto ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
        )}
        aria-expanded={aberto}
      >
        <Sliders width={13} height={13} /> Campos <span className="opacity-60">{n}/{campos.length}</span>
      </button>
      {aberto && (
        <div className="absolute right-0 z-20 mt-1 w-64 origin-top-right animate-in-pop rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Colunas visíveis</p>
          {campos.map((c) => (
            <label key={c.chave} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50" title={c.dica}>
              <input
                type="checkbox"
                className="mt-0.5 accent-brand"
                checked={!!visiveis[c.chave]}
                onChange={(e) => aoMudar({ ...visiveis, [c.chave]: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-slate-700">{c.rotulo}</span>
                {c.dica && <span className="block text-xs text-slate-400">{c.dica}</span>}
              </span>
            </label>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-100 px-2 pt-1.5 text-xs">
            <button
              type="button"
              className="text-slate-500 hover:text-slate-800"
              onClick={() => aoMudar(Object.fromEntries(campos.map((c) => [c.chave, true])) as Record<K, boolean>)}
            >
              Mostrar todos
            </button>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-800"
              onClick={() => aoMudar(Object.fromEntries(campos.map((c) => [c.chave, false])) as Record<K, boolean>)}
            >
              Só o nome
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
