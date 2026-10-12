// "Registar movimento" em dois passos: escolhe-se o tipo e preenche-se o formulário. As linhas que falham ficam no diálogo com a mensagem; as outras entram no livro.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { FOCO } from "../FiltrosPopover";
import { BORDA_CTRL } from "../PessoaLinha";
import { ecLinhaInfo } from "./ec";
import { Dlg } from "./DialogosInv";
import { useCtxInv } from "./ctxInv";
import { EditorLinhas } from "./EditorLinhas";
import { linhasValidas, type LinhaEd } from "./linhasEd";
import { MOTIVOS_AJUSTE, MOTIVOS_QUEBRA, TIPOS_REGISTO, avisosLinha, registarMovimento, type ResultadoRegisto, type TipoRegisto } from "./movimentos";
import { opcoesArmazens, opcoesFornecedores, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pri, Sec, Texto } from "./pecasInv";
import { ecPorId } from "./base";
import type { Inventario } from "./tipos";

export interface PreMov { type?: TipoRegisto; sku?: string; wh?: string; tr?: string }
interface Estado { passo: 1 | 2; type: TipoRegisto; wh: string; from: string; to: string; tr: string; ec: string; sign: "+" | "-"; reason: string; note: string; supplier: string; doc: string; linhas: LinhaEd[]; erro: string; resultado: ResultadoRegisto | null }
const vazio = [["", "—"]] as const;

function inicio(db: Inventario, pre: PreMov): Estado {
  const t = db.transfers.find((x) => x.id === pre.tr);
  const wh = pre.wh ?? db.settings.defaultWh;
  return { passo: pre.type ? 2 : 1, type: pre.type ?? "in", wh, from: t?.from ?? wh, to: t?.to ?? (wh === "POR" ? "LIS" : "POR"), tr: pre.tr ?? "", ec: "", sign: "+", reason: "", note: "", supplier: "", doc: "", linhas: [{ sku: pre.sku ?? "", qty: t?.qty ?? 1, cost: "" }], erro: "", resultado: null };
}

function Tipos({ escolher }: { escolher: (t: TipoRegisto) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {TIPOS_REGISTO.map((t) => (
        <button key={t.id} type="button" onClick={() => escolher(t.id)} className={cn("grid min-h-11 cursor-pointer gap-1 rounded-xl border bg-card p-3 text-left hover:border-foreground", BORDA_CTRL, FOCO)}>
          <b className="text-[15px]">{t.nome}</b><span className="text-[15px] text-muted-foreground">{t.desc}</span>
        </button>
      ))}
    </div>
  );
}

