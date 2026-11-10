// 10/11 (Rúben: «todas as infos, como fotografias do espaço exterior, interior e os campos preenchidos anteriormente, de forma acessível e
// bonita, a esconder e mostrar»). No Estúdio do plano, o que se sabe da obra antes de planear: as fotografias da visita e o que se
// respondeu no levantamento, cada bloco abre e fecha (o <details> do browser: teclado e leitor de ecrã sem nada a mais). Só se vê.
import type { ReactNode } from "react";
import { Building2, Camera, ChevronDown, ClipboardCheck, Home, Ruler, Wrench } from "lucide-react";
import { AREA, DECISAO, EXTERIOR, INTERIOR, PECAS_WC, efetivo, gruposArea, visivel, type Grupo } from "../campos";
import { mostra } from "../CamposFase";
import { FotosEtapa } from "../FotosEtapa";
import { LINHAS, camposMedida, fotosPor, medida, nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";

/** As respostas de um grupo: só as preenchidas e visíveis, com o nome que a empresa deu ao campo. */
function respostas(g: Grupo, f: Record<string, string>): { l: string; v: string }[] {
  return g.campos.filter((c) => !!f[c.k]?.trim() && visivel(c, f)).map((c) => ({ l: c.l, v: mostra(c, f[c.k]) }));
}

function Bloco({ titulo, icone, resumo, aberto, children }: { titulo: string; icone: ReactNode; resumo: string; aberto?: boolean; children: ReactNode }) {
  return (
    <details open={aberto} className="group rounded-2xl border border-border bg-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{titulo}</span>
          <span className="block truncate text-sm text-muted-foreground">{resumo}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

function Lista({ itens }: { itens: { l: string; v: string }[] }) {
  if (!itens.length) return <p className="text-sm text-muted-foreground">Nada preenchido.</p>;
  return (
    <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {itens.map((x) => (
        <div key={x.l} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{x.l}</dt>
          <dd className="text-[15px] leading-snug">{x.v}</dd>
        </div>
      ))}
    </dl>
  );
}

const quantas = (n: number, um: string, varios: string) => (n ? `${n} ${n === 1 ? um : varios}` : "nada preenchido");

export function InfoDoNegocio({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S } = ctx;
  const E = (g: Grupo) => efetivo(S.campos, g);
  const f = d.f ?? {};
  const nFotos = Object.values(fotosPor(d.visita)).reduce((a, n) => a + n, 0);
  const ext = respostas(E(EXTERIOR), f), int = respostas(E(INTERIOR), f);
  const area = gruposArea(S.campos, f).map(E).filter((g) => !g.oculto).flatMap((g) => respostas(g, f));
  const pecas = E(PECAS_WC).oculto ? [] : respostas(E(PECAS_WC), f);
  const decisao = E(DECISAO).oculto ? [] : respostas(E(DECISAO), f);
  const CM = camposMedida(LINHAS[d.linha]);
  const med = CM.map(([k, l]) => {
    const v = medida(d.visita.med, k), r = f[`retif_${k}`];
    return { k, l, v, r: r != null && r !== "" ? Number(r) : null };
  });
  const titulo = (g: Grupo) => E(g).nome || g.titulo;

  return (
    <div className="space-y-3">
      <Bloco titulo="Fotografias" icone={<Camera className="h-4 w-4" />} resumo={nFotos ? `${nFotos} ${nFotos === 1 ? "fotografia" : "fotografias"} da visita` : "sem fotografias"} aberto={nFotos > 0}>
        <div className="space-y-3">
          <FotosEtapa ctx={ctx} d={d} etapa="exterior" soVer simples />
          <FotosEtapa ctx={ctx} d={d} etapa="interior" soVer simples />
          <FotosEtapa ctx={ctx} d={d} etapa="area" soVer simples />
        </div>
      </Bloco>
      {!E(EXTERIOR).oculto && <Bloco titulo={titulo(EXTERIOR)} icone={<Building2 className="h-4 w-4" />} resumo={quantas(ext.length, "resposta", "respostas")}><Lista itens={ext} /></Bloco>}
      {!E(INTERIOR).oculto && <Bloco titulo={titulo(INTERIOR)} icone={<Home className="h-4 w-4" />} resumo={quantas(int.length, "resposta", "respostas")}><Lista itens={int} /></Bloco>}
      {!E(AREA).oculto && <Bloco titulo={titulo(AREA)} icone={<Wrench className="h-4 w-4" />} resumo={quantas(area.length, "resposta", "respostas")}><Lista itens={area} /></Bloco>}
      {CM.length > 0 && (
        <Bloco titulo="Medidas" icone={<Ruler className="h-4 w-4" />} resumo={f.retif_aceite ? "retificadas no local e aceites" : "as da visita"}>
          <table className="w-full text-[15px]">
            <caption className="sr-only">As medidas da visita e as retificadas pelo supervisor</caption>
            <thead><tr className="text-left text-xs text-muted-foreground"><th scope="col" className="pb-2 font-medium">Medida</th><th scope="col" className="pb-2 text-right font-medium">Visita</th><th scope="col" className="pb-2 text-right font-medium">No local</th></tr></thead>
            <tbody className="divide-y divide-border">
              {med.map((m) => (
                <tr key={m.k}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">{m.l}</th>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{nfmt(m.v)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.r == null ? "—" : <span className={Math.abs(m.r - m.v) > 0.001 ? "font-semibold" : ""}>{nfmt(m.r)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.retif_notas && <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">Notas do supervisor: </span>{f.retif_notas}</p>}
        </Bloco>
      )}
      {pecas.length > 0 && <Bloco titulo={titulo(PECAS_WC)} icone={<Wrench className="h-4 w-4" />} resumo={quantas(pecas.length, "resposta", "respostas")}><Lista itens={pecas} /></Bloco>}
      {decisao.length > 0 && <Bloco titulo={titulo(DECISAO)} icone={<ClipboardCheck className="h-4 w-4" />} resumo={decisao.slice(0, 2).map((x) => x.v).join(" · ")}><Lista itens={decisao} /></Bloco>}
    </div>
  );
}
