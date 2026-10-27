// A Lista e o Painel de Negócios na versão simples (27/10/2026): todos os negócios de sempre (abertos, ganhos, com a obra feita e perdidos),
// com procura, filtros e ordem, o histórico de cada um a abrir na própria linha, e um painel com os números e os gráficos dos mesmos filtros.
// O Painel está em PainelNegocios.tsx; tocar num número, numa barra ou num insight filtra e passa para a Lista. As contas estão em historicoNegocios.ts.
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Download, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FASES } from "./motor";
import { IconeFase, type Ctx } from "./pecas";
import { PainelNegocios } from "./PainelNegocios";
import { eurosTexto } from "./graficosTipos";
import { csvDe, descarregarCsv, valorCsv } from "./funcCsv";
import {
  ESTADOS, NOME_ESTADO, NOME_PERIODO, NOME_VALOR, SEM_FILTROS_H, filtrarH, filtrosLigados, linhasHistorico, opcoes, ordenarH,
  type ColunaH, type EstadoH, type FaixaValor, type FiltrosH, type LinhaH, type OrdemH, type Periodo,
} from "./historicoNegocios";

export type ModoNegocios = "quadro" | "lista" | "painel";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const SELECT = "h-10 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const POR_PAGINA = 40;

const dataTexto = (d: Date | null): string => (d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "—");
const haDias = (n: number | null): string => (n === null ? "" : n === 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`);
const negocios = (n: number): string => (n === 1 ? "1 negócio" : `${n} negócios`);

/** O selo do estado: texto sempre, a cor só ajuda. */
const COR_ESTADO: Record<EstadoH, string> = {
  aberto: "border-border bg-muted text-foreground",
  ganho: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  concluido: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  perdido: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};
function SeloEstado({ e }: { e: EstadoH }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium", COR_ESTADO[e])}>{NOME_ESTADO[e]}</span>;
}
const COR_EVENTO = { a: "bg-primary", w: "bg-amber-500", x: "bg-destructive" } as const;

/* ------------------------------------------------------------------ o seletor Quadro, Lista, Painel */
export function SeletorModo({ modo, mudar }: { modo: ModoNegocios; mudar: (m: ModoNegocios) => void }) {
  const M: [ModoNegocios, string][] = [["quadro", "Quadro"], ["lista", "Lista"], ["painel", "Painel"]];
  return (
    <div role="group" aria-label="Ver os negócios como" className="inline-flex rounded-lg border border-input bg-card p-1">
      {M.map(([id, nome]) => (
        <button key={id} type="button" aria-pressed={modo === id} onClick={() => mudar(id)}
          className={cn("min-h-9 rounded-md px-4 text-[15px] transition-colors", FOCO, modo === id ? "bg-foreground font-semibold text-background" : "text-foreground hover:bg-muted")}>
          {nome}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ a página */
interface Props extends Ctx {
  modo: Exclude<ModoNegocios, "quadro">;
  setModo: (m: ModoNegocios) => void;
  filtros: FiltrosH;
  setFiltros: (f: FiltrosH) => void;
  /** Só para os testes: o dia de hoje. */
  hoje?: Date;
}

export function NegociosHistorico({ S, A, go, q, setQ, modo, setModo, filtros: f, setFiltros, hoje: hojeDado }: Props) {
  const hoje = useMemo(() => hojeDado ?? new Date(), [hojeDado]);
  // o Estado muda no sítio (run volta a desenhar): conta-se a cada desenho, sem memória
  const todas = linhasHistorico(S, hoje);
  const ls = filtrarH(todas, f, q, hoje);
  const muda = (p: Partial<FiltrosH>): void => setFiltros({ ...f, ...p });
  const nLigados = filtrosLigados(f) + (q.trim() ? 1 : 0);
  /** Do Painel para a Lista, já filtrada. */
  const verNaLista = (p: Partial<FiltrosH>): void => { setFiltros({ ...f, ...p }); setModo("lista"); };
  const abrir = (id: number) => go(() => A.abrir(id));

  return (
    <div>
      <Filtros todas={todas} f={f} q={q} setQ={setQ} muda={muda} hoje={hoje} limpar={nLigados ? () => { setFiltros(SEM_FILTROS_H); setQ?.(""); } : undefined} />
      {modo === "lista"
        ? <Lista ls={ls} total={todas.length} abrir={abrir} />
        : <PainelNegocios ls={ls} hoje={hoje} verNaLista={verNaLista} abrir={abrir} />}
    </div>
  );
}

/* ------------------------------------------------------------------ filtros */
function Filtros({ todas, f, q, setQ, muda, limpar, hoje }: {
  todas: LinhaH[]; f: FiltrosH; q: string; setQ?: (v: string) => void; muda: (p: Partial<FiltrosH>) => void; limpar?: () => void; hoje: Date;
}) {
  const contaEstado = filtrarH(todas, f, q, hoje, "estado");
  // 27/10: à vista só a procura e o estado; os outros filtros atrás de «Filtros (N)»
  const nMais = filtrosLigados(f) - (f.estado !== SEM_FILTROS_H.estado ? 1 : 0);
  const [mais, setMais] = useState(false);
  const sel = (rotulo: string, valor: string, onChange: (v: string) => void, ops: [string, string][]) => (
    <label className="grid min-w-0 gap-1 text-sm text-muted-foreground">
      {rotulo}
      <select value={valor} onChange={(e) => onChange(e.target.value)} className={cn(SELECT, "text-foreground", valor && valor !== "todos" && valor !== "tudo" && "border-primary")}>
        {ops.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </label>
  );
  return (
    <section aria-label="Filtros" className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Nome, telefone, serviço ou histórico" value={q} onChange={(e) => setQ?.(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
          {(["todos", ...ESTADOS] as const).map((e) => {
            const n = e === "todos" ? contaEstado.length : contaEstado.filter((l) => l.estado === e).length;
            return (
              <button key={e} type="button" aria-pressed={f.estado === e} onClick={() => muda({ estado: e })}
                className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-[15px] transition-colors", FOCO,
                  f.estado === e ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:border-foreground/40")}>
                {e === "todos" ? "Todos" : NOME_ESTADO[e]}<span className="tabular-nums opacity-75">{n}</span>
              </button>
            );
          })}
        </div>
        <Button variant="outline" className={cn("min-h-10", nMais && "border-primary text-primary")} aria-expanded={mais} aria-controls="negocios-mais-filtros" onClick={() => setMais(!mais)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />{nMais ? `Filtros (${nMais})` : "Filtros"}
        </Button>
        {limpar && (
          <Button variant="ghost" size="sm" className="min-h-10" onClick={limpar}><X className="mr-1 h-4 w-4" aria-hidden="true" />Limpar os filtros</Button>
        )}
      </div>
      {mais && <div id="negocios-mais-filtros">
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {sel("Fase", f.fase, (v) => muda({ fase: v }), [["", "Todas as fases"], ...FASES.map((n, i): [string, string] => [String(i), n])])}
        {sel("Linha", f.linha, (v) => muda({ linha: v }), [["", "Todas"], ...opcoes(todas, "linha").map((v): [string, string] => [v, v])])}
        {sel("Origem", f.origem, (v) => muda({ origem: v }), [["", "Todas"], ...opcoes(todas, "origem").map((v): [string, string] => [v, v])])}
        {sel("Comercial", f.comercial, (v) => muda({ comercial: v }), [["", "Todos"], ...opcoes(todas, "comercial").map((v): [string, string] => [v, v])])}
        {sel("Entrada", f.periodo, (v) => muda({ periodo: v as Periodo }), Object.entries(NOME_PERIODO) as [string, string][])}
        {sel("Valor", f.valor, (v) => muda({ valor: v as FaixaValor }), Object.entries(NOME_VALOR) as [string, string][])}
      </div>
      <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 text-[15px]">
        <input type="checkbox" checked={f.parados} onChange={(e) => muda({ parados: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
        Parados há 7 dias ou mais
      </label>
      </div>}
    </section>
  );
}

/* ------------------------------------------------------------------ a lista */
const COLS: { id: ColunaH; nome: string; dir: "asc" | "desc"; direita?: boolean; cls?: string }[] = [
  { id: "nome", nome: "Negócio", dir: "asc" },
  { id: "fase", nome: "Fase", dir: "asc" },
  { id: "estado", nome: "Estado", dir: "asc" },
  { id: "valor", nome: "Valor sem IVA", dir: "desc", direita: true },
  { id: "origem", nome: "Origem", dir: "asc", cls: "hidden xl:table-cell" },
  { id: "comercial", nome: "Comercial", dir: "asc", cls: "hidden xl:table-cell" },
  { id: "entrada", nome: "Entrada", dir: "desc" },
  { id: "ultima", nome: "Último acontecimento", dir: "desc" },
];

function Lista({ ls, total, abrir }: { ls: LinhaH[]; total: number; abrir: (id: number) => () => void }) {
  const [ordem, setOrdem] = useState<OrdemH>({ coluna: "ultima", dir: "desc" });
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const ordenadas = ordenarH(ls, ordem), vistas = ordenadas.slice(0, mostrar);
  const valor = ls.reduce((a, l) => a + (l.valor ?? 0), 0);
  const alternar = (id: number): void => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ordenar = (c: (typeof COLS)[number]): void => setOrdem(ordem.coluna === c.id ? { coluna: c.id, dir: ordem.dir === "asc" ? "desc" : "asc" } : { coluna: c.id, dir: c.dir });
  const exportar = (): void => {
    descarregarCsv(`negocios-${new Date().toISOString().slice(0, 10)}.csv`, csvDe(
      ["N.º", "Nome", "Serviço", "Linha", "Localidade", "Fase", "Estado", "Valor sem IVA", "Origem", "Comercial", "Entrada", "Último acontecimento", "Quando", "Motivo da perda"],
      ordenadas.map((l) => [l.id, l.nome, l.servico, l.linha, l.local, FASES[l.fase], NOME_ESTADO[l.estado], valorCsv(l.valor), l.origem, l.comercial, dataTexto(l.entrada), l.ultimoTexto, dataTexto(l.ultima), l.motivo]),
    ));
  };

  return (
    <section aria-label="Lista de negócios" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground" aria-live="polite">
          <span className="font-semibold text-foreground">{negocios(ls.length)}</span>{ls.length !== total ? ` de ${total}` : ""} · {eurosTexto(valor)} em orçamentos
        </p>
        <Button variant="outline" className="min-h-10" onClick={exportar} disabled={!ls.length}><Download className="mr-2 h-4 w-4" aria-hidden="true" />Exportar para Excel</Button>
      </div>

      {!ls.length && <p role="status" className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-[15px] text-muted-foreground">Nenhum negócio com estes filtros.</p>}

      {/* Computador: a tabela */}
      {!!ls.length && (
        <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
          <table className="w-full text-[15px]">
            <caption className="sr-only">Negócios, um por linha. A seta abre o histórico do negócio.</caption>
            <thead className="border-b border-border bg-muted/50 text-left text-sm">
              <tr>
                <th scope="col" className="w-10"><span className="sr-only">Histórico</span></th>
                {COLS.map((c) => (
                  <th key={c.id} scope="col" aria-sort={ordem.coluna === c.id ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-3 font-semibold", c.direita && "text-right", c.cls)}>
                    <button type="button" onClick={() => ordenar(c)} className={cn("inline-flex min-h-11 items-center gap-1", FOCO)}>
                      {c.nome}<span aria-hidden="true" className="text-xs">{ordem.coluna === c.id ? (ordem.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vistas.map((l) => {
                const aberta = abertos.has(l.id);
                return (
                  <Fragment key={l.id}>
                    <tr className={cn("border-b border-border/70 transition-colors hover:bg-muted/40", aberta && "bg-muted/40")}>
                      <td className="pl-2">
                        <button type="button" aria-expanded={aberta} aria-controls={`hist-${l.id}`} onClick={() => alternar(l.id)} aria-label={`Histórico de ${l.nome}`}
                          className={cn("grid h-9 w-9 place-items-center rounded-md hover:bg-muted", FOCO)}>
                          <ChevronDown className={cn("h-4 w-4 transition-transform", aberta && "rotate-180")} aria-hidden="true" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={abrir(l.id)} className={cn("text-left font-semibold hover:underline", FOCO)}>{l.nome}</button>
                        <span className="block text-sm text-muted-foreground">{l.servico}{l.local ? ` · ${l.local}` : ""}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2"><IconeFase fase={l.fase} tam="sm" /><span className="whitespace-nowrap">{FASES[l.fase]}</span></span>
                      </td>
                      <td className="px-3 py-2.5"><SeloEstado e={l.estado} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{l.valor === null ? "—" : eurosTexto(l.valor)}</td>
                      <td className="hidden px-3 py-2.5 xl:table-cell">{l.origem}</td>
                      <td className="hidden px-3 py-2.5 xl:table-cell">{l.comercial}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{dataTexto(l.entrada)}</td>
                      <td className="max-w-[18rem] px-3 py-2.5">
                        <span className="line-clamp-1">{l.ultimoTexto}</span>
                        <span className={cn("text-sm tabular-nums", (l.parado ?? 0) >= 7 ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {dataTexto(l.ultima)}{l.parado !== null ? ` · ${haDias(l.parado)}` : ""}
                        </span>
                      </td>
                    </tr>
                    {aberta && (
                      <tr id={`hist-${l.id}`} className="border-b border-border/70 bg-muted/20">
                        <td />
                        <td colSpan={COLS.length} className="px-3 pb-4 pt-1"><Historico l={l} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Telemóvel e tablet: cartões */}
      <ul className="mt-3 grid gap-3 lg:hidden">
        {vistas.map((l) => {
          const aberta = abertos.has(l.id);
          return (
            <li key={l.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <IconeFase fase={l.fase} tam="sm" />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={abrir(l.id)} className={cn("text-left text-base font-semibold hover:underline", FOCO)}>{l.nome}</button>
                  <span className="block text-sm text-muted-foreground">{l.servico}{l.local ? ` · ${l.local}` : ""}</span>
                </div>
                <SeloEstado e={l.estado} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Valor</dt><dd className="tabular-nums">{l.valor === null ? "—" : eurosTexto(l.valor)}</dd>
                <dt className="text-muted-foreground">Entrada</dt><dd className="tabular-nums">{dataTexto(l.entrada)}</dd>
                <dt className="text-muted-foreground">Último</dt><dd className={cn((l.parado ?? 0) >= 7 && "font-medium text-destructive")}>{haDias(l.parado) || dataTexto(l.ultima)}</dd>
              </dl>
              <button type="button" aria-expanded={aberta} onClick={() => alternar(l.id)} className={cn("mt-2 inline-flex min-h-10 items-center gap-1 text-[15px] font-medium text-primary", FOCO)}>
                {aberta ? "Esconder o histórico" : `Ver o histórico (${l.eventos})`}<ChevronDown className={cn("h-4 w-4 transition-transform", aberta && "rotate-180")} aria-hidden="true" />
              </button>
              {aberta && <div className="mt-2"><Historico l={l} /></div>}
            </li>
          );
        })}
      </ul>

      {ordenadas.length > mostrar && (
        <div className="mt-4 text-center">
          <Button variant="outline" className="min-h-10" onClick={() => setMostrar((n) => n + POR_PAGINA)}>Mostrar mais ({ordenadas.length - mostrar} por ver)</Button>
        </div>
      )}
    </section>
  );
}

/** O histórico de um negócio: os acontecimentos, do mais recente para o mais antigo, numa linha do tempo. */
function Historico({ l }: { l: LinhaH }) {
  const h = l.d.hist;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
      {h.length ? (
        <ol aria-label={`Histórico de ${l.nome}`} className="relative ml-1.5 border-l border-border pl-5">
          {h.map((e, i) => (
            <li key={i} className="relative pb-2.5 last:pb-0">
              <span className={cn("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card", COR_EVENTO[e.k])} aria-hidden="true" />
              <span className="block text-[15px]">{e.t}</span>
              <span className="block text-sm tabular-nums text-muted-foreground">{e.q}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-[15px] text-muted-foreground">Sem registos no histórico.</p>}
      <dl className="grid content-start grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">N.º</dt><dd className="tabular-nums">{l.id}</dd>
        <dt className="text-muted-foreground">Telefone</dt><dd className="tabular-nums">{l.d.tel || "—"}</dd>
        <dt className="text-muted-foreground">Linha · origem</dt><dd>{l.linha} · {l.origem}</dd>
        {l.motivo && <><dt className="text-muted-foreground">Motivo da perda</dt><dd>{l.motivo}</dd></>}
      </dl>
    </div>
  );
}
