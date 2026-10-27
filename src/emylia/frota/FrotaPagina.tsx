// A Frota nativa (só na V2), portada de vault/frota-prototipo.html com a UI do Inventário: o ecrã aberto vem do menu lateral (MenuFrota), a
// pesquisa global, o interruptor das fontes e "Repor dados de demonstração" desenham-se no topo do protótipo (portal em `alvoTopo`), a viatura abre
// numa folha lateral e as ações em diálogos próprios. Base própria em loja.ts; o stock das carrinhas é o do Inventário; as obras vêm do Estado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { seed as seedMotor } from "../motor";
import { useAvisoInv } from "../inventario/ctxInv";
import { executar as executarInv, useInventario } from "../inventario/loja";
import "../inventario/inventario.css";
import "./frota.css";
import { ContextoFrota, useCtxFrota, type AbaFolha, type CtxFrota, type DadosDlg, type TipoDlg } from "./ctxFrota";
import { AvisoFrota, ConfirmarF, DialogoFrota } from "./DialogosFrota";
import { esquecerFrota, executar, guardarAbaFrota, lerAbaFrota, useFrota, type AbaFrota } from "./loja";
import { MENU_FROTA, visiveisDe } from "./itensMenuFrota";
import { PERFIS_FROTA, usePerfilFrota } from "./perfil";
import { obrasDoEstado } from "./pontes";
import { stockCarrinha } from "./pontesInv";
import { condutor, viaturaDe } from "./regras";
import type { ObraRef } from "./tipos";
import { HojeFrota } from "./HojeFrota";
import { ViaturasFrota } from "./ViaturasFrota";
import { AtribuicoesFrota } from "./AtribuicoesFrota";
import { CondutoresFrota } from "./CondutoresFrota";
import { ManutencaoFrota } from "./ManutencaoFrota";
import { CustosFrota } from "./CustosFrota";
import { OcorrenciasFrota } from "./OcorrenciasFrota";
import { DocumentosFrota } from "./DocumentosFrota";
import { RelatoriosFrota } from "./RelatoriosFrota";
import { LigacoesFrota } from "./LigacoesFrota";
import { ViaturaFolha } from "./ViaturaFolha";
import { useParamUrl } from "../usarParamUrl";

function Painel({ aba }: { aba: AbaFrota }) {
  switch (aba) {
    case "viaturas": return <ViaturasFrota />;
    case "atribuicoes": return <AtribuicoesFrota />;
    case "condutores": return <CondutoresFrota />;
    case "manutencao": return <ManutencaoFrota />;
    case "custos": return <CustosFrota />;
    case "ocorrencias": return <OcorrenciasFrota />;
    case "documentos": return <DocumentosFrota />;
    case "relatorios": return <RelatoriosFrota />;
    case "ligacoes": return <LigacoesFrota />;
    default: return <HojeFrota />;
  }
}

