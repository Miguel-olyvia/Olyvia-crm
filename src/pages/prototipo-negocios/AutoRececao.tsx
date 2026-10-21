// O auto de receção da obra (15/10/2026): o documento que o cliente assina no portal quando a obra acaba, e o cartão que o
// comercial e as Operações veem no negócio (por assinar / assinado, com a assinatura, e "Ver o relatório da obra").
// O mesmo estilo dos documentos (DocsCliente: Folha); a assinatura é a do contrato (AssinaturaContrato: SeloAssinatura).
import { useState } from "react";
import { ClipboardCheck, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Assinatura, type Estado, type Negocio } from "./motor";
import { Cliente, Folha } from "./DocsCliente";
import { SeloAssinatura } from "./AssinaturaContrato";
import { FASES_OBRA } from "./fasesObra";
import { RESPONSAVEL_OBRA } from "./obraOps";
import { totaisAdenda } from "./adendas";
import { garantiaAte, resumoObra } from "./historiaObra";
import { RelatorioObra } from "./RelatorioObra";

/** O auto de receção: a obra, as datas, os trabalhos por fase, os trabalhos a mais, as observações, a garantia e as assinaturas. */
export function AutoRececaoDoc({ d }: { d: Negocio }) {
  const au = d.obra.auto, p = d.obra.plano, R = resumoObra(d);
  if (!au || !p) return null;
  const assinado = au.estado === "assinado", ate = garantiaAte(d);
  const adendas = (d.adendas ?? []).filter((a) => a.estado === "assinada");
  const porFase = FASES_OBRA.map((f) => ({ f, ts: [...new Set(p.tasks.filter((t) => t.fase === f.n).map((t) => t.nome))] })).filter((x) => x.ts.length);
  const semFase = [...new Set(p.tasks.filter((t) => !t.fase).map((t) => t.nome))];
  const empresa: Assinatura = { tipo: "digital", nome: `${RESPONSAVEL_OBRA.n} (Mudelar)`, q: au.q, id: `MDL-AR-${d.id}` };
  return (
    <Folha titulo="Auto de receção da obra" numero={au.n} data={assinado ? `assinado ${au.assinado ?? ""}` : "à espera da assinatura"} carimbo={assinado ? "Obra recebida" : undefined}>
      <Cliente d={d} />
      <p className="text-slate-700">
        A Mudelar entrega e o cliente recebe a obra do contrato CT 2026/{d.id}{adendas.length ? ` e das adendas ${adendas.map((a) => a.n).join(", ")}` : ""}: {d.servico.toLowerCase()} em {d.f.morada || d.local}.
      </p>
      {R && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt className="text-xs uppercase tracking-wider text-slate-500">Início</dt><dd className="font-medium">{R.inicio}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-slate-500">Fim</dt><dd className="font-medium">{R.fim}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-slate-500">Duração</dt><dd className="font-medium tabular-nums">{fmtDias(R.diasReal)} <span className="font-normal text-slate-500">(previstos {fmtDias(R.diasPrev)})</span></dd></div>
        </dl>
      )}
      <section aria-label="Trabalhos executados">
        <h3 className="font-semibold">Trabalhos executados</h3>
        <ol className="mt-2 space-y-2">
          {porFase.map(({ f, ts }) => (
            <li key={f.n}><p className="text-sm font-medium text-slate-500">Fase {f.n} · {f.curto}</p><p>{ts.join(" · ")}</p></li>
          ))}
          {semFase.length > 0 && <li><p>{semFase.join(" · ")}</p></li>}
        </ol>
      </section>
      {adendas.length > 0 && (
        <section aria-label="Trabalhos a mais">
          <h3 className="font-semibold">Trabalhos a mais</h3>
          <ul className="mt-1 list-disc pl-5 text-slate-700">
            {adendas.map((a) => <li key={a.n}>{a.n}: {a.linhas.map((x) => x.n).join(", ")} ({eur(totaisAdenda(a).total)} € com IVA)</li>)}
          </ul>
        </section>
      )}
      <section aria-label="Observações">
        <h3 className="font-semibold">Observações do cliente</h3>
        <p className="mt-1 text-slate-700">{assinado ? au.reservas || "Sem observações: a obra foi recebida em boas condições." : "Escreve-as o cliente ao assinar, se as tiver."}</p>
      </section>
      <section aria-label="Garantia">
        <h3 className="font-semibold">Garantia</h3>
        <p className="mt-1 text-slate-700">{d.f.garantia || "2 anos"} sobre a mão de obra, a contar da data deste auto{ate ? `: até ${ate}` : ""}. Os materiais têm a garantia do fabricante.</p>
      </section>
      <section className="grid gap-8 pt-4 sm:grid-cols-2" aria-label="Assinaturas">
        {([
          ["Pela empresa", `${RESPONSAVEL_OBRA.n} · ${RESPONSAVEL_OBRA.papel}`, empresa, "Assinado", "Certificado qualificado"],
          ["O cliente", d.f.nome_fiscal || d.nome, assinado ? au.assinatura ?? null : null,
            assinado ? (au.assinatura?.tipo === "desenho" ? "Assinado no ecrã, no portal" : au.assinatura?.tipo === "sms" ? "Assinado com código por SMS" : "Assinado com Chave Móvel Digital") : "À espera da assinatura", undefined],
        ] as [string, string, Assinatura | null, string, string | undefined][]).map(([q, nome, a, est, meio]) => (
          <div key={q} className="flex flex-col">
            <p className="text-xs uppercase tracking-wider text-slate-500">{q}</p>
            <div className="flex min-h-[4.5rem] items-end pb-1 pt-2">{a ? <SeloAssinatura a={a} compacto meio={meio} /> : null}</div>
            <div className="border-t border-slate-300 pt-2">
              <p className="font-medium">{nome}</p>
              <p className={cn("text-sm", est.startsWith("Assinado") ? "text-emerald-700" : "text-slate-500")}>{est}{a && q === "O cliente" ? ` · ${a.q}` : ""}</p>
            </div>
          </div>
        ))}
      </section>
    </Folha>
  );
}
const fmtDias = (n: number) => `${String(Math.round(n * 2) / 2).replace(".", ",")} ${n === 1 ? "dia útil" : "dias úteis"}`;

