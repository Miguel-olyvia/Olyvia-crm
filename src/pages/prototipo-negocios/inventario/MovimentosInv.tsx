// Armazém › Movimentos: o livro completo e imutável (entradas, saídas, transferências, ajustes, devoluções e quebras), com filtros e exportação.
// Só a nota de um movimento se edita (fica marcada como editada). Um só botão primário: "Registar movimento".
import { useState } from "react";
import { Plus } from "lucide-react";
import { Escolher } from "../FiltrosPopover";
import { csvDe, descarregarCsv, nomeCsv } from "../funcCsv";
import { N, contagemPorId, ecPorId, fmtDT, nomeArm, nomeProd, poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { filtrarMovs } from "./filtros";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { opcoesArmazens } from "./opcoes";
import { Ligacao, Nota, Pesquisa, Pri, Sec, Selo, Texto, Vazio } from "./pecasInv";
import { TIPOS_MOV, anotarMovimento } from "./stock";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Movimento, TipoMov } from "./tipos";

function NotaDialogo({ m, aoFechar }: { m: Movimento; aoFechar: () => void }) {
  const { agir } = useCtxInv();
  const [t, setT] = useState(m.note);
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Editar nota do movimento" descricao="O movimento nunca muda: só a nota, que fica marcada como editada."
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={() => { if (agir((d) => anotarMovimento(d, m.id, t), "Nota gravada.").ok) aoFechar(); }}>Gravar nota</Pri></>}>
      <Texto rotulo="Nota" valor={t} aoMudar={setT} />
    </Dlg>
  );
}

function Filtros() {
  const { db, filtros, setFiltros, ir } = useCtxInv();
  const f = filtros.mov;
  const filtrado = !!(f.q || f.type || f.wh || f.doc || f.de || f.ate);
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("mov", { q })} rotulo="Pesquisar movimentos por produto, SKU ou EAN" dica="Produto, SKU ou EAN" />
        <div className="w-52"><Escolher rotulo="Tipo" valor={f.type} aoMudar={(v) => setFiltros("mov", { type: v as TipoMov | "" })} todas="Todos os tipos" opcoes={(Object.keys(TIPOS_MOV) as TipoMov[]).map((k) => ({ valor: k, nome: TIPOS_MOV[k].t }))} /></div>
        <div className="w-56"><Escolher rotulo="Armazém" valor={f.wh} aoMudar={(wh) => setFiltros("mov", { wh })} todas="Todos os armazéns" opcoes={opcoesArmazens(db, true).map(([valor, nome]) => ({ valor, nome }))} /></div>
        <label className="text-[15px] text-muted-foreground">Documento<input type="search" value={f.doc} onChange={(e) => setFiltros("mov", { doc: e.target.value })} placeholder="PO, EC, INV, TR" className="block h-11 w-44 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        <label className="text-[15px] text-muted-foreground">De<input type="date" value={f.de} onChange={(e) => setFiltros("mov", { de: e.target.value })} className="block h-11 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        <label className="text-[15px] text-muted-foreground">Até<input type="date" value={f.ate} onChange={(e) => setFiltros("mov", { ate: e.target.value })} className="block h-11 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        {filtrado && <Sec onClick={() => ir({ aba: "mov", f: {} })}>Limpar filtros</Sec>}
      </div>
    </>
  );
}

