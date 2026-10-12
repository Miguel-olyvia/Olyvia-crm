// Armazém › Encomendas de cliente (as saídas): o que existe em stock é reservado (FIFO) e sai do armazém de expedição; o que falta vai para a PO do preferencial.
// A lista tem KPI, filtros e ordenação; a linha abre a folha. Um só botão primário: "Nova encomenda manual".
import { useState } from "react";
import { Plus } from "lucide-react";
import { Kpi } from "./kpiInv";
import { ExportarInv } from "./ExportarInv";
import { CHIP, Escolher, Interruptor } from "../FiltrosPopover";
import { fmtD, nomeArm, armazem } from "./base";
import { contadores } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { EC_ESTADOS, ecEstado, ecProntas, ecSegmentos, origemTexto, type EstadoEc } from "./ec";
import { EcFormDialogo } from "./EcFormDialogo";
import { filtrarEcs } from "./filtros";
import { opcoesExpedicao } from "./opcoes";
import { Pesquisa, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Ec, Inventario, Tom } from "./tipos";

const TOM: Record<EstadoEc, Tom> = { full: "ok", partial: "warn", waiting: "info", nosup: "bad", deleted: "neu" };

/** O progresso de uma EC: servido, em stock (reservado), à espera de PO e em falta, em barra e em texto (a barra nunca diz nada sozinha). */
export function Progresso({ db, e }: { db: Inventario; e: Ec }) {
  const s = ecSegmentos(db, e);
  if (!s.tot) return <span className="text-muted-foreground">Só serviços</span>;
  const w = (n: number): string => `${(n / s.tot) * 100}%`;
  return (
    <span className="grid min-w-40 gap-1">
      <span className="flex h-2 overflow-hidden rounded-full bg-border" role="img" aria-label={`Servido ${s.s}, em stock ${s.st}, a aguardar PO ${s.po}, em falta ${s.mi}`}>
        <span className="bg-foreground" style={{ width: w(s.s) }} /><span className="bg-foreground/60" style={{ width: w(s.st) }} /><span className="bg-foreground/30" style={{ width: w(s.po) }} />
      </span>
      <span className="text-muted-foreground">{s.s} servido · {s.st} em stock · {s.po} PO · {s.mi} falta</span>
    </span>
  );
}

