// 4/11 (Rúben): o passo «Morada da obra» vai buscar a morada que a lead já trazia (a da ficha do cliente ou a do pedido). Com ela, basta
// um clique: validar (fica essa), editar (fica essa, com os campos à mão para corrigir) ou outra morada (os campos vazios). Sem nenhuma,
// escreve-se como antes (ou pela localização do dispositivo).
import { useState, type ReactNode } from "react";
import { Check, MapPin, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsarLocalizacao } from "./Localizacao";
import { moradaDoTexto, type MoradaLead, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

/** A sugestão do negócio: a lida da ficha (d.moradaLead) ou, sem ela, a do pedido. Nenhuma se a morada da obra já está escrita. */
export const sugestaoDeMorada = (d: Negocio): MoradaLead | null => (d.f.morada?.trim() ? null : d.moradaLead ?? moradaDoTexto(d.local));

const linhaDaMorada = (m: MoradaLead) => [m.morada, m.fracao].filter(Boolean).join(", ");
const linhaDaLocalidade = (m: MoradaLead) => [m.cp, m.localidade].filter(Boolean).join(" ");

export function MoradaDaObra({ ctx, d, children }: { ctx: Ctx; d: Negocio; children: ReactNode }) {
  const sugestao = sugestaoDeMorada(d);
  const [campos, setCampos] = useState(false);
  if (!sugestao || campos) {
    return <div className="space-y-4"><UsarLocalizacao ctx={ctx} d={d} />{children}</div>;
  }
  const usar = (editar: boolean) => {
    ctx.run(() => ctx.A.moradaDaLead(d.id, sugestao));
    // sem a rua (o código postal e a localidade já não se perguntam: ficam guardados se a lead os trouxe), ou para editar, ficam os campos
    const falta = !sugestao.morada.trim();
    if (editar || falta) setCampos(true);
  };
  return (
    <section aria-labelledby={`morada-lead-${d.id}`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h3 id={`morada-lead-${d.id}`} className="text-[15px] text-muted-foreground">
            {sugestao.de === "ficha" ? "A morada que está na ficha do cliente" : "A morada que veio no pedido"}
          </h3>
          <p className="text-[17px] font-medium leading-snug">{linhaDaMorada(sugestao)}</p>
          {linhaDaLocalidade(sugestao) && <p className="text-[15px]">{linhaDaLocalidade(sugestao)}</p>}
          <p className="pt-1 text-sm text-muted-foreground">É aqui a obra? Valide, corrija ou escreva outra.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" className="min-h-11" onClick={() => usar(false)}>
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />Validar esta morada
        </Button>
        <Button type="button" size="lg" variant="outline" className="min-h-11" onClick={() => usar(true)}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Editar
        </Button>
        <Button type="button" size="lg" variant="ghost" className="min-h-11" onClick={() => setCampos(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Outra morada
        </Button>
      </div>
    </section>
  );
}
