// Negócios (Emylia, Fase 2.3 e 2.4 da migração): o quadro, a lista e a ficha do negócio da Emylia, desde a lead, ligados à base da
// organização ativa. Ao abrir lê o Catálogo (carregarCatalogo) e os negócios (neg_ler_negocios) e monta-os como a Emylia os usa. Cada ação
// do ecrã corre no motor da Emylia (acoes); depois, o que mudou grava-se negócio a negócio (sincronizarNegocios.ts). Um negócio novo nasce
// pela "Nova lead" do CRM. O Pipeline da equipa do RH continua em /pipeline.
// O papel ("A ver como") escolhe-se no topo até os papéis da Emylia estarem ligados aos utilizadores do CRM.
// 28/10 (Fase 3): o Hoje de cada papel (o do técnico é o HojeTecnico) e as Obras (OperacoesSimples: a lista e a página da obra) abrem
// aqui, com o mesmo Estado: o que se faz na obra grava-se pela obra_guardar_negocio, como o resto. O Inventário ainda não.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { acertarDiaDasObras, acoes, definirPerdaReal, definirRelogioReal, herdarFaturacao, marcarAutor, PAPEIS, seed, type Aviso, type Estado, type Negocio, type Papel, type Vista } from "@/emylia/motor";
import { anularPerdaReal, mensagemDaPerda, perderNegocioReal } from "@/emylia/real/perdaReal";
import { NegociosSimples } from "@/emylia/NegociosSimples";
import { NegocioSimples } from "@/emylia/NegocioSimples";
import { comTemplatesNosPassos } from "@/components/pessoas/negocioEmylia/templatesDosPassos";
import { PermPortalNegocios } from "@/emylia/PermPortalNegocios";
import { comVisitasDoCrm } from "@/components/pessoas/negocioEmylia/visitasDosPassos";
import { HojeSimples } from "@/emylia/HojeSimples";
import { HojeTecnico, SemTecnicoLigado } from "@/emylia/HojeTecnico";
import { OperacoesSimples } from "@/emylia/OperacoesSimples";
import type { Ctx } from "@/emylia/pecas";
import { carregarCatalogo } from "@/emylia/real/carregarCatalogo";
import { carregarCamposConfig, lerCamposConfig } from "@/emylia/real/camposConfig";
import { definirEfeitosCampos, definirGravarEfeitos } from "@/emylia/efeitosLevantamento";
import { aplicarAgenda, carregarAgendaReal, carregarVisitasCrm, equipaReal, tecnicoDaConta } from "@/emylia/real/agendaReal";
import { definirVisitasCrm } from "@/emylia/equipa/visitasCrm";
import { definirEquipaReal } from "@/emylia/equipa/membros";
import { definirRhDaAgenda } from "@/emylia/equipa/rhDaAgenda";
import { definirCriadorContas, definirModoReal, definirResultadoConta, emailDaFicha, telefoneDaFicha, type EnvioAcesso, type ResultadoConta } from "@/emylia/acessosPortal";
import { marcarContaPortal } from "@/emylia/estadoContaPortal";
import { documentosDoNegocio, enviarAoPortal } from "@/emylia/real/portalReal";
import { definirModoTeste, podeModoTeste, simularCliente, simularFornecedor } from "@/emylia/real/modoTeste";
import { definirGuardarCliente } from "@/emylia/EditarCliente";
import { linkEntityEmail, linkEntityPhone } from "@/utils/entityContactSync";
import { gravarMoradaPrincipal } from "@/emylia/real/gravarMoradaDaEntidade";
import { definirMoradaDaEntidade } from "@/emylia/MoradaDeQuemPede";
import { definirEncomendasReais, lerEncomendasReais } from "@/emylia/real/encomendaReal";
import { refNegocio } from "@/emylia/inventario/ponteNegocios";
import { lerFaturaErp } from "@/emylia/erpEticadata";
import { avisoDaFase, codigosDaFase, definirVerCustos, faltaDaFase, podeNeg } from "@/emylia/permissoes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePodeVerCustos } from "@/hooks/usePodeVerCustos";
import { lerPermissoesReais, usePermissoesReaisNegocio } from "@/emylia/real/usePermissoesReais";
import type { NegocioLido } from "@/emylia/real/negocioBase";
import { garantirServicosDosNegocios } from "@/emylia/real/negocioReal";
import { lerMoradaDaEntidade, lerMoradasDasPessoas, sugerirMoradas } from "@/emylia/real/moradaDaLead";
import { gravarDadosDaLead, lerDadosDasLeads, type FonteLead } from "@/emylia/real/dadosDaLead";
import { definirGuardarDadosLead, definirPodeAtribuirLead } from "@/emylia/DadosDaLead";
import { usePodeAtribuirComercial } from "@/hooks/pessoas/usePodeAtribuirComercial";
import { lerComerciais } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import { idsServico, lerNegocios, negocioParaOEcra, type IdsServico } from "@/emylia/real/negocioBase";
import { aplicarRececao, aplicarResposta, lerRececoes, lerRespostas, marcarRespostas, publicarVistas, type VistasGravadas } from "@/emylia/real/vistaCliente";
import { avisarCliente } from "@/emylia/real/avisosCliente";
import { fotografarNegocios, gravarMudancas, type RefNegocio } from "@/emylia/real/sincronizarNegocios";
import { contratosDasEcs, lerProntidoes, ligacaoInventario } from "@/emylia/real/inventarioReal";
import { aoMudarProntidao } from "@/emylia/inventario/prontidaoReal";
import { definirOrgErp } from "@/emylia/erpEticadata";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import { aplicarNomesPapeis, aplicarPermissoesReais, definirPapeisEscolhiveis, aplicarGestoresObra, lerGestoresObra, lerMeusPapeis, papeisPermitidos, papelDeAbertura, reporNomesPapeis, type MeusPapeis } from "@/emylia/real/papeisReal";
import { atribuirPorAtribuir } from "@/emylia/preparacaoObra";
import { aprovarPoReal, definirAprovadorPo } from "@/emylia/real/encomendaReal";
import { definirAjusteReal, desfazerAjusteReal } from "@/emylia/encomendasAjuste";
import { definirMateriaisReais } from "@/emylia/tarefasValidador";
import { lerCatalogo } from "@/emylia/v2/catalogoStore";
import { definirEstadoVivo } from "@/emylia/estadoVivo";
import { carregarEquipasObra } from "@/emylia/equipa/equipasObra";
import { aplicarFaturacao, lerFaturacaoDaFicha, precisaDaFicha } from "@/emylia/real/faturacaoDaFicha";
import { definirDadosPagamento, lerDadosPagamento } from "@/emylia/pagamentoCliente";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

interface Toast extends Aviso { id: number }
type Gravacao = { k: "parado" } | { k: "a-gravar" } | { k: "gravado"; n: number } | { k: "erro"; t: string };
const VISTAS = new Set(["negocios", "negocio", "hoje", "operacoes"]);
/** As vistas que se escolhem no topo (a ficha do negócio abre-se a partir da lista). 09/11: cada uma só aparece a quem a pode ver (vistaPermitida). */
const SEPARADORES: [Vista, string][] = [["hoje", "Hoje"], ["negocios", "Negócios"], ["operacoes", "Operações"]];
/** As vistas da Emylia que abrem uma página da Olyvia: as Pessoas do CRM, as encomendas de cliente do Inventário e o Catálogo e custos. */
const PAGINA_REAL: Partial<Record<Vista, string>> = {
  pessoas: "/pessoas", leads: "/pessoas", clientes: "/pessoas", inventario: "/client-orders", catalogo: "/catalogo-custos",
};
/** As mesmas ligações, ao lado dos separadores (como o menu do protótipo). 09/11: com a permissão de cada página; sem ela, não aparece. */
const LIGACOES: [string, string, string][] = [["Pessoas", "/pessoas", "pessoas.view"], ["Inventário", "/client-orders", "client_orders.view"], ["Equipas de obra", "/equipas-obra", "pessoas.view"],
  ["Catálogo e custos", "/catalogo-custos", "services.view"]];

