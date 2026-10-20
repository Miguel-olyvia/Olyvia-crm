// Protótipo de Negócios (08/10/2026, com o aspeto da Olyvia desde 09/10): as 12
// screens a funcionar com dados de exemplo. Rota pública, fora do CRM: não usa a sessão nem a base de dados.
import { createPortal } from "react-dom";
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  BarChart3, Bell, Building, Building2, ChevronDown, LayoutTemplate, Megaphone, Package, Search, Settings, MoreHorizontal, ShoppingCart, Sparkles, Sun, Truck, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import mascote from "@/assets/olyvia-mascot.png";
import { cn } from "@/lib/utils";
import "./prototipo.css";
import {
  ESTR, FASES, LINHAS, PAPEIS, TECS, DIAS, VERSAO,
  aberto, acoes, conflitos, custoUn, eur, minhas, nfmt, pct, proximo, seed, tot,
  type Aviso, type Estado, type LinhaId, type Papel, type SvcId, type Vista,
} from "./motor";
import { Hoje } from "./Hoje";
import { HojeSimples } from "./HojeSimples";
import { LeadsSimples, esquecerLeads } from "./LeadsSimples";
import { NegocioSimples } from "./NegocioSimples";
import { NegociosSimples } from "./NegociosSimples";
import { NegociosV2 } from "./NegociosV2";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";
import { PessoasFunc, esquecerPessoasFunc } from "./PessoasFunc";
import { NegociosFunc, esquecerNegociosFunc } from "./NegociosFunc";
import { PessoasV1, esquecerPessoasV1, irParaLista } from "./PessoasV1";
import { NegociosV1Docs } from "./NegociosV1Docs";
import { NumerosV1 } from "./NumerosV1";
import { esquecerDiaADia } from "./diaADia";
import { esquecerV2 } from "./v2/esquecerV2";
import { SeletorVersao } from "./SeletorVersao";
import { gravarVersao, lerVersao, vistaEquivalente, type VersaoProto } from "./versaoPrototipo";
import { ICONE_NEGOCIO } from "./iconeNegocio";
import { InventarioSimples, OperacoesSimples } from "./OperacoesSimples";
import { CatalogoSimples, ClientesSimples, DefinicoesSimples, MarketingSimples } from "./OutrosSimples";
import { CamposEditor } from "./CamposEditor";
import { HojeV2 } from "./v2/HojeV2";
import { CatalogoV2 } from "./v2/CatalogoV2";
import { MarketingV2 } from "./v2/MarketingV2";
import { DefinicoesV2 } from "./v2/DefinicoesV2";
import { OperacoesV2 } from "./v2/OperacoesV2";
import { PaginaNegocio } from "./PaginaNegocio";
import { Banner, Btn, Campo, numero, type Ctx } from "./pecas";
import type { AbaInv } from "./inventario/ctxInv";
import { lerInventario, lerPedidoEcInv, lerPedidoRececaoInv, subscrever as subscreverInv, tirarPedidoEcInv, tirarPedidoRececaoInv, useInventario } from "./inventario/loja";
import { ecsEliminadasDeNegocios, sincronizarEcsNegocios } from "./inventario/ponteNegocios";
import { faltaParaArrancar } from "./preparacaoObra";
import PerfilSimulado from "./inventario/PerfilSimulado";
import PerfilFrotaSimulado from "./frota/PerfilFrotaSimulado";
import { esquecerFrota, type AbaFrota } from "./frota/loja";
import { definirMolduraFrota, obrasDoEstado, tratarPedidoFrota, usePedidoFrota } from "./frota/pontes";
import { PortalCliente } from "./PortalCliente";
import { RevisaoContrato } from "./RevisaoContrato";
import { TIPOS_DOC, tokenDoc } from "./DocsCliente";
import { fornecedorInicial } from "./portalFornecedor/dadosPortal";

// O Inventário completo (nativo, na Atual e na V2) só se carrega quando se abre essa página.
const InventarioPagina = lazy(() => import("./inventario/InventarioPagina"));
const MenuInventario = lazy(() => import("./inventario/MenuInventario"));
// A Frota (nativa, na Atual e na V2), com a UI do Inventário: também só se carrega quando se abre.
const FrotaPagina = lazy(() => import("./frota/FrotaPagina"));
const MenuFrota = lazy(() => import("./frota/MenuFrota"));
// 20/10 (demo): o Portal do Fornecedor simulado, de ecrã inteiro (lê e escreve o Inventário em memória: abre no mesmo separador).
const PortalFornecedor = lazy(() => import("./portalFornecedor/PortalFornecedor"));

const CHAVE = "olyvia-prototipo-negocios";
// A versão (Atual, V2 ou V2 funcional) vive fora do Estado (e da VERSAO): é uma preferência de quem vê, não um dado da demonstração (versaoPrototipo.ts).

function ler(): Estado {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (j && j.v === VERSAO) return j as Estado;
  } catch {
    /* sem storage: começa do zero */
  }
  return seed();
}

interface Toast extends Aviso { id: number }
const CHAVE_PROPOSTA_V1 = "olyvia-prototipo-v1-proposta";

