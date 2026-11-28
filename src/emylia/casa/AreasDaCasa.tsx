// 28/11 (Rúben, Schroeder: «atualmente só temos uma área de intervenção, ou casa de banho ou cozinha, e neste caso é a casa toda»).
// O passo «Estúdio» da Visita com as áreas da casa: uma fila com cada área (cada uma com o seu Estúdio: a planta, as peças, os serviços)
// e «Casa toda» (as áreas juntas, CasaToda.tsx). «Juntar área» junta outra com um toque (Sala, Corredor, Casa de banho 2…) ou com o
// nome escrito («Casa de banho suite»). A área escolhida fica no endereço (&area=), para o Estúdio voltar a ela.
import { useState } from "react";
import { Check, Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { useParamUrl } from "../usarParamUrl";
import { EstudioNaVisita } from "../VisitaEstudio";
import { areasPorJuntar, comDivisao, divisoesDoNegocio, fDaDivisao, nomeDeArea, type DivisaoNegocio } from "../divisoesNegocio";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { CasaToda } from "./CasaToda";

const CASA = "casa";

export function AreasDaCasa({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const divs = divisoesDoNegocio(d.f, d.linha);
  const varias = divs.length > 1;
  const [qual, setQual] = useParamUrl<string>("area", "");
  const [juntar, setJuntar] = useState(false);
  const [nome, setNome] = useState("");
  const atual: DivisaoNegocio | null = qual === CASA && varias ? null : divs.find((x) => x.prefixo === qual) ?? divs[0];
  const juntarArea = (n: string) => {
    const limpo = nomeDeArea(n);
    if (!limpo) return;
    ctx.run(() => ctx.A.campo(d.id, "diag_tipo_area", comDivisao(d.f, limpo, d.linha)));
    setNome(""); setJuntar(false);
  };
  const sugestoes = areasPorJuntar(d.f, d.linha);
  const feito = (x: DivisaoNegocio) => !!projetoDoNegocio(fDaDivisao(d.f, x));
  const CHIP = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors",
    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-semibold">{varias ? `As áreas da casa (${divs.length})` : "A área da obra"}</h3>
          {!varias && <p className="text-sm text-muted-foreground">É a casa toda? Junte as outras áreas.</p>}
        </div>
        <div role="group" aria-label="As áreas da casa" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {varias && (
            <button type="button" aria-pressed={atual === null} onClick={() => setQual(CASA)} className={CHIP(atual === null)}>
              <Home className="h-4 w-4" aria-hidden="true" />Casa toda
            </button>
          )}
          {divs.map((x) => (
            <button key={x.prefixo || "principal"} type="button" aria-pressed={atual?.prefixo === x.prefixo} onClick={() => setQual(x.prefixo)} className={CHIP(atual?.prefixo === x.prefixo)}>
              {feito(x) && <Check className="h-4 w-4" aria-label="com projeto" />}{x.nome}
            </button>
          ))}
          <button type="button" aria-expanded={juntar} onClick={() => setJuntar((v) => !v)} className={cn(CHIP(false), "border-dashed text-muted-foreground")}>
            <Plus className="h-4 w-4" aria-hidden="true" />Juntar área
          </button>
        </div>
        {juntar && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => juntarArea(s)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-[15px] hover:border-primary/50">
                  <Plus className="h-4 w-4 text-primary" aria-hidden="true" />{s}
                </button>
              ))}
            </div>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); juntarArea(nome); }}>
              <label htmlFor={`area-nova-${d.id}`} className="sr-only">Outra área (o nome)</label>
              <input id={`area-nova-${d.id}`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Outra área: Casa de banho suite, Quarto do bebé…" maxLength={40}
                className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <Button type="submit" className="min-h-11" disabled={!nomeDeArea(nome)}>Juntar</Button>
            </form>
          </div>
        )}
      </div>
      {atual === null
        ? <CasaToda ctx={ctx} d={d} abrirArea={(x) => setQual(x.prefixo)} />
        : <EstudioNaVisita key={atual.prefixo || "principal"} ctx={ctx} d={d} div={atual} varias={varias} />}
    </div>
  );
}
