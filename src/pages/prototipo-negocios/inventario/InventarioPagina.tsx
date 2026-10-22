// O Inventário nativo (na Atual e na V2; 16/10), com o aspeto e a estrutura do mockup: o ecrã aberto vem do menu lateral (MenuInventario), sem separadores internos;
// pesquisa global no topo, as listas com pesquisa, filtros e ordenação, o detalhe numa folha lateral e as ações com diálogos próprios (nunca confirm()).
// Vive numa base de exemplo em memória (loja.ts): não toca no Estado nem no localStorage e "Repor inventário" apaga-a. Dados inventados, a 09/10/2026.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ATALHOS } from "../funcAtalhos";
import { classePortal } from "../FiltrosPopover";
import { useAtalhos, SEM_ATALHOS } from "../useAtalhos";
import { AvisoCaixa } from "./AvisoCaixa";
import { Contexto, useAvisoInv, type AbaInv, type CtxInv, type Destino, type Detalhe } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { FILTROS_VAZIOS, type FiltrosInv } from "./filtros";
import { esquecerInventario, executar, guardarAba, lerAba, tirarPedidoEcInv, useInventario } from "./loja";
import { Sec } from "./pecasInv";
import { Cab } from "./cabInv";
import { usePerfil } from "./perfil";
import { TITULOS } from "./menuInv";
import { PesquisaGlobal } from "./PesquisaGlobal";
import "./inventario.css";
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

/** O topo do mockup: a pesquisa global, o interruptor das fontes de dados e o botão de repor os dados de demonstração (o tema vem do resto do protótipo). */
function Topo({ fontes, mudarFontes, pedirRepor }: { fontes: boolean; mudarFontes: (v: boolean) => void; pedirRepor: () => void }) {
  return (
    <div className="topbar">
      <PesquisaGlobal />
      <div className="top-actions">
        <label className="switch"><input type="checkbox" checked={fontes} onChange={(e) => mudarFontes(e.target.checked)} /><span className="sw" aria-hidden="true" /><span>Mostrar fontes de dados</span></label>
        <button type="button" className="btn btn-sm" onClick={pedirRepor} title="Apaga as alterações feitas no mockup"><RefreshCw className="ic" aria-hidden="true" /><span className="hide-sm">Repor dados de demonstração</span><span className="sr">Repor dados</span></button>
      </div>
    </div>
  );
}

/** `alvoTopo` é o sítio, no cabeçalho do protótipo, onde se desenha o topo (pesquisa e ações); sem ele (testes e uso isolado) o topo fica dentro da página. */
interface PaginaProps {
  leitura?: boolean; aba?: AbaInv; aoMudarAba?: (a: AbaInv) => void; alvoTopo?: HTMLElement | null;
  /** 20/10 (demo): "Abrir como fornecedor →" no separador Portal da PO abre o portal do fornecedor simulado (PrototipoNegocios).
   *  22/10: pelo login dos portais, com o email do fornecedor já posto. */
  aoAbrirPortalForn?: (sup: string, po?: string) => void;
}

