// O separador Quadro da V2 funcional de Negócios: as quatro colunas de sempre, com vistas rápidas (chips com contagem), ordem global ou por coluna
// (valor, tempo parado, nome), densidade Normal ou Compacta (cartões de uma linha), colunas que se recolhem e "Exportar CSV" do Quadro filtrado.
// Nenhuma ação muda a fase. Os cartões têm data-linha-func: as setas passam de cartão em cartão e Enter abre.
import { useId } from "react";
import { ChevronDown, Download, Euro, FileCheck2, FileSignature, FileText, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import { semPaginaPropria } from "./negociosApp";
import { COLUNAS_V2, type DocFase } from "./negociosDocs";
import type { LinhaN } from "./filtrosNegocios";
import { CHAVES_N, VISTAS_N, aplicarVistaN, ordenarN, paradoTexto, type ChaveN, type VistaN } from "./funcNegocios";
import { BORDA_CTRL } from "./PessoaLinha";
import { CHIP, FOCO } from "./FiltrosPopover";
import { DicaAtalhos } from "./FuncGrupo";
import { Chip, FASE_COR } from "./pecas";

const ICONE: Record<DocFase, { i: LucideIcon; cor: string }> = {
  orcamento: { i: FileText, cor: FASE_COR[0] }, proposta: { i: FileCheck2, cor: FASE_COR[3] }, contrato: { i: FileSignature, cor: FASE_COR[2] }, financeiro: { i: Euro, cor: FASE_COR[4] },
};
const CHIP_PEQ = "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4";
const SELECT = cn("h-11 cursor-pointer rounded-md border bg-card px-2 text-[15px]", BORDA_CTRL, FOCO);

export type Densidade = "normal" | "compacta";

export interface QuadroFuncProps {
  /** As linhas do Quadro já filtradas pela barra de filtros. */
  linhas: readonly LinhaN[];
  vista: VistaN | null;
  setVista: (v: VistaN | null) => void;
  global: ChaveN | null;
  setGlobal: (c: ChaveN | null) => void;
  porColuna: Partial<Record<DocFase, ChaveN | null>>;
  setPorColuna: (col: DocFase, c: ChaveN | null) => void;
  densidade: Densidade;
  setDensidade: (d: Densidade) => void;
  recolhidas: readonly DocFase[];
  alternarColuna: (col: DocFase) => void;
  abrir: (l: LinhaN, el: HTMLElement) => void;
  exportar: (ls: readonly LinhaN[]) => void;
  ajuda: () => void;
}

function EscolherOrdem({ rotulo, valor, mudar, semOrdem }: { rotulo: string; valor: ChaveN | null; mudar: (c: ChaveN | null) => void; semOrdem: string }) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-[15px] text-muted-foreground">{rotulo}</label>
      <select id={id} value={valor ?? ""} onChange={(e) => mudar((e.target.value || null) as ChaveN | null)} className={SELECT}>
        <option value="">{semOrdem}</option>
        {CHAVES_N.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
    </span>
  );
}

function Cartao({ l, compacta, abrir }: { l: LinhaN; compacta: boolean; abrir: QuadroFuncProps["abrir"] }) {
  const n = l.negocio, exemplo = semPaginaPropria(n), valor = l.valor !== null ? `${eur(l.valor)} €` : "Sem valor";
  if (compacta) {
    return (
      <li className="rounded-lg border border-border bg-card">
        <button type="button" data-linha-func="" onClick={(e) => abrir(l, e.currentTarget)} className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-[15px] hover:bg-muted/40", FOCO)}>
          <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{n.nome}</span> · {n.titulo}</span>
          <span className="shrink-0 tabular-nums">{valor}</span>
          {exemplo && <span className="shrink-0 text-muted-foreground">exemplo</span>}
        </button>
      </li>
    );
  }
  return (
    <li className="rounded-xl border border-border bg-card">
      <button type="button" data-linha-func="" onClick={(e) => abrir(l, e.currentTarget)} className={cn("block min-h-11 w-full rounded-xl p-4 text-left hover:bg-muted/40", FOCO)}>
        <span className="flex items-center justify-between gap-2"><span className="text-base font-semibold">{n.nome}</span>{exemplo && <span className="text-[15px] text-muted-foreground">exemplo</span>}</span>
        <span className="mt-0.5 block text-[15px] text-muted-foreground">{l.cartao?.servico ?? n.titulo}</span>
        <span className="mt-2 block text-base font-medium tabular-nums">{valor}</span>
        <span className="mt-1 block text-[15px] text-muted-foreground">{paradoTexto(l)}</span>
        <span className="mt-1 block text-[15px] font-medium">{l.cartao?.proximo}</span>
      </button>
    </li>
  );
}

