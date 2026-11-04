// 4/11 (Rúben): na fase Lead do pipeline, «O que veio na lead»: os campos da Olyvia original que a Nova lead gravou na pessoa (nome próprio e
// apelido, empresa, notas, fonte, campanha, comercial e as respostas ao formulário), já preenchidos. «Editar» muda-os na pessoa (a ficha e o
// negócio ficam iguais); quem grava é a página real (definirGuardarDadosLead). Telefone, email e NIF: «Editar os dados do cliente».
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DadosLead, FonteLead, MudancaLead } from "./real/dadosDaLead";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

export interface ApoioDadosLead { fontes: readonly FonteLead[]; comerciais: readonly { id: string; name: string }[] }
type Guardar = (d: Negocio, m: MudancaLead) => Promise<string>;
let guardar: Guardar | null = null;
let apoio: ApoioDadosLead = { fontes: [], comerciais: [] };
/** A página real regista quem grava na pessoa e as listas (fontes da organização, comerciais). Devolve como desligar. */
export function definirGuardarDadosLead(fn: Guardar, a: ApoioDadosLead): () => void {
  guardar = fn; apoio = a;
  return () => { if (guardar === fn) { guardar = null; apoio = { fontes: [], comerciais: [] }; } };
}

const INP = "h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const agoraHoje = () => { const t = new Date(); return `hoje ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

const mudancaDe = (x: DadosLead): MudancaLead => ({
  primeiro: x.primeiro, apelido: x.apelido, empresa: x.empresa, notas: x.notas, fonteId: x.fonteId, comercialId: x.comercialId,
  respostas: Object.fromEntries(x.respostas.map((r) => [r.k, r.v])),
});

/** O resumo do passo: empresa, fonte e comercial. */
export const resumoDadosLead = (x: DadosLead): string[] => [x.empresa, x.fonte, x.comercial ? `comercial ${x.comercial}` : ""].filter(Boolean);

export function DadosDaLead({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const x = d.dadosLead;
  const [editar, setEditar] = useState(false);
  const [m, setM] = useState<MudancaLead | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!x) return null;
  const linhas: [string, string][] = [
    ["Nome próprio", x.primeiro], ["Apelido", x.apelido], ["Empresa", x.empresa], ["Fonte da lead", x.fonte], ["Campanha", x.campanha],
    ["Comercial", x.comercial], ["Notas", x.notas], ...x.respostas.map((r): [string, string] => [r.l, r.v]),
  ];
  if (!editar || !m) {
    return (
      <div className="max-w-xl space-y-4">
        <dl className="divide-y divide-border rounded-2xl border border-border bg-card px-5">
          {linhas.map(([l, v]) => (
            <div key={l} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3 text-[15px]">
              <dt className="text-muted-foreground">{l}</dt>
              <dd className={v ? "min-w-0 break-words text-right font-medium" : "text-right text-muted-foreground"}>{v || "—"}</dd>
            </div>
          ))}
        </dl>
        {guardar && (
          <Button type="button" variant="outline" size="lg" className="min-h-11" onClick={() => { setM(mudancaDe(x)); setErro(null); setEditar(true); }}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Editar
          </Button>
        )}
      </div>
    );
  }
  const muda = (p: Partial<MudancaLead>) => setM({ ...m, ...p });
  const gravar = async () => {
    if (!guardar || aGravar) return;
    setAGravar(true); setErro(null);
    try {
      const nome = await guardar(d, m);
      const fonte = apoio.fontes.find((f) => f.id === m.fonteId)?.name ?? "";
      const comercial = apoio.comerciais.find((c) => c.id === m.comercialId)?.name ?? (m.comercialId === x.comercialId ? x.comercial : "");
      ctx.run(() => {
        d.dadosLead = {
          ...x, primeiro: m.primeiro.trim(), apelido: m.apelido.trim(), empresa: m.empresa.trim(), notas: m.notas.trim(), fonteId: m.fonteId, fonte,
          comercialId: m.comercialId, comercial, respostas: x.respostas.map((r) => ({ ...r, v: (m.respostas[r.k] ?? r.v).trim() })),
          extra: { ...x.extra, ...m.respostas, company_name: m.empresa.trim() || undefined, notes: m.notas.trim() || undefined },
        };
        if (nome) d.nome = nome;
        d.hist.unshift({ t: "Dados da lead mudados", q: agoraHoje(), k: "a" });
      });
      setEditar(false);
    } catch (e) {
      setErro((e as Error).message || "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };
  const id = (k: string) => `lead-${d.id}-${k}`;
  return (
    <form className="max-w-xl space-y-4" onSubmit={(e) => { e.preventDefault(); void gravar(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[15px] font-medium" htmlFor={id("primeiro")}>Nome próprio<input id={id("primeiro")} className={INP} value={m.primeiro} onChange={(e) => muda({ primeiro: e.target.value })} /></label>
        <label className="grid gap-1.5 text-[15px] font-medium" htmlFor={id("apelido")}>Apelido<input id={id("apelido")} className={INP} value={m.apelido} onChange={(e) => muda({ apelido: e.target.value })} /></label>
        <label className="grid gap-1.5 text-[15px] font-medium sm:col-span-2" htmlFor={id("empresa")}>Empresa<input id={id("empresa")} className={INP} value={m.empresa} onChange={(e) => muda({ empresa: e.target.value })} /></label>
        <label className="grid gap-1.5 text-[15px] font-medium" htmlFor={id("fonte")}>Fonte da lead
          <select id={id("fonte")} className={INP} value={m.fonteId} onChange={(e) => muda({ fonteId: e.target.value })}>
            <option value="">Sem fonte específica</option>
            {apoio.fontes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            {m.fonteId && !apoio.fontes.some((f) => f.id === m.fonteId) && <option value={m.fonteId}>{x.fonte || "A fonte atual"}</option>}
          </select>
        </label>
        <label className="grid gap-1.5 text-[15px] font-medium" htmlFor={id("comercial")}>Comercial
          <select id={id("comercial")} className={INP} value={m.comercialId} onChange={(e) => muda({ comercialId: e.target.value })}>
            <option value="">Sem comercial</option>
            {apoio.comerciais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {m.comercialId && !apoio.comerciais.some((c) => c.id === m.comercialId) && <option value={m.comercialId}>{x.comercial || "O comercial atual"}</option>}
          </select>
        </label>
        {x.respostas.map((r) => (
          <label key={r.k} className="grid gap-1.5 text-[15px] font-medium sm:col-span-2" htmlFor={id(r.k)}>{r.l}
            <input id={id(r.k)} className={INP} value={m.respostas[r.k] ?? ""} onChange={(e) => muda({ respostas: { ...m.respostas, [r.k]: e.target.value } })} />
          </label>
        ))}
        <label className="grid gap-1.5 text-[15px] font-medium sm:col-span-2" htmlFor={id("notas")}>Notas
          <textarea id={id("notas")} rows={3} className={`${INP} h-auto py-2.5`} value={m.notas} onChange={(e) => muda({ notas: e.target.value })} />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">O telefone, o email e o NIF mudam-se em «Editar os dados do cliente».</p>
      {erro && <p role="alert" className="text-[15px] text-destructive">{erro}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" className="min-h-11" disabled={aGravar}>{aGravar ? "A gravar…" : "Guardar"}</Button>
        <Button type="button" variant="ghost" size="lg" className="min-h-11" disabled={aGravar} onClick={() => setEditar(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
