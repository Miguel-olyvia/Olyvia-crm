// A página de Pessoas na proposta simples (V2): uma lista única de leads e clientes. A pessoa é uma só;
// lead e cliente são papéis dela. Ao escolher uma pessoa abre a ficha na mesma página, sem diálogos.
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Building2, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import { FILTROS_LEAD, filtrarLeads, tempoDesde, type FiltroLead } from "./leadsDocs";
import { CHIP_FILTRO, CHIP_PEQ, FichaLead, LinhaLead, type Separador } from "./LeadsSimples";
import {
  SEPARADORES_LISTA, contagens, dadosCliente, documentosDe, filtrarTexto, itensPessoa, pessoasDoSeparador, separadorPorDefeito, todosApp,
  type PapelPessoa, type PessoaApp, type SeparadorLista,
} from "./pessoasDocs";
import { FASE_COR, FASE_ICONE, Chip, teclasTablist, type Ctx } from "./pecas";

/** O que a página lembra quando se abre um negócio e se volta: vive fora do componente porque a página desmonta. */
interface Memoria { lista: SeparadorLista | null; sel: string | null; sep: Separador; filtro: FiltroLead; soMinhas: boolean; q: string }
const MEMORIA_VAZIA: Memoria = { lista: null, sel: null, sep: "negocios", filtro: "todas", soMinhas: false, q: "" };
let memoria: Memoria = MEMORIA_VAZIA;
const lembrar = (m: Partial<Memoria>): void => { memoria = { ...memoria, ...m }; };
/** Esquece tudo (por exemplo quando a demonstração é reposta). */
export function esquecerPessoas(): void { memoria = MEMORIA_VAZIA; }

function Etiqueta({ papel }: { papel: PapelPessoa }) {
  const lead = papel === "lead";
  return (
    <span className="mb-2 flex items-center gap-2 text-[15px] text-muted-foreground">
      <Chip icone={lead ? FASE_ICONE[0] : Building2} cor={lead ? FASE_COR[0] : FASE_COR[4]} className={CHIP_PEQ} />
      {lead ? "Lead" : "Cliente"}
    </span>
  );
}

