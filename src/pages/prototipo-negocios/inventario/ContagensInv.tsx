// Armazém › Contagens: as contagens físicas por armazém e categoria. A diferença conta o que se moveu durante a contagem; só se finaliza sem linhas por resolver
// e as diferenças ajustadas geram movimentos de ajuste no livro. Um só botão primário: "Nova contagem" (na lista) ou "Finalizar" (na folha).
import { useState } from "react";
import { Plus } from "lucide-react";
import { CHIP } from "../FiltrosPopover";
import { Campo, numero } from "../pecas";
import { diasEntre, fmtDT, HOJE, contagemPorId, nomeArm, nomeProd } from "./base";
import { CAMPO, Dados, Lista, Nota, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { CONTAGEM_ESTADOS, RESOLUCOES, cancelarContagem, contarLinha, criarContagem, estatisticasContagem, finalizarContagem, infoLinha, notaLinha, preencherEsperado, resolverLinha } from "./contagens";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg, Folha } from "./DialogosInv";
import { filtrarContagens } from "./filtros";
import { opcoesArmazens } from "./opcoes";
import { TIPOS_MOV } from "./stock";
import { TabelaInv } from "./TabelaInv";
import type { Contagem, Inventario, LinhaContagem, Resolucao, Tom } from "./tipos";

const TOM: Record<Contagem["state"], Tom> = { open: "info", final: "ok", cancelled: "neu" };
const ESTADOS: readonly (readonly [string, string])[] = [["", "Todas"], ["open", "Em contagem"], ["final", "Finalizadas"], ["cancelled", "Canceladas"]];

