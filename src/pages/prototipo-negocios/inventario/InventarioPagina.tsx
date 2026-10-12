// O Inventário completo, nativo, só na V2 (e na V2 funcional): um separador por área (Hoje, Encomendas, Fornecedores, Stock, Movimentos, Encomendas de cliente, Guias,
// Contagens, Armazéns), as listas com pesquisa, filtros e ordenação, o detalhe numa folha lateral e as ações com diálogos próprios (nunca confirm()).
// Vive numa base de exemplo em memória (loja.ts): não toca no Estado nem no localStorage e "Repor inventário" apaga-a. Dados inventados, a 09/10/2026.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { teclasTablist } from "../pecas";
import { ATALHOS } from "../funcAtalhos";
import { classePortal } from "../FiltrosPopover";
import { useAtalhos, SEM_ATALHOS } from "../useAtalhos";
import { AvisoCaixa } from "./AvisoCaixa";
import { Contexto, useAvisoInv, type AbaInv, type CtxInv, type Destino, type Detalhe } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { FILTROS_VAZIOS, type FiltrosInv } from "./filtros";
import { esquecerInventario, executar, guardarAba, lerAba, useInventario } from "./loja";
import { Sec } from "./pecasInv";
import { ArmazensInv } from "./ArmazensInv";
import { ContagensInv } from "./ContagensInv";
import { EcInv } from "./EcInv";
import { EncomendasInv } from "./EncomendasInv";
import FolhasInv from "./FolhasInv";
import { FornecedoresInv } from "./FornecedoresInv";
import { GuiasInv } from "./GuiasInv";
import { HojeInv } from "./HojeInv";
import { MovimentosInv } from "./MovimentosInv";
import { StockInv } from "./StockInv";



const ABAS: readonly (readonly [AbaInv, string])[] = [
  ["hoje", "Hoje"], ["po", "Encomendas"], ["sup", "Fornecedores"], ["stock", "Stock"], ["mov", "Movimentos"], ["ec", "Encomendas de cliente"], ["guia", "Guias"], ["cont", "Contagens"], ["wh", "Armazéns"],
];
const CHAVE_FILTRO: Partial<Record<AbaInv, keyof FiltrosInv>> = { po: "po", sup: "forn", stock: "stock", mov: "mov", ec: "ec", guia: "guia", cont: "cont" };

function Painel({ aba }: { aba: AbaInv }) {
  switch (aba) {
    case "po": return <EncomendasInv />;
    case "sup": return <FornecedoresInv />;
    case "stock": return <StockInv />;
    case "mov": return <MovimentosInv />;
    case "ec": return <EcInv />;
    case "guia": return <GuiasInv />;
    case "cont": return <ContagensInv />;
    case "wh": return <ArmazensInv />;
    default: return <HojeInv />;
  }
}

function AjudaTeclas({ aberta, mudar, leitura }: { aberta: boolean; mudar: (v: boolean) => void; leitura: boolean }) {
  const itens = ATALHOS.filter((a) => !/pessoa|painel/i.test(a.o));
  return (
    <Dialog open={aberta} onOpenChange={mudar}>
      <DialogContent {...{ [SEM_ATALHOS]: "" }} className={cn("max-w-md gap-3 p-5", classePortal(leitura))}>
        <DialogTitle className="text-lg font-semibold">Atalhos</DialogTitle>
        <DialogDescription className="text-[15px] text-muted-foreground">Não funcionam enquanto se escreve num campo.</DialogDescription>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
          {itens.map((a) => <div key={a.teclas} className="contents"><dt><kbd className="rounded border border-border px-1.5 font-sans">{a.teclas}</kbd></dt><dd>{a.o.replace("a ficha (ou o negócio)", "o detalhe")}</dd></div>)}
        </dl>
        <div className="flex justify-end"><Sec onClick={() => mudar(false)}>Fechar</Sec></div>
      </DialogContent>
    </Dialog>
  );
}

function Cabecalho({ pedirRepor }: { pedirRepor: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">Inventário completo</h1><span className="rounded-full border border-border px-3 py-0.5 text-[15px]">exemplo · dados inventados, 09/10/2026</span></div>
            <Sec onClick={pedirRepor}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Repor inventário</Sec>
          </div>
  );
}