function LinhaCliente({ p, S, abrir, topo }: { p: PessoaApp; S: Ctx["S"]; abrir: () => void; topo?: ReactNode }) {
  const dc = dadosCliente(S, p);
  const tempo = dc.ultimo ? tempoDesde(dc.ultimo.quando) : "";
  return (
    <li>
      <button type="button" onClick={abrir}
        className="group block min-h-11 w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        {topo}
        <span className="flex items-start justify-between gap-3">
          <span className="block text-base font-semibold text-foreground">{p.nome}</span>
          {p.novoNegocio && (
            <span className="inline-flex shrink-0 flex-wrap items-center justify-end gap-x-1.5 text-[15px] font-medium text-foreground">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />Novo negócio em curso
              {p.extra.length > 0 && <span className="font-normal text-muted-foreground">exemplo</span>}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[15px] text-muted-foreground">
          {eur(dc.valorTotal)} € em {dc.contratos} {dc.contratos === 1 ? "contrato" : "contratos"}
        </span>
        <span className="mt-0.5 block text-[15px] text-muted-foreground">
          {dc.obrasEmCurso === 0 ? "Sem obras em curso" : dc.obrasEmCurso === 1 ? "1 obra em curso" : `${dc.obrasEmCurso} obras em curso`}
        </span>
        {dc.ultimo && (
          <span className="mt-2 block text-[15px] font-medium text-foreground">
            Último negócio: {dc.ultimo.servico}{tempo ? " · " + tempo : ""}
            <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        )}
      </button>
    </li>
  );
}

export function PessoasSimples({ S, A, go, abrirEm }: Ctx & { abrirEm?: SeparadorLista }) {
  const [lista, setListaEstado] = useState<SeparadorLista | null>(abrirEm ?? memoria.lista);
  const [sel, setSelEstado] = useState<string | null>(abrirEm ? null : memoria.sel);
  const [filtro, setFiltroEstado] = useState<FiltroLead>(memoria.filtro);
  const [soMinhas, setSoMinhasEstado] = useState(memoria.soMinhas);
  const [q, setQEstado] = useState(memoria.q);
  const setLista = (v: SeparadorLista) => { setListaEstado(v); lembrar({ lista: v }); };
  const setSel = (v: string | null) => { setSelEstado(v); lembrar(v === null ? { sel: null, sep: "negocios" } : { sel: v }); };
  const setFiltro = (v: FiltroLead) => { setFiltroEstado(v); lembrar({ filtro: v }); };
  const setSoMinhas = (v: boolean) => { setSoMinhasEstado(v); lembrar({ soMinhas: v }); };
  const setQ = (v: string) => { setQEstado(v); lembrar({ q: v }); };

  const aba = lista ?? separadorPorDefeito(S.role);
  const escolhida = sel ? todosApp(S).find((p) => p.nome === sel) : undefined;

  // Ir de Leads para Clientes (ou ao contrário) pelo menu não remonta a página: o separador pedido aplica-se quando abrirEm muda.
  useEffect(() => {
    if (!abrirEm) return;
    lembrar({ lista: abrirEm, sel: null });
    setListaEstado(abrirEm);
    setSelEstado(null);
  }, [abrirEm]);
  // Se a pessoa escolhida deixou de existir (por exemplo depois de repor a demonstração), volta-se à lista e esquece-se a escolha.
  useEffect(() => {
    if (sel && !escolhida) { setSelEstado(null); lembrar({ sel: null, sep: "negocios" }); }
  }, [sel, escolhida]);

  if (escolhida) {
    return (
      <FichaLead S={S} A={A} go={go} p={escolhida} voltar={() => setSel(null)} papel={escolhida.papel} textoVoltar="Voltar às pessoas" vistaLista="pessoas"
        itens={itensPessoa(S, escolhida)} documentos={documentosDe(escolhida)} sepInicial={memoria.sep} aoMudarSep={(s) => lembrar({ sep: s })} />
    );
  }

  const todas = pessoasDoSeparador(S, aba);
  const visiveis = aba === "leads" ? filtrarLeads(todas, filtro, soMinhas, q) : filtrarTexto(todas, q);
  const total = contagens(S, "");
  const porAba = contagens(S, q);
  const limpar = () => { setQ(""); if (aba === "leads") { setFiltro("todas"); setSoMinhas(false); } };
  const idsAbas = SEPARADORES_LISTA.map((s) => s.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pessoas</h1>
          <p className="mt-1 text-base text-muted-foreground">{total.leads} {total.leads === 1 ? "lead" : "leads"} · {total.clientes} {total.clientes === 1 ? "cliente" : "clientes"}</p>
        </div>
        {aba !== "clientes" && <Button size="lg" className="min-h-11" onClick={go(() => A.novo())}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>}
      </header>

      <div className="mt-6 grid gap-3">
        <label className="relative block">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Procurar nome, telefone ou serviço" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Lista de pessoas">
          {SEPARADORES_LISTA.map(({ id, nome }, i) => (
            <button key={id} type="button" role="tab" id={`pessoas-tab-${id}`} aria-selected={aba === id} aria-controls="pessoas-painel" tabIndex={aba === id ? 0 : -1}
              onClick={() => setLista(id)} onKeyDown={(e) => teclasTablist(e, i, idsAbas, "pessoas-tab", setLista)}
              className={cn("min-h-11 shrink-0 rounded-lg px-4 text-[15px]", aba === id ? "bg-foreground text-background" : "bg-muted text-foreground")}>
              {nome} <span className="tabular-nums opacity-70">{porAba[id]}</span>
            </button>
          ))}
        </div>
        {aba === "leads" && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Mostrar">
            {FILTROS_LEAD.map(({ id, nome }) => (
              <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)} className={CHIP_FILTRO(filtro === id)}>
                {nome} <span className="tabular-nums opacity-70">{filtrarLeads(todas, id, soMinhas, q).length}</span>
              </button>
            ))}
            <button type="button" aria-pressed={soMinhas} onClick={() => setSoMinhas(!soMinhas)} className={CHIP_FILTRO(soMinhas)}>Só as minhas</button>
          </div>
        )}
      </div>

      <div id="pessoas-painel" role="tabpanel" aria-labelledby={`pessoas-tab-${aba}`}>
        {!visiveis.length ? (
          <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
            <p className="text-base">Nenhuma pessoa encontrada.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={limpar}>{aba === "leads" ? "Limpar pesquisa e filtros" : "Limpar pesquisa"}</Button>
          </div>
        ) : (
          <ul className="mt-6 space-y-3" aria-label={SEPARADORES_LISTA.find((s) => s.id === aba)!.nome}>
            {visiveis.map((p) => {
              const topo = aba === "todos" ? <Etiqueta papel={p.papel} /> : undefined;
              return p.papel === "lead"
                ? <LinhaLead key={p.nome} p={p} S={S} abrir={() => setSel(p.nome)} topo={topo} />
                : <LinhaCliente key={p.nome} p={p} S={S} abrir={() => setSel(p.nome)} topo={topo} />;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
