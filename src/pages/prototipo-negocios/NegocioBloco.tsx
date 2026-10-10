// O desenho de um negócio no separador Negócios da ficha: o bloco (serviço, estado, valor, probabilidade e próximo passo)
// e o percurso em quatro passos. Serve a lead com um só negócio (detalhe) e a lista de vários (compacto).
import { ArrowRight, Check, Circle, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { ItemNegocio } from "./leadsDocs";
import { estadoNegocio, percursoDe, probabilidade, type EstadoPasso } from "./perfilDocs";
import { BORDA_CTRL } from "./PessoaLinha";
import { Chip } from "./pecas";
import { CHIP_PEQ, Exemplo, LINHA, SETA, icone } from "./FichaListas";
import type { GrupoNegocio } from "./pessoasDocs";

const PASSO: Record<EstadoPasso, { texto: string; icone: typeof Check; classe: string }> = {
  feito: { texto: "Feito", icone: Check, classe: "border-foreground text-foreground" },
  atual: { texto: "Atual", icone: CircleDot, classe: "border-primary font-semibold text-foreground" },
  seguinte: { texto: "Por fazer", icone: Circle, classe: cn(BORDA_CTRL, "text-muted-foreground") },
};

/** Levantamento, Orçamento, Proposta e Contrato: o passo atual marcado em ícone e em texto, os seguintes a cinzento. Em fila quando há largura, em lista vertical quando não. */
export function Percurso({ d }: { d: Negocio }) {
  return (
    <div className="percurso-cx">
      <ol aria-label="Percurso do negócio" className="percurso text-[15px]">
        {percursoDe(d).map(({ nome, estado }) => {
          const p = PASSO[estado], I = p.icone;
          return (
            <li key={nome} aria-current={estado === "atual" ? "step" : undefined} className={cn("grid gap-0.5", p.classe)}>
              <span className="flex items-center gap-1.5"><I className="h-4 w-4 shrink-0" aria-hidden="true" />{p.texto}</span>
              <span className="font-medium text-foreground">{nome}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Um negócio da lista de vários: o serviço, o estado, o próximo passo e os documentos dele em linhas (tipo, valor e, na proposta conjunta, as linhas), com o percurso uma só vez. */
export function NegocioAgrupado({ g, d, abrir }: { g: GrupoNegocio; d: Negocio; abrir: (id: number) => () => void }) {
  const it = g.principal, ic = icone(it.tipo), preparacao = g.docs.length === 0;
  return (
    <section aria-label={`Negócio: ${d.servico}`} className="grid min-w-0 gap-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
        <Chip icone={ic.i} cor={ic.cor} className={CHIP_PEQ} />{estadoNegocio(d)}{g.docs.some((x) => x.demo) && <Exemplo />}
      </p>
      <h3 className="break-words text-xl font-semibold tracking-tight">{d.servico}</h3>
      {!preparacao && (
        <ul className="divide-y divide-border border-y border-border" aria-label="Documentos do negócio">
          {g.docs.map((x) => {
            const dx = icone(x.tipo);
            return (
              <li key={x.id}>
                <button type="button" onClick={abrir(x.negocioId)} className={LINHA}>
                  <span className="flex items-center gap-2 text-[15px] text-muted-foreground"><Chip icone={dx.i} cor={dx.cor} className={CHIP_PEQ} />{x.tipo}{x.demo && <Exemplo />}</span>
                  <span className="text-[15px] font-medium">{x.valor !== null ? `${x.conjunta ? "Total " : ""}${eur(x.valor)} € · ` : ""}Abrir<ArrowRight className={SETA} aria-hidden="true" /></span>
                </button>
                {x.linhas.length > 0 && (
                  <ul className="mb-2 px-1 text-[15px] text-muted-foreground" aria-label="Linhas do documento">
                    {x.linhas.map((l) => <li key={l.rotulo} className="flex justify-between gap-2 py-0.5"><span>{l.rotulo}</span><span className="tabular-nums">{eur(l.valor)} €</span></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <p className="text-[15px] text-muted-foreground">Próximo passo</p>
        <Button type="button" variant="outline" className={cn("mt-1 min-h-11 max-w-full cursor-pointer whitespace-normal text-left text-[15px]", BORDA_CTRL)} onClick={abrir(it.negocioId)}>
          {it.proximo}<ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </div>
      <Percurso d={d} />
    </section>
  );
}

interface BlocoProps { it: ItemNegocio; d: Negocio; abrir: (id: number) => () => void }

/** O negócio: serviço, estado em palavras, valor (ou "Sem valor ainda"), probabilidade de fechar (exemplo) e o próximo passo. */
export function BlocoNegocio({ it, d, abrir }: BlocoProps) {
  const ic = icone(it.tipo), preparacao = ["Lead", "Contacto", "Visita"].includes(it.tipo);
  return (
    <section aria-label={`Negócio: ${it.servico}`} className="grid min-w-0 gap-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
        <Chip icone={ic.i} cor={ic.cor} className={CHIP_PEQ} />
        {preparacao ? estadoNegocio(d) : `${it.tipo} · ${estadoNegocio(d)}`}{it.demo && <Exemplo />}
      </p>
      <h3 className="break-words text-xl font-semibold tracking-tight">{it.servico}</h3>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-x-6 gap-y-2 text-[15px]">
        <div><dt className="text-muted-foreground">{it.valor === null ? "Valor" : "Valor com IVA"}</dt>
          <dd className="text-base font-semibold tabular-nums">{it.valor === null ? "Sem valor ainda" : `${it.conjunta ? "Total " : ""}${eur(it.valor)} €`}</dd></div>
        <div><dt className="text-muted-foreground">Probabilidade de fechar</dt>
          <dd className="text-base font-semibold tabular-nums">{probabilidade(it.tipo)} %<Exemplo /></dd></div>
      </dl>
      {it.linhas.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-[15px]" aria-label="Linhas do documento">
          {it.linhas.map((l) => <li key={l.rotulo} className="flex justify-between gap-2 py-1"><span>{l.rotulo}</span><span className="tabular-nums">{eur(l.valor)} €</span></li>)}
        </ul>
      )}
      <div>
        <p className="text-[15px] text-muted-foreground">Próximo passo</p>
        <Button type="button" variant="outline" className={cn("mt-1 min-h-11 max-w-full cursor-pointer whitespace-normal text-left text-[15px]", BORDA_CTRL)} onClick={abrir(it.negocioId)}>
          {it.proximo}<ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
