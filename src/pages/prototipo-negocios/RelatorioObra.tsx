// O relatório da obra que o cliente recebe depois de assinar o auto de receção (15/10/2026): o resumo, a garantia, a linha do
// tempo de tudo o que aconteceu (com as fotografias das tarefas), as fotografias por fase, os materiais e os documentos.
// Sem custos internos nem margens: só o que o cliente pagou. As contas estão em relatorioObra.ts.
import type { ReactNode } from "react";
import { Camera, ChevronRight, ClipboardCheck, FileSignature, FileText, Flag, Hammer, Package, Phone, Receipt, ShieldCheck, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { eur, type Estado, type Negocio } from "./motor";
import { totais } from "./DocsCliente";
import { totalComIva } from "./adendas";
import { materiaisPorFase, RESPONSAVEL_OBRA } from "./obraOps";
import { FASES_OBRA } from "./fasesObra";
import { fotosPorFase, garantiaAte, historiaDaObra, resumoObra, type Marco } from "./historiaObra";

const ICONE: Record<Marco["k"], LucideIcon> = {
  proposta: FileText, contrato: FileSignature, pagamento: Receipt, materiais: Package, obra: Flag, tarefa: Wrench, diario: Camera, adenda: Sparkles, auto: ClipboardCheck,
};
const Caixa = ({ titulo, children, rotulo }: { titulo: string; children: ReactNode; rotulo?: string }) => (
  <section aria-label={rotulo ?? titulo} className="rounded-2xl bg-white p-5 shadow-sm">
    <h3 className="text-base font-semibold">{titulo}</h3>
    <div className="mt-3">{children}</div>
  </section>
);

export function RelatorioObra({ S, d, docs, abrirDoc }: { S: Estado; d: Negocio; docs?: [string, string][]; abrirDoc?: (k: string) => void }) {
  const R = resumoObra(d), H = historiaDaObra(d), F = fotosPorFase(d), ate = garantiaAte(d);
  const adendas = (d.adendas ?? []).filter((a) => a.estado === "assinada");
  const total = (d.orc ? totais(d, S).total : 0) + adendas.reduce((a, x) => a + totalComIva(x.linhas), 0);
  const mats = materiaisPorFase(d);
  return (
    <div className="space-y-5 text-slate-900" aria-label="Relatório da obra" role="region">
      {/* o resumo */}
      <section aria-label="Resumo" className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Relatório da obra</p>
        <h3 className="mt-1 text-xl font-semibold">{d.servico}</h3>
        <p className="text-[15px] text-slate-600">{d.f.morada || d.local}</p>
        {R && (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-4">
            <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Início</dt><dd className="font-semibold">{R.inicio}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Fim</dt><dd className="font-semibold">{R.fim}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Duração</dt><dd className="font-semibold tabular-nums">{dias(R.diasReal)}<span className="block text-sm font-normal text-slate-500">previstos {dias(R.diasPrev)}</span></dd></div>
            <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Valor, com IVA</dt><dd className="font-semibold tabular-nums">{eur(total)} €</dd></div>
          </dl>
        )}
        {R && R.equipa.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-500">A equipa</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {R.equipa.map((x) => <li key={x.n} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{x.n} <span className="text-slate-500">· {x.sk.split(" · ")[0].toLowerCase()}</span></li>)}
            </ul>
          </div>
        )}
      </section>

      {/* a garantia */}
      <section aria-label="Garantia" className="flex items-start gap-3 rounded-2xl bg-white p-5 shadow-sm">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-hidden="true"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-base font-semibold">{ate ? `Garantia até ${ate}` : "Garantia"}</p>
          <p className="text-[15px] text-slate-600">{d.f.garantia || "2 anos"} sobre a mão de obra; os materiais têm a garantia do fabricante. Precisa de assistência? Fale com o responsável de obra.</p>
          <a href={`tel:${RESPONSAVEL_OBRA.tel.replace(/\s/g, "")}`} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-slate-900 underline-offset-4 hover:underline">
            <Phone className="h-4 w-4" aria-hidden="true" />{RESPONSAVEL_OBRA.n} · {RESPONSAVEL_OBRA.tel}
          </a>
        </div>
      </section>

      {/* a linha do tempo */}
      <Caixa titulo="Tudo o que aconteceu" rotulo="Linha do tempo">
        <ol>
          {H.map((x, i) => {
            const Ic = ICONE[x.k], ultimo = i === H.length - 1;
            return (
              <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                {!ultimo && <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-10 w-px bg-slate-200" />}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700" aria-hidden="true"><Ic className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{x.t}</p>
                  {x.q && <p className="text-sm tabular-nums text-slate-500">{x.q}</p>}
                  {x.sub && <p className="text-sm text-slate-600">{x.sub}</p>}
                  {x.fotos && (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {x.fotos.map((f, k) => <img key={k} src={f} alt={`${x.t}: fotografia ${k + 1}`} className="h-20 w-28 shrink-0 rounded-lg object-cover" />)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Caixa>

      {/* as fotografias, por fase */}
      {F.length > 0 && (
        <Caixa titulo="As fotografias, por fase" rotulo="Fotografias">
          <div className="space-y-4">
            {F.map((g) => (
              <div key={g.fase}>
                <p className="text-sm font-medium text-slate-500">{g.fase ? `Fase ${g.fase} · ${g.nome}` : g.nome}</p>
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.fotos.map((f, k) => (
                    <li key={k}><figure><img src={f.src} alt={f.t} className="aspect-[4/3] w-full rounded-lg object-cover" /><figcaption className="mt-1 text-sm text-slate-600">{f.t}</figcaption></figure></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Caixa>
      )}

      {/* os materiais aplicados */}
      {mats.length > 0 && (
        <Caixa titulo="Os materiais aplicados" rotulo="Materiais">
          <div className="space-y-3">
            {mats.map((g) => (
              <div key={g.fase}>
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500"><Hammer className="h-3.5 w-3.5" aria-hidden="true" />Fase {g.fase} · {FASES_OBRA[g.fase - 1]?.curto}</p>
                <ul className="mt-1 divide-y divide-slate-100">
                  {g.itens.map((m) => <li key={m.n} className="flex justify-between gap-3 py-1.5 text-[15px]"><span>{m.n}</span><span className="shrink-0 tabular-nums text-slate-500">{String(m.q).replace(".", ",")} {m.un}</span></li>)}
                </ul>
              </div>
            ))}
          </div>
        </Caixa>
      )}

      {/* os documentos (no portal abrem-se aqui) */}
      {docs && docs.length > 0 && (
        <Caixa titulo="Os documentos da obra" rotulo="Documentos da obra">
          <ul className="-mx-2">
            {docs.map(([k, t]) => (
              <li key={k}>
                <button type="button" onClick={() => abrirDoc?.(k)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] hover:bg-slate-50">
                  <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" /><span className="flex-1">{t}</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Caixa>
      )}
    </div>
  );
}
const dias = (n: number) => `${String(Math.round(n * 2) / 2).replace(".", ",")} ${n === 1 ? "dia útil" : "dias úteis"}`;
