// A folha de uma contagem (scrCnt › countSheet do mockup): cabeçalho com o progresso e as ações, as linhas com edição das quantidades, resolução e notas,
// os movimentos gerados e o rodapé com Cancelar contagem e Finalizar.
import { useState } from "react";
import { Camera, Check, Info, Lock, Upload } from "lucide-react";
import { contagemPorId, fmtDT, nomeArm, nomeProd, produto } from "./base";
import { Fonte } from "./cabInv";
import { CONTAGEM_ESTADOS, RESOLUCOES, TOM_CONTAGEM, cancelarContagem, contarLeitura, contarLinha, estatisticasContagem, finalizarContagem, infoLinha, notaLinha, preencherEsperado, resolverLinha } from "./contagens";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg, Folha } from "./DialogosInv";
import { BotaoExportar, ImportarDlg } from "./ImportarInv";
import { defContagem } from "./importContArm";
import { Ed } from "./mockPecas";
import { MovimentoDialogo, type PreMov } from "./MovimentoDialogo";
import { Dados, Peq, Pri, Sec, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { TIPOS_MOV } from "./stock";
import { TabelaInv } from "./TabelaInv";
import type { Contagem, Inventario, LinhaContagem, Resolucao } from "./tipos";

const FECHADA = "Contagem fechada: corrija quantidades com um ajuste em Movimentos";
const doC = (d: Inventario, id: string): Contagem => contagemPorId(d, id) as Contagem;

/** Um campo que grava ao sair ou com Enter (o `onchange` do mockup); se a regra recusa, volta ao valor guardado. */
function CampoGravar({ valor, aoGravar, ...p }: { valor: string; aoGravar: (v: string) => boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [tick, setTick] = useState(0);
  const gravar = (v: string): void => { if (v !== valor && !aoGravar(v)) setTick((x) => x + 1); };
  return <input key={`${valor}-${tick}`} defaultValue={valor} {...p} onBlur={(e) => gravar(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") gravar(e.currentTarget.value); }} />;
}

function CelulaContada({ c, l, k, aberta, pedirAjuste }: { c: Contagem; l: LinhaContagem; k: number; aberta: boolean; pedirAjuste: (sku: string) => void }) {
  const { db, agir } = useCtxInv();
  if (aberta) {
    return <CampoGravar id={`cl-${k}`} type="number" min={0} step={1} inputMode="numeric" style={{ width: 90 }} aria-label={`Contada ${nomeProd(db, l.sku)}`} valor={l.counted == null ? "" : String(l.counted)}
      aoGravar={(v) => agir((d) => contarLinha(d, doC(d, c.id), k, v === "" ? null : Number(v))).ok} />;
  }
  const desbloquear = <> <button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); pedirAjuste(l.sku); }}><Lock className="ic sm" aria-hidden="true" />Registar ajuste</button></>;
  return <Ed valor={l.counted} aoGravar={() => undefined} mostrar={l.counted == null ? "—" : String(l.counted)} bloqueio={c.state === "final" ? "Contagem finalizada: quantidades corrigem-se com um ajuste" : "Contagem cancelada"} desbloquear={desbloquear} />;
}

function CelulaResolucao({ c, l, k, aberta }: { c: Contagem; l: LinhaContagem; k: number; aberta: boolean }) {
  const { db, agir } = useCtxInv();
  if (!infoLinha(db, c, l).diff && aberta) return null;
  if (!aberta) return <>{l.res ? RESOLUCOES[l.res] : "—"}</>;
  return (
    <select id={`cr-${k}`} aria-label="Resolução" value={l.res} onChange={(e) => agir((d) => resolverLinha(d, doC(d, c.id), k, e.target.value as Resolucao))}>
      <option value="">Por resolver</option>
      {(Object.keys(RESOLUCOES) as Exclude<Resolucao, "">[]).map((r) => <option key={r} value={r}>{RESOLUCOES[r]}</option>)}
    </select>
  );
}

function CelulaNota({ c, l, k, aberta }: { c: Contagem; l: LinhaContagem; k: number; aberta: boolean }) {
  const { db, agir } = useCtxInv();
  if (!infoLinha(db, c, l).diff && aberta) return null;
  if (aberta) return <CampoGravar id={`cn-${k}`} placeholder="Nota" aria-label="Nota" valor={l.note} aoGravar={(v) => agir((d) => notaLinha(d, doC(d, c.id), k, v)).ok} />;
  return <Ed valor={l.note} aoGravar={(v) => agir((d) => notaLinha(d, doC(d, c.id), k, String(v)), "Gravado.")} perm="inventory.count" />;
}

function Leitor({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const c = doC(db, id);
  const ler = (code: string): void => { agir((d) => contarLeitura(d, doC(d, id), code)); };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Contar com leitor/câmara" rodape={<Sec onClick={aoFechar}>Concluir</Sec>}>
      <p className="muted">Cada leitura soma 1 à contada.</p>
      <div className="scanbox"><input autoFocus data-autofocus placeholder="Leia ou escreva o código e Enter" aria-label="Código" onKeyDown={(e) => { if (e.key === "Enter") { ler(e.currentTarget.value); e.currentTarget.value = ""; } }} /></div>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        {c.lines.map((l) => <button key={l.sku} type="button" className="btn" style={{ justifyContent: "space-between" }} onClick={() => ler(produto(db, l.sku)?.ean ?? l.sku)}><span>{nomeProd(db, l.sku)}</span><span className="mono muted">{l.counted == null ? "—" : l.counted}</span></button>)}
      </div>
    </Dlg>
  );
}

type Dlg3 = { t: "cancelar" | "leitor" | "importar" } | { t: "mov"; pre: PreMov } | null;

function Linhas({ c, pedirAjuste, aberta }: { c: Contagem; pedirAjuste: (sku: string) => void; aberta: boolean }) {
  const { db } = useCtxInv();
  const linhas = c.lines.map((l, k) => ({ l, k }));
  return (
    <TabelaInv minimo={1000} titulo="Linhas da contagem" chave={({ l }) => l.sku} linhas={linhas}
      colunas={[
        { id: "p", titulo: "Produto", celula: ({ l }) => <>{nomeProd(db, l.sku)}<br /><small className="muted mono">{l.sku}</small></> },
        { id: "s", titulo: "Sistema", direita: true, celula: ({ l }) => l.sys },
        { id: "m", titulo: "Movida durante", direita: true, celula: ({ l }) => { const m = infoLinha(db, c, l).moved; return m ? <span title="Movimentos feitos durante a contagem" style={{ color: "var(--i-info)", fontWeight: 600 }}>{m > 0 ? "+" : ""}{m}</span> : "0"; } },
        { id: "e", titulo: "Esperado", direita: true, celula: ({ l }) => infoLinha(db, c, l).exp },
        { id: "c", titulo: "Contada", celula: ({ l, k }) => <CelulaContada c={c} l={l} k={k} aberta={aberta} pedirAjuste={pedirAjuste} /> },
        { id: "d", titulo: "Diferença", direita: true, celula: ({ l }) => { const d = infoLinha(db, c, l).diff; return d == null ? <span className="muted">—</span> : d === 0 ? <Selo tom="ok">0</Selo> : <Selo tom="bad">{d > 0 ? "+" : ""}{d}</Selo>; } },
        { id: "r", titulo: "Resolução", celula: ({ l, k }) => <CelulaResolucao c={c} l={l} k={k} aberta={aberta} /> },
        { id: "n", titulo: "Nota", celula: ({ l, k }) => <CelulaNota c={c} l={l} k={k} aberta={aberta} /> },
      ]} />
  );
}

function Gerados({ c }: { c: Contagem }) {
  const { db } = useCtxInv();
  const gen = db.moves.filter((m) => c.moves.includes(m.id));
  return (
    <>
      <h3 style={{ margin: "14px 0 8px" }}>Movimentos gerados</h3>
      {gen.length ? gen.map((m) => <div key={m.id} className="row" style={{ fontSize: 13, gap: 8 }}><Selo tom={TIPOS_MOV[m.type].tone}>{TIPOS_MOV[m.type].t}</Selo>{m.qty > 0 ? "+" : ""}{m.qty} {nomeProd(db, m.sku)} · saldo {m.bal} · {fmtDT(m.at)}</div>) : <p className="muted">Nenhum (sem diferenças ajustadas).</p>}
    </>
  );
}

function Rodape({ c, pend, aoCancelar }: { c: Contagem; pend: number; aoCancelar: () => void }) {
  const { agir } = useCtxInv();
  const perm = can("inventory.count");
  if (c.state !== "open") return null;
  return (
    <>
      <div className="left"><button type="button" className="btn btn-ghost" disabled={!perm} title={perm ? undefined : porqueNao("inventory.count")} onClick={aoCancelar}>Cancelar contagem</button></div>
      <span className="muted" style={{ alignSelf: "center" }}>{pend ? `${pend} linha(s) por contar ou resolver` : "Pronta a finalizar"}</span>
      <Pri disabled={pend > 0 || !perm} title={!perm ? porqueNao("inventory.count") : pend ? "Há linhas por contar ou diferenças por resolver" : undefined}
        onClick={() => agir((d) => finalizarContagem(d, doC(d, c.id)), (n) => `Contagem finalizada: ${n} movimento(s) de ajuste.`)}><Check className="ic" aria-hidden="true" />Finalizar</Pri>
    </>
  );
}

export function ContagemFolha({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg3>(null);
  const c = contagemPorId(db, id);
  if (!c) return null;
  const s = estatisticasContagem(db, c), aberta = c.state === "open" && can("inventory.count");
  const def = defContagem(db, id), fechada = aberta ? undefined : FECHADA;
  const cab = (
    <>
      <Dados itens={[["Iniciada", `${fmtDT(c.started)} · ${c.user}`], ["Última atividade", fmtDT(c.last)], ["Progresso", `${s.done} / ${s.total} contadas`], ["Por resolver", s.pend]]} />
      <div className="row" style={{ marginBottom: 12 }}>
        <Peq disabled={!aberta} title={fechada} onClick={() => setDlg({ t: "leitor" })}><Camera className="ic" aria-hidden="true" />Câmara / leitor</Peq>
        <BotaoExportar def={def} pequeno />
        <Peq disabled={!aberta} title={fechada} onClick={() => setDlg({ t: "importar" })}><Upload className="ic" aria-hidden="true" />Importar</Peq>
        <Peq disabled={!aberta} onClick={() => agir((d) => preencherEsperado(d, doC(d, id)), "Linhas por contar preenchidas com o esperado.")}>Preencher contadas = esperado</Peq>
      </div>
    </>
  );
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={c.id} subtitulo="Armazém › Contagens" abas={cab}
      rodape={c.state === "open" ? <Rodape c={c} pend={s.pend} aoCancelar={() => setDlg({ t: "cancelar" })} /> : <Sec onClick={aoFechar}>Fechar</Sec>}
      selos={<><Selo tom={TOM_CONTAGEM[c.state]}>{CONTAGEM_ESTADOS[c.state]}</Selo><Selo>{nomeArm(db, c.wh)}</Selo><Selo>{c.cat || "Todas as categorias"}</Selo></>}>
      <Linhas c={c} aberta={aberta} pedirAjuste={(sku) => setDlg({ t: "mov", pre: { type: "adjust", sku, wh: c.wh } })} />
      <p className="rules" style={{ marginTop: 8 }}><Info className="ic sm" aria-hidden="true" />Diferença = contada − (sistema + movida durante a contagem). “Ajustado” gera um movimento de ajuste ao finalizar; “Recontagem” mantém a linha por resolver.</p>
      {c.state === "final" && <Gerados c={c} />}
      {c.cancelReason && <div className="alert neu" style={{ marginTop: 10 }}>Cancelada: {c.cancelReason}</div>}
      <Fonte>inventory_count_lines · rpc_update_inventory_count_line_quantity · rpc_resolve_inventory_count_line · rpc_bulk_update_inventory_count_lines · rpc_finalize_inventory_count</Fonte>
      {dlg?.t === "leitor" && <Leitor id={id} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "importar" && <ImportarDlg def={def} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} pre={dlg.pre} />}
      {dlg?.t === "cancelar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Cancelar ${id}`} ok="Cancelar contagem" perigo motivo="Motivo" texto={<p>A contagem fica cancelada; nenhum ajuste é gerado.</p>} aoConfirmar={(m) => agir((d) => cancelarContagem(d, doC(d, id), m), "Contagem cancelada.")} />}
    </Folha>
  );
}