function Formulario({ f, mudar }: { f: Estado; mudar: (p: Partial<Estado>) => void }) {
  const { db } = useCtxInv();
  const trs = db.transfers.filter((t) => t.state === "pending");
  const ecs = db.ecs.filter((e) => !e.deleted && e.wh === f.wh && e.lines.some((l) => l.sku && !l.voided && l.served < l.qty));
  const arm = opcoesArmazens(db);
  const motivo = f.type === "adjust" ? MOTIVOS_AJUSTE : MOTIVOS_QUEBRA;
  const pickEc = (id: string): void => {
    const e = ecPorId(db, id);
    const ls = e ? e.lines.filter((l) => l.sku && !l.voided && l.served < l.qty).map((l): LinhaEd => ({ sku: l.sku as string, qty: Math.max(1, ecLinhaInfo(db, e, l).ready), cost: "" })) : [];
    mudar({ ec: id, ...(ls.length ? { linhas: ls } : {}) });
  };
  const pickTr = (id: string): void => {
    const t = trs.find((x) => x.id === id);
    mudar(t ? { tr: id, from: t.from, to: t.to, linhas: [{ sku: t.sku, qty: t.qty, cost: "" }] } : { tr: id });
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {f.type === "transfer" ? (
          <>
            <Lista rotulo="Origem" valor={f.from} aoMudar={(v) => mudar({ from: v })} opcoes={arm} obrigatorio />
            <Lista rotulo="Destino" valor={f.to} aoMudar={(v) => mudar({ to: v })} opcoes={arm} obrigatorio />
            <Lista rotulo="Pedido de transferência (opcional)" valor={f.tr} aoMudar={pickTr} opcoes={[["", "Nenhum"], ...trs.map((t) => [t.id, `${t.id} · ${t.qty}× ${t.sku} · ${t.from}→${t.to}`] as const)]} />
          </>
        ) : <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => mudar({ wh: v, ec: "" })} opcoes={arm} obrigatorio />}
        {f.type === "out" && <Lista rotulo="Encomenda Cliente de origem (opcional)" valor={f.ec} aoMudar={pickEc} opcoes={[["", "Sem EC"], ...ecs.map((e) => [e.id, `${e.id} · ${e.client}`] as const)]} ajuda="Preenche as linhas com o que está pronto a sair." />}
        {f.type === "adjust" && <Lista rotulo="Sentido" valor={f.sign} aoMudar={(v) => mudar({ sign: v as "+" | "-" })} opcoes={[["+", "Aumentar (+)"], ["-", "Diminuir (−)"]]} />}
        {(f.type === "in" || f.type === "ret") && <Lista rotulo={f.type === "ret" ? "Fornecedor" : "Fornecedor (opcional)"} valor={f.supplier} aoMudar={(v) => mudar({ supplier: v })} opcoes={[...vazio, ...opcoesFornecedores(db)]} obrigatorio={f.type === "ret"} />}
        {(f.type === "adjust" || f.type === "loss") && <Lista rotulo="Motivo" valor={f.reason} aoMudar={(v) => mudar({ reason: v })} opcoes={[["", "Escolher…"], ...motivo.map((m) => [m, m] as const)]} obrigatorio />}
        <Texto rotulo="Documento (opcional)" valor={f.doc} aoMudar={(v) => mudar({ doc: v })} ajuda="Por exemplo guia ou fatura." />
        <Texto rotulo="Notas" valor={f.note} aoMudar={(v) => mudar({ note: v })} />
      </div>
      <EditorLinhas linhas={f.linhas} aoMudar={(l) => mudar({ linhas: l })} opcoes={opcoesProdutos(db)} comCusto={f.type === "in"}
        nota={(_, i) => <>{avisosLinha(db, f, f.linhas, i).map((a) => <Nota key={a.msg} tom={a.tom}>{a.msg}</Nota>)}{f.resultado?.failed.filter((x) => x.i === i).map((x) => <Nota key={x.msg} tom="bad" alerta>Falhou: {x.msg}</Nota>)}</>} />
    </>
  );
}

export function MovimentoDialogo({ aberto, aoFechar, pre = {} }: { aberto: boolean; aoFechar: () => void; pre?: PreMov }) {
  const { db, agir } = useCtxInv();
  const [f, setF] = useState<Estado>(() => inicio(db, pre));
  const mudar = (p: Partial<Estado>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const T = TIPOS_REGISTO.find((t) => t.id === f.type);
  const registar = (): void => {
    const linhas = linhasValidas(f.linhas);
    if (!linhas || !linhas.length) { setF((x) => ({ ...x, erro: "Escolha o produto e uma quantidade inteira em cada linha." })); return; }
    const r = agir((d) => registarMovimento(d, { type: f.type, wh: f.wh, from: f.from, to: f.to, tr: f.tr, ec: f.ec, sign: f.sign, reason: f.reason, note: f.note, supplier: f.supplier, doc: f.doc, lines: linhas }));
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    if (!r.valor.failed.length) { aoFechar(); return; }
    const falhadas = new Set(r.valor.failed.map((x) => x.i));
    setF((x) => ({ ...x, resultado: { ok: r.valor.ok, failed: r.valor.failed.map((e, k) => ({ i: k, msg: e.msg })) }, linhas: x.linhas.filter((_, i) => falhadas.has(i)), erro: "" }));
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} largo titulo={f.passo === 1 ? "Registar movimento · 1 de 2" : `Registar movimento · 2 de 2 · ${T?.nome}`}
      descricao={f.passo === 1 ? "Que tipo de movimento? O stock só muda por movimentos e todos ficam no livro." : T?.desc}
      rodape={f.passo === 1 ? <Sec onClick={aoFechar}>Cancelar</Sec> : <><Sec onClick={() => mudar({ passo: 1, resultado: null })}>Mudar tipo</Sec><Sec onClick={aoFechar}>{f.resultado?.ok.length ? "Fechar" : "Cancelar"}</Sec><Pri onClick={registar}>Registar {f.linhas.length} linha{f.linhas.length === 1 ? "" : "s"}</Pri></>}>
      {f.passo === 1 ? <Tipos escolher={(t) => mudar({ type: t, passo: 2 })} /> : <Formulario f={f} mudar={mudar} />}
      {f.resultado && <Nota tom={f.resultado.failed.length ? "warn" : "ok"}><b>{f.resultado.ok.length} de {f.resultado.ok.length + f.resultado.failed.length} registados</b>; linhas falhadas mantidas para corrigir.</Nota>}
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}
