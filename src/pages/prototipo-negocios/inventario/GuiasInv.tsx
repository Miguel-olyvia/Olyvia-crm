// Armazém › Guias (receção): a lista das guias do fornecedor (abertas, com divergências, fechadas, canceladas), a folha com o anunciado contra o recebido e o formulário de guia.
// Um só botão primário: "Nova guia". A receção por código no telemóvel não foi portada: recebe-se na folha de cada encomenda (ver README).
import { useState } from "react";
import { Plus } from "lucide-react";
import { CHIP } from "../FiltrosPopover";
import { fmtD, fmtDT, guiaPorId, nomeArm, nomeForn, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg, Folha } from "./DialogosInv";
import { EditorLinhas } from "./EditorLinhas";
import { linhasValidas, type LinhaEd } from "./linhasEd";
import { contaGuias, filtrarGuias, type FiltrosGuia } from "./filtros";
import { GUIA_ESTADOS, cancelarGuia, fecharGuia, guardarGuia, reabrirGuia, resumoGuia, type TipoDiferenca } from "./guias";
import { opcoesArmazens, opcoesFornecedores, opcoesProdutos } from "./opcoes";
import { Dados, Lista, Ligacao, Nota, Pri, Sec, Selo, Texto, Vazio } from "./pecasInv";
import { TabelaInv } from "./TabelaInv";
import type { Guia, Tom } from "./tipos";

const ESTADOS: readonly (readonly [FiltrosGuia["estado"], string])[] = [["all", "Todas"], ["open", "Abertas"], ["div", "Com divergências"], ["closed", "Fechadas"], ["cancelled", "Canceladas"]];
const TOM_G: Record<Guia["state"], Tom> = { open: "info", closed: "ok", cancelled: "neu" };
const TIPO: Record<TipoDiferenca, [string, Tom]> = { ok: ["Certo", "ok"], falta: ["Falta", "warn"], excesso: ["Excesso", "warn"], div: ["Divergência (não anunciado)", "bad"] };

