// As fotografias de uma etapa da visita (13/10/2026): o exterior, o interior e a área de intervenção têm
// cada um as suas. Para fechar a visita basta haver fotografias no total (ou marcar que o cliente não quis).
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fotosPor, type EtapaFotos, type Negocio } from "./motor";
import { Campos, aValidar } from "./CamposFase";
import type { Ctx } from "./pecas";

const TITULO: Record<EtapaFotos, string> = { exterior: "Fotografias do exterior", interior: "Fotografias do interior", area: "Fotografias da área de intervenção" };
const DICA: Record<EtapaFotos, string> = {
  exterior: "fachada, entrada, acesso e estacionamento",
  interior: "caminho até à área, portas e elevador",
  area: "a área toda, as paredes e o que se vai demolir",
};

export function FotosEtapa({ ctx, d, etapa, simples }: { ctx: Ctx; d: Negocio; etapa: EtapaFotos; simples?: boolean }) {
  const { A, run, go } = ctx;
  const v = d.visita, n = fotosPor(v)[etapa], semFotos = !(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim";
  return (
    <section aria-label={TITULO[etapa]} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className={simples ? "text-base font-semibold" : "text-sm font-semibold"}>{TITULO[etapa]}</h3>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex -space-x-2">
          {Array.from({ length: Math.min(n, 6) }).map((_, i) => (
            <span key={i} className="grid h-12 w-12 place-items-center rounded-lg border-2 border-card bg-gradient-to-br from-primary/20 to-accent/20 text-primary animate-in zoom-in-50"><Camera className="h-4 w-4" /></span>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{n} {n === 1 ? "fotografia" : "fotografias"} · {DICA[etapa]}</span>
        {/* sem fotografias no fecho da visita: o "Tirar foto" fica inválido e ligado ao aviso, para a validação (R6) trazer o foco aqui */}
        <Button variant="outline" size="sm" disabled={v.fechada} aria-invalid={(etapa === "area" && aValidar(d, "fotos") && semFotos) || undefined} aria-describedby={etapa === "area" && aValidar(d, "fotos") && semFotos ? "fotos-falta" : undefined} onClick={go(() => A.foto(d.id, etapa))}><Camera className="mr-1.5 h-4 w-4" />Tirar foto</Button>
      </div>
      {etapa === "area" && (
        <>
          {aValidar(d, "fotos") && semFotos && <p id="fotos-falta" className="text-[15px] font-medium text-destructive">Tire pelo menos uma fotografia (em qualquer etapa), ou marque que o cliente não quis.</p>}
          <Campos grupo={{ titulo: "", campos: [{ k: "diag_cliente_recusou_fotos", l: "O cliente não quis fotografias", t: "sim_nao", opcional: true }] }} d={d} A={A} run={run} simples={simples} ro={v.fechada} />
        </>
      )}
    </section>
  );
}