export default function PrototipoNegocios() {
  const ref = useRef<Estado>(ler());
  const S = ref.current;
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Com o painel de uma pessoa aberto, o Radix esconde o resto da página (aria-hidden): os avisos passam para dentro do painel enquanto ele estiver aberto.
  const [alvoAvisos, setAlvoAvisos] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const [mais, setMais] = useState(false); // telemóvel: o menu "Mais"
  const [invMock, setInvMock] = useState(false); // um ecrã do Inventário (do menu lateral): existe na Atual e na V2 (não na V2 funcional) e vive fora do Estado
  const [invAba, setInvAba] = useState<AbaInv>("hoje"); // qual deles
  const [frotaMock, setFrotaMock] = useState(false); // um ecrã da Frota (do menu lateral): como o Inventário, na Atual e na V2 e fora do Estado
  const [frotaAba, setFrotaAba] = useState<AbaFrota>("hoje");
  // 20/10 (demo): o Portal do Fornecedor simulado (com que fornecedor se entrou, a encomenda a abrir e para onde voltar); fecha o Inventário e a Frota
  const [fornMock, setFornMock] = useState<{ sup: string; po: string | null; voltar: "inv" | "crm"; n: number } | null>(null);
  const [alvoTopo, setAlvoTopo] = useState<HTMLElement | null>(null); // o cabeçalho do protótipo, onde o inventário desenha a pesquisa global
  const [versao, setVersao] = useState<VersaoProto>(lerVersao);
  // 16/10: Pessoas numa página e Negócios por documento (PessoasV1.tsx, NegociosV1Docs.tsx). Neste ramo partilhado fica desligada por defeito
  // (liga-se no interruptor "Pessoas numa página"); o V1 novo do Ruben segue no ramo feat/v1, onde está ligada. Preferência de quem vê, como a versão.
  const [navPessoas, setNavPessoas] = useState(0); // o menu "Pessoas" volta a montar a página (vai à lista, mesmo com uma ficha aberta)
  const [propostaV1, setPropostaV1] = useState<boolean>(() => { try { return localStorage.getItem(CHAVE_PROPOSTA_V1) === "1"; } catch { return false; } });
  const mainRef = useRef<HTMLElement>(null);
  const tid = useRef(0);

  // o link do portal do cliente (?portal=<código>): abre o portal numa página própria (14/10)
  const [portalTok, setPortalTok] = useState<string | null>(() => { try { return new URLSearchParams(window.location.search).get("portal"); } catch { return null; } });
  // o que se faz noutro separador (o portal) chega aqui sem recarregar
  useEffect(() => {
    const f = (e: StorageEvent) => { if (e.key === CHAVE) { ref.current = ler(); redesenhar(); } };
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);

  const guardar = useCallback(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify(ref.current)); } catch { /* ignora */ }
  }, []);

  // corre uma mudança, grava e desenha; volta ao topo quando muda de ecrã
  const run = useCallback((fn: () => void) => {
    const antes = ref.current.view + ":" + ref.current.deal + ":" + ref.current.op;
    fn();
    guardar();
    redesenhar();
    const depois = ref.current.view + ":" + ref.current.deal + ":" + ref.current.op;
    if (antes !== depois && mainRef.current) mainRef.current.scrollTop = 0;
  }, [guardar]);

  const avisar = useCallback((a: Aviso) => {
    const mostra = () => {
      const id = ++tid.current;
      setToasts((t) => [...t, { ...a, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), a.act ? 8000 : 5200);
    };
    if (a.atraso) setTimeout(mostra, a.atraso); else mostra();
  }, []);

  const A = useMemo(() => acoes(S, avisar, run), [S, avisar, run]);
  const go = (fn: () => void) => () => run(fn);

  // o "pulse" faz scroll até à secção e acende-a uma vez
  useEffect(() => {
    const alvo = ref.current.pulse;
    if (!alvo) return;
    ref.current.pulse = null;
    document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: alvo === "verif" ? "center" : "start" });
  });
  useEffect(() => { S.deals.forEach((d) => (d.fresh = false)); });
  // iPhone: só com viewport-fit=cover é que env(safe-area-inset-*) tem valor; liga-se enquanto o protótipo está aberto
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const antes = meta.content;
    if (!/viewport-fit/.test(antes)) meta.content = antes + ", viewport-fit=cover";
    return () => { meta.content = antes; };
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Olyvia · Protótipo de Negócios";
    return () => { document.title = prev; };
  }, []);

  const repor = () => run(() => {
    try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
    ref.current = seed();
    esquecerLeads();
    esquecerPessoas();
    esquecerPessoasFunc();
    esquecerPessoasV1();
    esquecerNegociosFunc();
    esquecerDiaADia();
    esquecerV2();
    esquecerFrota();
    avisar({ msg: "Demonstração reposta", sub: "Todos os negócios voltaram ao início", kind: "ok" });
  });

  const ctx: Ctx = { S, A, run, go, q, setQ, repor };
  const simples = (S.aspeto ?? "simples") === "simples";
  // A V2 (e a V2 funcional) só se aplicam ao aspeto simples: no aspeto atual o seletor nem aparece.
  const v2 = versao !== "atual" && simples;
  const func = versao === "funcional" && simples;
  const v1n = propostaV1 && versao === "atual" && simples; // a proposta só se aplica ao V1
  const mudarPropostaV1 = (sim: boolean) => {
    setPropostaV1(sim);
    try { localStorage.setItem(CHAVE_PROPOSTA_V1, sim ? "1" : "0"); } catch { /* sem storage: vale só nesta sessão */ }
    run(() => {
      if (["leads", "clientes", "pessoas"].includes(ref.current.view)) A.nav(sim ? "pessoas" : "leads");
      else if (!sim && ref.current.view === "numeros") A.nav("negocios");
    });
  };
  const mudarVersao = (nova: VersaoProto) => {
    setVersao(nova);
    gravarVersao(nova);
    // Os ecrãs do Inventário e da Frota não existem na V2 funcional: volta à vista equivalente (Negócios).
    if (nova === "funcional" && (invMock || frotaMock)) { setInvMock(false); setFrotaMock(false); run(() => A.nav("negocios")); return; }
    // Leads e Clientes passam a Pessoas (e Pessoas a Leads): a vista atual segue para a equivalente.
    run(() => {
      if (ref.current.view === "numeros" && nova !== "atual") { A.nav("negocios"); return; } // os Números só existem no V1
      const vista = vistaEquivalente(ref.current.view, nova);
      if (vista !== ref.current.view) A.nav(vista);
    });
  };

  // A letra da proposta simples: Lexend, desenhada para facilitar a leitura (inclui quem tem dislexia).
  useEffect(() => {
    if (document.getElementById("pn-lexend")) return;
    const l = document.createElement("link");
    l.id = "pn-lexend"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);
  // Com a V2 ligada a lista de Negócios é por documento. Enquanto se cria uma lead (S.novo) mostra-se a lista de sempre, que tem o formulário.
  // Com a V2 ligada, "Nova lead" é de Pessoas: o menu destaca Pessoas e uma frase avisa que a lead criada se vê lá.
  const novaLeadV2 = v2 && !!S.novo;
  // Com a proposta do V1 a lead cria-se em Pessoas: Negócios mostra sempre o quadro por documento (um S.novo antigo não o tapa).
  const listaNegocios = simples
    ? (v1n ? <NegociosV1Docs {...ctx} /> : v2 && !S.novo ? (func ? <NegociosFunc {...ctx} /> : <NegociosV2 {...ctx} />) : novaLeadV2
      ? (
        <>
          <p className="mx-auto w-full max-w-3xl px-4 pt-6 text-[15px] text-muted-foreground sm:px-8">Nova lead: depois de criada, vê-se em Pessoas.</p>
          <NegociosSimples {...ctx} />
        </>
      )
      : <NegociosSimples {...ctx} />)
    : <Negocios {...ctx} />;
  let corpo: ReactNode;
  switch (S.view) {
    case "hoje": corpo = v2 ? <HojeV2 {...ctx} /> : simples ? <HojeSimples {...ctx} /> : <Hoje {...ctx} />; break;
    case "negocio": corpo = S.deal && S.deals.some((d) => d.id === S.deal) ? (simples ? <NegocioSimples {...ctx} /> : <PaginaNegocio {...ctx} />) : listaNegocios; break;
    case "leads": corpo = simples ? (func ? <PessoasFunc {...ctx} abrirEm="leads" alvoAvisos={setAlvoAvisos} /> : v2 ? <PessoasSimples {...ctx} abrirEm="leads" alvoAvisos={setAlvoAvisos} /> : <LeadsSimples {...ctx} />) : <Negocios {...ctx} />; break;
    case "pessoas": corpo = simples ? (func ? <PessoasFunc {...ctx} alvoAvisos={setAlvoAvisos} /> : v2 ? <PessoasSimples {...ctx} alvoAvisos={setAlvoAvisos} /> : <LeadsSimples {...ctx} />) : <Negocios {...ctx} />; break;
    case "operacoes": corpo = v2 ? <OperacoesV2 {...ctx} /> : simples ? <OperacoesSimples {...ctx} /> : <Operacoes {...ctx} />; break;
    case "inventario": corpo = simples ? <InventarioSimples {...ctx} /> : <Inventario {...ctx} />; break;
    case "catalogo": corpo = v2 ? <CatalogoV2 {...ctx} /> : simples ? <CatalogoSimples {...ctx} /> : <Catalogo {...ctx} />; break;
    case "clientes": corpo = simples ? (func ? <PessoasFunc {...ctx} abrirEm="clientes" alvoAvisos={setAlvoAvisos} /> : v2 ? <PessoasSimples {...ctx} abrirEm="clientes" alvoAvisos={setAlvoAvisos} /> : <ClientesSimples {...ctx} />) : <Clientes {...ctx} />; break;
    case "marketing": corpo = v2 ? <MarketingV2 {...ctx} /> : simples ? <MarketingSimples /> : <Marketing />; break;
    case "definicoes": corpo = v2 ? <DefinicoesV2 {...ctx} /> : simples ? <DefinicoesSimples {...ctx} /> : <Definicoes {...ctx} />; break;
    case "campos": corpo = <CamposEditor {...ctx} />; break;
    default: corpo = listaNegocios;
  }
  if (v1n && (S.view === "leads" || S.view === "clientes" || S.view === "pessoas")) corpo = <PessoasV1 key={navPessoas} {...ctx} />;
  if (S.view === "numeros") corpo = v1n ? <NumerosV1 {...ctx} /> : listaNegocios; // os Números só existem no V1 com Pessoas numa página

  const n = minhas(S, S.role).length;
  // Com a V2, Pessoas ocupa o lugar de Leads e Clientes.
  const pessoas: [Vista, string, LucideIcon][] = v2 || v1n ? [["pessoas", "Pessoas", Users]] : [["leads", "Leads", Users], ["clientes", "Clientes", Building]];
  const itens: [Vista, string, LucideIcon, number?][] = [
    ["hoje", "Hoje", Sun, n], ["negocios", "Negócios", ICONE_NEGOCIO], ...pessoas,
    ["operacoes", "Operações", Wrench], ["inventario", "Inventário", ShoppingCart], ["catalogo", "Catálogo e custos", Package], ["marketing", "Marketing", Megaphone],
    ...(v1n ? [["numeros", "Números", BarChart3] as [Vista, string, LucideIcon]] : []), // 16/10: no lugar dos dashboards, para a Direção
  ];
  const itensAtual = itens.filter(([v]) => v !== "leads"); // o aspeto atual não tem a página de Leads
  const porVista = (v: Vista) => itens.find(([x]) => x === v)!;
  // A vista que o menu destaca: com a V2, Leads e Clientes são Pessoas (e sem ela Pessoas é Leads). O aspeto atual não tem Leads
  // nem Pessoas (mostra Negócios), por isso destaca Negócios. Com a V2, criar uma lead (S.novo) destaca Pessoas.
  // 16/10: o Inventário e a Frota novos aparecem na Atual e na V2 (um grupo do menu cada, no lugar do item antigo "Inventário"); a V2 funcional fica com o seu
  const comInvFrota = (versao === "atual" || versao === "v2") && simples;
  const ativoInv = comInvFrota && (invMock || S.view === "inventario");
  const ativoFrota = comInvFrota && frotaMock && !ativoInv; // abrir a Frota fecha o Inventário e vice-versa
  const itensMenu = comInvFrota ? itens.filter(([v]) => v !== "inventario") : itens;
  const cur: Vista | "inv" | "frota" = ativoInv ? "inv" : ativoFrota ? "frota" : novaLeadV2 ? "pessoas"
    : S.view === "negocio" ? "negocios"
    : !simples && (S.view === "leads" || S.view === "pessoas") ? "negocios"
    : (v2 || v1n) && (S.view === "leads" || S.view === "clientes") ? "pessoas"
    : !v2 && !v1n && S.view === "pessoas" ? "leads" : S.view;
  // Na Atual e na V2 a vista antiga "Inventário" (o motor abre-a em "Abrir no Inventário") leva ao Inventário novo: à encomenda de cliente
  // do negócio (Saídas para clientes), se foi pedida, senão às Encomendas a fornecedor.
  useEffect(() => {
    if (S.view !== "inventario") return;
    if (!comInvFrota) { tirarPedidoEcInv(); tirarPedidoRececaoInv(); return; }
    setInvAba(lerPedidoEcInv() ? "ec" : lerPedidoRececaoInv() ? "guia" : "po"); setInvMock(true); setFrotaMock(false); run(() => A.nav("hoje"));
  }, [comInvFrota, S.view, run, A]);
  // 16/10: o Inventário novo vive em memória; ao recarregar (ou ao repor os dados dele) volta a emitir as encomendas dos negócios pagos que lá faltam
  // 19/10: e uma encomenda de cliente eliminada lá anula o negócio dela (perdido, com o motivo). O motor marca primeiro o negócio que ele próprio
  // anula (anularContrato), por isso aqui só chegam as eliminadas no Inventário; sem negócios com encomenda lá, nem se lê a base.
  const refA = useRef(A);
  refA.current = A;
  useEffect(() => {
    const sinc = (): void => {
      const deals = ref.current.deals;
      sincronizarEcsNegocios(deals);
      if (!deals.some((d) => !d.perdido && d.obra.ec?.ref)) return;
      const L = ecsEliminadasDeNegocios(deals, lerInventario());
      if (L.length) run(() => L.forEach((x) => refA.current.ecEliminadaNoInventario(x.id, x.motivo)));
    };
    sinc();
    return subscreverInv(sinc);
  }, [run]);
  // Outro módulo pediu para abrir a Frota (Definições › Agenda, a página da obra): abre-a (a viatura abre-se lá dentro).
  // "Abrir na Frota" só aparece noutros módulos quando esta moldura a consegue abrir (a mesma condição do menu); o pedido trata-se logo,
  // e a viatura passa à Frota como propriedade, para um pedido antigo nunca ser consumido mais tarde.
  const [frotaPedido, setFrotaPedido] = useState<{ vid: string; n: number } | null>(null);
  useEffect(() => { definirMolduraFrota(comInvFrota); }, [comInvFrota]);
  useEffect(() => () => definirMolduraFrota(false), []);
  const pedidoFrota = usePedidoFrota();
  useEffect(() => {
    if (!pedidoFrota) return;
    tratarPedidoFrota();
    if (!comInvFrota) return;
    setInvMock(false); setFrotaAba(pedidoFrota.aba ?? "viaturas"); setFrotaMock(true);
    setFrotaPedido(pedidoFrota.vid ? { vid: pedidoFrota.vid, n: pedidoFrota.n } : null);
  }, [comInvFrota, pedidoFrota]);
  const antigo = !(S.view === "hoje" || (S.view === "negocio" && S.deals.some((d) => d.id === S.deal)));
  // 20/10 (demo): abrir o portal do fornecedor (do menu, ou de uma PO com "Abrir como fornecedor →"); voltar repõe o Inventário se veio de lá
  const abrirPortalForn = (sup: string | null, po: string | null, voltar: "inv" | "crm"): void => {
    setMais(false); setInvMock(false); setFrotaMock(false);
    setFornMock((x) => ({ sup: sup || fornecedorInicial(lerInventario()), po, voltar, n: (x?.n ?? 0) + 1 }));
  };

  // o portal do cliente aberto pelo link de partilha
  if (portalTok) {
    const dp = S.deals.find((d) => TIPOS_DOC.some((t) => tokenDoc(d, t) === portalTok));
    const sair = () => { window.history.replaceState(null, "", window.location.pathname); setPortalTok(null); };
    return dp
      ? <PortalCliente ctx={ctx} d={dp} fechar={sair} />
      : (
        <div className="grid min-h-screen place-items-center bg-slate-100 p-6 text-center text-slate-800">
          <div>
            <p className="text-lg font-semibold">Este link já não abre nenhum documento.</p>
            <p className="mt-1 text-[15px] text-slate-600">Peça um link novo a quem lho enviou.</p>
            <button type="button" onClick={sair} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-4 text-[15px] font-semibold text-white">Ir para o protótipo</button>
          </div>
        </div>
      );
  }

  // o portal do fornecedor simulado: ecrã inteiro, como o portal do cliente (só na Atual e na V2, como o Inventário e a Frota)
  if (fornMock && comInvFrota) {
    const voltar = (): void => { const de = fornMock.voltar; setFornMock(null); if (de === "inv") setInvMock(true); };
    return (
      <Suspense fallback={<p className="p-6 text-[15px] text-muted-foreground" role="status">A abrir o portal do fornecedor…</p>}>
        <PortalFornecedor key={fornMock.sup + ":" + fornMock.n} sup={fornMock.sup} po={fornMock.po} aoVoltar={voltar}
          aoMudarFornecedor={(sup) => setFornMock((x) => (x ? { ...x, sup, po: null, n: x.n + 1 } : x))} />
      </Suspense>
    );
  }

  const icone = (v: Vista, l: string, Ic: LucideIcon, c?: number) => (
    <button key={v} type="button" onClick={go(() => A.nav(v))} aria-label={l} aria-current={cur === v ? "page" : undefined}
      className={cn("group relative flex w-full items-center justify-center rounded-xl p-3 transition-all duration-200",
        cur === v ? "bg-primary text-primary-foreground shadow-md" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground")}>
      <Ic className="h-5 w-5" />
      {c ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{c}</span> : null}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">{l}</span>
    </button>
  );

  const toastsBase = (
    <div className="toasts" aria-live="polite">
      {/* no máximo dois avisos à vista (os mais recentes): uma ação em cadeia (ex.: assinar o contrato) dá vários e tapavam o ecrã no telemóvel */}
      {toasts.slice(-2).map((t) => (
        <div key={t.id} className={"toast " + (t.kind || "")} role="status">
          <i>{t.kind === "ok" ? "✓" : t.kind === "auto" ? "⚡" : t.kind === "bad" ? "!" : "i"}</i>
          <div>{t.msg}{t.sub ? <small>{t.sub}</small> : null}</div>
          {t.act ? <button onClick={() => { t.act!.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.act.label}</button> : <span />}
        </div>
      ))}
    </div>
  );
  const toastsEl = alvoAvisos ? createPortal(toastsBase, alvoAvisos) : toastsBase;
  // 15/10: a revisão do contrato pelo Jurídico abre por cima da app (RevisaoContrato.tsx)
  const dRev = S.revisao != null ? S.deals.find((x) => x.id === S.revisao) : undefined;
  const revisaoEl = dRev ? <RevisaoContrato ctx={ctx} d={dRev} /> : null;

  if (simples) {
    const item = (v: Vista, l: string, Ic: LucideIcon, c?: number) => (
      <button key={v} type="button" onClick={go(() => { setInvMock(false); setFrotaMock(false); if (v1n && v === "pessoas") { irParaLista(); setNavPessoas((x) => x + 1); } A.nav(v); })} aria-current={cur === v ? "page" : undefined}
        className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors",
          cur === v ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
        <Ic className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span className="flex-1">{l}</span>
        {c ? <span className="text-sm tabular-nums text-muted-foreground" aria-label={c + " por fazer"}>{c}</span> : null}
      </button>
    );
    const abrirInv = (a: AbaInv): void => { setMais(false); setFrotaMock(false); setInvAba(a); setInvMock(true); };
    const menuInv = (aberto: boolean) => (comInvFrota ? <Suspense fallback={null}><MenuInventario aba={ativoInv ? invAba : null} aoIr={abrirInv} iniciarAberto={aberto} /></Suspense> : null);
    const abrirFrota = (a: AbaFrota): void => { setMais(false); setInvMock(false); setFrotaAba(a); setFrotaMock(true); };
    const menuFrota = (aberto: boolean) => (comInvFrota ? <Suspense fallback={null}><MenuFrota aba={ativoFrota ? frotaAba : null} aoIr={abrirFrota} iniciarAberto={aberto} /></Suspense> : null);
    // 20/10 (demo): o Portal do Fornecedor simulado, ao lado do Inventário e da Frota
    const menuForn = comInvFrota ? (
      <button type="button" onClick={() => abrirPortalForn(null, null, "crm")}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
        <Truck className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className="flex-1">Portal do Fornecedor</span>
      </button>
    ) : null;
    // As ligações da Frota para fora: a obra (Operações), a Agenda (Definições › Agenda › Recursos) e as carrinhas no Inventário (Armazéns).
    const irObra = (id: number): void => { setFrotaMock(false); run(() => A.abrirPlano(id)); };
    const irAgenda = (): void => {
      setFrotaMock(false); run(() => A.nav("definicoes"));
      setTimeout(() => document.getElementById("agenda-recursos")?.scrollIntoView({ block: "start" }), 80);
    };
    const irInventario = (): void => { setFrotaMock(false); setInvAba("wh"); setInvMock(true); };
    const papel = (
      <label className="grid gap-1.5 text-sm text-muted-foreground">
        A ver como
        <select value={S.role} onChange={(e) => run(() => A.role(e.target.value as Papel))}
          className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          {(Object.keys(PAPEIS) as Papel[]).map((k) => <option key={k} value={k}>{PAPEIS[k].n}</option>)}
        </select>
      </label>
    );
    const listaNova = true; // na proposta simples todos os ecrãs são novos
    const seletorVersao = (
      <>
        <SeletorVersao versao={versao} mudar={mudarVersao} />
        {versao === "atual" && (
          <button type="button" role="switch" aria-checked={propostaV1} onClick={() => mudarPropostaV1(!propostaV1)}
            className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px] text-foreground">
            <span>Pessoas numa página<span className="block text-sm text-muted-foreground">desligue para ver o V1 de antes, com Leads e Clientes</span></span>
            <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", propostaV1 ? "bg-primary" : "bg-input")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", propostaV1 ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>
        )}
      </>
    );
    return (
      <div className={cn("pn calma fixed inset-0 flex bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-foreground", S.leitura && "leitura")}>
        <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-3 py-5 md:flex">
          <div className="flex items-center gap-2.5 px-3 pb-6">
            <img src={mascote} alt="" className="h-8 w-8 object-contain" />
            <span className="text-lg font-semibold tracking-tight">Olyvia</span>
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Menu">
            {itensMenu.map(([v, l, Ic, c]) => <Fragment key={v}>{item(v, l, Ic, c)}{v === "operacoes" ? <>{menuInv(false)}{menuFrota(false)}{menuForn}</> : null}</Fragment>)}
          </nav>
          <div className="mt-auto flex flex-col gap-4 px-0 pt-6">
            {item("definicoes", "Definições", Settings)}
            <div className="px-3">{papel}</div>
            {ativoInv && <div className="px-3"><PerfilSimulado /></div>}
            {ativoFrota && <div className="px-3"><PerfilFrotaSimulado /></div>}
            <button type="button" role="switch" aria-checked={!!S.leitura} onClick={go(() => A.leitura(!S.leitura))}
              className="mx-3 flex min-h-11 items-center justify-between gap-3 rounded-lg text-left text-[15px] text-foreground">
              <span>Leitura fácil<span className="block text-sm text-muted-foreground">letra maior, mais espaço</span></span>
              <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", S.leitura ? "bg-primary" : "bg-input")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", S.leitura ? "left-[22px]" : "left-0.5")} />
              </span>
            </button>
            <div className="px-3">{seletorVersao}</div>
            <div className="space-y-1 px-3 text-sm text-muted-foreground">
              <p>Protótipo com dados de exemplo.</p>
              <button type="button" onClick={go(() => A.aspeto("atual"))} className="text-left font-medium text-primary underline-offset-4 hover:underline">Comparar com o aspeto atual</button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {(ativoInv || ativoFrota) && <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6"><div ref={setAlvoTopo} className="flex min-w-0 flex-1" /></header>}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
            <img src={mascote} alt="" className="h-7 w-7 object-contain" />
            <span className="flex-1 text-base font-semibold">Olyvia</span>
            <select value={S.role} aria-label="A ver como" onChange={(e) => run(() => A.role(e.target.value as Papel))}
              className="h-10 max-w-[170px] rounded-lg border border-input bg-card px-2 text-[15px]">
              {(Object.keys(PAPEIS) as Papel[]).map((k) => <option key={k} value={k}>{PAPEIS[k].n}</option>)}
            </select>
          </header>
          {/* layoutScroll: as animações de layout (cartões ao filtrar) contam com o scroll deste contentor */}
          <motion.main ref={mainRef} layoutScroll className="min-h-0 flex-1 overflow-auto pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">
            {ativoInv ? (
              <div className="h-full animate-in fade-in-0 duration-200">
                <Suspense fallback={<p className="p-6 text-[15px] text-muted-foreground" role="status">A abrir o inventário…</p>}><InventarioPagina leitura={!!S.leitura} aba={invAba} aoMudarAba={setInvAba} alvoTopo={alvoTopo} aoAbrirPortalForn={(sup, po) => abrirPortalForn(sup, po ?? null, "inv")} /></Suspense>
              </div>
            ) : ativoFrota ? (
              <div className="h-full animate-in fade-in-0 duration-200">
                <Suspense fallback={<p className="p-6 text-[15px] text-muted-foreground" role="status">A abrir a frota…</p>}>
                  <FrotaPagina leitura={!!S.leitura} aba={frotaAba} aoMudarAba={setFrotaAba} alvoTopo={alvoTopo} obras={obrasDoEstado(S)} irObra={irObra} irAgenda={irAgenda} irInventario={irInventario} pedido={frotaPedido} pedidoAberto={() => setFrotaPedido(null)} />
                </Suspense>
              </div>
            ) : <div key={S.view + ":" + (S.deal || "")} className="animate-in fade-in-0 duration-200">

              {antigo && !listaNova ? <div className="pg page mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-8">{corpo}</div> : corpo}
            </div>}
          </motion.main>
          {mais && (
            <div className="fixed inset-0 z-40 bg-foreground/20 md:hidden animate-in fade-in-0" onClick={() => setMais(false)}>
              <div role="dialog" aria-label="Mais" className="absolute inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-6 shadow-lg animate-in slide-in-from-bottom-4"
                onClick={(e) => e.stopPropagation()}>
                <nav className="grid gap-0.5" aria-label="Mais" onClick={() => setMais(false)}>
                  {[...(v1n ? ["inventario"] : pessoas.map(([v]) => v)), "catalogo", "marketing", ...(v1n ? ["numeros"] : [])].map((v) => porVista(v as Vista)).map(([v, l, Ic, c]) => item(v, l, Ic, c))}
                  {item("definicoes", "Definições", Settings)}
                </nav>
                {comInvFrota && <div className="mt-2 border-t border-border pt-2">{menuInv(true)}{ativoInv && <div className="px-3 pt-3"><PerfilSimulado /></div>}</div>}
                {comInvFrota && <div className="mt-2 border-t border-border pt-2">{menuFrota(true)}{ativoFrota && <div className="px-3 pt-3"><PerfilFrotaSimulado /></div>}</div>}
                {comInvFrota && <div className="mt-2 border-t border-border pt-2">{menuForn}</div>}
                <div className="mt-3 border-t border-border px-3 pt-3">{seletorVersao}</div>
                <button type="button" role="switch" aria-checked={!!S.leitura} onClick={go(() => A.leitura(!S.leitura))}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-[15px]">
                  Leitura fácil
                  <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", S.leitura ? "bg-primary" : "bg-input")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", S.leitura ? "left-[22px]" : "left-0.5")} />
                  </span>
                </button>
              </div>
            </div>
          )}
          <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(4rem_+_env(safe-area-inset-bottom))] items-stretch justify-around border-t border-border bg-card px-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Menu">
            {((comInvFrota ? (v1n ? ["hoje", "negocios", "pessoas", "operacoes"] : ["hoje", "negocios", "operacoes"]) : v1n ? ["hoje", "negocios", "pessoas", "operacoes"] : ["hoje", "negocios", "operacoes", "inventario"]) as Vista[]).map((v) => porVista(v)).map(([v, l, Ic, c]) => (
              <button key={v} type="button" onClick={go(() => { setMais(false); setInvMock(false); setFrotaMock(false); if (v1n && v === "pessoas") { irParaLista(); setNavPessoas((x) => x + 1); } A.nav(v); })} aria-current={cur === v ? "page" : undefined}
                className={cn("relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px]", cur === v ? "font-semibold text-primary" : "text-muted-foreground")}>
                <Ic className="h-5 w-5" aria-hidden="true" />{l}
                {c ? <span className="absolute right-[calc(50%-20px)] top-2 h-2 w-2 rounded-full bg-primary" aria-label={c + " por fazer"} /> : null}
              </button>
            ))}
            {comInvFrota && (
              <button type="button" onClick={() => setMais(true)} aria-haspopup="dialog" aria-current={cur === "inv" ? "page" : undefined}
                className={cn("relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px]", cur === "inv" ? "font-semibold text-primary" : "text-muted-foreground")}>
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />Inventário
              </button>
            )}
            <button type="button" onClick={() => setMais(!mais)} aria-expanded={mais}
              className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px]", mais || [...(v1n ? ["inventario", "numeros"] : ["leads", "clientes", "pessoas"]), "catalogo", "marketing", "definicoes", "frota"].includes(cur) ? "font-semibold text-primary" : "text-muted-foreground")}>
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />Mais
            </button>
          </nav>
        </div>
        {revisaoEl}
        {toastsEl}
      </div>
    );
  }

  return (
    <div className="pn fixed inset-0 bg-background text-foreground">
      {/* Barra de ícones, como a da Olyvia */}
      <aside className="fixed left-0 top-0 z-[60] hidden h-screen w-16 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg md:flex">
        <div className="flex shrink-0 items-center justify-center border-b border-sidebar-border px-2 py-2">
          <img src={mascote} alt="Olyvia" className="h-10 w-10 object-contain" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Menu">{itensAtual.map(([v, l, Ic, c]) => icone(v, l, Ic, c))}</nav>
        <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
          <button type="button" onClick={go(() => A.aspeto("simples"))} aria-label="Ver a proposta simples"
            className="group relative flex w-full items-center justify-center rounded-xl p-3 text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <Sparkles className="h-5 w-5" />
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Ver a proposta simples</span>
          </button>
          {icone("definicoes", "Definições", Settings)}
          <a href="/prototipo/maquetas.html" target="_blank" rel="noreferrer" aria-label="Maquetas das 12 screens"
            className="group relative flex items-center justify-center rounded-xl p-3 text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LayoutTemplate className="h-5 w-5" />
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Maquetas das 12 screens</span>
          </a>
        </div>
      </aside>

      {/* Cabeçalho escuro, como o da Olyvia */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:px-4 md:left-16">
        <div className="flex min-w-0 items-center gap-2">
          <img src={mascote} alt="" className="h-8 w-8 object-contain md:hidden" />
          <span className="hidden items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-1.5 text-sm font-medium sm:inline-flex"><Building2 className="h-4 w-4" />Mudelar<ChevronDown className="h-3.5 w-3.5 opacity-60" /></span>
          <span className="hidden rounded-full bg-accent/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground lg:inline">Protótipo · dados de exemplo</span>
        </div>
        <div className="relative max-w-xl flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/70" />
          <input type="search" placeholder="Procurar negócio, cliente ou telefone" aria-label="Procurar" value={q}
            onChange={(e) => { setQ(e.target.value); if (S.view !== "negocios") run(() => { S.view = "negocios"; S.deal = null; }); }}
            className="h-9 w-full rounded-md border-none bg-sidebar-accent pl-10 pr-3 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50 focus-visible:ring-1 focus-visible:ring-sidebar-ring" />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pn-role" className="hidden text-xs text-sidebar-foreground/70 lg:inline">A ver como</label>
          <select id="pn-role" value={S.role} onChange={(e) => run(() => A.role(e.target.value as Papel))}
            className="h-9 max-w-[150px] rounded-md border-none bg-sidebar-accent px-2 text-sm text-sidebar-foreground outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring sm:max-w-none">
            {(Object.keys(PAPEIS) as Papel[]).map((k) => <option key={k} value={k} className="text-foreground">{PAPEIS[k].n}</option>)}
          </select>
          <button type="button" onClick={go(() => A.nav("hoje"))} aria-label="Alertas" className="relative hidden rounded-md p-2 transition hover:bg-sidebar-accent sm:block">
            <Bell className="h-5 w-5" />
            {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{n}</span>}
          </button>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-bold text-white">{PAPEIS[S.role].av}</span>
        </div>
      </header>

      <main ref={mainRef} className="fixed bottom-14 left-0 right-0 top-14 overflow-auto bg-background md:bottom-0 md:left-16">
        <div key={S.view + ":" + (S.deal || "")} className="animate-in fade-in-0 duration-300">
          {antigo ? <div className="pg page mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6">{corpo}</div> : corpo}
        </div>
      </main>

      {/* No telemóvel, os ícones vão para baixo */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-sidebar-border bg-sidebar px-1 md:hidden" aria-label="Menu">
        {itensAtual.slice(0, 5).map(([v, l, Ic, c]) => (
          <button key={v} type="button" onClick={go(() => A.nav(v))} aria-label={l}
            className={cn("relative grid place-items-center rounded-xl p-2.5 transition", cur === v ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/80")}>
            <Ic className="h-5 w-5" />
            {c ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{c}</span> : null}
          </button>
        ))}
      </nav>

      {revisaoEl}
      {toastsEl}
    </div>
  );
}

/* ------------------------------------------------------------------ Negócios */
function Negocios({ S, A, go, run, q }: Ctx) {
  const f = S.filtro;
  const ql = q.toLowerCase();
  let ds = aberto(S).filter((d) => !ql || (d.nome + " " + d.tel + " " + d.servico + " " + d.local).toLowerCase().includes(ql));
  if (f === "meus") ds = ds.filter((d) => d.dono === "comercial");
  if (f === "wc") ds = ds.filter((d) => d.linha === "wc");
  if (f === "coz") ds = ds.filter((d) => d.linha === "coz");
  if (f === "atraso") ds = ds.filter((d) => d.atraso);
  const totalProp = aberto(S).filter((d) => d.fase === 3 && d.orc).reduce((a, d) => a + tot(d, S).pf, 0);
  const chip = (k: string, l: string) => <button key={k} className={"chip " + (f === k ? "on" : "")} onClick={go(() => A.filtro(k))}>{l}</button>;
  return (
    <>
      <div className="row">
        <div><h1 className="h1">Negócios</h1><div className="sub">{aberto(S).length} abertos · {eur(totalProp)} € s/ IVA em fase Negócio</div></div>
        <Btn onClick={go(() => A.novo())}>+ Novo negócio</Btn>
      </div>
      <div className="chips">{chip("meus", "Os meus")}{chip("todos", "Todos")}{chip("wc", "Casa de banho")}{chip("coz", "Cozinha")}{chip("atraso", "Com atraso")}</div>
      <Banner A={A} go={go} texto={'e siga o botão do próximo passo, da lead à obra. Alguns passos são de outros papéis: mude em "A ver como", no canto de cima.'} />
      <div className="kb">
        {FASES.map((fn, i) => {
          const cards = ds.filter((d) => d.fase === i);
          const nv = i === 0 && S.novo ? <NovoCartao key="novo" S={S} A={A} run={run} /> : null;
          return (
            <div className="col" key={fn}>
              <h4>{fn} <span>{cards.length}</span></h4>
              {nv}
              {cards.map((d) => {
                const p = proximo(d, S);
                const val = d.orc ? ` · ${eur(tot(d, S).pf)} € s/ IVA` : "";
                const vd = d.orc && d.orc.vendaDireta ? " · venda direta" : "";
                const cls = d.atraso && d.fase === 0 ? "late" : p.wait ? "wait" : "";
                return (
                  <button key={d.id} className={"kc " + (d.fresh ? "flash" : "")} onClick={go(() => A.abrir(d.id))}>
                    <b>{d.nome}</b>
                    <small>{d.servico}{d.local ? " · " + d.local.split(",").pop()!.trim() : ""}{val}{vd}</small>
                    <span className={"nx " + cls}>{p.t}{d.atraso && d.fase === 0 ? " · há 2 dias" : ""}</span>
                  </button>
                );
              })}
              {!cards.length && !nv && <span className="empty">Sem negócios</span>}
            </div>
          );
        })}
      </div>
      <p className="sub">Os cartões não se arrastam: a fase muda quando acontece o facto (chamada registada, visita marcada, contrato assinado, pagamento validado).</p>
    </>
  );
}

function NovoCartao({ S, A, run }: Pick<Ctx, "S" | "A" | "run">) {
  const [nome, setNome] = useState(S.novo!.nome);
  const [tel, setTel] = useState(S.novo!.tel);
  const [linha, setLinha] = useState<LinhaId>(S.novo!.linha);
  const criar = () => run(() => A.novoCriar(nome, tel, linha));
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") criar();
    if (e.key === "Escape") run(() => A.novoCancel());
  };
  return (
    <div className="newc">
      <div className="f"><label htmlFor="nv-nome">Nome</label><input id="nv-nome" autoFocus autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={teclas} /></div>
      <div className="f"><label htmlFor="nv-tel">Telefone ou email</label><input id="nv-tel" autoComplete="off" value={tel} onChange={(e) => setTel(e.target.value)} onKeyDown={teclas} /></div>
      <div className="f">
        <label htmlFor="nv-linha">Linha de serviço</label>
        <select id="nv-linha" value={linha} onChange={(e) => setLinha(e.target.value as LinhaId)}><option value="wc">Casa de banho</option><option value="coz">Cozinha</option></select>
      </div>
      {S.novo!.err && <span className="err">{S.novo!.err}</span>}
      <div className="row"><Btn cls="sec sm" onClick={() => run(() => A.novoCancel())}>Cancelar</Btn><Btn cls="sm" onClick={criar}>Criar</Btn></div>
    </div>
  );
}

/* ------------------------------------------------------------------ Operações */
function Operacoes({ S, A, go }: Ctx) {
  // os materiais vivem no Inventário: redesenha quando lá muda alguma coisa
  const db = useInventario();
  // como em ListaObras (ObraOperacoes.tsx): a obra aparece com o contrato assinado, com o plano por aprovar
  const obras = aberto(S).filter((x) => x.obra.plano && x.fase >= 4);
  const d = S.op ? S.deals.find((x) => x.id === S.op) : null;
  if (d && d.obra.plano) {
    const p = d.obra.plano, C = conflitos(p), nd = Math.max(5, ...p.tasks.map((t) => t.dia + t.dur));
    const F = faltaParaArrancar(d, db).filter((x) => !/plano/.test(x)), matsOk = !F.length;
    let acao: ReactNode = null;
    if (p.estado === "por aprovar") acao = <Btn cls={C.length ? "sec" : ""} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar plano</Btn>;
    else if (p.estado === "aprovado") acao = <Btn cls={matsOk ? "" : "sec"} onClick={go(() => A.arrancar(d.id))}>Arrancar obra</Btn>;
    else if (p.estado === "em curso") acao = <Btn onClick={go(() => A.fimObra(d.id))}>Registar fim da obra (simular)</Btn>;
    const pode = S.role === "operacoes";
    const equipa = [...new Set(p.tasks.map((t) => t.tec))];
    return (
      <>
        <button className="back" onClick={go(() => A.nav("operacoes"))}>← Operações</button>
        <div className="row">
          <div>
            <h1 className="h1">Plano · {d.servico} · {d.nome}</h1>
            <div className="sub">Gerado do contrato · {p.tasks.length} fases · {nfmt(p.tasks.reduce((a, t) => a + t.h, 0))} h de equipa · tarefas das receitas do Catálogo</div>
          </div>
          <div className="row">
            {C.length > 0 && <span className="pill warn">{C.length} conflito</span>}
            <span className={"pill " + (p.estado === "concluída" ? "ok" : "pri")}>{p.estado}</span>
            {pode ? acao : acao ? <button className="link" onClick={go(() => A.role("operacoes"))}>Mudar para Operações</button> : null}
          </div>
        </div>
        <div className="gw">
          <div className="gantt" style={{ gridTemplateColumns: `170px repeat(${nd},minmax(74px,1fr))`, minWidth: 170 + nd * 74 }}>
            <div className="h">Fase</div>
            {Array.from({ length: nd }, (_, k) => <div className="h" key={k}>{DIAS[k]}</div>)}
            {p.tasks.map((t) => {
              const tec = TECS.find((x) => x.id === t.tec);
              const c = C.find((x) => x.t === t);
              const cells: ReactNode[] = [];
              for (let k = 0; k < nd; k++) {
                if (k === t.dia) {
                  const done = p.estado === "concluída" || (p.estado === "em curso" && k < p.dia);
                  cells.push(<div className="gb" key={k} style={{ gridColumn: `span ${t.dur}` }}><i className={c ? "warn" : done ? "done" : ""}>{tec ? tec.n.split(" ")[0] : "?"}{c ? " · de férias " + DIAS[c.dia].split(" ")[1] : ""}</i></div>);
                  k += t.dur - 1;
                } else cells.push(<div key={k} />);
              }
              return <Fragment key={t.nome}><div className="t">{t.nome}<small>{nfmt(t.h)} h · {t.sk.toLowerCase()}</small></div>{cells}</Fragment>;
            })}
          </div>
        </div>
        <div className="g2">
          <div className="card">
            <h3>Equipa proposta <span>do RH: competências e disponibilidade</span></h3>
            {equipa.map((id) => {
              const t = TECS.find((x) => x.id === id)!;
              const c = C.find((x) => x.tec.id === id);
              return (
                <div className="item" key={id}>
                  <div><b>{t.n}</b><small>{t.sk}{t.ferias.length ? " · férias " + t.ferias.map((k) => DIAS[k].split(" ")[1]).join(", ") : ""}</small></div>
                  {c ? <span className="pill warn">Conflito</span> : <span className="pill ok">Disponível</span>}
                </div>
              );
            })}
          </div>
          <div className="card">
            <h3>{C.length ? "Resolver o conflito" : "Materiais"}</h3>
            {C.map((c) => {
              const ti = p.tasks.indexOf(c.t);
              const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && !x.ferias.some((k) => k >= c.t.dia && k < c.t.dia + c.t.dur));
              return (
                <div className="al" key={ti}>
                  {alt && (
                    <div className="w"><i>!</i><span><b>Trocar por {alt.n}</b><small>{alt.sk} · livre nesses dias · mesmo custo/hora</small></span>
                      <span className="acts"><Btn cls="sm" onClick={go(() => A.trocar(d.id, ti))}>Trocar</Btn></span></div>
                  )}
                  <div><i>→</i><span><b>Ou adiar {c.t.nome.toLowerCase()}</b><small>{c.tec.n.split(" ")[0]} volta depois das férias · a obra acaba mais tarde</small></span>
                    <span className="acts"><Btn cls="sec sm" onClick={go(() => A.adiar(d.id, ti))}>Adiar</Btn></span></div>
                </div>
              );
            })}
            <span className="sub">Materiais: {matsOk ? "prontos no armazém" : "falta " + F.join(", ")}</span>
            {!matsOk && p.estado === "aprovado" && <span className="err">A obra só arranca com os materiais garantidos.</span>}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div><h1 className="h1">Operações</h1><div className="sub">As obras chegam aqui com o contrato assinado (ou a venda direta aceite), com o plano do orçamento por aprovar depois do pagamento.</div></div>
      <div className="tw"><table>
        <thead><tr><th>Obra</th><th>Plano</th><th>Conflitos</th><th className="n">Horas previstas</th></tr></thead>
        <tbody>
          {obras.length ? obras.map((o) => {
            const p = o.obra.plano!;
            return (
              <tr key={o.id}>
                <td><button className="link" onClick={go(() => A.abrirPlano(o.id))}>{o.nome}</button><small>{o.servico} · {o.local}</small></td>
                <td><span className={"pill " + (p.estado === "concluída" ? "ok" : p.estado === "por aprovar" ? "warn" : "pri")}>{p.estado}</span></td>
                <td>{conflitos(p).length ? <span className="pill warn">1 conflito</span> : "—"}</td>
                <td className="n">{nfmt(p.tasks.reduce((a, t) => a + t.h, 0))} h</td>
              </tr>
            );
          }) : <tr><td colSpan={4} className="empty">Sem obras. Aparecem quando o cliente assina o contrato.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

/* ------------------------------------------------------------------ Inventário */
const NOMES_STOCK: Record<string, string> = {
  cp: "Cerâmico de parede 30×60 (m²)", pv: "Pavimento cerâmico 60×60 (m²)", san: "Sanita suspensa com estrutura", base: "Base de duche 80×120",
  cim: "Cimento-cola · saco 25 kg", mov: "Conjunto de móveis de cozinha", banc: "Bancada em pedra",
};
function Inventario({ S, A, go }: Ctx) {
  const obras = aberto(S).filter((d) => d.fase === 5 && d.obra.mats);
  return (
    <>
      <div><h1 className="h1">Inventário · materiais por obra</h1><div className="sub">A lista vem do orçamento de cada obra. Aparece aqui quando o Financeiro valida o pagamento (a encomenda de cliente vai para o Inventário).</div></div>
      {obras.length ? obras.map((d) => {
        return (
          <div className="card" key={d.id}>
            <h3>{d.nome} · {d.servico} <span>{d.obra.ec ? d.obra.ec.n : "sem encomenda"}</span></h3>
            <div className="tw"><table style={{ minWidth: 520 }}>
              <thead><tr><th>Material</th><th className="n">Precisa</th><th className="n">Reservado</th><th>Estado</th></tr></thead>
              <tbody>
                {d.obra.mats!.map((x) => (
                  <tr key={x.n} className={x.falta > 0 ? "hl" : ""}>
                    <td>{x.n}</td><td className="n">{nfmt(x.q)} {x.un}</td><td className="n">{nfmt(x.res)} {x.un}</td>
                    <td>{x.falta > 0 ? <span className="pill bad">Faltam {nfmt(x.falta)} {x.un}</span> : <span className="pill ok">Reservado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {/* as encomendas a fornecedor do que falta aprovam-se e recebem-se no Inventário (já não há encomenda no motor) */}
            {d.obra.ec?.ref && <Btn cls="sec sm" onClick={go(() => A.abrirInv(d.id))}>Abrir no Inventário</Btn>}
          </div>
        );
      }) : <p className="empty">Ainda não há obras com materiais. Valide um pagamento no Financeiro.</p>}
      <div className="card">
        <h3>Stock livre <span>exemplo</span></h3>
        <div className="kv">{Object.entries(S.stock).map(([k, v]) => <Fragment key={k}><span>{NOMES_STOCK[k]}</span><b>{nfmt(Math.max(0, v))}</b></Fragment>)}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Catálogo */
function Catalogo({ S, run }: Ctx) {
  return (
    <>
      <div className="row">
        <div><h1 className="h1">Catálogo e custos · serviços</h1><div className="sub">A receita de cada serviço por unidade de medida. É daqui que o orçamento tira o custo.</div></div>
        <span className="lock">salários: só a Direção vê</span>
      </div>
      <div className="banner"><b>Experimente:</b> mude as horas ou o custo/hora de um serviço. Os orçamentos ainda não enviados mostram "Catálogo mudou"; os enviados guardam a cópia do cálculo.</div>
      <div className="tw"><table style={{ minWidth: 900 }}>
        <thead><tr>
          <th>Serviço</th><th>Medida</th><th className="n">Horas/un.</th><th className="n">€/h técnico</th><th className="n">Equip. €/un.</th><th className="n">Consum. €/un.</th>
          {S.cfg.estrutura && <th className="n">Estrutura €/un.</th>}<th className="n">Custo/un.</th><th className="n">Preço/un.</th><th className="n">Margem</th>
        </tr></thead>
        <tbody>
          {(Object.entries(S.svc) as [SvcId, (typeof S.svc)[SvcId]][]).map(([k, s]) => {
            const c = custoUn(s, S), m = (s.preco - c) / s.preco;
            const cls = m < S.cfg.min / 100 ? "bad" : m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
            const inp = (f: "h" | "eh" | "cons" | "preco") => (
              <Campo id={`svc-${k}-${f}`} ariaLabel={f} value={nfmt(s[f])} onCommit={(v) => run(() => {
                const n = numero(v);
                if (isNaN(n) || n < 0) return;
                s[f] = n;
                if (f === "eh") s.semCusto = false;
                if (f === "cons") s.stale = null;
              })} />
            );
            return (
              <tr key={k} className={cls === "bad" ? "hl" : ""}>
                <td>{s.n}<small>{s.perfil}{s.semCusto && <> · <span style={{ color: "var(--warn)" }}>técnico sem custo/hora, usa o médio</span></>}{s.stale && <> · <span style={{ color: "var(--warn)" }}>preço de consumível antigo</span></>}</small></td>
                <td>{s.un}</td>
                <td className="n">{inp("h")}</td><td className="n">{inp("eh")}</td><td className="n">{eur(s.eq)}</td><td className="n">{inp("cons")}</td>
                {S.cfg.estrutura && <td className="n">{eur(s.h * ESTR)}</td>}
                <td className="n"><b>{eur(c)}</b></td><td className="n">{inp("preco")}</td><td className="n"><span className={"pill " + cls}>{pct(m)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <p className="sub">Custo por unidade = horas × €/h do técnico + equipamento + consumíveis{S.cfg.estrutura ? " + horas × " + eur(ESTR) + " €/h de estrutura" : ""}. Todos os valores são de exemplo.</p>
    </>
  );
}

/* ------------------------------------------------------------------ Clientes, Marketing, Definições */
function Clientes({ S, A, go }: Ctx) {
  return (
    <>
      <div><h1 className="h1">Clientes</h1><div className="sub">O cliente é criado sozinho quando o contrato é assinado ou a venda direta é aceite.</div></div>
      <div className="tw"><table>
        <thead><tr><th>Cliente</th><th>Telefone</th><th>Desde</th><th>Negócio</th></tr></thead>
        <tbody>{S.clientes.map((c) => (
          <tr key={c.deal}><td>{c.nome}<small>{c.local}</small></td><td>{c.tel}</td><td>{c.desde}</td><td><button className="link" onClick={go(() => A.abrir(c.deal))}>#{c.deal}</button></td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function Marketing() {
  const C: [string, string, number, number][] = [["Campanha de outono", 'Meta Ads · formulário "Cozinha nova"', 14, 3], ["Site · pedido de orçamento", "Formulário do site", 31, 9], ["Recomendações", "À mão", 6, 2]];
  return (
    <>
      <div><h1 className="h1">Marketing · campanhas</h1><div className="sub">A origem e o formulário vivem dentro de cada campanha. Fora do âmbito deste protótipo.</div></div>
      <div className="tw"><table>
        <thead><tr><th>Campanha</th><th className="n">Leads</th><th className="n">Ganhos</th></tr></thead>
        <tbody>{C.map((c) => <tr key={c[0]}><td>{c[0]}<small>{c[1]}</small></td><td className="n">{c[2]}</td><td className="n">{c[3]}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}

function Definicoes({ S, run, repor }: Ctx) {
  const n = (k: "min" | "alvo") => (
    <Campo id={`cfg-${k}`} type="number" value={S.cfg[k]} onCommit={(v) => run(() => { const x = numero(v); if (!isNaN(x)) S.cfg[k] = x; })} />
  );
  return (
    <>
      <div><h1 className="h1">Definições</h1><div className="sub">Neste protótipo só estão as regras que mexem no orçamento.</div></div>
      <div className="g2">
        <div className="card">
          <h3>Margens <span>por empresa e linha de serviço</span></h3>
          <div className="form">
            <div className="f"><label htmlFor="cfg-min">Margem mínima (%)</label>{n("min")}</div>
            <div className="f"><label htmlFor="cfg-alvo">Margem-alvo (%)</label>{n("alvo")}</div>
          </div>
          <span className="sub">Abaixo do mínimo, a proposta só sai com aprovação da Direção. O preço sugerido repõe a margem-alvo.</span>
        </div>
        <div className="card">
          <h3>Estrutura no custo <span>decisão em aberto</span></h3>
          <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
            <input type="checkbox" id="cfg-estr" checked={S.cfg.estrutura} onChange={(e) => { const v = e.target.checked; run(() => { S.cfg.estrutura = v; }); }} />
            Somar {eur(ESTR)} €/h de estrutura ao custo de cada serviço
          </label>
          <span className="sub">Pelo método BMG, a estrutura fica dentro da margem. Somá-la ao custo sem baixar a margem cobra-a duas vezes. Ligue e desligue para ver o efeito nos orçamentos.</span>
        </div>
      </div>
      <div className="card">
        <h3>Demonstração</h3>
        <span className="sub">Os passos que der ficam guardados neste browser. Para recomeçar do zero:</span>
        <div><Btn cls="sec" onClick={repor}>Repor a demonstração</Btn></div>
      </div>
    </>
  );
}
