// A folha da guia do fornecedor (guiaSheet do mockup): anunciado contra recebido, as receções por esta guia, o histórico e as ações por estado
// (editar, cancelar, fechar, usar na receção; reabrir; criar nova). Com o perfil "Só consulta" os botões que mudam a guia ficam desativados.
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ExternalLink, Lock, Pencil, Plus, Printer, ScanLine } from "lucide-react";
import { fmtD, fmtDT, guiaEnviadaForn, guiaPorId, nomeArm, nomeForn, nomeProd } from "./base";
import { abrirAnexoGuia, tamanhoAnexo } from "./anexoGuia";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Folha } from "./DialogosInv";
import { AprenderDlg, GuiaForm, PdfGuiaDlg } from "./GuiaDialogo";
import { GUIA_ESTADOS, cancelarGuia, fecharGuia, reabrirGuia, resumoGuia, type TipoDiferenca } from "./guias";
import { Ligacao, Dados, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { fixarRececao } from "./rececao";
import { TabelaInv } from "./TabelaInv";
import type { Guia, Inventario, Tom } from "./tipos";

export const TOM_GUIA: Record<Guia["state"], Tom> = { open: "info", closed: "ok", cancelled: "neu" };
export const SeloGuia = ({ g }: { g: Guia }) => <Selo tom={TOM_GUIA[g.state]}>{GUIA_ESTADOS[g.state]}</Selo>;
/** SÓ PROTÓTIPO (21/10): a guia veio do fornecedor, no portal (ao expedir). */
export const SeloOrigemGuia = ({ g }: { g: Guia }) => (guiaEnviadaForn(g) ? <Selo tom="violet">Fornecedor (portal)</Selo> : null);
/** O ficheiro da guia anexado pelo fornecedor: nome, tamanho e "Ver guia" (separador novo). */
export function AnexoGuiaLinha({ g }: { g: Guia }) {
  if (!g.anexo) return <span className="muted">Sem ficheiro</span>;
  const a = g.anexo;
  return <span>{a.nome} <small className="muted">({tamanhoAnexo(a.tamanho)})</small> <button type="button" className="link" onClick={() => abrirAnexoGuia(a)}><ExternalLink className="ic sm" aria-hidden="true" /> Ver guia<span className="sr"> (abre num separador novo)</span></button></span>;
}
const TIPO: Record<TipoDiferenca, [string, Tom]> = { ok: ["Certo", "ok"], falta: ["Falta", "warn"], excesso: ["Excesso", "warn"], div: ["Divergência (não anunciado)", "bad"] };

type Dlg = "editar" | "fechar" | "cancelar" | "nova" | "pdf" | "associar";

function Rodape({ g, ro, abrirDlg, aoUsar }: { g: Guia; ro: boolean; abrirDlg: (d: Dlg) => void; aoUsar: () => void }) {
  const { agir } = useCtxInv();
  const dis = ro ? { disabled: true, title: porqueNao("inventory.receive") } : {};
  const doG = (d: Inventario): Guia => guiaPorId(d, g.id) as Guia;
  let acoes: ReactNode;
  if (g.state === "open") {
    acoes = <>
      <button type="button" className="btn" {...dis} onClick={() => abrirDlg("editar")}><Pencil className="ic" aria-hidden="true" />Editar</button>
      <button type="button" className="btn" {...dis} onClick={() => abrirDlg("cancelar")}>Cancelar guia</button>
      <button type="button" className="btn" {...dis} onClick={() => abrirDlg("fechar")}><Check className="ic" aria-hidden="true" />Fechar</button>
      <button type="button" className="btn btn-p" {...dis} onClick={aoUsar}><ScanLine className="ic" aria-hidden="true" />Usar esta guia</button>
    </>;
  } else if (g.state === "closed") {
    acoes = <>
      <span className="muted" style={{ alignSelf: "center" }}><Lock className="ic sm" aria-hidden="true" /> Guia fechada</span>
      <button type="button" className="btn" {...dis} onClick={() => agir((d) => reabrirGuia(d, doG(d)), "Guia reaberta.")}>Reabrir</button>
      <button type="button" className="btn btn-p" {...dis} onClick={() => { if (agir((d) => reabrirGuia(d, doG(d)), "Guia reaberta para edição.").ok) abrirDlg("editar"); }}><Pencil className="ic" aria-hidden="true" />Reabrir e editar</button>
    </>;
  } else {
    acoes = <>
      <span className="muted" style={{ alignSelf: "center" }}><Lock className="ic sm" aria-hidden="true" /> Guia cancelada: {g.note}</span>
      <button type="button" className="btn" {...dis} onClick={() => abrirDlg("nova")}><Plus className="ic" aria-hidden="true" />Criar nova guia</button>
    </>;
  }
  return (
    <>
      <div className="left">
        <button type="button" className="btn btn-ghost" onClick={() => abrirDlg("pdf")}><Printer className="ic" aria-hidden="true" />PDF prova de receção</button>
        <button type="button" className="btn btn-ghost" {...dis} onClick={() => abrirDlg("associar")}>Associar código a produto</button>
      </div>
      {acoes}
    </>
  );
}

function Corpo({ g }: { g: Guia }) {
  const { db, abrir } = useCtxInv();
  const s = resumoGuia(db, g);
  const recs = db.pos.flatMap((p) => p.receipts.filter((r) => r.guia === g.id).map((r) => [p, r] as const));
  return (
    <>
      <h3 style={{ marginBottom: 8 }}>Anunciado vs recebido</h3>
      {s.rows.length ? (
        <TabelaInv titulo="Anunciado vs recebido" minimo={560} chave={(r) => r.sku} linhas={s.rows}
          colunas={[{ id: "p", titulo: "Produto", celula: (r) => nomeProd(db, r.sku) }, { id: "a", titulo: "Anunciado", direita: true, celula: (r) => r.ann }, { id: "r", titulo: "Recebido", direita: true, celula: (r) => r.rec },
            { id: "d", titulo: "Diferença", direita: true, celula: (r) => `${r.diff > 0 ? "+" : ""}${r.diff}` }, { id: "e", titulo: "", nome: "Estado", celula: (r) => (s.anyRec || r.kind === "ok" ? <Selo tom={TIPO[r.kind][1]}>{TIPO[r.kind][0]}</Selo> : <Selo>Por receber</Selo>) }]} />
      ) : <div className="tw"><table className="min-560"><caption className="sr">Anunciado vs recebido</caption><thead><tr><th scope="col">Produto</th><th scope="col" className="num">Anunciado</th><th scope="col" className="num">Recebido</th><th scope="col" className="num">Diferença</th><th scope="col"><span className="sr">Estado</span></th></tr></thead><tbody><tr><td colSpan={5} className="muted">Sem linhas anunciadas.</td></tr></tbody></table></div>}
      <h3 style={{ margin: "14px 0 8px" }}>Receções por esta guia</h3>
      {recs.length ? (
        <TabelaInv titulo="Receções por esta guia" minimo={640} chave={([, r]) => r.id} linhas={recs}
          colunas={[{ id: "d", titulo: "Data", celula: ([, r]) => fmtDT(r.at) }, { id: "p", titulo: "Encomenda", celula: ([p]) => <Ligacao className="mono" aoClicar={() => abrir({ t: "po", id: p.id, tab: "rec" })}>{p.id}</Ligacao> },
            { id: "pr", titulo: "Produto", celula: ([, r]) => nomeProd(db, r.sku) }, { id: "q", titulo: "Qtd", direita: true, celula: ([, r]) => r.qty },
            { id: "rp", titulo: "Repartição", celula: ([, r]) => <div className="split">{r.toEC ? <span className="to-ec">{r.toEC} → {r.ec}</span> : null}{r.toStock ? <span className="to-st">{r.toStock} → stock</span> : null}</div> },
            { id: "e", titulo: "Estado", celula: ([, r]) => <Selo tom={r.state === "Ativa" ? "ok" : "neu"}>{r.state}</Selo> }]} />
      ) : <p className="muted">Ainda sem receções.</p>}
      <h3 style={{ margin: "14px 0 6px" }}>Histórico</h3>
      <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>{g.history.slice().reverse().map((h, i) => <li key={i}>{fmtDT(h.at)} — {h.t}</li>)}</ol>
      <Fonte>rpc_delivery_note_get · rpc_delivery_note_save · rpc_delivery_note_close · rpc_delivery_note_reopen · rpc_delivery_note_cancel</Fonte>
    </>
  );
}

export function GuiaFolha({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir, ir } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const g = guiaPorId(db, id);
  if (!g) return null;
  const s = resumoGuia(db, g);
  const ro = !can("inventory.receive");
  const doG = (d: typeof db): Guia => guiaPorId(d, id) as Guia;
  const usar = (): void => { agir((d) => fixarRececao(d, { guia: id })); ir({ aba: "guia" }); };
  const info: [string, ReactNode][] = [["Fornecedor", nomeForn(db, g.sup)], ["Data", fmtD(g.date)], ["Armazém", nomeArm(db, g.wh)],
    ["Origem", guiaEnviadaForn(g) ? "Fornecedor (portal)" : "Registada no armazém"], ...(guiaEnviadaForn(g) ? [["Ficheiro da guia", <AnexoGuiaLinha key="a" g={g} />] as [string, ReactNode]] : []),
    ["Encomendas", g.pos.length ? <FolhaPos key="p" pos={g.pos} /> : "—"], ...(g.note ? [["Nota", g.note] as [string, ReactNode]] : [])];
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={g.id} tituloClasse="mono" subtitulo="Armazém › Receção › Guia do fornecedor" abas={<Dados itens={info} />}
      selos={<><SeloGuia g={g} /><SeloOrigemGuia g={g} />{s.div ? <Selo tom="bad">{s.div} divergência(s)</Selo> : null}</>}
      rodape={<Rodape g={g} ro={ro} abrirDlg={setDlg} aoUsar={usar} />}>
      <Corpo g={g} />
      {(dlg === "editar" || dlg === "nova") && <GuiaForm id={dlg === "editar" ? id : undefined} aoFechar={() => setDlg(null)} />}
      {dlg === "associar" && <AprenderDlg code="" k={null} aoFechar={() => setDlg(null)} />}
      {dlg === "pdf" && <PdfGuiaDlg id={id} aoFechar={() => setDlg(null)} />}
      {dlg === "fechar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Fechar guia ${id}`} ok="Fechar guia" motivo={s.div ? "Nota" : undefined}
        texto={s.div ? <div className="alert warn"><AlertTriangle className="ic" aria-hidden="true" /><span>Há {s.div} divergência(s) entre anunciado e recebido: a nota é obrigatória.</span></div> : <p>Anunciado e recebido coincidem.</p>}
        aoConfirmar={(m) => agir((d) => fecharGuia(d, doG(d), m), "Guia fechada.")} />}
      {dlg === "cancelar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Cancelar guia ${id}`} ok="Cancelar guia" perigo motivo="Motivo" texto={<p>Só é possível sem receções ativas.</p>} aoConfirmar={(m) => agir((d) => cancelarGuia(d, doG(d), m), "Guia cancelada.")} />}
    </Folha>
  );
}

/** As encomendas da guia: ligações separadas por vírgula (como no mockup). */
function FolhaPos({ pos }: { pos: string[] }) {
  const { abrir } = useCtxInv();
  return <>{pos.map((p, i) => <span key={p}>{i > 0 ? ", " : ""}<Ligacao className="mono" aoClicar={() => abrir({ t: "po", id: p })}>{p}</Ligacao></span>)}</>;
}