export function EcInv() {
  const { db, filtros, setFiltros, abrir, ir } = useCtxInv();
  const f = filtros.ec, c = contadores(db);
  const lista = filtrarEcs(db, f);
  const [nova, setNova] = useState(false);
  const cols: Coluna<Ec>[] = [
    { id: "id", titulo: "Nº EC · origem", celula: (e) => <>{e.id} · {origemTexto(e)}</>, valor: (e) => e.id },
    { id: "cl", titulo: "Cliente", celula: (e) => e.client, valor: (e) => e.client },
    { id: "ad", titulo: "Morada", celula: (e) => e.addr },
    { id: "d", titulo: "Data", celula: (e) => <>{fmtD(e.date)}<span className="block text-muted-foreground">{armazem(db, e.wh)?.code}</span></>, valor: (e) => e.date },
    { id: "ln", titulo: "Linhas", direita: true, celula: (e) => e.lines.length },
    { id: "pr", titulo: "Progresso", celula: (e) => <Progresso db={db} e={e} /> },
    { id: "st", titulo: "Estado", celula: (e) => <span className="grid justify-items-start gap-1"><Selo tom={TOM[ecEstado(db, e)]}>{EC_ESTADOS[ecEstado(db, e)]}</Selo>{ecProntas(db, e) > 0 && <Selo tom="violet">{ecProntas(db, e)} pronta(s) a sair</Selo>}</span> },
  ];
  const chip = (k: "" | EstadoEc, nome: string, n?: number): React.ReactNode => <button key={k + nome} type="button" aria-pressed={f.status === k && !f.prontas} onClick={() => setFiltros("ec", { status: k, prontas: false })} className={CHIP(f.status === k && !f.prontas)}>{nome}{n != null && <> <span className="tabular-nums opacity-70">{n}</span></>}</button>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <ExportarInv nome="saidas-clientes" rotulo="encomendas de cliente" cabecalho={["Nº EC", "Origem", "Cliente", "Morada", "Data", "Linhas", "Estado"]} linhas={() => lista.map((e) => [e.id, origemTexto(e), e.client, e.addr, e.date, e.lines.length, EC_ESTADOS[ecEstado(db, e)]])} /><Pri onClick={() => setNova(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova encomenda manual</Pri>
      </div>
      <div className="kpis">
        <Kpi tom="ok" rotulo="Prontas a expedir" valor={String(c.ecReady)} nota="com linhas prontas a sair" aoClicar={() => setFiltros("ec", { prontas: true, status: "" })} acaoRotulo="Filtrar por prontas a expedir" />
        <Kpi tom="warn" rotulo="Parcialmente pendentes" valor={String(c.ecPartial)} aoClicar={() => setFiltros("ec", { status: "partial", prontas: false })} acaoRotulo="Filtrar por parcialmente pendentes" />
        <Kpi tom="info" rotulo="A aguardar PO" valor={String(c.ecWaiting)} nota="à espera do fornecedor" aoClicar={() => setFiltros("ec", { status: "waiting", prontas: false })} acaoRotulo="Filtrar por a aguardar PO" />
        <Kpi tom="bad" rotulo="Sem fornecedor" valor={String(c.ecNoSup)} nota="sem preferido para encomendar" aoClicar={() => setFiltros("ec", { status: "nosup", prontas: false })} acaoRotulo="Filtrar por sem fornecedor" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("ec", { q })} rotulo="Pesquisar encomendas clientes por nº, contrato, cliente ou produto" dica="Nº EC, contrato, VD, cliente ou produto" />
        <div className="w-60"><Escolher rotulo="Armazém de expedição" valor={f.wh} aoMudar={(wh) => setFiltros("ec", { wh })} todas="Todos os armazéns" opcoes={opcoesExpedicao(db).map(([valor, nome]) => ({ valor, nome }))} /></div>
        <label className="text-[15px] text-muted-foreground">De<input type="date" value={f.de} onChange={(e) => setFiltros("ec", { de: e.target.value })} className="block h-11 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        <label className="text-[15px] text-muted-foreground">Até<input type="date" value={f.ate} onChange={(e) => setFiltros("ec", { ate: e.target.value })} className="block h-11 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        <Interruptor nome="Ver eliminadas" ativo={f.eliminadas} aoMudar={() => setFiltros("ec", { eliminadas: !f.eliminadas })} />
      </div>
      <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
        {chip("", "Todas", db.ecs.filter((e) => !e.deleted).length)}
        <button type="button" aria-pressed={f.prontas} onClick={() => setFiltros("ec", { prontas: !f.prontas, status: "" })} className={CHIP(f.prontas)}>Prontas a expedir <span className="tabular-nums opacity-70">{c.ecReady}</span></button>
        {chip("full", "Totalmente servido")}{chip("partial", "Parcialmente pendente")}{chip("waiting", "A aguardar encomenda")}{chip("nosup", "Sem fornecedor")}
      </div>
      {lista.length === 0 ? <Vazio titulo="Sem encomendas com estes filtros"><Sec onClick={() => ir({ aba: "ec", f: {} })}>Limpar filtros</Sec></Vazio> : (
        <TabelaInv titulo="Encomendas de cliente" colunas={cols} linhas={lista} chave={(e) => e.id} abrir={(e) => abrir({ t: "ec", id: e.id })} classeLinha={(e) => (e.deleted ? "opacity-70" : "")} rotuloAbrir={(e) => `Abrir ${e.id}, ${e.client}`} />
      )}
      <p className="text-[15px] text-muted-foreground" aria-live="polite">{lista.length} encomenda{lista.length === 1 ? "" : "s"} · armazém por defeito: {nomeArm(db, db.settings.defaultWh)}</p>
      {nova && <EcFormDialogo aberto aoFechar={() => setNova(false)} />}
    </div>
  );
}