/** 10/11: a permissão que a rota de cada página real pede (ProtectedRoute em App.tsx) e o nome com que se avisa. As rotas só olham para o
 *  perfil da Olyvia (não para o Papel no Negócio): sem ela, a ligação levava a «Acesso negado». */
const PERM_PAGINA: readonly [string, string, string][] = [["/client-orders", "client_orders.view", "as encomendas de cliente"],
  ["/receiving", "receiving.view", "a Receção"], ["/purchase-orders", "purchase_orders.view", "as encomendas a fornecedor"],
  ["/catalogo-custos", "services.view", "o Catálogo e custos"], ["/pessoas", "pessoas.view", "as Pessoas"]];
const permDaPagina = (url: string): readonly [string, string, string] | null =>
  PERM_PAGINA.find(([rota]) => url === rota || url.startsWith(rota + "?") || url.startsWith(rota + "/")) ?? null;

/** 09/11: os papéis do Negócio que veem a encomenda de cliente do negócio (neg_papeis_permissoes com client_orders.view). */
const PAPEIS_VEEM_ENCOMENDAS: readonly Papel[] = ["comercial", "direcao", "financeiro", "armazem", "operacoes"];

/** `vistaInicial`: a vista ao abrir sem ?vista= (a primeira página, /home, abre no Hoje). */