/** No negócio (comercial e Operações): o auto por assinar ou assinado (com a assinatura e as observações), e o relatório. */
export function AutoNoNegocio({ S, d }: { S: Estado; d: Negocio }) {
  const [ver, setVer] = useState<null | "auto" | "relatorio">(null);
  const au = d.obra.auto;
  if (!au) return null;
  const assinado = au.estado === "assinado";
  return (
    <section aria-label="Auto de receção" className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", assinado ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")} aria-hidden="true"><ClipboardCheck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">Auto de receção {au.n} {assinado ? "assinado" : "por assinar"}</p>
          <p className="text-[15px] text-muted-foreground">
            {assinado ? `Pelo cliente, ${au.assinado ?? ""}${garantiaAte(d) ? ` · garantia até ${garantiaAte(d)}` : ""}` : "Está no portal do cliente. Assinado, começa a garantia e o cliente recebe o relatório da obra."}
          </p>
          {assinado && au.assinatura && <div className="mt-3"><SeloAssinatura a={au.assinatura} compacto /></div>}
          {assinado && au.reservas && <p className="mt-3 rounded-xl border border-warning/40 bg-warning/[0.06] px-3 py-2 text-[15px]"><b className="font-medium">Observações do cliente:</b> {au.reservas}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setVer("auto")}><FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />Ver o auto</Button>
            {assinado && <Button variant="outline" className="min-h-11" onClick={() => setVer("relatorio")}>Ver o relatório da obra</Button>}
          </div>
        </div>
      </div>
      {ver && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-100 animate-in fade-in-0" role="dialog" aria-modal="true" aria-label={ver === "auto" ? `Auto de receção ${au.n}` : "Relatório da obra"}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
            <p className="text-sm font-semibold">{ver === "auto" ? `Auto de receção ${au.n}` : "Relatório da obra"}</p>
            <button type="button" onClick={() => setVer(null)} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
          </div>
          <div className="mx-auto max-w-3xl px-3 py-6">{ver === "auto" ? <AutoRececaoDoc d={d} /> : <RelatorioObra S={S} d={d} />}</div>
        </div>
      )}
    </section>
  );
}