/** Sem `aba`, a página guarda ela própria o ecrã aberto (testes e uso isolado); com `aba`, quem manda é o menu lateral. */
export default function InventarioPagina({ leitura = false, aba: abaFora, aoMudarAba, alvoTopo, aoAbrirPortalForn }: PaginaProps) {
  const db = useInventario();
  const [abaInterna, setAbaInterna] = useState<AbaInv>(lerAba);
  const aba = abaFora ?? abaInterna;
  const setAba = useCallback((a: AbaInv): void => { setAbaInterna(a); aoMudarAba?.(a); }, [aoMudarAba]);
  const [filtros, setFiltros] = useState<FiltrosInv>(FILTROS_VAZIOS);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [aviso, anunciar] = useAvisoInv();
  const [repor, setRepor] = useState(false), [ajuda, setAjuda] = useState(false), [fontes, setFontes] = useState(false);
  const perfil = usePerfil();
  const [alvoAcoes, registarAcoes] = useState<HTMLElement | null>(null);
  const painel = useRef<HTMLDivElement>(null), primeira = useRef(true), viaIr = useRef(false);
  useEffect(() => { guardarAba(aba); }, [aba]);
  useEffect(() => { if (primeira.current) { primeira.current = false; return; } if (viaIr.current) viaIr.current = false; else setDetalhe(null); painel.current?.focus({ preventScroll: true }); }, [aba]);
  // 16/10: o negócio pediu para abrir a sua encomenda de cliente ("Ver no Inventário"): abre a folha dela
  useEffect(() => { const id = tirarPedidoEcInv(); if (id && db.ecs.some((e) => e.id === id)) setDetalhe({ t: "ec", id }); }, [db]);
  useEffect(() => { const prev = document.title; document.title = "Olyvia · Protótipo · Inventário"; return () => { document.title = prev; }; }, []);

  const agir = useCallback<CtxInv["agir"]>((fn, ok) => {
    const r = executar(fn);
    if (r.ok) { const t = typeof ok === "function" ? ok(r.valor) : ok; if (t) anunciar(t); } else anunciar(r.erro, true);
    return r;
  }, [anunciar]);
  const ir = useCallback((d: Destino, det?: Detalhe): void => {
    setDetalhe(det ?? null);
    if (d.aba !== aba) viaIr.current = true;
    setAba(d.aba);
    const k = CHAVE_FILTRO[d.aba];
    if (k && "f" in d && d.f) setFiltros((x) => ({ ...x, [k]: { ...FILTROS_VAZIOS[k], ...d.f } }));
  }, [setAba, aba]);
  const ctx = useMemo<CtxInv>(() => ({
    db, leitura, agir, avisar: anunciar, aviso, ir, perfil, alvoAcoes, registarAcoes, abrir: setDetalhe, fecharDetalhe: () => setDetalhe(null), filtros,
    setFiltros: (k, p) => setFiltros((x) => ({ ...x, [k]: { ...x[k], ...p } })), abrirPortalForn: aoAbrirPortalForn,
  }), [db, leitura, agir, anunciar, aviso, ir, perfil, alvoAcoes, filtros, aoAbrirPortalForn]);

  // Os atalhos: ↓ ↑ j k entre linhas, Enter abre, "/" vai à pesquisa, Esc limpa-a, "?" mostra a ajuda. Um só ouvinte para todo o módulo.
  useAtalhos(!ajuda, "lista", painel, {
    pesquisa: () => painel.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus(), ajuda: () => setAjuda(true),
    esc: () => { const k = CHAVE_FILTRO[aba]; const f = k ? (filtros[k] as { q?: string }) : null; if (k && f?.q) setFiltros((x) => ({ ...x, [k]: { ...x[k], q: "" } })); },
  });
  const topo = <Topo fontes={fontes} mudarFontes={setFontes} pedirRepor={() => setRepor(true)} />;
  return (
    <Contexto.Provider value={ctx}>
      <TooltipProvider>
        <div className={cn("inv-root inv-pagina", fontes && "show-src")}>
          {alvoTopo === undefined ? topo : alvoTopo ? createPortal(<div className="inv-root inv-topo">{topo}</div>, alvoTopo) : null}
          <div className="content">
            <AvisoCaixa />
            <div id="inv-painel" ref={painel} role="region" aria-label={TITULOS[aba][0]} tabIndex={-1} className="min-w-0 outline-none">
              <Cab aba={aba} />
              <Painel aba={aba} />
            </div>
          </div>
          {detalhe && <FolhasInv detalhe={detalhe} aoFechar={() => setDetalhe(null)} />}
          {repor && <Confirmar aberto aoFechar={() => setRepor(false)} titulo="Repor dados de demonstração" ok="Repor dados" perigo
            texto={<p>Todas as alterações feitas neste mockup (encomendas, movimentos, receções…) são apagadas e os dados fictícios voltam ao estado inicial. O resto do protótipo não muda.</p>}
            aoConfirmar={() => { esquecerInventario(); setFiltros(FILTROS_VAZIOS); setDetalhe(null); anunciar("Dados de demonstração repostos."); return { ok: true, valor: undefined, erro: "" }; }} />}
          <AjudaTeclas aberta={ajuda} mudar={setAjuda} leitura={leitura} />
        </div>
      </TooltipProvider>
    </Contexto.Provider>
  );
}