export default function NegociosEmylia({ vistaInicial }: { vistaInicial?: "hoje" | "operacoes" } = {}) {
  usePaginaInteira();
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  // 5/11: ver os custos e as margens do orçamento (quotes.view_costs por fn_cat_pode, a pergunta das RPCs que os devolvem). Põe-se em
  // permissoes.ts já no render (como S.tec mais abaixo), para que podeVerCustos() responda o mesmo nesta passagem; a ler, esconde.
  const verCustos = usePodeVerCustos();
  definirVerCustos(verCustos.aLer ? null : verCustos.pode);
  useEffect(() => () => definirVerCustos(undefined), []);
  // 11/11 (teste da Obra, achado): o relógio real (motor: diaReal) nunca se ligava na app: o «hoje» das obras em curso ficava no dia em que
  // arrancaram (o Hoje do técnico, os atrasos e o Estúdio da obra erravam) e arrancar não punha o início em hoje. Com a base, liga-se.
  definirRelogioReal(!!org);
  useEffect(() => () => definirRelogioReal(false), []);
  // 5/11: as permissões das ações (podeNeg) vêm de fn_cat_pode, a MESMA pergunta do servidor (o perfil, os Papéis no Negócio de todos os
  // papéis da pessoa e o admin do sistema), postas no motor com `simular: false`, como na ficha da pessoa. O «A ver como» continua a
  // escolher a vista e de quem é cada passo, mas já não muda o que se pode fazer. Com as reais postas, definirVerCustos é ignorado.
  const perms = usePermissoesReaisNegocio(org);
  // 09/11: o perfil «Ser técnico de obra» (negocios.obra.tecnico) só dá o papel com a conta ligada a uma pessoa do RH; sem ela, o aviso
  const { hasPermission, loading: permsPerfilALer } = usePermissions();
  const tecnicoPorPerfil = hasPermission("negocios.obra.tecnico");
  // 09/11: ver as encomendas de cliente pelo perfil (client_orders.view). Num ref, porque carregarEncomendas corre dentro de efeitos
  // que guardam a primeira versão da função; a ler as permissões, conta como sim (o servidor decide na mesma).
  const verEncomendasPerfil = useRef(true);
  verEncomendasPerfil.current = permsPerfilALer || hasPermission("client_orders.view");
  // 09/11: o que quem entrou pode ver: fn_cat_pode (o perfil, os Papéis no Negócio e o admin, como a base decide; lido em
  // usePermissoesReaisNegocio) OU o perfil da Olyvia (usePermissions). Enquanto se lê, só o perfil.
  const codigosLidos = perms.leitura.k === "lidas" ? perms.leitura.codigos : null;
  const pode = (c: string): boolean => !!codigosLidos?.has(c) || (!permsPerfilALer && hasPermission(c));
  // 11/11: ao sair da página, o «Mudar» do impacto ao lado dos campos deixa de aparecer
  useEffect(() => () => definirGravarEfeitos(null), []);
  // 10/11: as páginas reais (rotas da Olyvia) só contam o perfil; o Papel no Negócio não abre a rota. As ligações só aparecem com ela.
  const podeRota = (c: string): boolean => !permsPerfilALer && hasPermission(c);
  // ao abrir uma, só se recusa com o perfil já lido (a ler, abre; a rota decide na mesma). Num ref para o `run` e as ligações ao
  // Inventário (guardadas em useCallback/useMemo).
  const negaRota = (c: string): boolean => !permsPerfilALer && !hasPermission(c);
  const negaRotaRef = useRef(negaRota);
  negaRotaRef.current = negaRota;
  // 09/11 (20270111100000): a leitura reduzida da base (fn_neg_so_execucao): sem pessoas.view, com negocios.obra.executar. Só as obras onde
  // trabalha, sem dinheiro; as funções do negócio inteiro recusam-no, por isso nem se chamam. Num ref, para os efeitos e o gravar.
  const soExecucao = !!codigosLidos && !pode("pessoas.view") && pode("negocios.obra.executar");
  const soExecucaoRef = useRef(soExecucao);
  soExecucaoRef.current = soExecucao;
  // espera pela leitura das permissões (o que se lê ao abrir depende de soExecucao); resolve logo se já estão lidas
  const leituraRef = useRef(perms.leitura);
  leituraRef.current = perms.leitura;
  const esperasPerms = useRef<(() => void)[]>([]);
  useEffect(() => { if (perms.leitura.k === "lidas") for (const f of esperasPerms.current.splice(0)) f(); }, [perms.leitura]);
  const permsLidas = useCallback(() => new Promise<void>((ok) => {
    if (leituraRef.current.k === "lidas") ok(); else esperasPerms.current.push(ok);
  }), []);
  /** 09/11: os papéis lidos (neg_meus_papeis), também num ref pela mesma razão; null enquanto não se leem. */
  const meusRef = useRef<MeusPapeis | null>(null);
  /** 11/11: o papel escolhido à mão no «A ver como» nesta página (null: nenhum); respeita-se se os papéis se voltarem a ler. */
  const escolhaRef = useRef<Papel | null>(null);
  // 5/11: leads.assign para o comercial da lead (ComercialDaLead), da mesma maneira
  const podeAtribuir = usePodeAtribuirComercial();
  definirPodeAtribuirLead(podeAtribuir);
  useEffect(() => () => definirPodeAtribuirLead(null), []);
  // ?vista=operacoes (o "Operações" do menu) ou ?vista=hoje abre logo essa vista; o resto abre os Negócios
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const vistaPedida = params.get("vista") ?? vistaInicial ?? null;
  // 3/11: a notificação de uma mensagem do cliente (aos gestores de obra) abre a obra dele: ?vista=operacoes&obra=<número>
  const obraPedida = useRef(Number(params.get("obra")) || null);
  // 9/11: ?negocio=<número> abre esse negócio (a volta do Estúdio e o indicador da gravação, sem recarregar a app)
  const negocioPedido = useRef(Number(params.get("negocio")) || null);
  const S = useMemo<Estado>(() => {
    const s = seed(); s.deals = []; s.clientes = []; s.deal = null;
    s.view = vistaPedida === "operacoes" || vistaPedida === "hoje" ? vistaPedida : "negocios";
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- a vista do endereço só conta ao abrir
  const [, setTique] = useState(0);
  const redesenhar = useCallback(() => setTique((t) => t + 1), []);
  // o menu volta a pedir a vista com a página já aberta (ex.: "Operações" estando nos Negócios)
  useEffect(() => {
    if ((vistaPedida === "operacoes" || vistaPedida === "hoje") && S.view !== vistaPedida) { S.view = vistaPedida; S.deal = null; S.op = null; redesenhar(); }
  }, [vistaPedida, S, redesenhar]);
  const [pronto, setPronto] = useState(false);
  const [erroLer, setErroLer] = useState<string | null>(null);
  // 30/10 (20270101340000): os papéis de quem entrou, do RH; null enquanto se leem
  const [meus, setMeus] = useState<MeusPapeis | null>(null);
  const [gravacao, setGravacao] = useState<Gravacao>({ k: "parado" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const refs = useRef(new Map<number, RefNegocio>());
  // os negócios do CRM (com documentos do CRM): lêem-se, mas nunca se gravam por aqui
  const soLeitura = useRef(new Set<number>());
  // 11/11 (20270113130000): a permissão que cada negócio pede pela fase em que está na base (codigosDaFase); sem nenhuma delas fica só
  // de leitura, como o servidor (a assistente comercial depois de «Passar ao comercial» é um caso disto)
  const faseLida = useRef(new Map<number, readonly string[] | null>());
  const lerFases = (): void => { faseLida.current = new Map(S.deals.map((d) => [d.id, codigosDaFase(d)])); };
  const faltaDoNegocio = (n: number): string | null => faltaDaFase(faseLida.current.get(n));
  const bloqueadosAssistente = (): ReadonlySet<number> => new Set([...faseLida.current.keys()].filter((n) => faltaDoNegocio(n) !== null));
  // 11/11 (F1): o Catálogo não carregou: os negócios abrem só para consulta (sem o Catálogo, gravar perdia os serviços)
  const catalogoFalhou = useRef(false);
  const foto = useRef(new Map<number, string>());
  const ids = useRef<IdsServico | null>(null);
  const aGravar = useRef(false);
  // 28/10: os envios ao portal do cliente à espera de a gravação acabar (a proposta e o contrato têm de estar na base)
  const filaPortal = useRef<EnvioAcesso[]>([]);
  const deNovo = useRef(false);
  // 3/11: a perda (neg_perder_negocio / neg_anular_perda) foi à base: na próxima gravação relê-se o negócio, como depois do Financeiro
  const relerPedido = useRef(false);
  const [q, setQ] = useState("");

  const avisar = useCallback((a: Aviso) => {
    const mostra = () => {
      const id = ++tid.current;
      setToasts((t) => [...t, { ...a, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), a.act ? 8000 : 5200);
    };
    if (a.atraso) setTimeout(mostra, a.atraso); else mostra();
  }, []);

  // o que a base devolveu passa a ser o estado (a leitura ao abrir e a releitura depois do Financeiro)
  const aplicarLidos = useCallback((lidos: Awaited<ReturnType<typeof lerNegocios>>) => {
    refs.current = new Map(lidos.map((n) => [n.linhas.negocio.numero, { id: n.id, entityId: n.entityId }]));
    soLeitura.current = new Set(lidos.filter((n) => n.docsCrm || catalogoFalhou.current).map((n) => n.linhas.negocio.numero));
    S.deals = lidos.map(negocioParaOEcra);
    lerFases();
    // 11/11 (teste da Obra): numa organização real o «hoje» de cada obra em curso é o do calendário (antes da fotografia: não grava só por isso)
    acertarDiaDasObras(S.deals);
    // os serviços do Catálogo fora do modelo, que os negócios já usam, entram em S.svc
    garantirServicosDosNegocios(S, S.deals);
    S.seq = Math.max(1000, ...S.deals.map((d) => d.id)) + 1;
    foto.current = fotografarNegocios(S.deals);
    // 3/11: no Financeiro, o NIF e o email da faturação que faltam vêm da Lead (depois da fotografia: grava-se na próxima gravação)
    for (const d of S.deals) if (!soLeitura.current.has(d.id)) herdarFaturacao(d);
  }, [S]);

  // 2/11 (20270103800000): a vista do cliente de cada negócio com proposta enviada (o portal real desenha-a com o ecrã da V1). Só se
  // grava a que mudou; um erro aqui não para o Negócio (o portal mostra a última vista gravada).
  const vistas = useRef<VistasGravadas>(new Map());
  // as respostas do cliente no portal já aplicadas ao negócio, à espera de a gravação acabar bem para se marcarem
  const respostasAplicadas = useRef<string[]>([]);
  const publicarVistasCliente = useCallback(async () => {
    // 09/11 (20270111100000): com a leitura reduzida a base recusa neg_vista_cliente_guardar (CT001): não se publica
    if (!org || soExecucaoRef.current) return;
    try {
      const erros = await publicarVistas(supabase, org, S, refs.current, vistas.current);
      if (erros.length) console.warn("[portal] vistas do cliente por gravar:", erros);
    } catch (e) { console.warn("[portal] vistas do cliente:", (e as Error).message); }
  }, [org, S]);
  // 2/11 (20270104000000): os avisos ao cliente por email (fatura por pagar, pagamento recebido, plano, início do serviço, fase
  // concluída, auto para assinar). A base devolve só os que ninguém enviou; um erro aqui não para o Negócio.
  const avisarClientes = useCallback(async () => {
    if (!org) return;
    for (const d of S.deals) {
      const ref = refs.current.get(d.id);
      if (!ref || !d.orc?.enviada) continue;
      try {
        const r = await avisarCliente(supabase, org, ref.id, d, window.location.origin);
        if (r.erros.length) console.warn("[portal] avisos ao cliente:", r.erros);
      } catch (e) { console.warn("[portal] avisos ao cliente:", (e as Error).message); }
    }
  }, [org, S]);

  // grava o que mudou; se mudar outra vez enquanto grava, volta a gravar no fim
  const gravar = useCallback(async () => {
    if (!org || !ids.current) return;
    if (aGravar.current) { deNovo.current = true; return; }
    aGravar.current = true;
    setGravacao({ k: "a-gravar" });
    let relerFinanceiro = false, semErros = true;
    try {
      do {
        deNovo.current = false;
        // 09/11 (20270111100000): com a leitura reduzida só se grava a obra (neg_guardar_negocio recusa-o; sem o «Não gravou»)
        const r = await gravarMudancas(supabase, org, S, refs.current, foto.current, ids.current, new Set([...soLeitura.current, ...bloqueadosAssistente()]), { soObra: soExecucaoRef.current });
        if (r.reler) relerFinanceiro = true;
        if (relerPedido.current) { relerPedido.current = false; relerFinanceiro = true; }
        if (r.erros.length) { semErros = false; setGravacao({ k: "erro", t: r.erros.join(" · ") }); avisar({ msg: "Não gravou", sub: r.erros[0], kind: "bad" }); }
        else setGravacao({ k: "gravado", n: r.gravados });
        for (const a of r.avisos) avisar({ msg: "Gravado, com um aviso", sub: a, kind: "" });
      } while (deNovo.current);
      // 11/11 (fim de contacto): gravado sem erros, o que está no ecrã é o da base: o negócio passado agora ao comercial fica só de leitura
      if (semErros) lerFases();
      // 2/11 (20270103900000): as respostas do cliente aplicadas ao abrir ficam marcadas, agora que o negócio está gravado
      if (semErros && respostasAplicadas.current.length) {
        try { await marcarRespostas(supabase, org, respostasAplicadas.current.splice(0)); }
        catch (e) { avisar({ msg: "As respostas do cliente não ficaram marcadas", sub: (e as Error).message, kind: "bad" }); }
      }
      // 28/10: o portal do cliente, depois de gravar (o documento já está na base): a conta real e o email de acesso
      for (const e of filaPortal.current.splice(0)) {
        const id = Number(e.conta.ref), ref = refs.current.get(id), d = S.deals.find((x) => x.id === id), email = d ? emailDaFicha(d) : null;
        const telefone = d ? telefoneDaFicha(d) : null;
        const r: ResultadoConta = !email ? { fase: "erro", msg: "Falta um email válido na ficha do cliente." }
          : !telefone ? { fase: "erro", msg: "Falta o telefone do cliente com indicativo do país (por exemplo +351 912 345 678)." }
          : !ref ? { fase: "erro", msg: "O negócio ainda não está gravado na base." }
          : await enviarAoPortal(supabase, org, ref, email, e, undefined, telefone);
        definirResultadoConta(e.n, r);
        marcarContaPortal(S, e, r);
        if (r.fase === "erro") avisar({ msg: "O portal do cliente não recebeu o documento", sub: r.msg, kind: "bad" });
        else if (r.fase === "pronta") avisar(r.email?.enviado
          ? { msg: r.nova ? "Conta do portal criada" : "Documento no portal do cliente", sub: `Email enviado para ${r.email.para ?? email}`, kind: "ok" }
          : { msg: "O email do portal não seguiu", sub: `${r.email?.motivo ? r.email.motivo + ". " : ""}${r.password ? `Entregue ao cliente: ${email} · password ${r.password}` : "Contacte o cliente por outro canal."}`, kind: "bad" });
      }
      // F3: com fatura, pagamento ou anulação no servidor, relê-se: a encomenda de cliente da base (contrato e número), a fase e a prontidão
      if (relerFinanceiro) {
        const relidos = await lerNegocios(supabase, org, ids.current, S.campos, { semSugestoes: soExecucaoRef.current });
        aplicarLidos(relidos);
        await carregarEncomendas(relidos);
        if (!soExecucaoRef.current) await lerProntidoes(supabase, org, contratosDasEcs(S.deals));
      }
      await publicarVistasCliente();
      await avisarClientes();
    } catch (e) {
      avisar({ msg: "Não foi possível atualizar os negócios", sub: (e as Error).message, kind: "bad" });
    } finally {
      aGravar.current = false;
      redesenhar();
    }
  }, [org, S, avisar, redesenhar, aplicarLidos, publicarVistasCliente, avisarClientes]);

  // 28/10: a encomenda de cliente e as encomendas a fornecedor de cada negócio, da base (as emitidas no servidor)
  const carregarEncomendas = useCallback(async (lidos: readonly NegocioLido[]) => {
    if (!org) return;
    // 09/11: quem não vê encomendas de cliente (sem client_orders.view no perfil nem um papel do negócio que as veja, ex.: o técnico)
    // não as pede: a base recusava-as e o aviso «A encomenda de cliente não carregou» aparecia sempre. Fica sem nenhuma.
    const m = meusRef.current;
    const veEncomendas = verEncomendasPerfil.current || !m || m.todos || m.papeis.some((p) => PAPEIS_VEEM_ENCOMENDAS.includes(p));
    if (!veEncomendas) { definirEncomendasReais(new Map()); redesenhar(); return; }
    const pares = lidos.flatMap((n) => {
      const d = S.deals.find((x) => x.id === n.linhas.negocio.numero);
      return n.ec?.emitida_em && d ? [{ ref: refNegocio(d), contrato: n.ec.contract_id }] : [];
    });
    const r = await lerEncomendasReais(supabase, org, pares);
    definirEncomendasReais(r.mapa);
    if (r.erros.length) avisar({ msg: "A encomenda de cliente não carregou", sub: r.erros[0], kind: "bad" });
    redesenhar();
  }, [org, S, avisar, redesenhar]);

  // 3/11: no Financeiro, o nome e o NIF dos dados de faturação vêm da ficha do cliente (Edge Function nif-faturacao). Pede-se uma vez
  // por negócio e por sessão; sem permissão ou sem a função publicada fica como antes (escreve-se à mão).
  const fichaPedida = useRef(new Set<number>());
  const preencherDaFicha = useCallback(() => {
    if (!org) return;
    for (const d of S.deals) {
      const ref = refs.current.get(d.id);
      if (!ref || fichaPedida.current.has(d.id) || !precisaDaFicha(d)) continue;
      fichaPedida.current.add(d.id);
      void lerFaturacaoDaFicha(supabase, org, ref.id).then((x) => {
        const atual = S.deals.find((y) => y.id === d.id);
        if (!x || !atual || !precisaDaFicha(atual) || !aplicarFaturacao(atual, x)) return;
        redesenhar();
        void gravar();
      }).catch(() => { /* fica como antes: escreve-se à mão */ });
    }
  }, [org, S, redesenhar, gravar]);

  // 3/11: o nome de quem entrou, nas entradas novas do histórico (depois de gravar, a base guarda-o: 20270105100000)
  const nomeEu = useRef("");
  const run = useCallback((fn: () => void) => {
    fn();
    marcarAutor(S.deals, nomeEu.current);
    preencherDaFicha();
    // 28/10: as vistas da Emylia que já têm página real na Olyvia abrem-na (o que mudou grava-se na mesma, antes de sair)
    let fora = VISTAS.has(S.view) ? null : PAGINA_REAL[S.view] ?? null;
    // 10/11: sem a permissão da rota (pelo perfil), avisa em vez de abrir a página e ficar em «Acesso negado»
    const perm = fora ? permDaPagina(fora) : null;
    if (fora && perm && negaRotaRef.current(perm[1])) {
      avisar({ msg: `Não tem permissão para abrir ${perm[2]}`, sub: `Peça ao administrador a permissão «${perm[1]}» no seu perfil.`, kind: "bad" });
      fora = null;
      S.view = S.deal ? "negocio" : "negocios";
    }
    if (!VISTAS.has(S.view)) {
      if (!fora) avisar({ msg: "Este ecrã ainda não está ligado", sub: "Fica no negócio.", kind: "" });
      S.view = S.deal ? "negocio" : "negocios";
    }
    redesenhar();
    void gravar();
    if (fora) navigate(fora);
  }, [S, avisar, redesenhar, gravar, navigate, preencherDaFicha]);
  const go = useCallback((fn: () => void) => () => run(fn), [run]);
  // F3: abrir a encomenda de cliente, a Receção e as compras vai às páginas reais, filtradas pela encomenda do negócio
  // 10/11: as ligações ao Inventário real (abrirInv, abrirRececao, abrirInvLista…) também só abrem a página com a permissão da rota
  const A = useMemo(() => acoes(S, avisar, run, ligacaoInventario((url) => {
    const perm = permDaPagina(url);
    if (perm && negaRotaRef.current(perm[1])) {
      avisar({ msg: `Não tem permissão para abrir ${perm[2]}`, sub: `Peça ao administrador a permissão «${perm[1]}» no seu perfil.`, kind: "bad" });
      return;
    }
    navigate(url);
  })), [S, avisar, run, navigate]);
  useEffect(() => { definirOrgErp(org); return () => definirOrgErp(null); }, [org]);
  // 4/11: os dados da empresa para o cliente pagar (o passo «Pagamento» e «Ver como o cliente»); sem eles, nada de exemplo
  useEffect(() => {
    let desfazer = definirDadosPagamento(null);
    let vivo = true;
    // 09/11 (20270111100000): depois de ler as permissões; com a leitura reduzida a base recusa-o, por isso não se pede
    if (org) void permsLidas().then(() => {
      if (!vivo || soExecucaoRef.current) return;
      return (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: unknown; error: unknown }> })
        .rpc("neg_dados_pagamento_ler", { p_org: org })
        .then(({ data, error }) => { if (vivo && !error) { desfazer(); desfazer = definirDadosPagamento(lerDadosPagamento(data)); } });
    });
    return () => { vivo = false; desfazer(); };
  }, [org, permsLidas]);
  useEffect(() => aoMudarProntidao(redesenhar), [redesenhar]);

  useEffect(() => {
    if (!org) return;
    let vivo = true;
    setPronto(false); setErroLer(null);
    (async () => {
      // 30/10: os papéis do RH primeiro: sem nenhum (e sem o perfil da Olyvia que vê todos), não há nada a fazer aqui
      const rh = await lerMeusPapeis(supabase, org);
      if (!vivo) return;
      // 9/11 (Lote 1, A): sem Papel no Negócio no RH (nem pessoas.edit), os papéis vêm das permissões negocios.* do perfil (fn_cat_pode):
      // entra e vê os passos para que tem permissão, em vez de «Não tem nenhum papel»
      // 11/11: sem papel no RH, também quem vê todos (pessoas.edit, admin) abre no papel que as permissões dão (o Financeiro abria no
      // Comercial); só muda o papel de abertura, o «A ver como» continua com todos. Uma escolha à mão nesta página mantém-se.
      const codigos = rh.papeis.length === 0 ? await lerPermissoesReais(org) : null;
      if (!vivo) return;
      const { meus: mp, papel } = papelDeAbertura(rh, codigos, S.role, escolhaRef.current);
      aplicarNomesPapeis(mp); aplicarPermissoesReais(); definirPapeisEscolhiveis(mp.todos ? null : papeisPermitidos(mp));
      meusRef.current = mp;
      setMeus(mp);
      if (!papel) { setErroLer("Não tem nenhum papel no Negócio. Peça ao RH para lho dar na sua ficha (Papéis no Negócio), um cargo técnico de obra ou o perfil de técnico de obra."); return; }
      S.role = papel;
      // 09/11 (20270111100000): quem vê todos (admin, pessoas.edit) nunca tem a leitura reduzida e segue logo; os outros esperam pelas
      // permissões, para não pedir o que a base lhes recusa (as linhas de negócio, os ajustes dos campos, as sugestões, a prontidão)
      if (!mp.todos) await permsLidas();
      if (!vivo) return;
      const so = !mp.todos && soExecucaoRef.current;
      // 11/11 (F1): um erro do Catálogo (ex.: CT001) não bloqueia o ecrã: avisa e os negócios abrem só para consulta
      const cat = await carregarCatalogo(supabase, org, S, { semLinhasModelo: so, tolerante: true });
      catalogoFalhou.current = !!cat.erro;
      if (cat.erro) avisar({ msg: "O Catálogo não carregou", sub: `${cat.erro} Os negócios abrem só para consulta.`, kind: "bad" });
      // 9/11: as equipas de obra da empresa (o plano escolhe a equipa toda ou nenhum membro); um erro aqui não para nada
      await carregarEquipasObra(supabase, org).catch(() => undefined);
      // 3/11 (Rúben): os campos das fases e o impacto no orçamento como a organização os ajustou (Pessoas › Workflow); sem ajustes, os de sempre
      await carregarCamposConfig(supabase, org, S, { semLer: so });
      // 11/11 (Rúben): quem configura os campos (pessoas.config) muda o impacto de uma resposta ao lado do campo
      definirGravarEfeitos(!so && pode("pessoas.config") ? async (efeitos) => {
        const { data, error } = await supabase.rpc("neg_guardar_campos_config" as never, { p_org: org, p_campos: null, p_efeitos: efeitos } as never);
        if (error) return error.message || "Não foi possível gravar.";
        definirEfeitosCampos(lerCamposConfig(data).efeitos);
        return null;
      } : null);
      // 30/10: o responsável de obra (o técnico vê-o no Hoje) é o Gestor de obra do RH
      aplicarGestoresObra(await lerGestoresObra(supabase, org));
      // 30/10: os materiais que o Gestor de obra junta às tarefas são os produtos e consumíveis do Catálogo (com o id, para a encomenda)
      const K = lerCatalogo(), custo = new Map([...K.produtos.map((p) => [p.id, { preco: p.custo, forn: p.fornecedor }] as const),
        ...(K.consumiveisCriados ?? []).map((c) => [c.id, { preco: c.preco, forn: c.fornecedor }] as const)]);
      definirMateriaisReais(cat.produtos.map((p) => {
        const c = custo.get(p.id);
        return { n: p.name, q: 1, un: p.unidade ?? "un", produto: p.id, ...(c?.preco ? { preco: c.preco } : {}), ...(c?.forn ? { forn: c.forn } : {}) };
      }));
      // 28/10: as ausências aprovadas no RH dos técnicos (plano e agenda); um erro aqui não impede os negócios de abrir
      const ag = await carregarAgendaReal(supabase, org);
      if (ag.erro) avisar({ msg: "A agenda do RH não carregou", sub: ag.erro, kind: "bad" });
      // 29/10: as visitas marcadas no CRM (Pipeline, agenda) também na agenda da Emylia
      const vc = await carregarVisitasCrm(supabase, org);
      if (vc.erro) avisar({ msg: "As visitas da agenda do CRM não carregaram", sub: vc.erro, kind: "bad" });
      ids.current = idsServico(cat.M.ids.servico);
      const lidos = await lerNegocios(supabase, org, ids.current, S.campos, { semSugestoes: so });
      if (!vivo) return;
      aplicarLidos(lidos);
      // 4/11: a morada que a lead já trazia (a da ficha da pessoa), para o passo «Morada da obra»; um erro a ler não para nada
      void lerMoradasDasPessoas(supabase, [...refs.current.values()].map((r) => r.entityId)).then((m) => {
        if (!vivo) return;
        sugerirMoradas(S.deals, (d) => refs.current.get(d.id)?.entityId, m);
        redesenhar();
      });
      // 4/11: o que a lead trouxe da Nova lead (os campos da Olyvia original), para a fase Lead; um erro a ler não para nada
      void lerDadosDasLeads(supabase, org, [...refs.current.values()].map((r) => r.entityId)).then(({ porPessoa, fontes }) => {
        if (!vivo) return;
        for (const d of S.deals) {
          const e = refs.current.get(d.id)?.entityId, x = e ? porPessoa.get(e) : undefined;
          if (x) d.dadosLead = x; else delete d.dadosLead;
        }
        setFontesLead(fontes);
        redesenhar();
      });
      // 2/11 (20270103800000): o auto de receção que o cliente assinou no portal passa a assinado na obra (o relatório final); grava-se a seguir
      const rececoes = await lerRececoes(supabase, org);
      if (!vivo) return;
      const recebidas = S.deals.filter((d) => { const ref = refs.current.get(d.id); return !!ref && aplicarRececao(d, rececoes.get(ref.id)); }).length;
      // 2/11 (20270103900000): as respostas do cliente no portal (aviso de pagamento, adendas) com as ações da V1; grava-se a seguir
      const respostas = await lerRespostas(supabase, org);
      if (!vivo) return;
      const numeroDe = new Map([...refs.current].map(([n, r]) => [r.id, n]));
      const Aresp = acoes(S, avisar, (fn) => fn());
      for (const r of respostas) {
        const d = S.deals.find((x) => x.id === numeroDe.get(r.negocio));
        if (d && aplicarResposta(d, Aresp, r)) respostasAplicadas.current.push(r.id);
      }
      // 3/11: o que veio do portal (o cliente avisou, assinou, recebeu a obra) não é de ninguém da equipa
      marcarAutor(S.deals, "");
      // 30/10: os planos por aprovar com tarefas por atribuir (o RH não tinha técnicos do ofício quando se geraram) ficam com os técnicos
      // que o RH já tem; grava-se a obra a seguir. Só quem grava a obra (o Gestor de obra; ou quem vê todos) o faz.
      const atribuidas = mp.todos || mp.papeis.includes("operacoes") ? S.deals.reduce((a, d) => a + atribuirPorAtribuir(d.obra.plano), 0) : 0;
      // F3: a prontidão das encomendas de cliente emitidas (o passo «À espera dos materiais»); 09/11: não com a leitura reduzida (recusa-a)
      if (!so) await lerProntidoes(supabase, org, contratosDasEcs(S.deals));
      if (!vivo) return;
      // 3/11: a obra pedida no endereço (a notificação de uma mensagem do cliente), se o negócio já tem plano
      const op = obraPedida.current;
      if (op && S.deals.some((x) => x.id === op && x.obra.plano)) { S.view = "operacoes"; S.op = op; S.deal = null; }
      const np = negocioPedido.current;
      if (np && S.deals.some((x) => x.id === np)) { S.view = "negocio"; S.deal = np; S.op = null; }
      setPronto(true);
      // 9/11: o Estúdio (no mesmo separador) lê daqui o Catálogo, os técnicos e as obras marcadas, para o plano da obra da visita
      definirEstadoVivo(S, org);
      preencherDaFicha();
      // 2/11: a vista do cliente grava-se depois de as encomendas carregarem (leva o estado dos materiais) e só depois os avisos
      void carregarEncomendas(lidos).catch(() => undefined).then(() => publicarVistasCliente()).then(avisarClientes);
      if (recebidas) avisar({ msg: "Obra recebida pelo cliente", sub: `${recebidas} ${recebidas === 1 ? "auto de receção foi assinado" : "autos de receção foram assinados"} no portal.`, kind: "ok" });
      if (atribuidas) avisar({ msg: "Técnicos atribuídos", sub: `${atribuidas} ${atribuidas === 1 ? "tarefa ficou" : "tarefas ficaram"} com um técnico do RH.`, kind: "ok" });
      if (atribuidas || recebidas || respostasAplicadas.current.length) void gravar();
    })().catch((e: Error) => { if (vivo) setErroLer(e.message); });
    return () => { vivo = false; };
  }, [org, S, avisar, carregarEncomendas, aplicarLidos, permsLidas]); // eslint-disable-line react-hooks/exhaustive-deps -- gravar só depois de ler
  useEffect(() => () => reporNomesPapeis(), []);
  // 3/11 (20270105200000): perder e anular a perda gravam-se pelas funções da base (neg_guardar_negocio ignora o estado e o motivo); depois,
  // com sucesso ou não, grava-se o resto e relê-se o negócio (a base é que diz se ficou perdido). A base pede negocios.perder.
  useEffect(() => {
    if (!org) return;
    const depois = () => { relerPedido.current = true; redesenhar(); void gravar(); };
    definirPerdaReal({
      perder: (d, fase, motivo) => {
        const ref = refs.current.get(d.id);
        if (!ref) { avisar({ msg: "A perda não ficou gravada", sub: "O negócio ainda não está gravado na base.", kind: "bad" }); return; }
        void perderNegocioReal(ref.id, fase, motivo)
          .catch((e) => { d.perdido = false; avisar({ msg: "A perda não ficou gravada", sub: mensagemDaPerda(e), kind: "bad" }); })
          .finally(depois);
      },
      anular: (d, razao) => {
        const ref = refs.current.get(d.id);
        if (!ref) return;
        void anularPerdaReal(ref.id, razao)
          .catch((e) => { d.perdido = true; avisar({ msg: "A perda não foi anulada", sub: mensagemDaPerda(e), kind: "bad" }); })
          .finally(depois);
      },
    });
    return () => definirPerdaReal(null);
  }, [org, avisar, redesenhar, gravar]);
  // 9/11 (Rúben: «o super admin deve sempre ter botões para fazer ações pelo cliente e pelo fornecedor»): numa base com o modo de teste
  // ligado, o super admin da organização aceita a proposta e assina o contrato pelo cliente (o caminho do portal) e confirma a encomenda
  // pelo fornecedor; depois relê o negócio (a fase, o contrato e as encomendas vêm da base). Sem modo de teste, os botões não existem.
  useEffect(() => {
    if (!org) return;
    let vivo = true;
    const reler = async () => {
      const relidos = await lerNegocios(supabase, org, ids.current, S.campos, { semSugestoes: soExecucaoRef.current });
      aplicarLidos(relidos);
      await carregarEncomendas(relidos);
    };
    const peloCliente = async (d: Negocio, acao: "sign_proposal" | "sign_contract") => {
      const ref = refs.current.get(d.id);
      try {
        if (!ref) throw new Error("O negócio ainda não está gravado na base.");
        const docs = await documentosDoNegocio(supabase, ref.id);
        const doc = acao === "sign_proposal" ? docs.proposal : docs.contract;
        if (!doc) throw new Error(acao === "sign_proposal" ? "A proposta ainda não está na base." : "O contrato ainda não está na base.");
        await simularCliente(supabase, acao, doc);
        await reler();
        avisar({ msg: acao === "sign_proposal" ? "Proposta aceite pelo cliente (teste)" : "Contrato assinado pelo cliente (teste)", sub: "Pelo caminho do portal, sem o código por SMS.", kind: "ok" });
      } catch (e) {
        avisar({ msg: "O teste não foi feito", sub: (e as Error).message, kind: "bad" });
      } finally { redesenhar(); }
    };
    void podeModoTeste(supabase, org).then((pode) => {
      if (!vivo) return;
      definirModoTeste(!pode ? null : {
        aceitarProposta: (d) => peloCliente(d, "sign_proposal"),
        assinarContrato: (d) => peloCliente(d, "sign_contract"),
        confirmarFornecedor: async (uuid) => {
          try {
            await simularFornecedor(supabase, uuid);
            await reler();
            avisar({ msg: "Encomenda confirmada pelo fornecedor (teste)", sub: "Como no portal do fornecedor.", kind: "ok" });
          } catch (e) {
            avisar({ msg: "O teste não foi feito", sub: (e as Error).message, kind: "bad" });
          } finally { redesenhar(); }
        },
      });
    });
    return () => { vivo = false; definirModoTeste(null); };
  }, [org, S, avisar, redesenhar, aplicarLidos, carregarEncomendas]);

  // 30/10: Compras e armazém aprova a encomenda a fornecedor no passo dos materiais; depois relê as encomendas do negócio
  useEffect(() => {
    if (!org) return;
    definirAprovadorPo(async (uuid) => {
      try {
        const r = await aprovarPoReal(supabase, uuid);
        avisar(r.publicada ? { msg: "Encomenda aprovada", sub: "Já está no portal do fornecedor.", kind: "ok" }
          : { msg: "Encomenda aprovada", sub: r.aviso ?? "O fornecedor não tem portal: envie-lhe a encomenda por email.", kind: "ok" });
        const relidos = await lerNegocios(supabase, org, ids.current, S.campos, { semSugestoes: soExecucaoRef.current });
        await carregarEncomendas(relidos);
      } catch (e) {
        avisar({ msg: "A encomenda não foi aprovada", sub: (e as Error).message, kind: "bad" });
      } finally { redesenhar(); }
    });
    return () => definirAprovadorPo(null);
  }, [org, avisar, carregarEncomendas, redesenhar]);
  // 30/10 (20270101350000): os materiais novos da obra (o Gestor de obra) vão à encomenda a fornecedor da base, pendente para Compras
  useEffect(() => {
    if (!org) return;
    definirAjusteReal((d, motivo, linhas) => {
      const ref = refs.current.get(d.id);
      void (async () => {
        try {
          if (!ref) throw new Error("O negócio ainda não está gravado na base.");
          const { data, error } = await supabase.rpc("obra_encomendar_materiais" as never, { p_org: org, p_negocio: ref.id, p_motivo: motivo,
            p_linhas: linhas.map((l) => ({ produto: l.produto, q: l.q, n: l.n, tarefa: l.tarefa })) } as never);
          if (error) throw new Error(error.message);
          // 30/10 (20270101400000): cada material é uma linha da encomenda de cliente; o stock reserva-se primeiro (reservadas)
          const r = (data ?? {}) as { encomendas?: { numero: string; fornecedor: string | null }[]; fora?: { n: string; motivo: string }[]; reservadas?: number };
          const pos = r.encomendas ?? [], fora = r.fora ?? [], reservadas = r.reservadas ?? 0;
          if (reservadas) avisar({ msg: "Materiais novos reservados para a obra", sub: `${reservadas} ${reservadas === 1 ? "material havia" : "materiais havia"} em stock: ficam reservados para esta obra.`, kind: "ok" });
          if (pos.length) avisar({ msg: "Materiais novos pedidos ao fornecedor", kind: "ok",
            sub: `${pos.map((p) => `${p.numero}${p.fornecedor ? `, ${p.fornecedor}` : ""}`).join(" · ")} · a aprovar por Compras e armazém` });
          if (fora.length) {
            avisar({ msg: "Materiais sem fornecedor", sub: `${fora.map((x) => `${x.n} (${x.motivo})`).join(" · ")}. Ligue um fornecedor preferido no Catálogo.`, kind: "bad", atraso: 300 });
            run(() => desfazerAjusteReal(d, linhas.filter((l) => fora.some((x) => x.n === l.n))));
          }
          const relidos = await lerNegocios(supabase, org, ids.current, S.campos, { semSugestoes: soExecucaoRef.current });
          await carregarEncomendas(relidos);
        } catch (e) {
          avisar({ msg: "Os materiais novos não foram pedidos", sub: (e as Error).message, kind: "bad" });
          run(() => desfazerAjusteReal(d, linhas));
        }
      })();
    });
    return () => { definirAjusteReal(null); definirMateriaisReais(null); };
  }, [org, avisar, carregarEncomendas, run]);

  // 29/10 (visto no teste no browser): como na V1 (PrototipoNegocios), o "pulse" acende a secção uma vez e desliga-se. Sem isto, um
  // "Fechar levantamento" com campos em falta deixava o pulse "falta" ligado e a página voltava sempre ao primeiro passo com falta
  // (não se conseguia abrir outro passo); e os negócios novos deixam de estar marcados como "frescos" depois de se mostrarem.
  useEffect(() => {
    const alvo = S.pulse;
    if (!alvo) return;
    S.pulse = null;
    document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: alvo === "verif" ? "center" : "start" });
  });
  useEffect(() => { S.deals.forEach((d) => (d.fresh = false)); });

  // 29/10: como na V1, o pagamento valida-se sozinho a partir do Eticadata (a ponte erp-fatura): as faturas por pagar leem-se a cada
  // 2 minutos; sem o ERP ao alcance, volta a tentar de 10 em 10 minutos, sem avisos. Só para quem pode validar pagamentos e nunca no técnico.
  useEffect(() => {
    if (!pronto) return;
    let t = 0, parado = false;
    const volta = async () => {
      const porPagar = S.deals.filter((d) => d.fin.fatura?.n && !d.fin.pago && !d.perdido);
      let proxima = 10 * 60_000;
      if (porPagar.length && S.role !== "tecnico" && podeNeg(S.role, "finance.validate_payment")) {
        const r = await lerFaturaErp(porPagar[0].fin.fatura!.n);
        if (parado) return;
        if ("info" in r || r.motivo === "nao_existe") { run(() => porPagar.forEach((d) => A.verificarErp(d.id, true))); proxima = 2 * 60_000; }
      }
      t = window.setTimeout(() => { void volta(); }, proxima);
    };
    t = window.setTimeout(() => { void volta(); }, 5_000);
    return () => { parado = true; window.clearTimeout(t); };
  }, [A, S, pronto, run]);

  // 29/10: "Editar os dados do cliente" (menu do negócio) também muda o contacto do CRM: o nome, o email e o telefone principais da ficha
  // da pessoa (anew_entities). O resto (NIF, morada da obra) fica no negócio e grava-se com ele.
  // 4/11: na fase Lead, «O que veio na lead» grava na pessoa (gravarDadosDaLead); as fontes e os comerciais para escolher
  const [fontesLead, setFontesLead] = useState<FonteLead[]>([]);
  const [comerciaisLead, setComerciaisLead] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!org) return;
    let vivo = true;
    void lerComerciais(org).then((c) => { if (vivo) setComerciaisLead(c.users.map((u) => ({ id: u.id, name: u.name }))); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [org]);
  useEffect(() => definirGuardarDadosLead(async (d, m) => {
    if (!org || !d.dadosLead) throw new Error("Não foi possível gravar: o negócio não tem pessoa.");
    return gravarDadosDaLead(supabase, org, d.dadosLead, m);
  }, { fontes: fontesLead, comerciais: comerciaisLead }), [org, fontesLead, comerciaisLead]);

  // 4/11: «Morada de quem pede» (fase Lead): lê e grava a morada da ficha do cliente (a da obra é outra e grava-se com o negócio)
  useEffect(() => definirMoradaDaEntidade({
    ler: async (entityId) => {
      const m = await lerMoradaDaEntidade(supabase, entityId);
      return m ? { rua: m.morada, cp: m.cp, localidade: m.localidade, fracao: m.fracao } : null;
    },
    gravar: async (entityId, m) => {
      if (!org) throw new Error("Não foi possível gravar: falta a organização.");
      return gravarMoradaPrincipal(entityId, org, m);
    },
  }), [org]);

  useEffect(() => definirGuardarCliente((d, x, mudou, o) => {
    const ref = refs.current.get(d.id);
    if (!ref) return;
    void (async () => {
      if (mudou.includes("nome")) {
        const { error } = await (supabase.from("anew_entities" as never) as unknown as { update: (r: object) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } })
          .update({ display_name: x.nome.trim() }).eq("id", ref.entityId);
        if (error) throw new Error(error.message);
      }
      // com o acesso a seguir para o portal, é esse envio que põe o email no contacto (garantirEmailDoContacto)
      if (mudou.includes("email") && x.email.trim() && !o.portal) await linkEntityEmail(ref.entityId, x.email.trim().toLowerCase());
      if (mudou.includes("telefone") && x.telefone.trim()) await linkEntityPhone(ref.entityId, x.telefone.trim());
      avisar({ msg: "Dados do cliente gravados", sub: "No negócio e no contacto do CRM", kind: "ok" });
    })().catch((e: Error) => avisar({ msg: "O contacto do CRM não ficou atualizado", sub: e.message, kind: "bad" }));
  }), [avisar]);

  // a letra da Emylia (Lexend)
  useEffect(() => {
    if (document.getElementById("pn-lexend")) return;
    const l = document.createElement("link");
    l.id = "pn-lexend"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);

  // 28/10: a equipa da agenda (os técnicos do RH e quem entrou, com o papel do "A ver como") e o técnico da conta (o Hoje do técnico fica
  // no dele). Ao sair da página, a agenda volta a não ter equipa real nem ausências.
  const minha = useMinhaPessoa();
  // o nome de quem entrou: o da ficha do RH; sem ficha, o da conta (anew_users), para as visitas com o nome dele lhe aparecerem na agenda
  const [nomeConta, setNomeConta] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const id = await resolveCurrentBusinessUserId();
      if (!id) return;
      const { data } = await (supabase.from("anew_users" as never) as unknown as { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { name: string | null; email: string | null } | null }> } } })
        .select("name, email").eq("id", id).maybeSingle();
      if (vivo && data) setNomeConta(data.name?.trim() || data.email?.split("@")[0] || null);
    })().catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  // 30/10: sem ler o RH (sem permissão nele), a pessoa vem da conta pelos papéis (neg_meus_papeis)
  const eu = minha.loading ? null : { pessoaId: minha.pessoaId ?? meus?.pessoa?.id ?? null, nome: minha.nome ?? meus?.pessoa?.nome ?? nomeConta ?? "Eu" };
  nomeEu.current = eu && eu.nome !== "Eu" ? eu.nome : "";
  const tecConta = pronto ? tecnicoDaConta(S.tecnicos ?? [], eu) : null;
  useEffect(() => {
    if (!pronto) return;
    definirEquipaReal(equipaReal(S.tecnicos ?? [], eu, S.role));
  }, [pronto, S, S.role, eu?.pessoaId, eu?.nome]); // eslint-disable-line react-hooks/exhaustive-deps -- eu é recriado a cada render
  useEffect(() => () => { definirEquipaReal(null); aplicarAgenda([]); definirRhDaAgenda(null); definirEncomendasReais(null); definirVisitasCrm(null); }, []);
  // 28/10: o modo real da V1 (2.0): o portal com a conta real e o email do cliente obrigatório, e a leitura do Eticadata pela ponte
  useEffect(() => {
    if (!org) return;
    definirModoReal(org, activeCompany?.name ?? "");
    const desligar = definirCriadorContas((e) => {
      if (e.conta.tipo !== "cliente") return;
      definirResultadoConta(e.n, { fase: "a criar" });
      marcarContaPortal(S, e, { fase: "a criar" });
      filaPortal.current.push(e);
    });
    return () => { desligar(); definirModoReal(null); };
  }, [org, activeCompany?.name, S]);
  if (tecConta && S.tec !== tecConta) S.tec = tecConta;
  // 09/11: quem só pode ser o técnico (sem ver todos) fica sempre fixo no seu, mesmo sem técnico ligado (null: o aviso), e nunca vê o de outro
  const fixarTecnico = !!tecConta || (!!meus && !meus.todos && S.role === "tecnico");
  // 09/11: cada separador só aparece a quem tem a permissão dele (perfil OU papel OU admin): o Hoje sempre; os Negócios (e a ficha) com
  // pessoas.view; as Operações com negocios.obra.executar ou negocios.obra.planear. As outras vistas (que abrem páginas reais) não se tocam.
  const vistaPermitida = (v: Vista): boolean =>
    v === "negocios" || v === "negocio" ? pode("pessoas.view")
      : v === "operacoes" ? pode("negocios.obra.executar") || pode("negocios.obra.planear")
      : true;
  // numa vista que não pode ver (o endereço, o menu, uma ligação dentro de um ecrã), fica no Hoje; só com as permissões lidas
  if (codigosLidos && !permsPerfilALer && !vistaPermitida(S.view)) { S.view = "hoje"; S.deal = null; S.op = null; }
  const ctx: Ctx = { S, A, run, go, q, setQ, ...(fixarTecnico ? { tecnicoFixo: { ref: tecConta } } : {}),
    podeCriarNegocio: pode("pessoas.create"), podeVerNegocio: pode("pessoas.view"), podeVerInventario: podeRota("client_orders.view"),
    podeVerCatalogo: podeRota("services.view"),
    idNegocioBase: (numero) => refs.current.get(numero)?.id ?? null,
    ...(soExecucao ? { leituraReduzida: true } : {}) };
  // 09/11: o perfil de técnico de obra sem a conta ligada a uma pessoa do RH: sem papel, o aviso de ligar a conta em vez do erro
  const semContaLigada = !!meus && !meus.todos && !meus.pessoa && meus.papeis.length === 0 && tecnicoPorPerfil;
  const doCrm = S.view === "negocio" && S.deal != null && soLeitura.current.has(S.deal);
  const faltaAqui = S.view === "negocio" && S.deal != null && !doCrm ? faltaDoNegocio(S.deal) : null;
  const comOComercialAqui = faltaAqui !== null;

  if (isLoading) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!org) return <div className="p-6">Escolha uma organização para ver os negócios.</div>;
  return (
    // 04/11/2026: a permissão real de mandar a proposta / o contrato ao portal, para os botões dos passos (permPortalPasso.tsx)
    <PermPortalNegocios>
    <div className="pn calma pg-root min-h-full bg-background">
      {/* 9/11 (Rúben, telemóvel): o papel e o estado da gravação numa linha; as vistas numa fila que desliza na sua própria largura
          (antes alargavam a página toda para 563 px e o ecrã fugia para o lado ao arrastar) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-[15px] sm:justify-between sm:gap-3">
        <label className="flex min-w-0 items-center gap-2">
          <span className="hidden text-muted-foreground sm:inline">A ver como</span>
          <select aria-label="A ver como" className="min-h-10 max-w-[60vw] rounded-lg border border-input bg-card px-3 sm:max-w-none" value={S.role}
            onChange={(e) => run(() => { S.role = escolhaRef.current = e.target.value as Papel; })}>
            {(meus ? papeisPermitidos(meus) : (Object.keys(PAPEIS) as Papel[])).map((p) => <option key={p} value={p}>{PAPEIS[p].n}</option>)}
          </select>
        </label>
        <nav aria-label="Vistas" className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
          {SEPARADORES.filter(([v]) => vistaPermitida(v)).map(([v, nome]) => {
            const ativo = S.view === v || (v === "negocios" && S.view === "negocio");
            return (
              <button key={v} type="button" aria-current={ativo ? "page" : undefined} onClick={go(() => A.nav(v))}
                className={"min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 " + (ativo ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
                {nome}
              </button>
            );
          })}
          {LIGACOES.filter(([, , codigo]) => podeRota(codigo)).map(([nome, para]) => (
            <button key={para} type="button" onClick={() => navigate(para)} className="min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 text-muted-foreground hover:bg-muted">{nome}</button>
          ))}
        </nav>
        <span role="status" aria-live="polite" className="ml-auto min-w-0 text-sm sm:ml-0 sm:text-[15px]">
          {gravacao.k === "a-gravar" && <span className="text-muted-foreground">A gravar…</span>}
          {gravacao.k === "gravado" && <span className="text-muted-foreground">Gravado</span>}
          {gravacao.k === "erro" && <span className="text-destructive">Não gravou: {gravacao.t}</span>}
        </span>
      </div>
      {erroLer ? (semContaLigada ? <SemTecnicoLigado /> : <p className="p-6 text-destructive">{erroLer}</p>)
        : perms.leitura.k === "falhou" ? (
          <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[15px]">
            <span className="text-destructive">Não foi possível ler as suas permissões nos negócios: sem elas, os negócios não abrem.</span>
            <button type="button" onClick={perms.repetir} className="min-h-10 rounded-lg border border-input bg-card px-3 font-medium hover:bg-muted">Tentar de novo</button>
          </div>
        )
        : !pronto || perms.leitura.k === "a-ler" ? <p className="p-6 text-muted-foreground">A ler os negócios…</p>
        : S.view === "hoje" ? (S.role === "tecnico" ? <HojeTecnico {...ctx} /> : <HojeSimples {...ctx} />)
        : S.view === "operacoes" ? <OperacoesSimples {...ctx} />
        : S.view === "negocio" && S.deal && S.deals.some((d) => d.id === S.deal) ? <>
            {doCrm && (
              <p role="alert" className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">
                {catalogoFalhou.current
                  ? "O Catálogo não carregou: o negócio fica só para consulta; o que mudar neste ecrã não se grava. Volte a abrir a página."
                  : "Este negócio é do CRM: abra-o em Contratos/Propostas. Aqui fica só para consulta; o que mudar neste ecrã não se grava."}
              </p>
            )}
            {comOComercialAqui && (
              <p role="status" className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">{avisoDaFase(faltaAqui as string)}</p>
            )}
            <NegocioSimples {...ctx} ajustarPassos={(passos, d) => {
              const r = refs.current.get(d.id), c = { negocioId: r?.id ?? null, ctx, d, podeEditar: !doCrm && !comOComercialAqui };
              return comVisitasDoCrm(comTemplatesNosPassos(passos, c), { ...c, entityId: r?.entityId ?? null });
            }} />
          </>
        : <NegociosSimples {...ctx} />}
      <div className="toasts" aria-live="polite">
        {toasts.slice(-2).map((t) => (
          <div key={t.id} className={"toast " + (t.kind || "")} role="status">
            <i>{t.kind === "ok" ? "✓" : t.kind === "auto" ? "⚡" : t.kind === "bad" ? "!" : "i"}</i>
            <div>{t.msg}{t.sub ? <small>{t.sub}</small> : null}</div>
            {t.act ? <button onClick={() => { t.act!.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.act.label}</button> : <span />}
          </div>
        ))}
      </div>
    </div>
    </PermPortalNegocios>
  );
}