/** A pesquisa global do topo (topoHtml do protótipo HTML): matrícula, modelo ou condutor. Cada resultado abre a viatura (ou os Condutores). */
function PesquisaFrota() {
  const { F, visiveis, perfil, abrir, ir } = useCtxFrota();
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const vs = t.length >= 2 ? visiveis.filter((v) => (v.mat + " " + v.marca + " " + v.modelo).toLowerCase().replace(/-/g, "").includes(t.replace(/-/g, ""))) : [];
  const ps = t.length >= 2 && perfil !== "tecnico" ? F.pessoas.filter((p) => p.nome.toLowerCase().includes(t)) : [];
  const fechar = (): void => setQ("");
  return (
    <div className="gsearch" role="search">
      <label className="sr" htmlFor="frota-gq">Procurar na frota</label>
      <Search className="ic" aria-hidden="true" />
      <input id="frota-gq" type="search" autoComplete="off" placeholder="Procurar matrícula, modelo ou condutor" value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") fechar(); }} />
      {t.length >= 2 ? (
        <div className="gres" role="listbox" aria-label="Resultados da pesquisa">
          {vs.map((v) => (
            <button key={v.id} type="button" role="option" aria-selected="false" onClick={() => { fechar(); abrir(v.id); }}>
              <span className="gk">Viatura</span><b>{v.mat}</b><small>{v.marca} {v.modelo} · {condutor(F, v.id)?.nome ?? "sem condutor"}</small>
            </button>
          ))}
          {ps.map((p) => { const v = viaturaDe(F, p.id); return (
            <button key={p.id} type="button" role="option" aria-selected="false" onClick={() => { fechar(); if (v) abrir(v.id); else ir("condutores"); }}>
              <span className="gk">Condutor</span><b>{p.nome}</b><small>{p.funcao} · {v ? v.mat : "sem viatura"}</small>
            </button>
          ); })}
          {!vs.length && !ps.length ? <div className="empty" style={{ padding: 16 }}>Nada encontrado para “{q.trim()}”.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function Topo({ pedirRepor }: { pedirRepor: () => void }) {
  const { perfil, fontes, mudarFontes } = useCtxFrota();
  return (
    <div className="topbar">
      <PesquisaFrota />
      <div className="top-actions">
        {perfil !== "gestor" ? <span className="badge b-info"><Eye className="ic sm" aria-hidden="true" />{PERFIS_FROTA[perfil]}</span> : null}
        <label className="switch"><input type="checkbox" checked={fontes} onChange={(e) => mudarFontes(e.target.checked)} /><span className="sw" aria-hidden="true" /><span>Mostrar fontes de dados</span></label>
        <button type="button" className="btn btn-sm" onClick={pedirRepor} title="Apaga as alterações feitas na Frota"><RefreshCw className="ic" aria-hidden="true" /><span className="hide-sm">Repor dados de demonstração</span><span className="sr">Repor dados</span></button>
      </div>
    </div>
  );
}

let obrasExemplo: ObraRef[] | null = null;
/** Sem o Estado (testes e uso isolado), as obras são as da demonstração (seed do motor). */
const obrasPorOmissao = (): ObraRef[] => (obrasExemplo ??= obrasDoEstado(seedMotor()));

export interface FrotaProps {
  leitura?: boolean;
  aba?: AbaFrota;
  aoMudarAba?: (a: AbaFrota) => void;
  /** Onde se desenha o topo (pesquisa e ações), no cabeçalho do protótipo; sem ele o topo fica dentro da página. */
  alvoTopo?: HTMLElement | null;
  obras?: ObraRef[];
  irObra?: (id: number) => void;
  irAgenda?: () => void;
  irInventario?: () => void;
  /** A viatura pedida por outro módulo (Agenda, página da obra), já tratada pela moldura: abre-se uma vez e avisa com `pedidoAberto`. */
  pedido?: { vid: string; n: number } | null;
  pedidoAberto?: () => void;
}

/** Sem `aba`, a página guarda ela própria o ecrã aberto (testes e uso isolado); com `aba`, manda o menu lateral. */
export default function FrotaPagina({ aba: abaFora, aoMudarAba, alvoTopo, obras, irObra, irAgenda, irInventario, pedido, pedidoAberto }: FrotaProps) {
  const F = useFrota();
  const inv = useInventario();
  const perfil = usePerfilFrota();
  const [abaInterna, setAbaInterna] = useState<AbaFrota>(lerAbaFrota);
  const aba = abaFora ?? abaInterna;
  const setAba = useCallback((a: AbaFrota): void => { setAbaInterna(a); aoMudarAba?.(a); }, [aoMudarAba]);
  const [f, setFs] = useState<Record<string, string>>({});
  // 26/10: a ficha da viatura vai para o endereço (?viatura=<id>:<separador>): o "voltar" do browser fecha-a ou volta ao separador anterior
  const [folhaUrl, setFolhaUrl] = useParamUrl<string>("viatura", "");
  const folha = useMemo<{ vid: string; aba: AbaFolha } | null>(() => {
    const i = folhaUrl.lastIndexOf(":");
    return folhaUrl ? { vid: i > 0 ? folhaUrl.slice(0, i) : folhaUrl, aba: (i > 0 ? folhaUrl.slice(i + 1) : "resumo") as AbaFolha } : null;
  }, [folhaUrl]);
  const setFolha = useCallback((x: { vid: string; aba: AbaFolha } | null, op?: { substituir?: boolean }) => setFolhaUrl(x ? `${x.vid}:${x.aba}` : "", op), [setFolhaUrl]);
  const [dlgAberto, setDlg] = useState<{ tipo: TipoDlg; dados: DadosDlg; n: number } | null>(null);
  const [repor, setRepor] = useState(false);
  const [fontes, setFontes] = useState(false);
  const [aviso, anunciar] = useAvisoInv();
  const painel = useRef<HTMLDivElement>(null), primeira = useRef(true), viaIr = useRef(false);

  useEffect(() => { guardarAbaFrota(aba); }, [aba]);
  // ao mudar de ecrã: fecha a folha (exceto quando se foi para lá com filtros) e o foco vai para o título
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    if (viaIr.current) viaIr.current = false;
    painel.current?.querySelector<HTMLElement>("#frota-h1")?.focus({ preventScroll: true });
  }, [aba]);
  // mudar de perfil fecha a folha e limpa os filtros (como no protótipo HTML)
  const perfilAntes = useRef(perfil);
  useEffect(() => { if (perfilAntes.current !== perfil) { perfilAntes.current = perfil; setFolha(null, { substituir: true }); setFs({}); } }, [perfil]); // eslint-disable-line react-hooks/exhaustive-deps
  // um pedido vindo de fora (Agenda, página da obra) abre a viatura uma só vez; depois a moldura esquece-o
  useEffect(() => {
    if (!pedido) return;
    if (F.viaturas.some((v) => v.id === pedido.vid)) setFolha({ vid: pedido.vid, aba: "resumo" });
    pedidoAberto?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.n]);
  // 26/10: dentro da moldura (que passa o alvoTopo), o título é dela (navegacao.ts: tituloDaRota)
  useEffect(() => { if (alvoTopo !== undefined) return undefined; const prev = document.title; document.title = "Olyvia · Protótipo · Frota"; return () => { document.title = prev; }; }, []);

  const agir = useCallback<CtxFrota["agir"]>((fn, ok) => {
    const r = executar(fn);
    if (r.ok) { const t = typeof ok === "function" ? ok(r.valor) : ok; if (t) anunciar(t); } else anunciar(r.erro, true);
    return r;
  }, [anunciar]);
  const agirInv = useCallback<CtxFrota["agirInv"]>((fn, ok) => {
    const r = executarInv(fn);
    if (r.ok) { const t = typeof ok === "function" ? ok(r.valor) : ok; if (t) anunciar(t); } else anunciar(r.erro, true);
    return r;
  }, [anunciar]);
  const ir = useCallback((a: AbaFrota, filtro?: Record<string, string>): void => {
    if (a !== aba) viaIr.current = true;
    setFolha(null, { substituir: true });
    if (filtro) setFs((x) => ({ ...x, ...filtro }));
    setAba(a);
  }, [aba, setAba]);
  const visiveis = useMemo(() => visiveisDe(F, perfil), [F, perfil]);
  const stock = useCallback((vid: string) => stockCarrinha(inv, F.viaturas.find((v) => v.id === vid)?.armazemId), [inv, F]);
  const ctx = useMemo<CtxFrota>(() => ({
    F, inv, perfil, fontes, mudarFontes: setFontes, visiveis, stock, obras: obras ?? obrasPorOmissao(), agir, agirInv, avisar: anunciar, aviso, aba, ir,
    f, setF: (k, v) => setFs((x) => ({ ...x, [k]: v })),
    abrir: (vid, a) => setFolha({ vid, aba: a ?? "resumo" }), fechar: () => setFolha(null),
    dlg: (tipo, dados) => setDlg((d) => ({ tipo, dados: dados ?? {}, n: (d?.n ?? 0) + 1 })),
    irObra, irAgenda, irInventario,
  }), [F, inv, perfil, fontes, visiveis, stock, obras, agir, agirInv, anunciar, aviso, aba, ir, f, irObra, irAgenda, irInventario]);

  // "/" vai à pesquisa global (fora dos campos)
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key !== "/" || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? "")) return;
      const g = document.getElementById("frota-gq");
      if (g) { e.preventDefault(); g.focus(); }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);

  const topo = <Topo pedirRepor={() => setRepor(true)} />;
  const titulo = MENU_FROTA.find(([k]) => k === aba)?.[1] ?? "Frota";
  return (
    <ContextoFrota.Provider value={ctx}>
      <TooltipProvider>
        <div className={cn("inv-root inv-pagina frota-root", fontes && "show-src")}>
          {alvoTopo === undefined ? topo : alvoTopo ? createPortal(<div className={cn("inv-root inv-topo frota-root", fontes && "show-src")}>{topo}</div>, alvoTopo) : null}
          <div className="content">
            <AvisoFrota />
            <div id="frota-painel" ref={painel} role="region" aria-label={titulo} className="min-w-0">
              <Painel aba={aba} />
            </div>
          </div>
          {folha && <ViaturaFolha key={folha.vid} vid={folha.vid} aba={folha.aba} mudarAba={(a) => setFolha({ ...folha, aba: a })} aoFechar={() => setFolha(null)} />}
          {dlgAberto && <DialogoFrota key={dlgAberto.n} tipo={dlgAberto.tipo} dados={dlgAberto.dados} aoFechar={() => setDlg(null)} aoCriar={(vid) => setFolha({ vid, aba: "resumo" })} />}
          {repor && <ConfirmarF aberto aoFechar={() => setRepor(false)} titulo="Repor a demonstração" ok="Repor" perigo
            texto={<p>Apaga tudo o que fizeste na Frota e volta aos dados de exemplo de 14/10/2026. O Inventário e o resto do protótipo não mudam.</p>}
            aoConfirmar={() => { esquecerFrota(); setFs({}); setFolha(null); setAba("hoje"); anunciar("Demonstração reposta."); }} />}
        </div>
      </TooltipProvider>
    </ContextoFrota.Provider>
  );
}
