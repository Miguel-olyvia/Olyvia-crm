// O Portal do Fornecedor simulado (20/10/2026, de volta só para a demonstração): o ecrã inteiro, com o aspeto de SupplierPortalLayout.tsx
// (cabeçalho com o nome do fornecedor, "Portal do Fornecedor", "Clientes: …", o utilizador; separadores Início · Encomendas · Catálogo ·
// Os meus dados; conteúdo em max-w-7xl sobre bg-muted/30; rodapé). Lê e escreve o Inventário do protótipo (em memória, por isso abre no
// mesmo separador do browser): confirmar chama portalConfirmar e expedir chama portalExpedir — a expedição com guia de remessa é SÓ DO
// PROTÓTIPO (o portal real não a tem). "Voltar ao CRM" no lugar de "Sair". Não usa Supabase nem componentes do portal real que chamam RPCs.
import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, Home, IdCard, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fornecedor } from "../inventario/base";
import { useInventario } from "../inventario/loja";
import { fornecedoresDoPortal, porConfirmar, posDoPortal, type FiltroPortal } from "./dadosPortal";
import { EncomendaPortal } from "./EncomendaPortal";
import { EncomendasPortal, InicioPortal } from "./PaginasPortal";
import { CatalogoPortal, DadosPortal } from "./CatalogoDadosPortal";
import { PrimeiroAcesso, SemAcesso } from "./AcessoPortal";

type Pagina = "inicio" | "encomendas" | "catalogo" | "dados";
const NAV: readonly (readonly [Pagina, string, typeof Home])[] = [["inicio", "Início", Home], ["encomendas", "Encomendas", ClipboardList], ["catalogo", "Catálogo", Package], ["dados", "Os meus dados", IdCard]];

export interface PortalFornecedorProps {
  /** O fornecedor com que se "entrou" no portal. */
  sup: string;
  /** Abrir já nesta encomenda (vindo de "Abrir como fornecedor →" na PO). */
  po?: string | null;
  aoMudarFornecedor: (sup: string) => void;
  aoVoltar: () => void;
}

export default function PortalFornecedor({ sup, po, aoMudarFornecedor, aoVoltar }: PortalFornecedorProps) {
  const db = useInventario();
  const s = fornecedor(db, sup);
  const [pagina, setPagina] = useState<Pagina>(po ? "encomendas" : "inicio");
  const [aberta, setAberta] = useState<string | null>(po ?? null);
  const [filtro, setFiltro] = useState<FiltroPortal>("all");
  const [aviso, setAviso] = useState("");
  // convidado: o primeiro acesso ocupa o portal até "Entrar no portal" (a regra passa-o logo a ativo, mas o ecrã mostra o "Concluído")
  const [primeiro, setPrimeiro] = useState(() => fornecedor(db, sup)?.portal === "invited");
  useEffect(() => { const prev = document.title; document.title = "Olyvia · Portal do Fornecedor (demonstração)"; return () => { document.title = prev; }; }, []);
  if (!s) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-center">
        <div className="space-y-4">
          <p className="text-lg font-semibold">Nenhum fornecedor com acesso ativo ao portal.</p>
          <Button className="h-11 gap-2" onClick={aoVoltar}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao CRM</Button>
        </div>
      </div>
    );
  }
  const empresa = s.company || "A empresa";
  const opcoes = fornecedoresDoPortal(db);
  const nConfirmar = posDoPortal(db, s.id).filter(porConfirmar).length;
  const ir = (p: Pagina): void => { setAberta(null); setPagina(p); };
  const irEncomendas = (f: FiltroPortal): void => { setFiltro(f); ir("encomendas"); };
  const utilizador = s.invite?.name || s.contact;
  return (
    <div className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-2 shadow-sm md:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground sm:text-base" title={s.name}>{s.name}</p>
          <p className="text-[11px] font-medium leading-tight text-primary">Portal do Fornecedor</p>
          <p className="hidden max-w-[40ch] truncate text-[11px] text-muted-foreground md:block" title={empresa}>Clientes: {empresa}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="max-w-[24ch] truncate text-sm font-medium leading-tight text-foreground" title={utilizador}>{utilizador}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Utilizador principal</p>
          </div>
          {opcoes.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden lg:inline">Entrar como</span>
              <select aria-label="Entrar como fornecedor" value={s.id} onChange={(e) => aoMudarFornecedor(e.target.value)}
                className="h-11 max-w-[14rem] rounded-md border border-input bg-background px-2 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {opcoes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          )}
          <Button variant="outline" className="h-11 min-w-11 gap-1.5" onClick={aoVoltar} aria-label="Voltar ao CRM">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden text-sm sm:inline">Voltar ao CRM</span>
          </Button>
        </div>
      </header>

      {primeiro || s.portal !== "active" ? (
        <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-4 md:p-6">
          {primeiro ? <PrimeiroAcesso s={s} aoConcluir={() => { setPrimeiro(false); setPagina("inicio"); setAviso(`Bem-vindo ao portal, ${s.name}.`); }} /> : <SemAcesso s={s} aoVoltar={aoVoltar} />}
        </main>
      ) : <>
      <nav className="border-b bg-background px-2 md:px-6" aria-label="Portal do Fornecedor">
        <div className="flex gap-0.5 overflow-x-auto">
          {NAV.map(([k, rot, Ic]) => (
            <button key={k} type="button" onClick={() => ir(k)} aria-current={pagina === k ? "page" : undefined}
              className={cn("flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                pagina === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}>
              <Ic className="h-4 w-4" aria-hidden="true" />{rot}
              {k === "encomendas" && nConfirmar > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-label={`${nConfirmar} por confirmar`}>{nConfirmar}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <div role="status" aria-live="polite" className="mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6">
        {aviso ? <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-[15px] text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">{aviso}</p> : null}
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-4 md:p-6">
        {aberta ? <EncomendaPortal key={aberta} id={aberta} s={s} empresa={empresa} voltar={() => setAberta(null)} avisar={setAviso} />
          : pagina === "encomendas" ? <EncomendasPortal s={s} filtro={filtro} setFiltro={setFiltro} abrir={(id) => { setAviso(""); setAberta(id); }} />
          : pagina === "catalogo" ? <CatalogoPortal s={s} avisar={setAviso} />
          : pagina === "dados" ? <DadosPortal s={s} avisar={setAviso} />
          : <InicioPortal s={s} empresa={empresa} irEncomendas={irEncomendas} irCatalogo={() => ir("catalogo")} />}
      </main>
      </>}

      <footer className="border-t bg-background px-4 py-3 text-center md:px-6">
        <p className="text-xs text-muted-foreground"><span className="font-medium">{s.name}</span> · Portal do Fornecedor · demonstração com dados de exemplo</p>
      </footer>
    </div>
  );
}