function Abas({ aba, ir }: { aba: AbaInv; ir: (d: Destino) => void }) {
  const ids = ABAS.map((a) => a[0]);
  return (
          <div role="tablist" aria-label="Áreas do inventário" className="flex gap-1 overflow-x-auto border-b border-border pb-2">
            {ABAS.map(([id, nome], i) => (
              <button key={id} id={`inv-tab-${id}`} type="button" role="tab" aria-selected={aba === id} aria-controls="inv-painel" tabIndex={aba === id ? 0 : -1} onClick={() => ir({ aba: id } as Destino)}
                onKeyDown={(e) => teclasTablist(e, i, ids, "inv-tab", (x) => ir({ aba: x } as Destino))}
                className={cn("min-h-11 shrink-0 cursor-pointer rounded-md border px-4 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", aba === id ? "border-foreground bg-foreground text-background" : "border-transparent hover:border-border")}>{nome}</button>
            ))}
          </div>
  );
}

export default function InventarioPagina({ leitura = false }: { leitura?: boolean }) {
  const db = useInventario();
  const [aba, setAba] = useState<AbaInv>(lerAba);
  const [filtros, setFiltros] = useState<FiltrosInv>(FILTROS_VAZIOS);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [aviso, anunciar] = useAvisoInv();
  const [repor, setRepor] = useState(false), [ajuda, setAjuda] = useState(false);
  const painel = useRef<HTMLDivElement>(null), primeira = useRef(true);
  useEffect(() => { guardarAba(aba); }, [aba]);
  useEffect(() => { if (primeira.current) { primeira.current = false; return; } painel.current?.focus({ preventScroll: true }); }, [aba]);
  useEffect(() => { const prev = document.title; document.title = "Olyvia · Protótipo · Inventário"; return () => { document.title = prev; }; }, []);

  const agir = useCallback<CtxInv["agir"]>((fn, ok) => {
    const r = executar(fn);
    if (r.ok) { const t = typeof ok === "function" ? ok(r.valor) : ok; if (t) anunciar(t); } else anunciar(r.erro, true);
    return r;
  }, [anunciar]);
  const ir = useCallback((d: Destino): void => {
    setDetalhe(null);
    setAba(d.aba);
    const k = CHAVE_FILTRO[d.aba];
    if (k && "f" in d && d.f) setFiltros((x) => ({ ...x, [k]: { ...FILTROS_VAZIOS[k], ...d.f } }));
  }, []);
  const ctx = useMemo<CtxInv>(() => ({
    db, leitura, agir, avisar: anunciar, aviso, ir, abrir: setDetalhe, fecharDetalhe: () => setDetalhe(null), filtros,
    setFiltros: (k, p) => setFiltros((x) => ({ ...x, [k]: { ...x[k], ...p } })),
  }), [db, leitura, agir, anunciar, aviso, ir, filtros]);

  // Os atalhos: ↓ ↑ j k entre linhas, Enter abre, "/" vai à pesquisa, Esc limpa-a, "?" mostra a ajuda. Um só ouvinte para todo o módulo.
  useAtalhos(!ajuda, "lista", painel, {
    pesquisa: () => painel.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus(), ajuda: () => setAjuda(true),
    esc: () => { const k = CHAVE_FILTRO[aba]; const f = k ? (filtros[k] as { q?: string }) : null; if (k && f?.q) setFiltros((x) => ({ ...x, [k]: { ...x[k], q: "" } })); },
  });
  return (
    <Contexto.Provider value={ctx}>
      <TooltipProvider>
        <div className={cn("pn calma mx-auto grid w-full max-w-[1600px] gap-4 px-4 pb-10 pt-4 text-[15px]", leitura && "leitura pessoas-leitura")}>
          <Cabecalho pedirRepor={() => setRepor(true)} />
          <Abas aba={aba} ir={ir} />
          <AvisoCaixa />
          <div id="inv-painel" ref={painel} role="tabpanel" aria-labelledby={`inv-tab-${aba}`} tabIndex={-1} className="min-w-0 outline-none">
            <Painel aba={aba} />
          </div>
          {detalhe && <FolhasInv detalhe={detalhe} aoFechar={() => setDetalhe(null)} />}
          {repor && <Confirmar aberto aoFechar={() => setRepor(false)} titulo="Repor inventário" ok="Repor inventário" perigo
            texto={<p>Todas as alterações feitas neste módulo (encomendas, movimentos, receções...) são apagadas e os dados de exemplo voltam ao estado inicial. O resto do protótipo não muda.</p>}
            aoConfirmar={() => { esquecerInventario(); setFiltros(FILTROS_VAZIOS); setDetalhe(null); anunciar("Inventário reposto: voltaram os dados de exemplo."); return { ok: true, valor: undefined, erro: "" }; }} />}
          <AjudaTeclas aberta={ajuda} mudar={setAjuda} leitura={leitura} />
        </div>
      </TooltipProvider>
    </Contexto.Provider>
  );
}