function NovaContagem({ aoFechar }: { aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const [f, setF] = useState<{ wh: string; cat: string; init: "blank" | "system"; erro: string }>({ wh: db.settings.defaultWh, cat: "", init: "blank", erro: "" });
  const cats = [...new Set(db.products.filter((p) => !p.kit).map((p) => p.cat))];
  const criar = (): void => {
    const r = agir((d) => criarContagem(d, { wh: f.wh, cat: f.cat, init: f.init }), (c) => `${c.id} criada.`);
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    aoFechar();
    abrir({ t: "cont", id: r.valor.id });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Nova contagem" descricao="O sistema guarda a fotografia do stock; movimentos feitos durante a contagem aparecem à parte para não falsear a diferença." rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={criar}>Começar contagem</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => setF({ ...f, wh: v, erro: "" })} opcoes={opcoesArmazens(db)} obrigatorio />
        <Lista rotulo="Categoria" valor={f.cat} aoMudar={(v) => setF({ ...f, cat: v, erro: "" })} opcoes={[["", "Todas"], ...cats.map((c) => [c, c] as const)]} />
        <Lista rotulo="Contagem inicial" valor={f.init} aoMudar={(v) => setF({ ...f, init: v === "system" ? "system" : "blank", erro: "" })} opcoes={[["blank", "Em branco (contagem cega)"], ["system", "Pré-preenchida com o stock do sistema"]]} className="sm:col-span-2" />
      </div>
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}

function CelulaContada({ c, l, k }: { c: Contagem; l: LinhaContagem; k: number }) {
  const { agir } = useCtxInv();
  const [tick, setTick] = useState(0);
  if (c.state !== "open") return <>{l.counted == null ? "—" : l.counted}</>;
  return <Campo id={`cc-${c.id}-${k}-${tick}`} type="number" min="0" step="1" value={l.counted == null ? "" : l.counted} ariaLabel={`Contada de ${l.sku}`} className={CAMPO + " w-24 text-right"}
    onCommit={(v) => { if (!agir((d) => contarLinha(d, contagemPorId(d, c.id) as Contagem, k, v.trim() === "" ? null : numero(v))).ok) setTick((x) => x + 1); }} />;
}

function ContagemFolha({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const [dlg, setDlg] = useState<"cancelar" | null>(null);
  const c = contagemPorId(db, id);
  if (!c) return null;
  const s = estatisticasContagem(db, c), aberta = c.state === "open";
  const doC = (d: Inventario): Contagem => contagemPorId(d, id) as Contagem;
  const gerados = db.moves.filter((m) => c.moves.includes(m.id));
  const linhas = c.lines.map((l, k) => ({ l, k }));
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={c.id} subtitulo="Armazém › Contagens" selos={<><Selo tom={TOM[c.state]}>{CONTAGEM_ESTADOS[c.state]}</Selo><Selo>{nomeArm(db, c.wh)}</Selo><Selo>{c.cat || "Todas as categorias"}</Selo></>}
      rodape={aberta ? <><Sec className="mr-auto" onClick={() => setDlg("cancelar")}>Cancelar contagem</Sec><Sec onClick={() => agir((d) => preencherEsperado(d, doC(d)), "Linhas por contar preenchidas com o esperado.")}>Preencher contadas = esperado</Sec>
        <Pri disabled={s.pend > 0} title={s.pend ? "Há linhas por contar ou diferenças por resolver" : undefined} onClick={() => agir((d) => finalizarContagem(d, doC(d)), (n) => `Contagem finalizada: ${n} movimento(s) de ajuste.`)}>Finalizar</Pri></> : <Sec onClick={aoFechar}>Fechar</Sec>}>
      <Dados itens={[["Iniciada", `${fmtDT(c.started)} · ${c.user}`], ["Última atividade", fmtDT(c.last)], ["Progresso", `${s.done} / ${s.total} contadas`], ["Por resolver", s.pend]]} />
      <TabelaInv rolar titulo="Linhas da contagem" chave={({ l }) => l.sku} linhas={linhas}
        colunas={[
          { id: "p", titulo: "Produto", celula: ({ l }) => <>{nomeProd(db, l.sku)} · {l.sku}</> },
          { id: "s", titulo: "Sistema", direita: true, celula: ({ l }) => l.sys },
          { id: "m", titulo: "Movida durante", direita: true, celula: ({ l }) => { const i = infoLinha(db, c, l); return i.moved > 0 ? `+${i.moved}` : i.moved; } },
          { id: "e", titulo: "Esperado", direita: true, celula: ({ l }) => infoLinha(db, c, l).exp },
          { id: "c", titulo: "Contada", direita: true, celula: ({ l, k }) => <CelulaContada c={c} l={l} k={k} /> },
          { id: "d", titulo: "Diferença", direita: true, celula: ({ l }) => { const i = infoLinha(db, c, l); return i.diff == null ? "—" : <Selo tom={i.diff === 0 ? "ok" : "bad"}>{i.diff > 0 ? "+" : ""}{i.diff}</Selo>; } },
          { id: "r", titulo: "Resolução", celula: ({ l, k }) => { const i = infoLinha(db, c, l); if (!i.diff && aberta) return ""; return aberta
            ? <Lista rotulo="Resolução" valor={l.res} aoMudar={(v) => agir((d) => resolverLinha(d, doC(d), k, v as Resolucao))} opcoes={[["", "Por resolver"], ...(Object.keys(RESOLUCOES) as Exclude<Resolucao, "">[]).map((r) => [r, RESOLUCOES[r]] as const)]} />
            : l.res ? RESOLUCOES[l.res] : "—"; } },
          { id: "n", titulo: "Nota", celula: ({ l, k }) => (aberta ? <Campo id={`cn-${c.id}-${k}`} value={l.note} ariaLabel={`Nota de ${l.sku}`} className={CAMPO} onCommit={(v) => { agir((d) => notaLinha(d, doC(d), k, v)); }} /> : l.note || "—") },
        ]} />
      <p className="text-[15px] text-muted-foreground">Diferença = contada − (sistema + movida durante a contagem). «Ajustado» gera um movimento de ajuste ao finalizar; «Recontagem» mantém a linha por resolver.</p>
      {c.state === "final" && <><h3 className="text-base font-semibold">Movimentos gerados</h3>{gerados.length ? <ul className="grid gap-1 text-[15px]">{gerados.map((m) => <li key={m.id}><Selo tom={TIPOS_MOV[m.type].tone}>{TIPOS_MOV[m.type].t}</Selo> {m.qty > 0 ? "+" : ""}{m.qty} {nomeProd(db, m.sku)} · saldo {m.bal} · {fmtDT(m.at)}</li>)}</ul> : <p className="text-[15px] text-muted-foreground">Nenhum (sem diferenças ajustadas).</p>}</>}
      {c.cancelReason && <Nota tom="info">Cancelada: {c.cancelReason}</Nota>}
      {dlg === "cancelar" && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Cancelar ${id}`} ok="Cancelar contagem" perigo motivo="Motivo" texto={<p>A contagem fica cancelada; nenhum ajuste é gerado.</p>} aoConfirmar={(m) => agir((d) => cancelarContagem(d, doC(d), m), "Contagem cancelada.")} />}
    </Folha>
  );
}

export function ContagensInv() {
  const { db, filtros, setFiltros, abrir } = useCtxInv();
  const f = filtros.cont;
  const lista = filtrarContagens(db, f);
  const [nova, setNova] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <Pri onClick={() => setNova(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova contagem</Pri>
      </div>
      <div role="group" aria-label="Estado das contagens" className="flex flex-wrap gap-2">
        {ESTADOS.map(([k, nome]) => <button key={k} type="button" aria-pressed={f.estado === k} onClick={() => setFiltros("cont", { estado: k as typeof f.estado })} className={CHIP(f.estado === k)}>{nome} <span className="tabular-nums opacity-70">{db.counts.filter((c) => !k || c.state === k).length}</span></button>)}
      </div>
      {lista.length === 0 ? <Vazio titulo="Sem contagens" /> : (
        <TabelaInv titulo="Contagens" chave={(c) => c.id} linhas={lista} abrir={(c) => abrir({ t: "cont", id: c.id })} rotuloAbrir={(c) => `Abrir a contagem ${c.id}`}
          colunas={[
            { id: "i", titulo: "Documento", celula: (c) => c.id, valor: (c) => c.id }, { id: "w", titulo: "Armazém", celula: (c) => nomeArm(db, c.wh) }, { id: "c", titulo: "Categoria", celula: (c) => c.cat || "Todas" },
            { id: "e", titulo: "Estado", celula: (c) => <span className="flex flex-wrap gap-1"><Selo tom={TOM[c.state]}>{CONTAGEM_ESTADOS[c.state]}</Selo>{c.state === "open" && diasEntre(c.last, HOJE) >= 7 && <Selo tom="warn">Parada há {diasEntre(c.last, HOJE)} dias</Selo>}</span> },
            { id: "s", titulo: "Iniciada", celula: (c) => fmtDT(c.started), valor: (c) => c.started },
            { id: "p", titulo: "Progresso", celula: (c) => `${estatisticasContagem(db, c).done} / ${estatisticasContagem(db, c).total} contadas` },
            { id: "d", titulo: "Discrepâncias", direita: true, celula: (c) => (estatisticasContagem(db, c).disc ? <Selo tom="bad">{estatisticasContagem(db, c).disc}</Selo> : "0") },
          ]} />
      )}
      <p className="text-[15px] text-muted-foreground" aria-live="polite">{lista.length} contagem(ns)</p>
      {nova && <NovaContagem aoFechar={() => setNova(false)} />}
    </div>
  );
}

export { ContagemFolha };
