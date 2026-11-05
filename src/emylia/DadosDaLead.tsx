// 4/11 (Rúben): os campos da Olyvia original na fase Lead (os que a Nova lead grava na pessoa): nome próprio e apelido, empresa, notas,
// fonte, comercial e as respostas ao formulário. Cada um grava-se na pessoa ao sair do campo (a ficha e o negócio ficam iguais); quem grava
// é a página real (definirGuardarDadosLead). Fora da página real (protótipo), não aparecem.
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FonteLead, MudancaLead } from "./real/dadosDaLead";
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
/** 5/11: leads.assign de quem entrou (usePodeAtribuirComercial), posto pela página real. Por pôr: ainda não se sabe (fixo, sem motivo). */
let atribuir: { pode: boolean; aLer: boolean } = { pode: false, aLer: true };
export function definirPodeAtribuirLead(v: { pode: boolean; aLer: boolean } | null): void { atribuir = v ?? { pode: false, aLer: true }; }
/** Há quem grave na pessoa (página real) e o negócio tem os dados da lead. */
export const comDadosLead = (d: Negocio) => !!d.dadosLead && !!guardar;

const agoraHoje = () => { const t = new Date(); return `hoje ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

/** Muda um ou mais campos da lead na pessoa e, a seguir, no negócio (o nome do negócio acompanha); fica no histórico. */
export async function mudarDadosLead(ctx: Ctx, d: Negocio, p: Partial<MudancaLead>, oQue: string): Promise<void> {
  const x = d.dadosLead;
  if (!x || !guardar) return;
  const m: MudancaLead = {
    primeiro: x.primeiro, apelido: x.apelido, empresa: x.empresa, notas: x.notas, fonteId: x.fonteId, comercialId: x.comercialId,
    respostas: Object.fromEntries(x.respostas.map((r) => [r.k, r.v])), ...p,
  };
  const nome = await guardar(d, m);
  const fonte = apoio.fontes.find((f) => f.id === m.fonteId)?.name ?? (m.fonteId === x.fonteId ? x.fonte : "");
  const comercial = apoio.comerciais.find((c) => c.id === m.comercialId)?.name ?? (m.comercialId === x.comercialId ? x.comercial : "");
  ctx.run(() => {
    d.dadosLead = {
      ...x, primeiro: m.primeiro.trim(), apelido: m.apelido.trim(), empresa: m.empresa.trim(), notas: m.notas.trim(), fonteId: m.fonteId, fonte,
      comercialId: m.comercialId, comercial, respostas: x.respostas.map((r) => ({ ...r, v: (m.respostas[r.k] ?? r.v).trim() })),
      extra: { ...x.extra, ...m.respostas, company_name: m.empresa.trim() || undefined, notes: m.notas.trim() || undefined },
    };
    if (nome) d.nome = nome;
    d.hist.unshift({ t: `Dados da lead mudados: ${oQue}`, q: agoraHoje(), k: "a" });
  });
}

const ROT = "grid gap-1.5 text-[15px] font-medium";
const INP = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

/** O estado de uma gravação na pessoa, por baixo do campo. */
function useGravar(ctx: Ctx, d: Negocio) {
  const [erro, setErro] = useState<string | null>(null);
  const gravar = (p: Partial<MudancaLead>, oQue: string) => {
    setErro(null);
    void mudarDadosLead(ctx, d, p, oQue).catch((e: Error) => setErro(e.message || "Não foi possível gravar na ficha do cliente."));
  };
  const aviso = erro ? <p role="alert" className="text-sm text-destructive">{erro}</p> : null;
  return { gravar, aviso };
}

type Texto = "primeiro" | "apelido" | "empresa" | "notas";
const NOME_DO_CAMPO: Record<Texto, string> = { primeiro: "nome próprio", apelido: "apelido", empresa: "empresa", notas: "notas" };

/** Um campo de texto da lead (nome próprio, apelido, empresa, notas), gravado na pessoa ao sair. */
export function TextoDaLead({ ctx, d, k, rotulo, longo, className }: { ctx: Ctx; d: Negocio; k: Texto; rotulo: string; longo?: boolean; className?: string }) {
  const { gravar, aviso } = useGravar(ctx, d);
  const x = d.dadosLead;
  if (!x) return null;
  const id = `lead-${d.id}-${k}`, val = x[k];
  const sair = (v: string) => { if (v.trim() !== val) gravar({ [k]: v } as Partial<MudancaLead>, NOME_DO_CAMPO[k]); };
  return (
    <div className={cn(ROT, className)}>
      <label htmlFor={id}>{rotulo}</label>
      {longo
        ? <textarea key={id + val} id={id} rows={3} defaultValue={val} className={cn(INP, "h-auto py-2.5")} onBlur={(e) => sair(e.target.value)} />
        : <input key={id + val} id={id} defaultValue={val} className={INP} onBlur={(e) => sair(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
      {aviso}
    </div>
  );
}

/** A fonte da lead (a lista da organização, como na Nova lead) e a campanha em que entrou. */
export function FonteDaLead({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { gravar, aviso } = useGravar(ctx, d);
  const x = d.dadosLead;
  if (!x) return null;
  const id = `lead-${d.id}-fonte`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={ROT}>
        <label htmlFor={id}>Fonte da lead</label>
        <select id={id} className={INP} value={x.fonteId} onChange={(e) => gravar({ fonteId: e.target.value }, "fonte")}>
          <option value="">Sem fonte específica</option>
          {apoio.fontes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          {x.fonteId && !apoio.fontes.some((f) => f.id === x.fonteId) && <option value={x.fonteId}>{x.fonte || "A fonte atual"}</option>}
        </select>
        {aviso}
      </div>
      {x.campanha && <div className={ROT}>Campanha da lead<span className="pt-2 text-[15px] font-normal">{x.campanha}</span></div>}
    </div>
  );
}

/** O comercial que fica com a lead (muda pela atribuição de sempre, neg_atribuir_pessoa). A função pede leads.assign só quando a pessoa
 *  ainda não é cliente (client_since vazio): nesse caso, sem a permissão, o seletor fica fixo e diz porquê. Um cliente fica como estava. */
export function ComercialDaLead({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { gravar, aviso } = useGravar(ctx, d);
  const x = d.dadosLead;
  if (!x) return null;
  const id = `lead-${d.id}-comercial`;
  const fixo = !x.cliente && !atribuir.pode;
  const semPermissao = fixo && !atribuir.aLer;
  return (
    <div className={cn(ROT, "max-w-sm")}>
      <label htmlFor={id}>Comercial</label>
      <select id={id} className={cn(INP, fixo && "cursor-not-allowed opacity-60")} value={x.comercialId} disabled={fixo}
        aria-describedby={semPermissao ? `${id}-permissao` : undefined} onChange={(e) => gravar({ comercialId: e.target.value }, "comercial")}>
        <option value="">Sem comercial</option>
        {apoio.comerciais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        {x.comercialId && !apoio.comerciais.some((c) => c.id === x.comercialId) && <option value={x.comercialId}>{x.comercial || "O comercial atual"}</option>}
      </select>
      {semPermissao && <p id={`${id}-permissao`} className="text-sm font-normal text-muted-foreground">Mudar o comercial pede a permissão «Atribuir leads».</p>}
      {aviso}
    </div>
  );
}

/** As respostas ao formulário da campanha (pelo nome de cada campo), gravadas na pessoa ao sair. */
export function RespostasDaLead({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { gravar, aviso } = useGravar(ctx, d);
  const x = d.dadosLead;
  if (!x || x.respostas.length === 0) return null;
  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold text-foreground">Do formulário{x.campanha ? ` (${x.campanha})` : ""}</p>
      {x.respostas.map((r) => {
        const id = `lead-${d.id}-r-${r.k}`;
        return (
          <div key={r.k} className={ROT}>
            <label htmlFor={id}>{r.l}</label>
            <input key={id + r.v} id={id} defaultValue={r.v} className={INP}
              onBlur={(e) => { if (e.target.value.trim() !== r.v) gravar({ respostas: { ...Object.fromEntries(x.respostas.map((y) => [y.k, y.v])), [r.k]: e.target.value } }, r.l); }} />
          </div>
        );
      })}
      {aviso}
    </div>
  );
}