export function MovimentosInv() {
  const { db, filtros, setFiltros, abrir, ir, avisar } = useCtxInv();
  const f = filtros.mov;
  const lista = filtrarMovs(db, f);
  const mostradas = lista.slice(0, f.limite);
  const [dlg, setDlg] = useState<{ t: "mov" } | { t: "nota"; m: Movimento } | null>(null);
  const doc = (d: string): React.ReactNode => {
    if (/^PO-/.test(d) && poPorId(db, d)) return <Ligacao aoClicar={() => abrir({ t: "po", id: d })}>{d}</Ligacao>;
    if (/^EC-/.test(d) && ecPorId(db, d)) return <Ligacao aoClicar={() => abrir({ t: "ec", id: d })}>{d}</Ligacao>;
    if (/^INV-/.test(d) && contagemPorId(db, d)) return <Ligacao aoClicar={() => abrir({ t: "cont", id: d })}>{d}</Ligacao>;
    if (/^TR-/.test(d)) return <Ligacao aoClicar={() => setFiltros("mov", { doc: d })}>{d}</Ligacao>;
    return d || "—";
  };
  const cols: Coluna<Movimento>[] = [
    { id: "at", titulo: "Data", celula: (m) => fmtDT(m.at), valor: (m) => m.at },
    { id: "t", titulo: "Tipo", celula: (m) => <Selo tom={TIPOS_MOV[m.type].tone}>{TIPOS_MOV[m.type].t}</Selo>, valor: (m) => TIPOS_MOV[m.type].t },
    { id: "p", titulo: "Produto", celula: (m) => <>{nomeProd(db, m.sku)} · {m.sku}</>, valor: (m) => nomeProd(db, m.sku) },
    { id: "w", titulo: "Armazém", celula: (m) => nomeArm(db, m.wh) },
    { id: "q", titulo: "Qtd", direita: true, celula: (m) => <b>{m.qty > 0 ? "+" : "−"}{N(Math.abs(m.qty))}</b>, valor: (m) => m.qty },
    { id: "b", titulo: "Saldo depois", direita: true, celula: (m) => N(m.bal) },
    { id: "d", titulo: "Documento", celula: (m) => doc(m.doc) },
    { id: "n", titulo: "Notas / contraparte", celula: (m) => <>{m.note || "—"}{m.noteEdited ? <span className="block text-muted-foreground">nota editada {fmtDT(m.noteEdited)} · {m.noteBy}</span> : null}{m.cost != null ? <span className="block text-muted-foreground">custo {m.cost.toFixed(2).replace(".", ",")} €/un</span> : null}</> },
    { id: "u", titulo: "Utilizador", celula: (m) => m.user },
  ];
  const exportar = (): void => {
    const ok = descarregarCsv(nomeCsv("movimentos"), csvDe(["Data", "Tipo", "SKU", "Armazém", "Quantidade", "Saldo depois", "Documento", "Notas", "Utilizador"], lista.map((m) => [m.at, TIPOS_MOV[m.type].t, m.sku, nomeArm(db, m.wh), m.qty, m.bal, m.doc, m.note, m.user])));
    avisar(ok ? `Exportados ${lista.length} movimentos` : "Não foi possível descarregar o CSV neste browser.", !ok);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-[15px] text-muted-foreground">Livro completo e imutável: cada entrada, saída, transferência, ajuste, devolução e quebra. Correções fazem-se com novos movimentos (ajuste, estorno, reversão). Uma saída que deixaria o stock abaixo de zero falha por inteiro.</p>
        <div className="flex flex-wrap gap-2"><Sec onClick={exportar}>Exportar</Sec><Pri onClick={() => setDlg({ t: "mov" })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Registar movimento</Pri></div>
      </div>
      <Filtros />
      {mostradas.length === 0 ? <Vazio titulo="Sem movimentos com estes filtros" /> : (
        <TabelaInv titulo="Livro de movimentos" colunas={cols} linhas={mostradas} chave={(m) => String(m.id)} acoes={(m) => <Sec onClick={() => setDlg({ t: "nota", m })}>Editar nota</Sec>} />
      )}
      <div className="flex flex-wrap items-center gap-3 text-[15px]" aria-live="polite">
        <span>A mostrar {mostradas.length} de {lista.length} movimento(s)</span>
        {lista.length > mostradas.length && <Sec onClick={() => setFiltros("mov", { limite: f.limite + 40 })}>Carregar mais</Sec>}
      </div>
      <Nota tom="info">O livro nunca se edita nem apaga. Só as notas são editáveis, e ficam marcadas como editadas.</Nota>
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} />}
      {dlg?.t === "nota" && <NotaDialogo m={dlg.m} aoFechar={() => setDlg(null)} />}
    </div>
  );
}
