// Peças comuns do Marketing da V2: o foco, o ícone de cada canal, os euros e a escolha em chips.
import { Globe, Handshake, Megaphone, Search, Signpost, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur } from "../motor";
import type { Canal } from "../toquesDocs";

export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** O ícone e a cor de cada canal (a cor só no ícone). */
export const ICONE_CANAL: Record<Canal, { i: LucideIcon; cor: string }> = {
  "Redes sociais pagas": { i: Megaphone, cor: "bg-violet-100 text-violet-700" },
  Pesquisa: { i: Search, cor: "bg-sky-100 text-sky-700" },
  Offline: { i: Signpost, cor: "bg-amber-100 text-amber-800" },
  Parcerias: { i: Handshake, cor: "bg-emerald-100 text-emerald-700" },
  Outros: { i: Globe, cor: "bg-slate-100 text-slate-700" },
};

/** Euros sem cêntimos quando são zero: "1.130 €". */
export const euros = (x: number): string => `${eur(x).replace(/,00$/, "")} €`;

/** Uma escolha em chips (radiogroup): alvos de 44 px, a escolhida marcada pelo contorno e pelo peso, nunca pela cor do texto. */
export function Chips<T extends string>({ rotulo, opcoes, valor, escolher }: { rotulo: string; opcoes: readonly { id: T; nome: string }[]; valor: T | null; escolher: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="text-[15px] font-medium">{rotulo}</legend>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={valor === o.id} onClick={() => escolher(o.id)}
            className={cn("min-h-11 rounded-full border px-4 text-[15px]", FOCO,
              valor === o.id ? "border-foreground bg-muted font-semibold" : "border-input bg-card hover:bg-muted")}>
            {o.nome}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