function GuiaForm({ id, aoFechar }: { id?: string; aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const g = id ? guiaPorId(db, id) : undefined;
  const [f, setF] = useState(() => ({ no: g?.id ?? "", sup: g?.sup ?? "", date: g?.date ?? "2026-10-09", wh: g?.wh ?? db.settings.defaultWh, linhas: (g ? g.ann.map((a): LinhaEd => ({ sku: a.sku, qty: a.qty })) : [{ sku: "", qty: 1 }]) as LinhaEd[], erro: "" }));
  const m = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const dup = f.no.trim() && f.sup ? db.guias.find((x) => x.id.toLowerCase() === f.no.trim().toLowerCase() && x.sup === f.sup && x.id !== id) : undefined;
  const gravar = (): void => {
    const l = linhasValidas(f.linhas);
    if (!l) { setF((x) => ({ ...x, erro: "Quantidades inteiras." })); return; }
    const r = agir((d) => guardarGuia(d, { orig: id ?? null, no: f.no, sup: f.sup, date: f.date, wh: f.wh, ann: l.map((x) => ({ sku: x.sku, qty: x.qty })) }), "Guia gravada.");
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    aoFechar();
    abrir({ t: "guia", id: r.valor.id });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={g ? `Editar guia ${g.id}` : "Nova guia do fornecedor"} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri disabled={!!dup} title={dup ? "Guia duplicada: use a existente" : undefined} onClick={gravar}>Gravar guia</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Texto rotulo="Nº da guia" valor={f.no} aoMudar={(v) => m({ no: v })} obrigatorio atributos={{ placeholder: "GR 2026/313" }} />
        <Lista rotulo="Fornecedor" valor={f.sup} aoMudar={(v) => m({ sup: v })} opcoes={[["", "Escolher…"], ...opcoesFornecedores(db)]} obrigatorio />
        <Texto rotulo="Data" tipo="date" valor={f.date} aoMudar={(v) => m({ date: v })} />
        <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => m({ wh: v })} opcoes={opcoesArmazens(db)} />
      </div>
      {dup && <Nota tom="warn"><b>Guia duplicada:</b> {dup.id} de {nomeForn(db, dup.sup)} já existe ({GUIA_ESTADOS[dup.state].toLowerCase()}). Use a existente.</Nota>}
      <EditorLinhas titulo="Anunciado na guia" linhas={f.linhas} aoMudar={(l) => m({ linhas: l })} opcoes={opcoesProdutos(db, false)} />
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}

function GuiaFolha({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const [dlg, setDlg] = useState<"editar" | "fechar" | "cancelar" | "nova" | null>(null);
  const g = guiaPorId(db, id);
  if (!g) return null;
  const s = resumoGuia(db, g);
  const recs = db.pos.flatMap((p) => p.receipts.filter((r) => r.guia === g.id).map((r) => [p, r] as const));
  const doG = (d: typeof db): Guia => guiaPorId(d, id) as Guia;
  const rodape = g.state === "open" ? <><Sec onClick={() => setDlg("editar")}>Editar</Sec><Sec onClick={() => setDlg("cancelar")}>Cancelar guia</Sec><Pri onClick={() => setDlg("fechar")}>Fechar</Pri></>
    : g.state === "closed" ? <><Sec onClick={() => agir((d) => reabrirGuia(d, doG(d)), "Guia reaberta.")}>Reabrir</Sec><Pri onClick={() => { if (agir((d) => reabrirGuia(d, doG(d)), "Guia reaberta para edição.").ok) setDlg("editar"); }}>Reabrir e editar</Pri></>
    : <><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={() => setDlg("nova")}>Criar nova guia</Pri></>;
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={g.id} subtitulo="Armazém › Guia do fornecedor" rodape={rodape}
      selos={<><Selo tom={TOM_G[g.state]}>{GUIA_ESTADOS[g.state]}</Selo>{s.div > 0 && <Selo tom="bad">{s.div} divergência(s)</Selo>}</>}>
      <Dados itens={[["Fornecedor", nomeForn(db, g.sup)], ["Data", fmtD(g.date)], ["Armazém", nomeArm(db, g.wh)], ["Encomendas", g.pos.length ? <span key="p">{g.pos.map((p) => <Ligacao key={p} aoClicar={() => abrir({ t: "po", id: p })}>{p}</Ligacao>)}</span> : "—"], ...(g.note ? [["Nota", g.note] as const] : [])]} />
      <h3 className="text-base font-semibold">Anunciado contra recebido</h3>
      <TabelaInv rolar titulo="Anunciado contra recebido" chave={(r) => r.sku} linhas={s.rows}
        colunas={[{ id: "p", titulo: "Produto", celula: (r) => nomeProd(db, r.sku) }, { id: "a", titulo: "Anunciado", direita: true, celula: (r) => r.ann }, { id: "r", titulo: "Recebido", direita: true, celula: (r) => r.rec },
          { id: "d", titulo: "Diferença", direita: true, celula: (r) => `${r.diff > 0 ? "+" : ""}${r.diff}` }, { id: "e", titulo: "Estado", celula: (r) => (s.anyRec || r.kind === "ok" ? <Selo tom={TIPO[r.kind][1]}>{TIPO[r.kind][0]}</Selo> : <Selo>Por receber</Selo>) }]} />
      <h3 className="text-base font-semibold">Receções por esta guia</h3>
      {recs.length === 0 ? <p className="text-[15px] text-muted-foreground">Ainda sem receções.</p> : (
        <TabelaInv rolar titulo="Receções por esta guia" chave={([, r]) => r.id} linhas={recs}
          colunas={[{ id: "d", titulo: "Data", celula: ([, r]) => fmtDT(r.at) }, { id: "p", titulo: "Encomenda", celula: ([p]) => <Ligacao aoClicar={() => abrir({ t: "po", id: p.id, tab: "rec" })}>{p.id}</Ligacao> }, { id: "pr", titulo: "Produto", celula: ([, r]) => nomeProd(db, r.sku) },
            { id: "q", titulo: "Qtd", direita: true, celula: ([, r]) => r.qty }, { id: "rp", titulo: "Repartição", celula: ([, r]) => `${r.toEC ? r.toEC + " → " + r.ec + " " : ""}${r.toStock ? r.toStock + " → stock" : ""}` }, { id: "e", titulo: "Estado", celula: ([, r]) => r.state }]} />
      )}
      <h3 className="text-base font-semibold">Histórico</h3>
      <ol className="grid gap-1 pl-5 text-[15px]" style={{ listStyle: "decimal" }}>{g.history.slice().reverse().map((h, i) => <li key={i}>{fmtDT(h.at)} — {h.t}</li>)}</ol>
      {dlg === "editar" && <GuiaForm id={id} aoFechar={() => setDlg(null)} />}
      {dlg === "nova" && <GuiaForm aoFechar={() => setDlg(null)} />}
      {dlg === "fechar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Fechar guia ${id}`} ok="Fechar guia" motivo={s.div ? "Nota" : undefined} texto={<p>{s.div ? `Há ${s.div} divergência(s) entre anunciado e recebido: a nota é obrigatória.` : "Anunciado e recebido coincidem."}</p>} aoConfirmar={(m) => agir((d) => fecharGuia(d, doG(d), m), "Guia fechada.")} />}
      {dlg === "cancelar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Cancelar guia ${id}`} ok="Cancelar guia" perigo motivo="Motivo" texto={<p>Só é possível sem receções ativas.</p>} aoConfirmar={(m) => agir((d) => cancelarGuia(d, doG(d), m), "Guia cancelada.")} />}
    </Folha>
  );
}

export function GuiasInv() {
  const { db, filtros, setFiltros, abrir } = useCtxInv();
  const f = filtros.guia;
  const lista = filtrarGuias(db, f);
  const [nova, setNova] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <Pri onClick={() => setNova(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova guia</Pri>
      </div>
      <div role="group" aria-label="Estado das guias" className="flex flex-wrap gap-2">
        {ESTADOS.map(([k, nome]) => <button key={k} type="button" aria-pressed={f.estado === k} onClick={() => setFiltros("guia", { estado: k })} className={CHIP(f.estado === k)}>{nome} <span className="tabular-nums opacity-70">{contaGuias(db, k)}</span></button>)}
      </div>
      {lista.length === 0 ? <Vazio titulo="Sem guias" /> : (
        <TabelaInv titulo="Guias do fornecedor" chave={(g) => g.id} linhas={lista} abrir={(g) => abrir({ t: "guia", id: g.id })} rotuloAbrir={(g) => `Abrir a guia ${g.id}`}
          colunas={[
            { id: "n", titulo: "Nº", celula: (g) => g.id, valor: (g) => g.id }, { id: "f", titulo: "Fornecedor", celula: (g) => nomeForn(db, g.sup), valor: (g) => nomeForn(db, g.sup) }, { id: "d", titulo: "Data", celula: (g) => fmtD(g.date), valor: (g) => g.date },
            { id: "p", titulo: "POs", celula: (g) => g.pos.join(", ") || "—" }, { id: "ar", titulo: "Anunciado / Recebido", direita: true, celula: (g) => `${resumoGuia(db, g).annT} / ${resumoGuia(db, g).recT}` },
            { id: "dv", titulo: "Divergências", celula: (g) => { const s = resumoGuia(db, g); return s.div ? <Selo tom="bad">{s.div}</Selo> : s.anyRec ? <Selo tom="ok">0</Selo> : "—"; } },
            { id: "e", titulo: "Estado", celula: (g) => <Selo tom={TOM_G[g.state]}>{GUIA_ESTADOS[g.state]}</Selo> },
          ]} />
      )}
      <p className="text-[15px] text-muted-foreground" aria-live="polite">{lista.length} guia(s)</p>
      {nova && <GuiaForm aoFechar={() => setNova(false)} />}
    </div>
  );
}

export { GuiaFolha };