function Coluna(props: QuadroFuncProps & { id: DocFase; nome: string; ls: readonly LinhaN[] }) {
  const { id, nome, ls, recolhidas, alternarColuna, porColuna, setPorColuna, global, densidade, abrir } = props;
  const aberta = !recolhidas.includes(id), corpo = `fq-${id}`;
  const ordenadas = ordenarN(ls, porColuna[id] ?? global);
  const total = ls.reduce((a, l) => a + (l.valor ?? 0), 0);
  return (
    <section aria-labelledby={`${corpo}-t`} className="min-w-0">
      <h2 id={`${corpo}-t`} className="text-[16px] font-semibold">
        <button type="button" aria-expanded={aberta} aria-controls={corpo} onClick={() => alternarColuna(id)} className={cn("flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left", FOCO)}>
          <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none", !aberta && "-rotate-90")} aria-hidden="true" />
          <Chip icone={ICONE[id].i} cor={ICONE[id].cor} className={CHIP_PEQ} />
          <span className="flex-1">{nome}</span><span className="text-[15px] font-normal tabular-nums text-muted-foreground">{ls.length}</span>
        </button>
      </h2>
      <div id={corpo} hidden={!aberta}>
        <p className="px-1 text-[15px] tabular-nums text-muted-foreground">{eur(total)} €</p>
        <div className="mt-1"><EscolherOrdem rotulo="Ordenar" valor={porColuna[id] ?? null} mudar={(c) => setPorColuna(id, c)} semOrdem={global ? "Como as outras" : "Ordem de sempre"} /></div>
        <ul className={cn("mt-3", densidade === "compacta" ? "space-y-1.5" : "space-y-3")}>
          {ordenadas.map((l) => <Cartao key={l.id} l={l} compacta={densidade === "compacta"} abrir={abrir} />)}
          {!ls.length && <li className="rounded-xl border border-dashed border-border p-4 text-[15px] text-muted-foreground">Nenhum</li>}
        </ul>
      </div>
    </section>
  );
}

function Opcoes(props: QuadroFuncProps & { visiveis: readonly LinhaN[] }) {
  const { linhas, vista, setVista, global, setGlobal, densidade, setDensidade, exportar, visiveis, ajuda } = props;
  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Vistas rápidas">
        {VISTAS_N.map((v) => (
          <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => setVista(vista === v.id ? null : v.id)} className={CHIP(vista === v.id)}>
            {v.nome} <span className="tabular-nums opacity-70">{aplicarVistaN(linhas, v.id).length}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <EscolherOrdem rotulo="Ordenar todas as colunas" valor={global} mudar={setGlobal} semOrdem="Ordem de sempre" />
        <div role="group" aria-label="Densidade" className="flex gap-2">
          {(["normal", "compacta"] as const).map((d) => <button key={d} type="button" aria-pressed={densidade === d} onClick={() => setDensidade(d)} className={CHIP(densidade === d)}>{d === "normal" ? "Normal" : "Compacta"}</button>)}
        </div>
        <Button type="button" variant="outline" className={cn("min-h-11 gap-2 text-[15px]", BORDA_CTRL)} onClick={() => exportar(visiveis)} disabled={!visiveis.length}>
          <Download className="h-4 w-4" aria-hidden="true" />Exportar CSV
        </Button>
        <DicaAtalhos abrir={ajuda} />
      </div>
    </div>
  );
}

export function QuadroFunc(props: QuadroFuncProps) {
  const visiveis = aplicarVistaN(props.linhas, props.vista);
  return (
    <>
      <Opcoes {...props} visiveis={visiveis} />
      {!visiveis.length && <p className="mt-6 text-base">Nenhum negócio com esta vista e estes filtros.</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-4 lg:gap-5">
        {COLUNAS_V2.map((c) => <Coluna key={c.id} {...props} id={c.id} nome={c.nome} ls={visiveis.filter((l) => l.doc === c.id)} />)}
      </div>
    </>
  );
}
