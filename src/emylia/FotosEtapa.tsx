// As fotografias de uma etapa da visita (13/10/2026): o exterior, o interior e a área de intervenção têm
// cada um as suas. Para fechar a visita basta haver fotografias no total (ou marcar que o cliente não quis).
import { Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fotosPor, type EtapaFotos, type Negocio } from "./motor";
import { aValidar } from "./CamposFase";
import type { Ctx } from "./pecas";

const TITULO: Record<EtapaFotos, string> = { exterior: "Fotografias do exterior", interior: "Fotografias do interior", area: "Fotografias da área de intervenção" };
const DICA: Record<EtapaFotos, string> = {
  exterior: "Fachada, entrada, acesso e estacionamento",
  interior: "Caminho até à área, portas e elevador",
  area: "A área toda, as paredes e o que se vai demolir",
};

export function FotosEtapa({ ctx, d, etapa, simples }: { ctx: Ctx; d: Negocio; etapa: EtapaFotos; simples?: boolean }) {
  const { A, run, go } = ctx;
  const v = d.visita, n = fotosPor(v)[etapa], recusou = d.f.diag_cliente_recusou_fotos === "Sim", semFotos = !(v.fotos > 0) && !recusou;
  return (
    <section aria-label={TITULO[etapa]} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className={simples ? "text-base font-semibold" : "text-sm font-semibold"}>{TITULO[etapa]}</h3>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex -space-x-2">
          {Array.from({ length: Math.min(n, 6) }).map((_, i) => (
            <span key={i} className="grid h-12 w-12 place-items-center rounded-lg border-2 border-card bg-gradient-to-br from-primary/20 to-accent/20 text-primary"><Camera className="h-4 w-4" /></span>
          ))}
        </div>
        {/* 27/10: a dica do que fotografar só enquanto não há fotografias */}
        <span className="text-sm text-muted-foreground">{n > 0 ? `${n} ${n === 1 ? "fotografia" : "fotografias"}` : DICA[etapa]}</span>
        <Button variant="outline" size="sm" disabled={v.fechada} onClick={go(() => A.foto(d.id, etapa))}><Camera className="mr-1.5 h-4 w-4" />Tirar foto</Button>
      </div>
      {etapa === "area" && (
        <>
          {aValidar(d, "fotos") && semFotos && <p className="text-[15px] font-medium text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">Tire pelo menos uma fotografia (em qualquer etapa), ou marque que o cliente não quis.</p>}
          {/* 27/10: uma só marca (o "Sim / Não" de uma pergunta negativa confundia): marcada, conta como as fotografias feitas */}
          <button type="button" aria-pressed={recusou} disabled={v.fechada} onClick={() => run(() => A.campo(d.id, "diag_cliente_recusou_fotos", recusou ? "" : "Sim"))}
            className={cn("flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-[15px] transition-colors disabled:opacity-60",
              recusou ? "border-primary bg-primary/5 font-medium" : "border-input hover:border-foreground/40")}>
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", recusou ? "border-primary bg-primary text-primary-foreground" : "border-input")} aria-hidden="true">{recusou && <Check className="h-3.5 w-3.5" />}</span>
            O cliente não quis fotografias
          </button>
        </>
      )}
    </section>
  );
}
