// Protótipo de Negócios (08/10/2026): dados de exemplo e regras.
// Nada daqui lê ou escreve na base de dados; o estado vive no browser.
// É a passagem para React de docs/negocios-2026-10-08/prototipo.html.

import { diferencas, fimDe, guardarBase, mudarDuracao, mudarHoras, mudarInicio, reporBase, type BaseTarefa } from "./ajustesPlano";
import { faltaParaFeita, fotoExemplo, type EntradaDiario, type ExecTarefa } from "./obraOps";
import { aplicarAjuste, aplicarCorrecao, instrucoesDe, preverAjuste, textoAvisoCliente, type Alteracao, type AjusteVivo, type Envio } from "./trabalhoObra";
import { itemCatalogo } from "./catalogo";
import {
  ativosDoPacote, catalogoLigado, emFaltaProdutos, fotografia, juntarProduto, linhasClienteCompra, linhasDosProdutos, marcarCliente, materiaisDoModelo,
  mudarQtd, precoProduto, servicosDaVisita, textoFalta, textoProduto, tirarProduto, trazidosParaOrc, PREFIXO_CLIENTE, PREFIXO_PROD, type NecVisita, type ProdVisita,
} from "./produtosVisita";
import type { Produto } from "./v2/catalogoModelo";
import { volumesDasLinhas } from "./entulhoPadrao";
import { faltaParaEncerrar } from "./encerrarObra";
import { ARTIGOS_DEM0, LINHA_DEMOLICAO, PAR_DEM0, calcularDemolicao, fatorAcesso, itensDasLinhas, type AjustesDem, type ChaveAjuste, type ItemDem, type ResultadoDem } from "./entulho";
import { ajustePrazo, prazoProposta, tarefasPrevistas } from "./ganttOrcamento";
import { PAGAMENTO_FASES, diasDaObra, iniciosRapidos, isoDia, planoObra, prestacoes, realPorFase, sugerirPorFases, type ObraReal } from "./planoObra";
import { diasAdenda, juntarAoPlano, linhaAdenda, totalAdenda, type Adenda } from "./adendas";
import { faltaParaArrancar, gerarEncCliente, passosAgora, inicioDoPlano, planoDoOrcamento, rotuloDia, type EcAjuste, type EncCliente } from "./preparacaoObra";
import { avisarTecnico, criarTarefa, juntarTarefa, materiaisDaTarefa, materiaisDoServico, moverTarefa, tirarTarefa, type NovaTarefa } from "./tarefasValidador";
import { anularAjustesDaTarefa, encomendarAjustes } from "./encomendasAjuste";
import { anularEcNoInventario, emitirNoInventario, idEcNegocio, pedidoDoNegocio, refNegocio, resumoEcNegocio, textoResumoEc } from "./inventario/ponteNegocios";
import { SEM_PERM, podeNeg, type PermNeg } from "./permissoes";
import { lerVersao } from "./versaoPrototipo";
import { lerInventario, pedirAbrirEcInv, pedirRececaoClienteInv } from "./inventario/loja";
import { CAMPOS_COM_EFEITO, PREFIXO_LEV, efeitosDoLevantamento } from "./efeitosLevantamento";
import { AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, efetivo, emFalta, grupoVisita, type CfgCampos, type Grupo } from "./campos";
import { chaveBase, divisaoPrincipal, divisoesEscolhidas, gruposArea, juntarDivisoes, prefixoDivisao, reorganizarDivisoes } from "./campos";

export const ESTR = 5.06; // €/h de estrutura (exemplo)

export type Papel = "comercial" | "direcao" | "financeiro" | "armazem" | "operacoes" | "juridico" | "tecnico";
export const PAPEIS: Record<Papel, { n: string; av: string; nome: string }> = {
  comercial: { n: "Rúben · Comercial", av: "RB", nome: "Rúben" },
  direcao: { n: "Direção", av: "DI", nome: "Direção" },
  financeiro: { n: "Sandra · Financeiro", av: "SA", nome: "Sandra" },
  armazem: { n: "Nuno · Armazém", av: "NU", nome: "Nuno" },
  operacoes: { n: "Filipe · Operações", av: "FI", nome: "Filipe" },
  // 15/10: revê e valida o contrato quando o cliente pede alterações a cláusulas (RevisaoContrato.tsx)
  juridico: { n: "Inês · Jurídico", av: "IN", nome: "Inês" },
  // 21/10: o técnico na obra faz tudo pelo Hoje dele (HojeTecnico.tsx); qual técnico é escolhe-se lá (Estado.tec)
  tecnico: { n: "Técnico de obra", av: "TE", nome: "Técnico" },
};

export const FASES = ["Lead", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"];

/** Os do pacote têm nome curto (demol, canal…); os do Catálogo têm o id do Catálogo (c1, c2…). */
export type SvcId = string;
export interface Servico {
  n: string;
  un: string;
  h: number;
  eh: number;
  eq: number;
  cons: number;
  preco: number;
  perfil: string;
  semCusto?: boolean;
  stale?: string | null;
}

const SVC0: Record<string, Servico> = {
  demol: { n: "Demolição e entulho", un: "m²", h: 0.5, eh: 25, eq: 0.33, cons: 1.2, preco: 25.48, perfil: "Servente · demolição" },
  canal: { n: "Canalização", un: "pt", h: 2, eh: 25, eq: 0.34, cons: 8.47, preco: 106.05, perfil: "Canalizador" },
  revest: { n: "Revestimento de parede", un: "m²", h: 0.75, eh: 25, eq: 0, cons: 1.01, preco: 26.0, perfil: "Ladrilhador", semCusto: true, stale: "O cimento-cola tem o preço de há 8 meses." },
  pav: { n: "Pavimento cerâmico", un: "m²", h: 0.85, eh: 25, eq: 0, cons: 0.66, preco: 40.32, perfil: "Ladrilhador" },
  loucas: { n: "Montagem de louças", un: "pç", h: 1.35, eh: 25, eq: 0, cons: 1.21, preco: 64.29, perfil: "Canalizador" },
  moveis: { n: "Montagem de móveis", un: "mód", h: 2.5, eh: 25, eq: 0, cons: 2, preco: 118.7, perfil: "Montador" },
  eletr: { n: "Pontos elétricos", un: "pt", h: 1.5, eh: 25, eq: 0.2, cons: 6, preco: 78, perfil: "Eletricista" },
  teto: { n: "Teto falso em pladur", un: "m²", h: 0.9, eh: 25, eq: 0.3, cons: 9.8, preco: 58, perfil: "Montador" },
  pint: { n: "Pintura de tetos e paredes", un: "m²", h: 0.3, eh: 25, eq: 0, cons: 2.1, preco: 17.5, perfil: "Pintor" },
};

export type MedKey = "pav" | "par" | "pts" | "pcs";
/** pts é o total dos pontos de água (o que os serviços usam); ptf / ptq são os pontos de água fria e quente pedidos na visita (13/10). */
export type Medidas = Record<MedKey, number> & { ptf?: number; ptq?: number };
export type StockKey = "cp" | "pv" | "san" | "base" | "cim" | "mov" | "banc";
export type LinhaId = "wc" | "coz";

interface LinhaServico {
  n: string;
  modelo: string;
  nec: string[];
  mat: MateriaisModelo;
  map: [SvcId, MedKey][];
  med: Partial<Record<MedKey, string>>;
  mats: [string, string, (m: Medidas) => number, StockKey][];
}

/** Uma parte da estimativa de materiais do modelo: o peso no total, o ramo do Catálogo cujos produtos a cobrem
 *  (ofício › sub) e os serviços cuja resposta "o cliente mantém" a tira. Sem ramo, nunca é coberta (colas, pequeno material). */
export interface ParteMateriais { d: string; peso: number; ramo?: [string, string?]; manter?: SvcId[] }
export interface MateriaisModelo { d: string; custo: number; preco: number; partes?: ParteMateriais[] }

export const LINHAS: Record<LinhaId, LinhaServico> = {
  wc: {
    n: "Casa de banho", modelo: "WC com base de duche", nec: ["Base de duche", "Sanita suspensa", "Banheira", "Móvel 80 cm"],
    mat: {
      d: "cerâmico, louças, base, torneiras", custo: 1400, preco: 2168,
      // a divisão da estimativa (exemplo, a confirmar com a Mudelar)
      partes: [
        { d: "cerâmico de parede", peso: 0.25, ramo: ["Revestimentos", "Parede"] },
        { d: "pavimento", peso: 0.15, ramo: ["Revestimentos", "Pavimento"], manter: ["pav", "c6"] },
        { d: "louças, base e torneiras", peso: 0.5, ramo: ["Canalização", "Louças e torneiras"], manter: ["loucas", "c13", "c17"] },
        { d: "colas e pequeno material", peso: 0.1 },
      ],
    },
    map: [["demol", "pav"], ["canal", "pts"], ["revest", "par"], ["pav", "pav"], ["loucas", "pcs"]],
    med: { pav: "Pavimento (m²)", par: "Paredes (m²)", pts: "Pontos de água", pcs: "Vasos sanitários" },
    mats: [
      ["Cerâmico de parede 30×60", "m²", (m) => Math.ceil(m.par * 1.1), "cp"],
      ["Pavimento cerâmico 60×60", "m²", (m) => Math.ceil(m.pav * 1.1), "pv"],
      ["Sanita suspensa com estrutura", "un", () => 1, "san"],
      ["Base de duche 80×120", "un", () => 1, "base"],
      ["Cimento-cola · saco 25 kg", "sacos", (m) => Math.ceil((m.par + m.pav) / 4), "cim"],
    ],
  },
  coz: {
    n: "Cozinha", modelo: "Cozinha linear", nec: ["Bancada em pedra", "Ilha", "Eletrodomésticos", "Mudar canalização"],
    mat: {
      d: "móveis, bancada, torneira", custo: 3800, preco: 5890,
      partes: [
        { d: "móveis e bancada", peso: 0.7, ramo: ["Carpintaria", "Mobiliário"], manter: ["moveis"] },
        { d: "cerâmico de parede", peso: 0.1, ramo: ["Revestimentos", "Parede"] },
        { d: "pavimento", peso: 0.1, ramo: ["Revestimentos", "Pavimento"], manter: ["pav", "c6"] },
        { d: "torneira e pequeno material", peso: 0.1 },
      ],
    },
    map: [["demol", "pav"], ["canal", "pts"], ["revest", "par"], ["pav", "pav"], ["moveis", "pcs"]],
    med: { pav: "Pavimento (m²)", par: "Paredes (m²)", pts: "Pontos de água", pcs: "Módulos" },
    mats: [
      ["Cerâmico de parede 30×60", "m²", (m) => Math.ceil(m.par * 1.1), "cp"],
      ["Pavimento cerâmico 60×60", "m²", (m) => Math.ceil(m.pav * 1.1), "pv"],
      ["Conjunto de móveis de cozinha", "un", () => 1, "mov"],
      ["Bancada em pedra", "un", () => 1, "banc"],
      ["Cimento-cola · saco 25 kg", "sacos", (m) => Math.ceil((m.par + m.pav) / 4), "cim"],
    ],
  },
};

export interface Tecnico {
  id: string; n: string; sk: string;
  /** Os dias de férias nos planos de exemplo (índice do dia, DIAS). */
  ferias: number[];
  /** As férias em datas reais ("aaaa-mm-dd"), para os planos do orçamento (14/10). */
  feriasDatas?: string[];
}
export const TECS: Tecnico[] = [
  { id: "js", n: "João Silva", sk: "Servente · demolição", ferias: [] },
  { id: "ra", n: "Rui Alves", sk: "Servente · demolição", ferias: [] },
  { id: "ma", n: "Marco Antunes", sk: "Canalizador", ferias: [] },
  // férias de exemplo: no plano de exemplo, o 4.º dia; em datas reais, 21 a 23 de outubro
  { id: "sf", n: "Sérgio Faria", sk: "Ladrilhador", ferias: [3], feriasDatas: ["2026-10-21", "2026-10-22", "2026-10-23"] },
  { id: "hn", n: "Hugo Neves", sk: "Ladrilhador", ferias: [] },
  { id: "pm", n: "Paulo Mota", sk: "Montador", ferias: [] },
];
const REAL: Record<string, number> = { demol: 0.93, canal: 0.97, revest: 1.23, pav: 1.05, loucas: 0.96, moveis: 1.02, eletr: 1, teto: 1.04, pint: 0.98 };
export const DIAS = ["seg 13/10", "ter 14/10", "qua 15/10", "qui 16/10", "sex 17/10", "seg 20/10", "ter 21/10", "qua 22/10", "qui 23/10", "sex 24/10",
  // os planos do orçamento (14/10) podem passar das duas semanas: os dias úteis seguintes
  ...Array.from({ length: 30 }, (_, k) => { const t = new Date(2026, 9, 27 + Math.floor(k / 5) * 7 + (k % 5)); return ["seg", "ter", "qua", "qui", "sex"][k % 5] + " " + t.getDate() + "/" + (t.getMonth() + 1); })];
export const SLOTS = ["qui 15/10 · 10:00", "qui 15/10 · 15:00", "sex 16/10 · 09:30"];

export type LinhaOrc =
  | { t: "svc"; sid: SvcId; q: number; cu: number; pu: number }
  | { t: "mat"; d: string; custo: number; preco: number };

export interface Orcamento {
  modelo: string;
  linhas: LinhaOrc[];
  desconto: number;
  vendaDireta: boolean;
  verif: boolean;
  aprov: null | "pedida" | "ok";
  enviada: string | null;
  aceite: string | null;
  contrato: null | "enviado" | "assinado";
  /** 15/10: como o cliente assinou o contrato no portal (desenho no ecrã ou Chave Móvel Digital). Os exemplos antigos não a têm. */
  assinatura?: Assinatura | null;
  avisosVistos: Record<string, boolean>;
  /** Preços de linhas de materiais mudados à mão, pela descrição: as linhas refeitas (levantamento, modelo, produtos) guardam-nos. */
  precosMan?: Record<string, number>;
  /** Demolição e entulho (orçamentos novos, com o Catálogo ligado): os artigos, os ajustes à mão e o último cálculo (entulho.ts). */
  demolicao?: { itens: ItemDem[]; aj: AjustesDem; r?: ResultadoDem };
  /** A demolição foi desligada à mão: o entulho dos serviços já não a liga sozinho (14/10). */
  semDemolicao?: true;
  /** O prazo previsto mudado à mão: os dias de cada tarefa (pelo id do serviço, ou "demolicao"); ganttOrcamento.ts. */
  prazo?: Record<string, number>;
  /** O início previsto da obra ("aaaa-mm-dd"), para pôr o plano em datas (planoObra.ts). Sem ele, a próxima segunda-feira. */
  inicioObra?: string;
  /** As prestações do plano "Por fases" (planoObra.ts: sugerirPorFases), guardadas quando se escolhe. */
  pagFases?: { l: string; p: number; fase: 0 | 1 | 2 | 3 | 4 | "fim" }[];
  /** Pessoas por ofício no plano da obra (1 por omissão; 2 = reforço: menos dias, as mesmas horas). */
  equipa?: number;
  /** As versões anteriores da proposta (14/10): enviadas ao cliente e substituídas a pedido dele. A atual é a versoes.length + 1. */
  versoes?: VersaoProposta[];
  /** 15/10: o cliente pediu alterações no portal (os motivos e o que mudaria). O comercial vê-o como próximo passo
   *  e a nova versão começa já com isto; limpa-se quando a nova versão começa ou o cliente aceita. */
  pedidoCliente?: { motivos: string[]; nota?: string; q: string } | null;
  /** 15/10: o cliente recusou a proposta por completo no portal. */
  recusada?: { motivos: string[]; nota?: string; q: string } | null;
  /** 15/10: o cliente pediu alterações a cláusulas do contrato no portal: espera pela revisão e validação do Jurídico. */
  contratoPedido?: { clausulas: PedidoClausula[]; q: string } | null;
  /** As versões do contrato substituídas a pedido do cliente (a atual é contratoVersoes.length + 1). */
  contratoVersoes?: { n: number; substituido: string; pedido: PedidoClausula[]; revisto?: { por: string; q: string } }[];
  /** O texto das cláusulas que o Jurídico reescreveu (pelo título da cláusula); as outras ficam as do modelo. */
  clausulas?: Record<string, string>;
  /** Quem do Jurídico reviu e validou a versão atual, e quando. */
  contratoRevisto?: { por: string; q: string } | null;
}
/** O que o cliente pediu numa cláusula do contrato: o título da cláusula e o que não lhe agrada. */
export interface PedidoClausula { c: string; nota: string }
/** A assinatura do contrato pelo cliente (15/10): desenhada no ecrã (a imagem PNG) ou com a Chave Móvel Digital (simulada no protótipo). */
export interface Assinatura {
  tipo: "desenho" | "digital";
  /** desenho: a imagem (data URL PNG) */
  imagem?: string;
  nome: string;
  /** quando, "dd/mm/aaaa hh:mm" */
  q: string;
  /** digital: o identificador da assinatura */
  id?: string;
  /** digital: o telemóvel, mascarado (ex.: "9•• ••• 123") */
  telemovel?: string;
}
/** O auto de receção da obra (15/10): gera-se ao registar o fim da obra e o cliente assina-o no portal (AutoRececao.tsx).
 *  Assinado, começa a garantia e o cliente recebe o relatório da obra. */
export interface AutoRececao {
  n: string; q: string; estado: "por assinar" | "assinado";
  /** o que o cliente deixou como observação ao receber a obra (vazio: "está tudo bem") */
  reservas?: string;
  assinatura?: Assinatura;
  /** quando foi assinado ("dd/mm/aaaa hh:mm") */
  assinado?: string;
}
/** Uma proposta enviada e substituída: o que se enviou, quando, por quanto e porque se refez. */
export interface VersaoProposta { n: number; enviada: string; /** se o cliente já a tinha aceite */ aceite?: string; substituida: string; total: number; /** 21/10: com IVA */ totalIva?: number; motivos: string[]; nota?: string; onde: "orcamento" | "visita";
  /** 21/10: os produtos e as partes tiradas da estimativa nesta versão (para mostrar o que mudou e repor). */
  prod?: ProdVisita[]; semParte?: string[] }
/** O que o cliente costuma pedir quando quer mudar a proposta (os botões da "Nova versão"). */
export const MOTIVOS_VERSAO = ["Outros materiais", "Juntar ou tirar trabalhos", "Baixar o preço", "Outras datas", "Outra forma de pagamento"] as const;
/** Porque o cliente recusa a proposta por completo (no portal). */
export const MOTIVOS_RECUSA = ["O preço", "Escolhi outra empresa", "Já não vou fazer a obra", "O prazo", "Outro motivo"] as const;
/** Os motivos de um pedido de alteração que mexem na visita (necessidades e produtos), e não só no orçamento. */
export const MOTIVOS_DA_VISITA: readonly string[] = ["Outros materiais", "Juntar ou tirar trabalhos"];
/** O número da proposta que está em cima da mesa (1 se nunca se refez). */
export const versaoAtual = (o: Orcamento) => (o.versoes?.length ?? 0) + 1;
export interface Tarefa { nome: string; svcs: SvcId[]; dia: number; dur: number; sk: string; h: number; tec: string | null; /** a fase da obra (planos do orçamento) */ fase?: number;
  /** 15/10: uma nota das Operações para a equipa (ex.: "levar o andaime") */ nota?: string;
  /** 15/10: o que o técnico registou (horas, fotografias) e a validação do supervisor (obraOps.ts) */ exec?: ExecTarefa;
  /** 21/10: uma tarefa de correção (pedida ao recusar a validação): o índice da tarefa que corrige (trabalhoObra.ts) */ corrige?: number;
  /** 21/10: juntada pelo validador do plano (tarefasValidador.ts): a quantidade do serviço e os materiais escolhidos */ nova?: true; q?: number; mats?: MatTarefa[];
  /** 21/10: os materiais desta tarefa já encomendados (pelo nome) e as encomendas de ajuste onde foram (encomendasAjuste.ts) */ encomendado?: MatTarefa[]; ecs?: string[] }
/** 21/10: um material de uma tarefa (da receita do serviço, ou juntado à mão). */
export interface MatTarefa { n: string; q: number; un: string; preco?: number; forn?: string }
/** 21/10: uma mensagem da conversa da obra (cliente ↔ empresa). */
export interface MensagemObra { de: "cliente" | "empresa"; quem: string; t: string; q: string; lida?: boolean; foto?: string }
export interface Plano {
  tasks: Tarefa[]; estado: "por aprovar" | "aprovado" | "em curso" | "concluída"; dia: number;
  /** Gerado do plano do orçamento (preparacaoObra.ts), com o início previsto ("aaaa-mm-dd"). */
  origem?: "orcamento"; inicio?: string;
  /** 15/10: o plano como veio do orçamento, guardado antes do primeiro ajuste das Operações (ajustesPlano.ts) */
  base?: BaseTarefa[];
  /** 21/10: os avisos aos técnicos quando o gestor cria ou muda uma tarefa (tarefasValidador.ts: avisarTecnico); aparecem no Hoje do técnico. */
  avisos?: AvisoTec[];
}
export interface AvisoTec { tec: string; ti: number; t: string; q: string; lido?: string }
export interface MatObra { n: string; un: string; k: StockKey; q: number; res: number; falta: number }
export interface Real { tasks: { nome: string; prev: number; real: number }[]; custoReal: number; m: number }
export interface Evento { t: string; q: string; k: "a" | "w" | "x" }

export interface Negocio {
  id: number;
  nome: string;
  tel: string;
  linha: LinhaId;
  servico: string;
  local: string;
  origem: string;
  quando: string;
  dono: Papel;
  fase: number;
  perdido: boolean;
  /** Porque se perdeu (ex.: o que o cliente disse ao recusar no portal). */
  motivoPerda?: string;
  /** 19/10: o contrato (ou a venda direta) anulado depois de assinado: pela Direção, no negócio, ou com a encomenda de cliente eliminada no Inventário. */
  anulado?: { q: string; por: string; motivo: string; origem: "negocio" | "inventario" };
  atraso?: boolean;
  fresh?: boolean;
  /** Valores dos campos de todas as fases (chaves em campos.ts). */
  f: Record<string, string>;
  /** Tentou passar de fase com campos em falta: o ecrã marca os campos destes grupos. */
  valida?: { fase: number; grupos: string[] } | null;
  /** Campos preenchidos pela Olyvia (sugestões): o ecrã marca-os até alguém os confirmar ou mudar. */
  sug?: Record<string, true>;
  /** As visitas do negócio (os números; os campos estão em f, com o prefixo v{n}_). */
  vis?: number[];
  /** off: serviços das medidas que o cliente não quer; extra: serviços juntados à mão, com quantidade. */
  /** prod: produtos do Catálogo escolhidos na visita; manter / clienteCompra: as respostas por serviço que obriga a produto (produtosVisita.ts). */
  visita: { slot: string; nec: string[]; med: Medidas; off: SvcId[]; extra: Partial<Record<SvcId, number>>; fotos: number; fechada: boolean;
    /** As fotografias por etapa da visita (fotos é o total). Em falta: reparte-se o total (fotosPor). */
    fotosPor?: Partial<Record<"exterior" | "interior" | "area", number>> } & NecVisita;
  orc: Orcamento | null;
  fin: { fatura: { n: string; q: string } | null; pago: boolean; recibo: { n: string; q: string } | null };
  obra: { plano: Plano | null; mats: MatObra[] | null; real: Real | null; aprendido: boolean;
    /** 15/10: o diário de obra (registos por dia) e a segurança tratada (chave → quando), obraOps.ts */
    diario?: EntradaDiario[]; seg?: Record<string, string>;
    /** A encomenda de cliente (16/10): emitida ao validar o pagamento, no Inventário novo (inventario/ponteNegocios.ts). Antes do pagamento não há. */
    ec?: EncCliente | null;
    /** 21/10: as encomendas de cliente de ajuste, depois da inicial: materiais novos de tarefas novas, adendas ou mudados à mão (encomendasAjuste.ts) */
    ecsAjuste?: EcAjuste[];
    /** O previsto e o real por fase, congelados no fim da obra: atualizar depois a receita no Catálogo não muda o histórico (planoObra.ts). */
    realFases?: ObraReal | null;
    /** 15/10: o auto de receção (por assinar → assinado) */
    auto?: AutoRececao | null;
    /** 21/10: os ajustes ao plano com a obra em curso (trabalhoObra.ts), com o aviso ao cliente quando foi avisado. */
    alteracoes?: Alteracao[];
    /** 21/10: a conversa com o cliente sobre a obra (a página da obra e o portal do cliente) */
    chat?: MensagemObra[] };
  /** Os trabalhos a mais depois do contrato assinado (adendas.ts). */
  adendas?: Adenda[];
  hist: Evento[];
}

export type Vista = "hoje" | "negocios" | "negocio" | "leads" | "pessoas" | "clientes" | "operacoes" | "inventario" | "catalogo" | "marketing" | "definicoes" | "campos" | "numeros"; // "numeros": os Números do V1 (16/10)

export interface Estado {
  v: number;
  role: Papel;
  view: Vista;
  deal: number | null;
  op: number | null;
  filtro: string;
  novo: { nome: string; tel: string; linha: LinhaId; err: string } | null;
  confirmPerda: number | null;
  pulse?: string | null;
  /** 15/10: o negócio cujo contrato o Jurídico está a rever (o editor abre por cima: RevisaoContrato.tsx). */
  revisao?: number | null;
  /** 21/10: o técnico que está a ver o Hoje (papel "tecnico"); por omissão, Hugo Neves. */
  tec?: string;
  cfg: { min: number; alvo: number; estrutura: boolean };
  /** "simples": a proposta de 09/10 com menos ruído; "atual": o aspeto de hoje da Olyvia, para comparar. */
  aspeto?: "simples" | "atual";
  /** Leitura fácil (dislexia): letra maior, mais espaço, fundo creme. */
  leitura?: boolean;
  /** Os campos à medida da empresa (editor de campos) e o modelo de setor de onde partiu. */
  campos?: CfgCampos;
  setor?: string;
  svc: Record<SvcId, Servico>;
  stock: Record<StockKey, number>;
  seq: number;
  ft: number;
  ef: number;
  rc: number;
  clientes: { nome: string; tel: string; local: string; desde: string; deal: number }[];
  /** 21/10: os dados do cliente mudados na área de Clientes (pelo nome do cliente): sobrepõem-se aos que vêm dos negócios (clientesV1Docs.ts). */
  fichas?: Record<string, Record<string, string>>;
  deals: Negocio[];
}

type NovoNegocio = Partial<Negocio> & Pick<Negocio, "id" | "nome" | "tel" | "linha">;
function novoDeal(o: NovoNegocio): Negocio {
  return {
    servico: "", local: "", origem: "site", quando: "", dono: "comercial", fase: 0, perdido: false,
    f: {},
    visita: { slot: "", nec: [], med: { pav: 0, par: 0, pts: 0, pcs: 0 }, off: [], extra: {}, fotos: 0, fechada: false },
    orc: null, fin: { fatura: null, pago: false, recibo: null }, obra: { plano: null, mats: null, real: null, aprendido: false },
    hist: [],
    ...o,
  };
}

// 7 (14/10/2026): o catálogo real da Mudelar (358 serviços, os produtos, perfis, equipamentos e consumíveis)
// 8 (14/10/2026): os c1..c41 com a receita da Mudelar; 20 produtos passam a consumíveis; mais serviços de instalação
// 9 (14/10/2026): a demolição de parede (c5) passa de ml a m², como diz o nome
// 10 (14/10/2026): as estruturas de sanita e bidé ("Kit´s para Sanitários") deixam de ser sanitas e de trazer a instalação
// 16 (16/10/2026): a encomenda de cliente deixa de nascer no contrato; emite-se no Inventário novo ao validar o pagamento
// 17 (19/10/2026): sai a encomenda a fornecedor do motor (obra.enc): os materiais vivem só no Inventário; negócios anulados (anulado)
export const VERSAO = 21;

export function seed(): Estado {
  const S: Estado = {
    v: VERSAO, role: "comercial", view: "negocios", deal: null, op: null, filtro: "meus", novo: null, confirmPerda: null,
    cfg: { min: 28, alvo: 35, estrutura: true },
    svc: structuredClone(SVC0),
    stock: { cp: 12, pv: 0, san: 0, base: 3, cim: 40, mov: 0, banc: 2 },
    seq: 1046, ft: 418, ef: 77, rc: 301,
    clientes: [
      { nome: "Tiago Almeida", tel: "913 220 410", local: "Cozinha · Almada", desde: "08/10", deal: 1027 },
      { nome: "Marta Lima", tel: "916 004 552", local: "WC · Odivelas", desde: "01/10", deal: 1022 },
    ],
    deals: [],
  };
  const D = (o: NovoNegocio) => S.deals.push(novoDeal(o));
  D({ id: 1043, nome: "Ana Martins", tel: "912 000 111", linha: "wc", servico: "Remodelação WC suite", local: "Rua das Flores 12, Sintra", origem: "site", quando: "30/09 21:40",
    f: { pedido: "Quero remodelar a casa de banho da suite." }, hist: [{ t: "Pedido pelo site", q: "30/09 21:40", k: "a" }] });
  D({ id: 1044, nome: "Pedro Lopes", tel: "927 118 300", linha: "wc", servico: "WC social", local: "Amadora", origem: "site", quando: "06/10 18:02", atraso: true,
    f: { pedido: "Trocar a banheira por duche." }, hist: [{ t: "Pedido pelo site", q: "06/10 18:02", k: "a" }] });
  D({ id: 1045, nome: "Rita Sousa", tel: "934 500 812", linha: "coz", servico: "Cozinha nova", local: "Loures", origem: "campanha de outono", quando: "08/10 08:15",
    f: { pedido: "Cozinha nova, com bancada em pedra." }, hist: [{ t: "Pedido pela campanha de outono", q: "08/10 08:15", k: "a" }] });
  D({ id: 1038, nome: "Manuel Costa", tel: "918 330 991", linha: "wc", servico: "WC social", local: "Cascais", origem: "telefone", quando: "03/10", fase: 1,
    f: { resultado: "Atendeu · interessado", orc_cliente: "Até 3.000 €", prazo: "1 a 3 meses" }, hist: [{ t: "Chamada · 4 min", q: "05/10 11:20", k: "a" }, { t: "Pedido por telefone", q: "03/10", k: "a" }] });
  D({ id: 1036, nome: "Luísa Freitas", tel: "962 774 105", linha: "coz", servico: "Cozinha", local: "Oeiras", origem: "site", quando: "01/10", fase: 2,
    visita: { slot: "qui 15/10 · 10:00", nec: ["Bancada em pedra"], med: { pav: 0, par: 0, pts: 0, pcs: 0 }, off: [], extra: {}, fotos: 0, fechada: false },
    hist: [{ t: "Visita marcada para qui 15/10 · 10:00", q: "02/10", k: "a" }] });
  D({ id: 1035, nome: "Hugo Matos", tel: "915 662 030", linha: "wc", servico: "WC suite", local: "Lisboa", origem: "recomendação", quando: "28/09", fase: 2,
    visita: { slot: "ter 06/10 · 15:00", nec: ["Base de duche", "Móvel 80 cm"], med: { pav: 5, par: 16, pts: 3, pcs: 3 }, off: [], extra: {}, fotos: 6, fechada: false },
    hist: [{ t: "Visita feita", q: "06/10 15:00", k: "a" }] });
  D({ id: 1031, nome: "Carla Nunes", tel: "938 101 777", linha: "coz", servico: "Cozinha", local: "Setúbal", origem: "site", quando: "22/09", fase: 3,
    visita: { slot: "", nec: ["Bancada em pedra"], med: { pav: 9, par: 14, pts: 2, pcs: 9 }, off: [], extra: {}, fotos: 10, fechada: true }, hist: [] });
  D({ id: 1030, nome: "Sérgio Pinto", tel: "919 440 222", linha: "wc", servico: "WC", local: "Barreiro", origem: "telefone", quando: "25/09", fase: 3,
    visita: { slot: "", nec: ["Base de duche"], med: { pav: 4, par: 14, pts: 3, pcs: 3 }, off: [], extra: {}, fotos: 5, fechada: true }, hist: [] });
  D({ id: 1027, nome: "Tiago Almeida", tel: "913 220 410", linha: "coz", servico: "Cozinha", local: "Almada", origem: "site", quando: "15/09", fase: 4,
    visita: { slot: "", nec: ["Ilha"], med: { pav: 12, par: 18, pts: 2, pcs: 12 }, off: [], extra: {}, fotos: 12, fechada: true }, hist: [] });
  D({ id: 1022, nome: "Marta Lima", tel: "916 004 552", linha: "wc", servico: "WC", local: "Odivelas", origem: "site", quando: "10/09", fase: 5,
    visita: { slot: "", nec: ["Base de duche"], med: { pav: 4, par: 15, pts: 3, pcs: 4 }, off: [], extra: {}, fotos: 8, fechada: true }, hist: [] });
  // O exemplo com tudo preenchido, da lead à obra concluída (para ver o layout inteiro)
  D({ id: 1050, nome: "Joana Ribeiro", tel: "916 480 213", linha: "wc", servico: "Remodelação WC principal", local: "Rua Morais Soares 112, Lisboa",
    origem: "recomendação", quando: "12/09 10:15", fase: 5,
    visita: { slot: "", nec: ["Base de duche", "Sanita suspensa", "Móvel 80 cm"], med: { pav: 5, par: 20, pts: 4, pcs: 4 }, off: [],
      extra: { c28: 1, c3: 1, c14: 1, c19: 1 }, fotos: 9, fechada: true },
    f: EXEMPLO_COMPLETO,
    hist: [] });
  for (const d of S.deals) d.f = { ...exemplo(d), ...d.f };
  for (const d of S.deals) {
    if (d.fase < 2 || d.vis) continue;
    const feita = d.fase >= 3 || d.id === 1035;
    criarVisita(d, visitaDoSlot(d.visita.slot || "qui 01/10 · 10:00", { estado: feita ? "Feita" : "Marcada", presentes: d.f.presentes || "O cliente",
      combinado: feita ? "Levantamento feito, com medidas e fotografias." : "" }));
  }
  {
    const j = by0(S, 1050);
    j.vis = [];
    criarVisita(j, visitaDoSlot("qua 17/09 · 10:00", { estado: "Feita", presentes: "O casal", combinado: "Medidas e fotos tiradas. O casal quer base de duche e móvel suspenso." }));
    criarVisita(j, { tipo: "Escolha de materiais", estado: "Feita", data: "2026-09-19", hora: "15:00", quem: "Hugo (técnico)", presentes: "O casal", duracao: "1 h",
      combinado: "Escolhido o cerâmico 30×60 branco mate e o pavimento a imitar madeira." });
  }
  Object.assign(by0(S, 1035).f, { andar: "2", tem_elevador: "Sim", n_elevadores: "1", estacionamento: "Pago", zona_estacionamento: "Vermelha" });
  for (const d of S.deals) if (d.fase >= 3) d.orc = criarOrc(d, S);
  const by = (id: number) => S.deals.find((d) => d.id === id)!;
  Object.assign(by(1031).orc!, { verif: true, enviada: "05/10" });
  by(1031).hist.push({ t: "Proposta enviada ao portal", q: "05/10", k: "a" });
  Object.assign(by(1030).orc!, { verif: true, enviada: "07/10", vendaDireta: true });
  by(1030).hist.push({ t: "Proposta enviada · venda direta", q: "07/10", k: "a" });
  Object.assign(by(1027).orc!, { verif: true, enviada: "01/10", aceite: "03/10", contrato: "assinado" });
  by(1027).hist.push({ t: "Contrato assinado · cliente criado", q: "08/10", k: "a" });
  // o exemplo do circuito (16/10): contrato assinado → só o plano da obra, por aprovar; a encomenda de cliente vem com o pagamento validado
  prepararPlanoDe(by(1027), S);
  by(1027).hist.unshift({ t: "Plano da obra gerado do orçamento · aprova-se depois do pagamento", q: "08/10", k: "a" });
  {
    const j = by(1050);
    Object.assign(j.orc!, { verif: true, enviada: "19/09", aceite: "21/09", contrato: "assinado" });
    j.fin = { fatura: { n: "FT 2026/380", q: "22/09" }, pago: true, recibo: { n: "RC 2026/270", q: "24/09" } };
    j.f.valor_recebido = String(r2(tot(j, S).pf));
    j.f.protecoes = protecoesSugeridas(j.f);
    j.obra.plano = gerarPlano(j, S);
    j.obra.plano.tasks.forEach((t) => { if (t.tec === "sf") t.tec = "hn"; });
    j.obra.plano.estado = "concluída";
    j.obra.mats = calcMats(j, S, true);
    j.obra.real = realObra(j, S);
    j.obra.auto = { n: "AR 2026/" + j.id, q: "08/10", estado: "assinado", assinado: "08/10/2026 17:40",
      assinatura: { tipo: "digital", nome: j.nome, q: "08/10/2026 17:40", id: "CMD-4QX7T2", telemovel: "9•• ••• 213" } };
    j.hist = [
      { t: "Obra concluída · margem real " + pct(j.obra.real.m), q: "08/10", k: "a" },
      { t: "Vistoria final e auto de receção assinado", q: "08/10", k: "a" },
      { t: "Obra arrancou", q: "29/09", k: "a" },
      { t: "Pagamento validado · RC 2026/270 emitido", q: "24/09", k: "a" },
      { t: "FT 2026/380 emitida e enviada ao portal do cliente", q: "22/09", k: "a" },
      { t: "Contrato assinado pelo cliente · cliente criado", q: "21/09", k: "a" },
      { t: "Proposta enviada ao portal do cliente", q: "19/09", k: "a" },
      { t: "Levantamento fechado · 9 fotos", q: "17/09", k: "a" },
      { t: "Visita feita", q: "17/09 10:00", k: "a" },
      { t: "Chamada registada · Atendeu · interessado", q: "12/09 15:20", k: "a" },
      { t: "Pedido por recomendação", q: "12/09 10:15", k: "a" },
    ];
    S.clientes.unshift({ nome: j.nome, tel: j.tel, local: "Casa de banho · Lisboa", desde: "21/09", deal: j.id });
  }
  const m = by(1022);
  Object.assign(m.orc!, { verif: true, enviada: "15/09", aceite: "17/09", contrato: "assinado" });
  m.fin = { fatura: { n: "FT 2026/391", q: "18/09" }, pago: true, recibo: { n: "RC 2026/288", q: "22/09" } };
  m.obra.plano = gerarPlano(m, S);
  m.obra.plano.tasks.forEach((t) => { if (t.tec === "sf") t.tec = "hn"; });
  // 21/10: as fases da obra também no exemplo (o portal mostra o plano por fases e o Hoje do técnico diz a fase)
  m.obra.plano.tasks.forEach((t) => { t.fase = /demol/i.test(t.nome) ? 1 : /canaliz/i.test(t.nome) ? 2 : /revest|pavim/i.test(t.nome) ? 3 : 4; });
  m.obra.plano.estado = "em curso";
  m.obra.plano.dia = 2;
  m.obra.mats = calcMats(m, S, true);
  m.f.valor_recebido = String(r2(tot(m, S).pf));
  m.hist.push({ t: "Obra em curso · dia 3 de 5", q: "hoje", k: "a" });
  {
    const pm = m.obra.plano, dias = ["seg 13/10", "ter 14/10"];
    pm.tasks.forEach((t, i) => {
      const tec = TECS.find((x) => x.id === t.tec)?.n ?? "Equipa";
      if (t.dia + t.dur <= 1) t.exec = { estado: "validada", horas: Math.round(t.h * 1.05 * 2) / 2, fotos: [fotoExemplo(t.nome, "#8b6fe0", i), fotoExemplo(t.nome + " · fim", "#8b6fe0", i + 1)], nota: "Paredes picadas até ao tijolo. Entulho no contentor.", feita: dias[0], validada: dias[0] + " 18:10" };
      else if (t.dia + t.dur <= 2) t.exec = { estado: "feita", horas: Math.round(t.h * 1.1 * 2) / 2, fotos: [fotoExemplo(t.nome, "#5a3fc0", i), fotoExemplo(t.nome + " · ensaio", "#5a3fc0", i + 1)], nota: "Ensaio de pressão sem perdas. Ponto de água da base de duche mudado 20 cm.", feita: dias[1] + " 17:40" };
      // 21/10: a tarefa de hoje (o revestimento) fica por começar: na demonstração, o técnico começa-a no Hoje dele
      // 21/10: o histórico dos registos (o que o cliente vê no portal) e os passos feitos
      const e = t.exec;
      if (e && e.estado !== "em curso") {
        const n = instrucoesDe(t).passos.length;
        e.passos = Array.from({ length: n }, (_, k) => k);
        e.envios = [{ q: e.feita!.includes(":") ? e.feita! : e.feita + " 17:50", dia: t.dia, quem: tec, k: "feita", horas: e.horas, fotos: e.fotos, nota: e.nota, passos: instrucoesDe(t).passos }];
        if (e.estado === "validada") e.envios.push({ q: e.validada!, dia: t.dia, quem: "Filipe Rocha", k: "validada" });
      }
    });
    m.obra.diario = [
      { q: "seg 13/10 08:05", quem: "Filipe Rocha", t: "Obra arrancou. Equipa no local, proteções colocadas no caminho e no elevador.", k: "marco" },
      { q: "seg 13/10 17:50", quem: "João Silva", t: "Demolição feita: 8 h. Duas fotografias.", k: "horas", fotos: [fotoExemplo("Demolição", "#8b6fe0", 0)] },
      { q: "seg 13/10 18:10", quem: "Filipe Rocha", t: "Validou a demolição.", k: "validacao" },
      { q: "ter 14/10 11:20", quem: "Marco Antunes", t: "O tubo de esgoto antigo estava fissurado: trocado mais 1 m (sem custo para o cliente).", k: "ocorrencia" },
      { q: "ter 14/10 17:40", quem: "Marco Antunes", t: "Canalização feita. Falta validar.", k: "horas", fotos: [fotoExemplo("Canalização", "#5a3fc0", 1)] },
    ];
    m.obra.seg = { pss: "seg 13/10", condominio: "sex 10/10" };
    m.obra.chat = [
      { de: "empresa", quem: "Filipe Rocha", t: "Bom dia, Marta. A obra arrancou hoje: a equipa está no local e as proteções estão no elevador. Qualquer dúvida, escreva aqui.", q: "seg 13/10 08:20", lida: true },
      { de: "cliente", quem: "Marta Lima", t: "Obrigada! O porteiro sabe que vêm. Já agora, a base de duche pode ficar mais para a janela?", q: "ter 14/10 09:02", lida: true },
      { de: "empresa", quem: "Filipe Rocha", t: "Pode, sim: o Marco mudou o ponto de água 20 cm. Está nas fotografias da canalização.", q: "ter 14/10 17:55", lida: true },
      { de: "cliente", quem: "Marta Lima", t: "Vi as fotografias, está ótimo. Os azulejos são os que escolhemos na loja (o 30×60 claro)?", q: "qua 15/10 08:40" },
    ];
  }
  // as obras antigas do exemplo (pagas em setembro, antes do Inventário novo) têm a encomenda de cliente já servida, sem origem no Inventário (ref)
  const ecAntiga = (d: Negocio, n: string, quando: string) => {
    const ec = gerarEncCliente(d, S, n, quando);
    ec.linhas.forEach((x) => { x.res = x.q; x.falta = 0; });
    d.obra.ec = { ...ec, emitida: { por: PAPEIS.financeiro.n, q: quando } };
  };
  ecAntiga(m, "EC 2026/001", "17/09");
  ecAntiga(by(1050), "EC 2026/002", "21/09");
  return S;
}

/** 21/10: os clientes com mais de um negócio (a área de Clientes): a Joana pede agora a cozinha, o Tiago a casa de banho e a Marta
 *  perdeu um segundo negócio. Junta só os que faltam (pelo número), por isso serve também para migrar um Estado já guardado.
 *  Fica fora do seed() (as contas dos testes de Pessoas e Negócios são sobre a seed): a página chama-a ao ler, repor e sincronizar (demo()). */
export function exemplosClientes(S: Estado): boolean {
  const extra: NovoNegocio[] = [
    { id: 2001, nome: "Joana Ribeiro", tel: "916 480 213", linha: "coz", servico: "Cozinha nova", local: "Rua Morais Soares 112, Lisboa", origem: "cliente", quando: "16/10 09:30", fase: 1,
      f: { pedido: "Agora queremos a cozinha: armários novos e bancada em pedra.", resultado: "Atendeu · interessado", prazo: "3 a 6 meses", orc_cliente: "6.000 a 10.000 €" },
      hist: [{ t: "Chamada registada · Atendeu · interessado", q: "16/10 10:05", k: "a" }, { t: "Novo negócio do cliente", q: "16/10 09:30", k: "a" }] },
    { id: 2002, nome: "Tiago Almeida", tel: "913 220 410", linha: "wc", servico: "WC de serviço", local: "Almada", origem: "cliente", quando: "19/10 18:20",
      f: { pedido: "Depois da cozinha, a casa de banho pequena: trocar a banheira por duche." },
      hist: [{ t: "Novo negócio do cliente", q: "19/10 18:20", k: "a" }] },
    { id: 2003, nome: "Marta Lima", tel: "916 004 552", linha: "coz", servico: "Cozinha", local: "Odivelas", origem: "cliente", quando: "02/10", fase: 1, perdido: true, motivoPerda: "Adiou a obra para o próximo ano",
      f: { pedido: "Ver também a cozinha, se o preço for bom." },
      hist: [{ t: "Marcado como perdido · Adiou a obra para o próximo ano", q: "06/10", k: "x" }, { t: "Novo negócio do cliente", q: "02/10", k: "a" }] },
  ];
  let mudou = false;
  for (const o of extra) {
    if (S.deals.some((d) => d.id === o.id)) continue;
    const base = S.deals.find((d) => d.nome === o.nome && d.id < 2000);
    const d = novoDeal(o);
    // os dados da pessoa vêm do negócio que já tem (email, NIF, preferências); o resto do exemplo segue a fase
    // (nestes exemplos a obra é na mesma casa: a morada também)
    const daPessoa = base ? Object.fromEntries(Object.entries(base.f).filter(([k]) => CAMPOS_PESSOA.includes(k) || ["morada", "cp", "localidade", "fracao"].includes(k))) : {};
    d.f = { ...exemplo(d), ...daPessoa, ...o.f };
    S.deals.push(d);
    mudou = true;
  }
  return mudou;
}

/** A demonstração inteira: a seed e os clientes com vários negócios. */
export const demo = (): Estado => { const S = seed(); exemplosClientes(S); return S; };

/** Os campos que são da pessoa (e não de um negócio): passam para cada negócio novo do mesmo cliente. */
export const CAMPOS_PESSOA: readonly string[] = ["email", "pref", "hora", "idioma", "rgpd", "tipo_cliente", "nif", "nif_fat", "nome_fiscal", "email_fat", "origem", "recomendou", "concelho"];

const by0 = (S: Estado, id: number) => S.deals.find((d) => d.id === id)!;

// Todos os campos de todas as fases, preenchidos à mão, como um negócio real acabado.
const EXEMPLO_COMPLETO: Record<string, string> = {
  // Lead
  email: "joana.ribeiro@exemplo.pt", pref: "WhatsApp", hora: "Manhã", idioma: "Português", origem: "Recomendação", recomendou: "Marta Lima (cliente)",
  rgpd: "Sim", tipo_cliente: "Particular", nif: "123456789", concelho: "Lisboa",
  pedido: "Remodelar a casa de banho principal: tirar a banheira e pôr base de duche, com móvel suspenso.",
  // Contacto
  resultado: "Atendeu · interessado", tentativas: "2", imovel: "Apartamento", posse: "Proprietário", decisor: "O próprio",
  orc_cliente: "3.000 a 6.000 €", prazo: "1 a 3 meses", outros_orc: "Não",
  morada: "Rua Morais Soares 112", cp: "1900-345", localidade: "Lisboa", fracao: "3.º Esq.",
  duracao: "1 h 30", presentes: "O casal", nota_visita: "Estacionar na rua de trás. O prédio tem porteiro até às 18h.",
  // Visita · exterior
  acesso: "Fácil", estacionamento: "Pago", zona_estacionamento: "Amarela", tem_elevador: "Sim", n_elevadores: "1", n_andares: "6", andar: "3", n_fracoes_por_andar: "2",
  // Visita · interior
  tipo_espaco: "Casa", tipologia: "T3", area_util_m2: "105", n_divisoes: "4", n_casas_banho: "2", ano_construcao: "1950 a 1970", pavimento: "Madeira", eletrica: "Antiga",
  quadro_diferencial: "Não", canalizacao: "Ferro", gas: "Canalizado", amianto: "Não sei", habitada_durante_obra: "Sim", animais: "Sim",
  notas_interior: "Há um gato: manter a porta da cozinha fechada durante a obra.",
  // Visita · área
  diag_tipo_area: "Casa de banho", diag_intervencao_tipo: "Remodelação total", diag_pe_direito_m: "2,7 m",
  diag_pontos_eletricos: "5", diag_gas: "Não há", diag_toalheiro: "Sim", diag_janela: "Sim", diag_local_cortes: "Varanda",
  diag_distancia_entrada: "Média (5–15 m)", diag_mobilada: "Médio", diag_portas_proteger: "3",
  diag_demolir_descricao: "Banheira, azulejo das paredes até ao teto e pavimento.",
  // Visita · escolhas
  materiais_cliente: "Não", mobilidade_reduzida: "Não", cor_estilo: "Branco mate e madeira clara", diag_cliente_recusou_fotos: "Não",
  // Negócio
  validade: "30 dias", prazo_exec: "8", inicio_prev: "2026-09-29", pagamento: "50% + 50% no fim", garantia: "2 anos",
  notas_cliente: "Inclui a remoção do entulho e a limpeza final.",
  modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não",
  // Financeiro
  nome_fiscal: "Joana Ribeiro", nif_fat: "123456789", morada_fiscal_igual: "Sim", email_fat: "joana.ribeiro@exemplo.pt",
  serie: "FT 2026", tranche: "1.ª (adjudicação)", vencimento: "15 dias", metodo: "Transferência",
  data_pag: "2026-09-24", conta: "Banco B · conta obras", comprovativo: "TRF 0924-551",
  // Obra
  responsavel: "Filipe", inicio: "2026-09-29", horario: "Dias úteis 8h–17h", chaves: "O cliente abre", contacto_local: "Joana Ribeiro · 916 480 213",
  condominio: "Sim", contentor: "Não",
  vistoria: "2026-10-08", auto_rececao: "Sim", satisfacao: "5", notas_fecho: "Silicone da base de duche retocado no dia da vistoria.",
};

// Valores de exemplo das fases por onde o negócio já passou.
function exemplo(d: Negocio): Record<string, string> {
  const loc = d.local.split(",").pop()!.trim();
  const mail = d.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, ".") + "@exemplo.pt";
  const origem = d.origem.startsWith("campanha") ? "Campanha" : d.origem === "recomendação" ? "Recomendação" : d.origem === "telefone" ? "Telefone" : "Site";
  const f: Record<string, string> = {
    email: mail, pref: "Telefone", hora: "Fim do dia", idioma: "Português", origem, rgpd: "Sim", tipo_cliente: "Particular", concelho: loc,
  };
  if (origem === "Campanha") f.campanha = "Campanha de outono · Meta Ads";
  if (d.fase >= 1) Object.assign(f, {
    resultado: "Atendeu · interessado", tentativas: "1", imovel: "Apartamento", posse: "Proprietário", decisor: "Com a família",
    orc_cliente: d.linha === "coz" ? "6.000 a 10.000 €" : "3.000 a 6.000 €", prazo: "1 a 3 meses", outros_orc: "Sim",
    morada: "Rua de exemplo, 10", cp: "2700-000", localidade: loc, fracao: "1.º Dto.", duracao: "1 h 30",
  });
  if (d.fase >= 2) Object.assign(f, {
    acesso: "Fácil", estacionamento: "Não pago", tem_elevador: "Não", n_andares: "4", andar: "1", n_fracoes_por_andar: "2",
    tipologia: "T3", area_util_m2: "110", n_casas_banho: "2", diag_tipo_area: d.linha === "coz" ? "Cozinha" : "Casa de banho",
    diag_intervencao_tipo: "Remodelação total",
  });
  if (d.fase >= 3) Object.assign(f, {
    n_divisoes: "6", ano_construcao: "1970 a 1990", pavimento: "Flutuante", eletrica: "Antiga", quadro_diferencial: "Sim", canalizacao: "Ferro", gas: "Canalizado",
    amianto: "Não", habitada_durante_obra: "Sim", animais: "Não", diag_pe_direito_m: "2,6 m", diag_pontos_eletricos: "4",
    diag_gas: "Não há", diag_toalheiro: "Sim", diag_janela: "Sim", diag_local_cortes: "Varanda", diag_distancia_entrada: "Média (5–15 m)", diag_mobilada: "Médio",
    diag_portas_proteger: "3", materiais_cliente: "Não",
    validade: "30 dias", prazo_exec: "8", pagamento: "50% + 50% no fim", garantia: "2 anos",
    modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben",
  });
  if (d.fase >= 4) Object.assign(f, {
    nome_fiscal: d.nome, nif_fat: "2" + String(d.id).padStart(8, "0"), morada_fiscal_igual: "Sim", email_fat: mail,
    serie: "FT 2026", tranche: "1.ª (adjudicação)", vencimento: "15 dias", metodo: "Transferência",
  });
  if (d.fase >= 5) Object.assign(f, {
    data_pag: "2026-09-22", conta: "Banco B · conta obras", comprovativo: "TRF 0922-118",
    responsavel: "Filipe", inicio: "2026-10-06", horario: "Dias úteis 8h–17h", chaves: "Chave entregue", contacto_local: d.nome + " · " + d.tel,
    condominio: "Sim", contentor: "Não", protecoes: "Cartão canelado no caminho (12 m), plástico nas 3 portas, proteção do elevador.",
  });
  return f;
}

/* ------------------------------------------------------------------ visitas */
const MESES_DIA = (slot: string) => {
  // "qui 15/10 · 10:00" → { data: "2026-10-15", hora: "10:00" }
  const m = /(\d{1,2})\/(\d{1,2}).*?(\d{1,2}:\d{2})/.exec(slot);
  return m ? { data: `2026-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, hora: m[3] } : { data: "", hora: "" };
};
export const visitas = (d: Negocio) => d.vis || [];
export const campoVisita = (d: Negocio, n: number, k: string) => d.f[`v${n}_${k}`] || "";
export function criarVisita(d: Negocio, dados: Record<string, string>): number {
  const n = Math.max(0, ...visitas(d)) + 1;
  d.vis = [...visitas(d), n];
  for (const k in dados) if (dados[k]) d.f[`v${n}_${k}`] = dados[k];
  return n;
}
export const visitaFeita = (d: Negocio) => visitas(d).some((n) => campoVisita(d, n, "estado") === "Feita");
const visitaDoSlot = (slot: string, extra: Record<string, string>) => ({ tipo: "Levantamento", quem: "Rúben (comercial)", duracao: "1 h 30", ...MESES_DIA(slot), ...extra });

/* ------------------------------------------------------------------ cálculo */
export const r2 = (x: number) => Math.round(x * 100) / 100;
export function eur(x: number): string {
  const s = (Math.round(x * 100) / 100).toFixed(2).split(".");
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
}
export const pct = (x: number) => (x * 100).toFixed(1).replace(".", ",") + "%";
export const nfmt = (x: number) => String(r2(x)).replace(".", ",");

export function custoUn(s: Servico, S: Estado): number {
  return s.h * s.eh + s.eq + s.cons + (S.cfg.estrutura ? s.h * ESTR : 0);
}
/** O custo por unidade de uma linha de serviço (o do Catálogo). 15/10: o cliente só fornece produtos, por isso a receita fica inteira. */
export const custoUnLinha = (s: Servico, S: Estado) => r2(custoUn(s, S));
/** Uma linha de serviço do orçamento, ao custo e ao preço do Catálogo. */
function linhaSvc(_d: Negocio, S: Estado, sid: SvcId, q: number, s: Servico): LinhaOrc {
  return { t: "svc", sid, q, cu: custoUnLinha(s, S), pu: s.preco };
}
export function criarOrc(d: Negocio, S: Estado): Orcamento {
  const L = LINHAS[d.linha], m = d.visita.med, linhas: LinhaOrc[] = [];
  for (const [sid, k] of L.map) {
    const s = S.svc[sid];
    if (!(m[k] > 0) || d.visita.off.includes(sid)) continue;
    linhas.push(linhaSvc(d, S, sid, m[k], s));
  }
  // os juntados do Catálogo, pela ordem em que foram juntados
  for (const [sid, q] of Object.entries(d.visita.extra)) {
    const sv = garantirServico(S, sid);
    if (sv && (q || 0) > 0) linhas.push(linhaSvc(d, S, sid, q!, sv));
  }
  // os serviços trazidos pelos produtos escolhidos (os que não vêm do pacote nem foram postos à mão)
  const prod = d.visita.prod ?? [];
  for (const [sid, t] of trazidosParaOrc(prod, ativosDoPacote(L.map, m, d.visita.off), d.visita.extra)) {
    const sv = garantirServico(S, sid);
    if (sv && t.q > 0) linhas.push(linhaSvc(d, S, sid, t.q, sv));
  }
  // os materiais do modelo descem pelo que os produtos escolhidos já cobrem (sem produtos, ficam iguais)
  const mm = materiaisDoModelo(L.mat, prod, d.visita.manter, undefined, d.visita.semParte);
  if (mm) linhas.push({ t: "mat", d: L.mat.d, custo: mm.custo, preco: mm.preco });
  linhas.push(...linhasDosProdutos(prod), ...linhasClienteCompra(d.visita, servicosVisita(d), d.f.materiais_cliente === "Sim"));
  const o: Orcamento = { modelo: L.modelo, linhas, desconto: 0, vendaDireta: false, verif: false, aprov: null, enviada: null, aceite: null, contrato: null, avisosVistos: {} };
  return o;
}

/* Medidas da visita (13/10): os pontos de água pedem-se em fria e quente; pts (o que os serviços usam) é a soma.
   Negócios de antes (sem ptf/ptq): fria = pts, quente = 0, e os totais ficam iguais. */
export type CampoMedida = MedKey | "ptf" | "ptq";
/** Os campos de medida a pedir na visita, pela ordem da linha: "Pontos de água" dá "fria" e "quente". */
export function camposMedida(L: { med: Partial<Record<MedKey, string>> }): [CampoMedida, string][] {
  return (Object.entries(L.med) as [MedKey, string][]).flatMap(([k, l]): [CampoMedida, string][] =>
    k === "pts" ? [["ptf", "Pontos de água fria"], ["ptq", "Pontos de água quente"]] : [[k, l]]);
}
export function medida(m: Medidas, k: CampoMedida): number {
  if (k === "ptq") return m.ptq ?? 0;
  if (k === "ptf") return m.ptf ?? Math.max(0, (m.pts || 0) - (m.ptq ?? 0));
  return m[k] || 0;
}
/** Muda uma medida; mudar a fria ou a quente refaz o total dos pontos de água. */
export function porMedida(m: Medidas, k: CampoMedida, n: number) {
  if (k === "ptf" || k === "ptq") {
    const f = medida(m, "ptf"), q = medida(m, "ptq");
    m.ptf = k === "ptf" ? n : f; m.ptq = k === "ptq" ? n : q;
    m.pts = m.ptf + m.ptq;
  } else m[k] = n;
}
/** Se a medida falta para fechar a visita: a quente pode ser 0 (basta haver pontos de água no total). */
export const medidaEmFalta = (m: Medidas, k: CampoMedida) => (k === "ptq" ? false : k === "ptf" ? !(medida(m, "ptf") + medida(m, "ptq") > 0) : !(m[k] > 0));

/** As fotografias da visita por etapa (13/10): exterior, interior e área de intervenção. visita.fotos fica o total. */
export type EtapaFotos = "exterior" | "interior" | "area";
export const ETAPAS_FOTOS: EtapaFotos[] = ["exterior", "interior", "area"];
/** As fotografias por etapa; sem contagem guardada (negócios de antes), reparte o total: um terço ao exterior, um terço ao interior, o resto à área. */
export function fotosPor(v: Negocio["visita"]): Record<EtapaFotos, number> {
  if (v.fotosPor) return { exterior: v.fotosPor.exterior || 0, interior: v.fotosPor.interior || 0, area: v.fotosPor.area || 0 };
  const t = Math.floor((v.fotos || 0) / 3);
  return { exterior: t, interior: t, area: (v.fotos || 0) - 2 * t };
}

/** Os preços mudados à mão nas linhas de materiais (pela descrição) voltam a valer nas linhas refeitas. */
export function aplicarPrecosMan(o: Orcamento) {
  const m = o.precosMan;
  if (!m) return;
  for (const l of o.linhas) if (l.t === "mat" && m[l.d] != null) l.preco = m[l.d];
}

/* ------------------------------------------------------------------ demolição e entulho (entulho.ts) */
/**
 * Liga a demolição num orçamento: os serviços que dizem que artigo de demolição usam passam a artigos
 * (com a quantidade da linha) e saem como linhas de serviço; a conta faz-se pela fórmula da Mudelar e o
 * cliente vê uma só linha. Os artigos postos à mão no orçamento de antes ficam.
 */
export function ligarDemolicao(o: Orcamento, antes?: Orcamento["demolicao"]) {
  const K = catalogoLigado();
  if (!K) return;
  const mapa = K.artigoDoServico ?? {};
  const itens = itensDasLinhas(o.linhas, mapa);
  o.linhas = o.linhas.filter((l) => !(l.t === "svc" && mapa[l.sid]));
  o.demolicao = { itens: [...itens, ...(antes?.itens ?? []).filter((x) => !x.de)], aj: { ...(antes?.aj ?? {}) } };
}
/** Refaz a conta e a linha da demolição (só com a demolição ligada e o Catálogo ligado; antes de enviar). */
export function sincronizarDemolicao(d: Negocio, _S: Estado) {
  const o = d.orc, K = catalogoLigado();
  if (!o || !K || o.enviada) return;
  const P = K.parDem ?? PAR_DEM0;
  // o entulho dos serviços (entulhoPadrao.ts): sem a demolição ligada, liga-se sozinha (menos se a desligaram à mão)
  if (!o.demolicao && !o.semDemolicao && volumesDasLinhas(o.linhas, K, d.visita, P).length) ligarDemolicao(o);
  if (!o.demolicao) return;
  const vols = volumesDasLinhas(o.linhas, K, d.visita, P);
  o.linhas = o.linhas.filter((l) => !(l.t === "mat" && l.d === LINHA_DEMOLICAO));
  // sem margens próprias, a demolição usa a mínima e a alvo gerais da Olyvia
  const r = calcularDemolicao(o.demolicao.itens, K.artigosDem ?? ARTIGOS_DEM0, P, fatorAcesso(d.f, P), o.demolicao.aj, { min: _S.cfg.min / 100, alvo: _S.cfg.alvo / 100 }, vols);
  o.demolicao.r = r;
  if (r.preco > 0 || r.custo > 0) o.linhas.push({ t: "mat", d: LINHA_DEMOLICAO, custo: r.custo, preco: r.preco });
  sugerirPrazo(d, _S); // as horas da demolição mexem no prazo
}

/** Todos os serviços da visita: do pacote (pelas medidas), postos à mão e trazidos pelos produtos escolhidos. */
export function servicosVisita(d: Negocio): SvcId[] {
  const v = d.visita;
  return servicosDaVisita(ativosDoPacote(LINHAS[d.linha].map, v.med, v.off), v.extra, v.prod ?? []);
}
/** O que falta nas necessidades por causa dos produtos (com o Catálogo ligado): perguntas por responder e produtos por escolher. */
export function faltaProdutosVisita(d: Negocio, S: Estado): { sid: SvcId; t: string }[] {
  const K = catalogoLigado();
  if (!K) return [];
  const nome = (sid: SvcId) => S.svc[sid]?.n ?? itemCatalogo(sid)?.n ?? sid;
  return emFaltaProdutos(K, servicosVisita(d), d.visita, d.f.materiais_cliente === "Sim").map((o) => ({ sid: o.sid, t: textoFalta(o, nome(o.sid)) }));
}
/** Ao fechar de novo um levantamento reaberto: o orçamento novo guarda os preços por serviço, o desconto,
 *  a venda direta e as linhas de materiais postas à mão do orçamento de antes. */
export function preservarManuais(antes: Orcamento, novo: Orcamento, L: LinhaServico): Orcamento {
  for (const l of novo.linhas) {
    if (l.t !== "svc") continue;
    const a = antes.linhas.find((x) => x.t === "svc" && x.sid === l.sid);
    if (a && a.t === "svc") l.pu = a.pu;
  }
  const geradas = (dl: string) => dl === L.mat.d || [PREFIXO_LEV, PREFIXO_PROD, PREFIXO_CLIENTE].some((p) => dl.startsWith(p)) || dl === LINHA_DEMOLICAO;
  novo.linhas.push(...antes.linhas.filter((l) => l.t === "mat" && !geradas(l.d)));
  novo.desconto = antes.desconto; novo.vendaDireta = antes.vendaDireta; novo.avisosVistos = { ...antes.avisosVistos };
  if (antes.precosMan) { novo.precosMan = { ...antes.precosMan }; aplicarPrecosMan(novo); }
  if (antes.prazo) novo.prazo = { ...antes.prazo }; // os dias mudados à mão no prazo previsto (as tarefas que já não existem não contam)
  // o plano da obra (início, reforço, prestações) e as versões já enviadas não se perdem ao refazer
  if (antes.inicioObra) novo.inicioObra = antes.inicioObra;
  if (antes.equipa) novo.equipa = antes.equipa;
  if (antes.pagFases) novo.pagFases = antes.pagFases.map((p) => ({ ...p }));
  if (antes.versoes?.length) novo.versoes = antes.versoes.map((v) => ({ ...v, motivos: [...v.motivos] }));
  return novo;
}

/** As respostas do levantamento no orçamento (efeitosLevantamento.ts): refaz as linhas "Levantamento · …"
 *  e a linha de materiais (materiais do cliente). Só antes de a proposta ser enviada. */
export function sincronizarEfeitos(d: Negocio, _S: Estado) {
  const o = d.orc;
  if (!o || o.vendaDireta) return;
  const L = LINHAS[d.linha];
  const tinhaMat = o.linhas.some((l) => l.t === "mat" && l.d === L.mat.d) || !o.linhas.some((l) => l.t === "mat");
  o.linhas = o.linhas.filter((l) => !(l.t === "mat" && (l.d.startsWith(PREFIXO_LEV) || l.d === L.mat.d)));
  const ef = efeitosDoLevantamento(d.f);
  const fator = ef.find((e) => e.t === "material")?.fator ?? 1;
  const mm = materiaisDoModelo(L.mat, d.visita.prod ?? [], d.visita.manter, undefined, d.visita.semParte);
  if (tinhaMat && fator > 0 && mm) o.linhas.push({ t: "mat", d: L.mat.d, custo: r2(mm.custo * fator), preco: r2(mm.preco * fator) });
  let bc = 0, bp = 0;
  for (const l of o.linhas) if (l.t === "svc") { bc += l.cu * l.q; bp += l.pu * l.q; }
  for (const e of ef) {
    if (e.t === "linha") o.linhas.push({ t: "mat", d: PREFIXO_LEV + e.d, custo: e.custo, preco: e.preco });
    if (e.t === "percent") o.linhas.push({ t: "mat", d: PREFIXO_LEV + e.d, custo: r2(bc * e.pct!), preco: r2(bp * e.pct!) });
  }
  aplicarPrecosMan(o);
  sincronizarDemolicao(d, _S);
}
/** O IVA na proposta: a mão de obra (os serviços) a 6% e os materiais a 23%. */
export const IVA_MO = 0.06, IVA_MAT = 0.23;
/** Os totais com IVA do orçamento (a fonte única: documentos, portal, Financeiro): a mão de obra e os materiais, depois do desconto, e o IVA de cada parte. */
export function totaisIva(d: Negocio, S: Estado) {
  if (!d.orc) return { mo: 0, mat: 0, ivaMo: 0, ivaMat: 0, base: 0, iva: 0, total: 0 };
  const k = 1 - (d.orc.desconto || 0) / 100; // o desconto reparte-se pelas duas partes
  let mo = 0, mat = 0;
  for (const l of d.orc.linhas) { const p = linhaCalc(l, S).preco * k; if (l.t === "mat") mat += p; else mo += p; }
  const ivaMo = mo * IVA_MO, ivaMat = mat * IVA_MAT;
  return { mo, mat, ivaMo, ivaMat, base: mo + mat, iva: ivaMo + ivaMat, total: mo + mat + ivaMo + ivaMat };
}
/** O valor da primeira prestação (o sinal), com IVA: o que o Financeiro espera ver entrar (14/10). */
export function valorSinal(d: Negocio, S: Estado): number {
  if (!d.orc) return 0;
  return r2(totaisIva(d, S).total * (prestacoes(d.f.pagamento, d.orc.pagFases)[0]?.p ?? 1));
}
export function linhaCalc(l: LinhaOrc, S: Estado): { custo: number; preco: number; h: number; s?: Servico } {
  if (l.t === "mat") return { custo: l.custo, preco: l.preco, h: 0 };
  const s = S.svc[l.sid];
  return { custo: l.cu * l.q, preco: l.pu * l.q, h: s.h * l.q, s };
}
export function tot(d: Negocio, S: Estado) {
  let c = 0, p = 0, h = 0;
  for (const l of d.orc!.linhas) { const x = linhaCalc(l, S); c += x.custo; p += x.preco; h += x.h; }
  c += ajustePrazo(d, S); // os dias mudados à mão no prazo previsto
  const pf = p * (1 - (d.orc!.desconto || 0) / 100);
  return { custo: c, preco: p, pf, h, m: pf > 0 ? (pf - c) / pf : 0 };
}
export function partes(d: Negocio, S: Estado) {
  const o = { mo: 0, eq: 0, cons: 0, estr: 0, mat: 0 };
  for (const l of d.orc!.linhas) {
    if (l.t === "mat") { o.mat += l.custo; continue; }
    const s = S.svc[l.sid];
    o.mo += s.h * s.eh * l.q; o.eq += s.eq * l.q; o.cons += s.cons * l.q;
    if (S.cfg.estrutura) o.estr += s.h * ESTR * l.q;
  }
  o.mo += ajustePrazo(d, S);
  return o;
}

export interface Alerta { k: "x" | "w"; t: string; d: string; fix?: boolean; i?: number; sug?: number; aprov?: boolean; go?: Vista; key?: string }
export function alertas(d: Negocio, S: Estado): Alerta[] {
  const A: Alerta[] = [], min = S.cfg.min / 100, alvo = S.cfg.alvo / 100, o = d.orc!, vistos = o.avisosVistos || {};
  o.linhas.forEach((l, i) => {
    // uma linha de materiais com o preço mudado à mão para baixo do custo também bloqueia
    if (l.t === "mat" && o.precosMan?.[l.d] != null && l.custo > 0 && l.preco < l.custo) A.push({ k: "x", fix: true, t: `Preço abaixo do custo em ${l.d}`, d: `${eur(l.preco)} € não cobre o custo de ${eur(l.custo)} €. Não se envia assim.`, i, sug: r2(l.custo / (1 - alvo)), aprov: false });
    if (l.t !== "svc") return;
    const s = S.svc[l.sid], x = linhaCalc(l, S), m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
    if (x.preco < x.custo) A.push({ k: "x", fix: true, t: `Preço abaixo do custo em ${s.n}`, d: `${eur(l.pu)} €/${s.un} não cobre o custo de ${eur(l.cu)} €/${s.un}. Não se envia assim.`, i, sug: r2(l.cu / (1 - alvo)), aprov: false });
    else if (m < min) A.push({ k: "x", fix: true, t: `Margem abaixo do mínimo em ${s.n}`, d: `${pct(m)} nesta linha, com um mínimo de ${S.cfg.min}%. O preço de tabela (${eur(l.pu)} €/${s.un}) mal cobre o custo do Catálogo.`, i, sug: r2(l.cu / (1 - alvo)), aprov: true });
    if (s.semCusto && !vistos["sc" + l.sid]) A.push({ k: "w", t: `Técnico sem custo/hora (${s.perfil.toLowerCase()})`, d: `Foi usado o custo médio do perfil (${eur(s.eh)} €/h). Define-se no Catálogo.`, go: "catalogo", key: "sc" + l.sid });
    if (s.stale && !vistos["st" + l.sid]) A.push({ k: "w", t: "Preço desatualizado", d: s.stale, key: "st" + l.sid });
  });
  // a demolição: a ocupação dos big bags ou contentores (cheios de mais, ou o último contentor quase vazio)
  const oc = o.demolicao?.r?.ocupacao;
  if (oc?.falta && !vistos["enfalta"]) A.push({ k: "w", t: oc?.meio === "contentor" ? "Os contentores não chegam para o entulho" : "Os big bags não chegam para o entulho", d: `${oc.texto}. ${oc.falta.charAt(0).toUpperCase() + oc.falta.slice(1)}.`, key: "enfalta" });
  if (oc?.sugestao && !vistos["ensug"]) A.push({ k: "w", t: "Contentor quase vazio", d: oc.sugestao.charAt(0).toUpperCase() + oc.sugestao.slice(1) + ".", key: "ensug" });
  // a demolição: o preço mexido à mão abaixo da margem mínima (da demolição ou, sem ela, a geral)
  const rd = o.demolicao?.r;
  if (rd?.abaixoMin) A.push({ k: "x", t: rd.preco < rd.custo ? "Preço da demolição abaixo do custo" : "Margem da demolição abaixo do mínimo", d: `${eur(rd.preco)} € dá ${pct(rd.margem)} de margem, com um mínimo de ${pct(rd.margemMin)}. Reponha o cálculo (${eur(rd.precoCalc)} €) ou peça aprovação.`, aprov: rd.preco >= rd.custo });
  const T = tot(d, S);
  if (o.desconto > 0 && T.m < min) A.push({ k: "x", t: `O desconto de ${nfmt(o.desconto)}% deixa a margem em ${pct(T.m)}`, d: `Abaixo do mínimo de ${S.cfg.min}%. Baixe o desconto ou peça aprovação.`, aprov: true });
  else if (T.m < min && !A.some((a) => a.k === "x")) A.push({ k: "x", t: `Margem total de ${pct(T.m)}`, d: `Abaixo do mínimo de ${S.cfg.min}%.`, aprov: true });
  return A;
}
export function bloqueado(d: Negocio, S: Estado): boolean {
  const A = alertas(d, S).filter((a) => a.k === "x");
  if (!A.length) return false;
  if (d.orc!.aprov === "ok" && A.every((a) => a.aprov)) return false;
  return true;
}
export function calcMats(d: Negocio, S: Estado, jaReservado: boolean): MatObra[] {
  const L = LINHAS[d.linha], m = d.visita.med;
  return L.mats.map(([n, un, f, k]) => {
    const q = f(m);
    const ha = jaReservado ? q : Math.min(q, S.stock[k] || 0);
    return { n, un, k, q, res: ha, falta: q - ha };
  });
}
export function gerarPlano(d: Negocio, S: Estado): Plano {
  const h = (sid: SvcId) => {
    const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === sid);
    return l && l.t === "svc" ? S.svc[sid].h * l.q : 0;
  };
  const mont: SvcId = d.linha === "wc" ? "loucas" : "moveis";
  const T: Tarefa[] = [
    { nome: "Demolição", svcs: ["demol"] as SvcId[], dia: 0, dur: 1, sk: "Servente · demolição" },
    { nome: d.visita.extra.eletr ? "Canalização e eletricidade" : "Canalização", svcs: ["canal", "eletr"] as SvcId[], dia: 1, dur: 1, sk: "Canalizador" },
    { nome: "Revestimento e pavimento", svcs: ["revest", "pav"] as SvcId[], dia: 2, dur: 2, sk: "Ladrilhador" },
    { nome: d.linha === "wc" ? "Louças e acabamentos" : "Móveis e acabamentos", svcs: [mont, "teto", "pint"] as SvcId[], dia: 4, dur: 1, sk: mont === "loucas" ? "Canalizador" : "Montador" },
  ]
    .map((t, i) => {
      const of: Record<string, number> = { "Demolições": 0, "Canalização": 1, "Gás (ITG)": 1, "Eletricidade": 1, "Revestimentos": 2, "Carpintaria": 3, "Pintura": 3 };
      const mais = Object.keys(d.visita.extra).filter((sid) => !t.svcs.includes(sid) && of[S.svc[sid]?.perfil] === i);
      return { ...t, svcs: [...t.svcs, ...mais] };
    })
    .filter((t) => t.svcs.some((s) => h(s) > 0))
    .map((t) => {
      const tec = TECS.find((x) => x.sk === t.sk);
      return { ...t, h: r2(t.svcs.reduce((a, s) => a + h(s), 0)), tec: tec ? tec.id : null };
    });
  return { tasks: T, estado: "por aprovar", dia: 0 };
}
/** O primeiro dia (índice no plano) em que o técnico está de férias entre `dia` e `dia + dur`, ou null.
 *  Nos planos do orçamento, pelas datas reais (os dias úteis desde o início); nos de exemplo, pelo índice. */
export function diaDeFerias(tec: Tecnico, p: Plano, dia: number, dur: number): number | null {
  if (p.origem === "orcamento") {
    const i = inicioDoPlano(p);
    if (!i || !tec.feriasDatas?.length) return null;
    const ds = diasDaObra(i, dia + dur);
    for (let k = dia; k < dia + dur; k++) if (tec.feriasDatas.includes(isoDia(ds[k]))) return k;
    return null;
  }
  for (let k = dia; k < dia + dur; k++) if (tec.ferias.includes(k)) return k;
  return null;
}
export function conflitos(p: Plano) {
  const C: { t: Tarefa; tec: Tecnico; dia: number }[] = [];
  for (const t of p.tasks) {
    const tec = TECS.find((x) => x.id === t.tec);
    if (!tec) continue;
    const k = diaDeFerias(tec, p, t.dia, t.dur);
    if (k != null) C.push({ t, tec, dia: k });
  }
  return C;
}
export function realObra(d: Negocio, S: Estado): Real {
  let extra = 0;
  const tasks = d.obra.plano!.tasks.map((t) => {
    let hr = 0;
    for (const sid of t.svcs) {
      const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === sid);
      if (!l || l.t !== "svc") continue;
      const s = S.svc[sid];
      if (!s) continue;
      const hp = s.h * l.q, h2 = hp * (REAL[sid] || 1);
      hr += h2;
      extra += (h2 - hp) * (s.eh + (S.cfg.estrutura ? ESTR : 0));
    }
    return { nome: t.nome, prev: t.h, real: r2(hr) };
  });
  const T = tot(d, S);
  const custoReal = T.custo + extra;
  return { tasks, custoReal, m: (T.pf - custoReal) / T.pf };
}
export const fatorReal = (sid: SvcId) => REAL[sid] ?? 1;

/** Um serviço do Catálogo passa a existir em S.svc quando se junta pela primeira vez. */
export function garantirServico(S: Estado, sid: SvcId): Servico | null {
  if (S.svc[sid]) return S.svc[sid];
  const s = servicoDoCatalogo(sid);
  if (s) S.svc[sid] = s;
  return s;
}
/** O serviço como entra em uso, sem mexer no estado (21/10: a pré-visualização da adenda mostra o preço que o cliente vai receber). */
export function servicoDoCatalogo(sid: SvcId): Servico | null {
  const c = itemCatalogo(sid);
  if (!c) return null;
  // os serviços novos do catálogo da Mudelar (14/10) entram com a receita deles e o PVP real
  if (c.rs) return { n: c.n, un: c.un, h: c.rs.h, eh: c.rs.eh, eq: c.rs.eq, cons: c.rs.cons, preco: c.pvp ?? 0, perfil: c.cat };
  const h = r2(c.hu + c.hf / Math.max(1, c.qm)); // as horas fixas repartidas pela quantidade habitual
  const custo = h * (25 + ESTR);
  return { n: c.n, un: c.un, h, eh: 25, eq: 0, cons: 0, preco: r2(custo / (1 - 0.35)), perfil: c.cat };
}

/* ------------------------------------------------------------------ próximo passo */
export interface Proximo {
  t: string;
  sub?: string;
  btn?: string;
  act?: string;
  who?: Papel | "cliente" | null;
  wait?: boolean;
  sim?: "aceitar" | "assinar" | "auto";
  done?: boolean;
}
export function proximo(d: Negocio, S: Estado): Proximo {
  if (d.anulado) return { t: d.orc?.vendaDireta ? "Venda anulada" : "Contrato anulado", sub: `${d.anulado.motivo} · ${d.anulado.q}`, who: null };
  if (d.perdido) return { t: "Negócio perdido", who: null };
  const o = d.orc;
  switch (d.fase) {
    case 0: return { t: "Registar a chamada", sub: "Ligar ao cliente e anotar o resultado.", btn: "Registar chamada", act: "contactar", who: "comercial" };
    case 1: return { t: "Marcar a visita", sub: "Escolher uma vaga na agenda do comercial.", btn: "Marcar visita", act: "marcarVisita", who: "comercial" };
    case 2: return { t: "Fechar o levantamento", sub: d.orc ? "Mude o que precisa. Ao fechar, o orçamento refaz-se com o que mudou." : "Confirmar o local, as necessidades e as medidas.", btn: "Fechar levantamento", act: "fecharVisita", who: "comercial" };
    case 3:
      if (!o!.enviada) {
        if (!o!.verif) return { t: o!.versoes?.length ? `Verificar e enviar a versão ${versaoAtual(o!)}` : "Verificar e enviar a proposta", sub: o!.versoes?.length ? `Substitui a v${versaoAtual(o!) - 1}, enviada a ${o!.versoes.at(-1)!.enviada}. A Olyvia verifica as margens antes de enviar.` : "A Olyvia verifica as margens e os custos antes de enviar.", btn: "Verificar", act: "verificar", who: "comercial" };
        if (bloqueado(d, S))
          return o!.aprov === "pedida"
            ? { t: "À espera da aprovação da Direção", sub: "Pedido de exceção à margem mínima.", who: "direcao", wait: true }
            : { t: "Resolver os bloqueios", sub: "Corrigir o preço ou pedir aprovação à Direção.", btn: "Ver bloqueios", act: "irVerif", who: "comercial" };
        return { t: o!.versoes?.length ? `Enviar a versão ${versaoAtual(o!)}` : "Enviar a proposta", sub: o!.vendaDireta ? "Venda direta: a proposta aceite dispensa o contrato." : "Vai para o portal do cliente.", btn: "Enviar proposta", act: "enviar", who: "comercial" };
      }
      if (!o!.aceite && o!.pedidoCliente) {
        const pc = o!.pedidoCliente, pediu = [...pc.motivos, pc.nota ? "«" + pc.nota + "»" : ""].filter(Boolean).join(", ");
        return { t: "O cliente pediu alterações", sub: `No portal, ${pc.q}: ${pediu || "sem detalhe"}. Faça a versão ${versaoAtual(o!) + 1}: a v${versaoAtual(o!)} fica guardada.`, btn: "Fazer a nova versão", act: "pedidoCliente", who: "comercial" };
      }
      if (!o!.aceite) return { t: "À espera do cliente", sub: "Proposta no portal desde " + o!.enviada + ".", who: "cliente", wait: true, sim: "aceitar" };
      if (!o!.vendaDireta && o!.contrato !== "assinado")
        return o!.contrato === "enviado"
          ? { t: "À espera da assinatura do contrato", sub: "Contrato no portal do cliente.", who: "cliente", wait: true, sim: "assinar" }
          // 15/10 (Ruben): o cliente aceita no portal e é o comercial que gera o contrato; aparece no mesmo link, por assinar
          : o!.contratoPedido
          ? { t: "O cliente pediu alterações ao contrato", sub: `Cláusulas: ${o!.contratoPedido.clausulas.map((x) => x.c.toLowerCase()).join(", ")}. O Jurídico revê e valida; depois o comercial envia a versão ${(o!.contratoVersoes?.length ?? 0) + 1}.`, btn: "Rever o contrato", act: "abrirRevisao", who: "juridico" }
          : o!.contratoRevisto
          ? { t: `Enviar o contrato (versão ${(o!.contratoVersoes?.length ?? 0) + 1})`, sub: `Revisto e validado pelo Jurídico (${o!.contratoRevisto.por}, ${o!.contratoRevisto.q}). Volta ao portal do cliente, por assinar.`, btn: "Enviar o contrato", act: "enviarContrato", who: "comercial" }
          : { t: "O cliente aceitou. Gerar o contrato", sub: `Aceite ${o!.aceite === "hoje" ? "hoje" : "a " + o!.aceite}, no portal. O contrato segue a proposta e aparece no mesmo link do cliente, por assinar.`, btn: "Gerar o contrato", act: "enviarContrato", who: "comercial" };
      return { t: "—" };
    case 4:
      // 19/10: na V2 a Olyvia não emite faturas: o Financeiro regista a do programa certificado (sem botão no passo)
      if (!d.fin.fatura && lerVersao() !== "atual") return { t: "Registar a fatura", sub: "Emita-a no programa de faturação certificado e registe-a no Financeiro do negócio.", who: "financeiro" };
      if (!d.fin.fatura) return { t: "Emitir a fatura", sub: "Vai para o portal do cliente.", btn: "Emitir fatura", act: "emitir", who: "financeiro" };
      return { t: "Validar o pagamento", sub: `Confirmar que o valor da ${d.fin.fatura.n} entrou na conta. O recibo é emitido ao validar.`, btn: "Validar pagamento", act: "validar", who: "financeiro" };
    case 5: {
      const p = d.obra.plano!;
      // do pagamento ao arranque: o passo à espera, pela ordem (encomenda, plano, arranque)
      if (p.estado === "por aprovar" || p.estado === "aprovado") {
        const a = passosAgora(d, S)[0];
        if (a) return { t: a.t, sub: a.sub, btn: a.btn, act: a.act, who: a.who! };
      }
      if (p.estado === "por aprovar") return { t: conflitos(p).length ? "Operações: resolver um conflito e aprovar o plano" : "Operações: aprovar o plano", sub: "Plano gerado a partir do contrato.", btn: "Abrir plano", act: "abrirPlano", who: "operacoes" };
      if (p.estado === "aprovado") {
        // 19/10: os materiais por garantir no Inventário (aprovar ou receber as encomendas a fornecedor) seguram o arranque
        const F = faltaParaArrancar(d);
        if (F.length) return { t: "À espera dos materiais", sub: "Para arrancar falta " + F.join(", ") + ".", btn: "Abrir Inventário", act: "abrirInv", who: "armazem" };
        return { t: "Operações: arrancar a obra", sub: "Plano aprovado e materiais garantidos.", btn: "Abrir plano", act: "abrirPlano", who: "operacoes" };
      }
      if (p.estado === "em curso") return { t: "Obra em curso", sub: "As Operações registam o fim da obra.", btn: "Abrir plano", act: "abrirPlano", who: "operacoes" };
      if (d.obra.auto?.estado === "por assinar") return { t: "À espera do auto de receção", sub: `O ${d.obra.auto.n} está no portal do cliente para assinar. Assinado, começa a garantia e o cliente recebe o relatório da obra.`, who: "cliente", wait: true, sim: "auto" };
      if (!d.obra.aprendido) return { t: "Rever a margem real", sub: "A obra acabou. Comparar o previsto com o real.", btn: "Ver resultado", act: "irObra", who: "comercial" };
      return { t: "Negócio fechado", sub: "O cliente fica em Clientes, com o histórico.", done: true };
    }
  }
  return { t: "—" };
}

export const aberto = (S: Estado) => S.deals.filter((d) => !d.perdido);

export function minhas(S: Estado, role: Papel) {
  const L: { d: Negocio; p: Proximo; dir?: boolean }[] = [];
  for (const d of aberto(S)) {
    const p = proximo(d, S);
    if (role === "direcao" && d.fase === 3 && d.orc && d.orc.aprov === "pedida")
      L.push({ d, p: { t: "Aprovar exceção à margem", sub: pct(tot(d, S).m) + " de margem · mínimo " + S.cfg.min + "%" }, dir: true });
    // do contrato à obra: o pagamento primeiro; depois o plano (a encomenda emite-se sozinha com o pagamento), cada um de quem é
    else if (d.fase >= 4 && d.obra.plano && (d.obra.plano.estado === "por aprovar" || d.obra.plano.estado === "aprovado")) {
      for (const a of passosAgora(d, S)) if (a.who === role) L.push({ d, p: { t: a.t, sub: a.sub, btn: a.btn, act: a.act, who: a.who } });
    }
    else if (p.who === role && !p.wait && !p.done) L.push({ d, p });
  }
  return L;
}

/* ------------------------------------------------------------------ ações */
export type TipoAviso = "ok" | "auto" | "bad" | "";
export interface Aviso { msg: string; sub?: string; kind?: TipoAviso; act?: { label: string; fn: () => void }; atraso?: number }
export type Avisar = (a: Aviso) => void;

const agora = () => {
  const t = new Date();
  return "hoje " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
};
function log(d: Negocio, t: string, k: Evento["k"] = "a") { d.hist.unshift({ t, q: agora(), k }); }
/** Do contrato à obra (preparacaoObra.ts): o plano do orçamento, por aprovar. A encomenda de cliente só nasce com o pagamento validado. */
export function prepararPlanoDe(d: Negocio, S: Estado) {
  d.obra.plano = planoDoOrcamento(d, S);
}
function fase(d: Negocio, n: number) { d.fase = n; d.valida = null; preencher(d, n); log(d, "Passou a " + FASES[n] + " · sozinho"); }

const hojeISO = () => new Date().toISOString().slice(0, 10);

/** Preenche só o que está vazio e marca como sugestão da Olyvia. */
function sugerir(d: Negocio, o: Record<string, string>) {
  for (const k in o) if (!d.f[k] && o[k]) { d.f[k] = o[k]; (d.sug ??= {})[k] = true; }
}

/** O prazo de execução da proposta vem do prazo previsto (Gantt) e acompanha-o enquanto for sugestão (ninguém o mexeu). */
export function sugerirPrazo(d: Negocio, S: Estado) {
  if (!d.orc || d.orc.enviada || d.fase < 3 || (d.f.prazo_exec && !d.sug?.prazo_exec)) return;
  const T = tarefasPrevistas(d, S);
  if (!T.length) return;
  d.f.prazo_exec = String(prazoProposta(T));
  (d.sug ??= {}).prazo_exec = true;
}

// Uma resposta que dá outra: o que se sabe por dedução vem preenchido (como sugestão).
const AREA_TIPO: Record<string, [string, string, string]> = {
  T0: ["35", "1", "1"], T1: ["55", "2", "1"], T2: ["80", "3", "1"], T3: ["110", "4", "2"], T4: ["140", "5", "2"], "T5+": ["180", "6", "3"],
};
export function derivar(d: Negocio, k: string) {
  const f = d.f, v = f[k] || "";
  if (k === "tipologia" && AREA_TIPO[v]) { const [a, dv, wc] = AREA_TIPO[v]; sugerir(d, { area_util_m2: a, n_divisoes: dv, n_casas_banho: wc }); }
  if (k === "tem_elevador" && v === "Sim") sugerir(d, { n_elevadores: "1" });
  if (k === "gas" && v === "Sem gás") sugerir(d, { diag_gas: "Não há" });
  if (k === "localidade" && v) sugerir(d, { concelho: v });
  if (k === "fracao" && v) {
    const m = /^\s*(\d+)/.exec(v);
    const andar = /r\/?c|rés/i.test(v) ? "0" : m ? m[1] : "";
    if (andar) sugerir(d, { andar });
  }
  if (k === "pagamento") sugerir(d, { tranche: v === "100% na adjudicação" ? "Única" : "1.ª (adjudicação)" });
  if (k === "diag_tipo_area" && v === "Cozinha") sugerir(d, { diag_toalheiro: "Não" });
  if (k === "diag_tipo_area") {
    // várias divisões: fixa a principal e, numa cozinha que não é a principal, também não há toalheiro
    reorganizarDivisoes(f);
    const princ = divisaoPrincipal(f);
    for (const div of divisoesEscolhidas(f)) if (div === "Cozinha" && div !== princ) sugerir(d, { [prefixoDivisao(div) + "diag_toalheiro"]: "Não" });
  }
  if (k === "habitada_durante_obra" && v) sugerir(d, { chaves: v === "Sim" ? "O cliente abre" : "Chave entregue" });
}

// Proteções sugeridas a partir da ficha do local e da área (como em sugestaoFichaLocal.ts).
export function protecoesSugeridas(f0: Record<string, string>): string {
  const f = juntarDivisoes(f0); // várias divisões: contagens somadas, pior caso nas escolhas
  const p: string[] = [];
  const caminho = f.diag_distancia_entrada?.startsWith("Longa") ? 20 : f.diag_distancia_entrada?.startsWith("Média") ? 12 : 5;
  p.push(`Cartão canelado no caminho (${caminho} m)`);
  if (Number(f.diag_portas_proteger) > 0) p.push(`plástico nas ${f.diag_portas_proteger} portas`);
  if (f.tem_elevador === "Sim") p.push("proteção do elevador");
  if (f.diag_mobilada === "Muito") p.push("cobrir os móveis no caminho");
  if (f.diag_local_cortes === "Na própria área") p.push("aspiração nos cortes");
  if (f.estacionamento === "Pago") p.push("parquímetro previsto na logística");
  return p.join(", ") + ".";
}

// O que já se sabe ao entrar numa fase vem preenchido; o que lá estiver não se toca.
function preencher(d: Negocio, n: number) {
  const f = d.f, def = (o: Record<string, string>) => sugerir(d, o);
  if (n === 1 && d.local.includes(",")) {
    const [rua, ...resto] = d.local.split(",");
    def({ morada: rua.trim(), localidade: resto.join(",").trim() });
  }
  if (n === 2) {
    def({ diag_tipo_area: d.linha === "coz" ? "Cozinha" : "Casa de banho", diag_intervencao_tipo: "Remodelação total" });
    if (d.linha === "coz") def({ diag_toalheiro: "Não" });
    derivar(d, "fracao"); derivar(d, "localidade");
  }
  if (n === 3) {
    const h = d.orc ? d.orc.linhas.reduce((a, l) => a + (l.t === "svc" ? (SVC0[l.sid]?.h || 0) * l.q : 0), 0) : 0;
    def({ validade: "30 dias", prazo_exec: String(Math.max(3, Math.ceil(h / 7))), garantia: "2 anos", pagamento: "50% + 50% no fim",
      modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben" });
  }
  if (n === 4) def({ nome_fiscal: d.nome, nif_fat: f.nif || "", morada_fiscal_igual: "Sim", email_fat: f.email || "", serie: "FT 2026",
    tranche: f.pagamento === "100% na adjudicação" ? "Única" : "1.ª (adjudicação)", vencimento: "15 dias", metodo: "Transferência" });
  if (n === 5) def({ data_pag: hojeISO(), responsavel: "Filipe", horario: "Dias úteis 8h–17h", chaves: f.habitada_durante_obra === "Sim" ? "O cliente abre" : "Chave entregue",
    contacto_local: d.nome + " · " + d.tel, contentor: "Não", protecoes: protecoesSugeridas(f) });
}
function criarCliente(S: Estado, d: Negocio) {
  if (!S.clientes.some((c) => c.deal === d.id)) S.clientes.unshift({ nome: d.nome, tel: d.tel, local: LINHAS[d.linha].n + (d.local ? " · " + d.local : ""), desde: "hoje", deal: d.id });
  log(d, "Cliente criado em Clientes");
}

// Cada ação muda o estado no sítio. `run` (no ecrã) repõe o desenho a seguir.
export function acoes(S: Estado, avisar: Avisar, run: (fn: () => void) => void) {
  const deal = (id: number) => S.deals.find((d) => d.id === id)!;
  /** 19/10: a ação pede a permissão ao papel atual (permissoes.ts); sem ela, avisa e não faz nada. Está aqui (e não só nos ecrãs) porque há
   *  ecrãs que chamam a ação do passo sem olhar para o papel. */
  const exigePerm = (p: PermNeg): boolean => {
    if (podeNeg(S.role, p)) return true;
    avisar({ ...SEM_PERM[p], kind: "bad" });
    return false;
  };

  // Não se passa de fase sem os campos obrigatórios. Se faltar algo, abre o
  // negócio, marca os campos e diz quantos faltam.
  const portao = (d: Negocio, gs0: Grupo[], extra: { id: string; t: string }[] = []) => {
    // os campos como a empresa os definiu (nomes, obrigatórios, escondidos, campos novos)
    const gs = gs0.map((g) => efetivo(S.campos, g)).filter((g) => !g.oculto);
    const faltam = [...emFalta(gs, d.f).map((c) => c.l), ...extra.map((x) => x.t)];
    if (!faltam.length) { d.valida = null; return true; }
    d.valida = { fase: d.fase, grupos: [...gs.map((g) => g.titulo), ...extra.map((x) => x.id)] };
    S.view = "negocio"; S.deal = d.id; S.confirmPerda = null; S.pulse = "falta";
    avisar({ msg: faltam.length === 1 ? "Falta preencher 1 campo" : `Falta preencher ${faltam.length} campos`, sub: faltam.slice(0, 4).join(", ") + (faltam.length > 4 ? "…" : ""), kind: "bad" });
    return false;
  };
  const prepararObra = (d: Negocio) => {
    prepararPlanoDe(d, S);
    log(d, "Plano da obra gerado do orçamento · " + d.obra.plano!.tasks.length + " tarefas · por aprovar (Operações, depois do pagamento)");
    avisar({ msg: "Plano da obra gerado", sub: "A encomenda de cliente emite-se quando o pagamento for validado", kind: "auto", atraso: 500 });
  };
  /** A encomenda de cliente, emitida no Inventário novo (16/10): reserva FIFO do stock e encomenda ao fornecedor do que faltar.
   *  Idempotente: se já existe, não faz nada. Devolve se a encomenda ficou emitida. */
  const emitirEc = (d: Negocio): boolean => {
    if (d.obra.ec) return true;
    const ec = gerarEncCliente(d, S, idEcNegocio(d), agora());
    ec.ref = refNegocio(d); ec.emitida = { por: PAPEIS[S.role].n, q: agora() };
    const r = emitirNoInventario(pedidoDoNegocio(d, ec));
    if (!r.ok) {
      log(d, "Encomenda de cliente não emitida no Inventário: " + r.erro, "x");
      avisar({ msg: "A encomenda de cliente não foi emitida", sub: r.erro, kind: "bad" });
      return false;
    }
    // o que o Inventário reservou do stock ao emitir; o resto foi ao fornecedor (o estado vivo lê-se lá). As linhas seguem a mesma ordem.
    const linhasInv = r.valor.lines.filter((l) => l.sku);
    ec.linhas.forEach((x, i) => { const l = linhasInv[i]; if (l) { x.res = Math.min(x.q, l.stockQty); x.falta = r2(Math.max(0, x.q - l.stockQty)); } });
    d.obra.ec = ec;
    // fotografia na emissão: o estado vivo lê-se no Inventário
    d.obra.mats = ec.linhas.filter((x) => x.k).map((x) => ({ n: x.n, un: x.un, k: x.k!, q: x.q, res: x.res, falta: x.falta }));
    const res = resumoEcNegocio(lerInventario(), ec.ref);
    log(d, "Encomenda de cliente " + ec.n + " emitida no Inventário" + (res ? " · " + textoResumoEc(res) : ""));
    // 21/10: os materiais das tarefas juntadas antes do pagamento vão numa encomenda de ajuste, logo a seguir
    ajustar(d, "materiais das tarefas novas do plano");
    return true;
  };
  /** 21/10: a encomenda de ajuste com os materiais novos do plano (encomendasAjuste.ts), o registo e o aviso. Devolve se emitiu. */
  const ajustar = (d: Negocio, motivo: string): boolean => {
    const r = encomendarAjustes(d, motivo, PAPEIS[S.role].n, agora());
    if (!r) return false;
    if ("erro" in r) {
      log(d, "Encomenda de ajuste não emitida no Inventário: " + r.erro, "x");
      avisar({ msg: "A encomenda dos materiais novos não foi emitida", sub: r.erro, kind: "bad" });
      return false;
    }
    const p = d.obra.plano!, n = r.ec.linhas.length;
    const partes = [r.reservadas ? `${r.reservadas} reservado${r.reservadas === 1 ? "" : "s"} do stock` : "", r.aFornecedor ? `${r.aFornecedor} ao fornecedor${r.chegada ? `, chega a ${r.chegada.slice(8, 10)}/${r.chegada.slice(5, 7)}` : ""}` : ""].filter(Boolean);
    log(d, `Encomenda de ajuste ${r.ec.n} emitida no Inventário (${motivo}): ${r.ec.linhas.map((x) => `${x.n} × ${x.q} ${x.un}`).join(", ")}${partes.length ? " · " + partes.join(" · ") : ""}`);
    for (const t of r.adiadas) log(d, `Plano: ${t.nome} passa para ${rotuloDia(p, t.dia)}, depois de os materiais chegarem`, "w");
    avisar({ msg: `Encomenda ${r.ec.n} no Inventário`, sub: `${n} ${n === 1 ? "material novo" : "materiais novos"}${partes.length ? " · " + partes.join(" · ") : ""}${r.adiadas.length ? ` · ${r.adiadas.map((t) => t.nome).join(", ")} passa${r.adiadas.length > 1 ? "m" : ""} para ${rotuloDia(p, r.adiadas[0].dia)}` : ""}`,
      kind: "auto", atraso: 400, act: { label: "Ver no Inventário", fn: () => run(() => A.abrirInv(d.id)) } });
    return true;
  };
  const extrasVisita = (d: Negocio) => {
    const L = LINHAS[d.linha], v = d.visita, x: { id: string; t: string }[] = [];
    if (!visitaFeita(d) && !visitas(d).some((n) => campoVisita(d, n, "estado") !== "Cancelada")) x.push({ id: "visitas", t: "Uma visita por cancelar" });
    const semMedida = camposMedida(L).filter(([k]) => medidaEmFalta(v.med, k));
    if (semMedida.length) x.push({ id: "medidas", t: "Medidas: " + semMedida.map(([, l]) => l).join(", ") });
    const servicos = servicosVisita(d).length;
    if (!servicos) x.push({ id: "nec", t: "Pelo menos um serviço" });
    // os serviços que obrigam a produto: a pergunta respondida e o produto escolhido
    for (const f of faltaProdutosVisita(d, S)) x.push({ id: "nec", t: f.t });
    if (!(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim") x.push({ id: "fotos", t: "Fotografias (ou marcar que o cliente não quis)" });
    return x;
  };

  // 21/10/2026: a visita não se marca como feita à mão. Fica feita sozinha quando as necessidades
  // (serviços, produtos, medidas, fotografias) ficam completas, e volta a marcada se deixarem de estar.
  const necessidadesCompletas = (d: Negocio) => !extrasVisita(d).some((x) => x.id !== "visitas");
  const sincronizarVisita = (d: Negocio) => {
    if (d.fase !== 2 || d.visita.fechada || d.perdido) return;
    const vs = visitas(d), est = (n: number) => campoVisita(d, n, "estado") || "Marcada";
    if (necessidadesCompletas(d)) {
      // as marcadas que já deviam ter acontecido; se ainda nenhuma foi feita e nenhuma passou, a primeira marcada
      const hoje = new Date().toISOString().slice(0, 10), marcadas = vs.filter((n) => est(n) === "Marcada");
      const passadas = marcadas.filter((m) => campoVisita(d, m, "data") <= hoje);
      const feitas = passadas.length ? passadas : visitaFeita(d) ? [] : marcadas.slice(0, 1);
      for (const n of feitas) {
        d.f[`v${n}_estado`] = "Feita"; d.f[`v${n}_auto`] = "1";
        log(d, `Visita ${vs.indexOf(n) + 1} feita · as necessidades ficaram completas`);
      }
      if (feitas.length) avisar({ msg: feitas.length > 1 ? "Visitas feitas" : `Visita ${vs.indexOf(feitas[0]) + 1} feita`, sub: "As necessidades ficaram completas", kind: "ok" });
    } else for (const n of vs) if (d.f[`v${n}_auto`] && est(n) === "Feita") {
      d.f[`v${n}_estado`] = "Marcada"; delete d.f[`v${n}_auto`];
      log(d, `Visita ${vs.indexOf(n) + 1} volta a marcada · as necessidades deixaram de estar completas`, "w");
    }
  };

  const A = {
    nav(v: Vista) { S.view = v; S.deal = null; S.op = null; S.confirmPerda = null; },
    abrir(id: number) { S.view = "negocio"; S.deal = id; S.confirmPerda = null; },
    role(r: Papel) { S.role = r; },
    aspeto(v: "simples" | "atual") { S.aspeto = v; },
    leitura(v: boolean) { S.leitura = v; },
    filtro(f: string) { S.filtro = f; },
    novo() { S.view = "negocios"; S.novo = { nome: "", tel: "", linha: "wc", err: "" }; },
    novoCancel() { S.novo = null; },
    /** 21/10: um negócio novo para um cliente que já existe (área de Clientes): leva os dados da pessoa e a morada da obra escolhida, e abre-se logo. */
    novoNegocioCliente(nome: string, linha: LinhaId, pedido: string, obra: { morada: string; cp: string; localidade: string }) {
      const dele = S.deals.filter((d) => d.nome === nome);
      if (!dele.length) return;
      const base = dele.reduce((a, d) => (d.id > a.id ? d : a), dele[0]);
      const ficha = S.fichas?.[nome] || {};
      const daPessoa: Record<string, string> = {};
      for (const k of CAMPOS_PESSOA) { const v = ficha[k] ?? base.f[k]; if (v) daPessoa[k] = v; }
      const id = S.seq++;
      S.deals.unshift(novoDeal({ id, nome, tel: ficha.tel || base.tel, linha, servico: LINHAS[linha].n, local: [obra.morada, obra.localidade].filter(Boolean).join(", "),
        origem: "cliente", quando: agora(), dono: base.dono, fresh: true,
        f: { ...daPessoa, ...(pedido.trim() ? { pedido: pedido.trim() } : {}), morada: obra.morada, cp: obra.cp, localidade: obra.localidade },
        hist: [{ t: "Novo negócio do cliente", q: agora(), k: "a" }] }));
      S.view = "negocio"; S.deal = id; S.confirmPerda = null;
      avisar({ msg: "Negócio criado", sub: `${nome} tem agora ${dele.length + 1} negócios · fase Lead`, kind: "ok" });
    },
    /** 21/10: muda um dado do cliente. O nome e o telefone mudam em todos os negócios dele; os outros ficam na ficha do cliente. */
    editarCliente(nome: string, k: string, v: string) {
      const val = v.trim();
      const dele = S.deals.filter((d) => d.nome === nome);
      if (k === "nome") {
        if (!val || val === nome) return;
        if (S.deals.some((d) => d.nome === val)) { avisar({ msg: "Já há um cliente com esse nome", sub: "Escolha outro nome", kind: "bad" }); return; }
        for (const d of dele) d.nome = val;
        for (const c of S.clientes) if (c.nome === nome) c.nome = val;
        if (S.fichas?.[nome]) { S.fichas[val] = S.fichas[nome]; delete S.fichas[nome]; }
        avisar({ msg: "Nome mudado", sub: `Em ${dele.length} ${dele.length === 1 ? "negócio" : "negócios"}`, kind: "ok" });
        return;
      }
      if (k === "tel") {
        if (!val) return;
        for (const d of dele) d.tel = val;
        for (const c of S.clientes) if (c.nome === nome) c.tel = val;
      }
      S.fichas = S.fichas || {};
      S.fichas[nome] = { ...(S.fichas[nome] || {}), [k]: val };
    },
    novoCriar(nome: string, tel: string, linha: LinhaId) {
      const n = S.novo!;
      n.nome = nome.trim(); n.tel = tel.trim(); n.linha = linha;
      if (!n.nome || !n.tel) { n.err = "Falta " + (!n.nome ? "o nome" : "o telefone ou o email") + "."; return; }
      const id = S.seq++;
      S.deals.unshift(novoDeal({ id, nome: n.nome, tel: n.tel, linha: n.linha, servico: LINHAS[n.linha].n, local: "", origem: "à mão", quando: agora(), f: { origem: "Telefone" }, hist: [{ t: "Negócio criado à mão", q: agora(), k: "a" }], fresh: true }));
      S.novo = null;
      // abre logo o negócio novo: o próximo passo (registar a chamada) fica à vista, sem ter de o procurar na lista
      S.view = "negocio"; S.deal = id; S.confirmPerda = null;
      avisar({ msg: "Negócio criado", sub: n.nome + " · fase Lead", kind: "ok" });
    },
    contactar(id: number) { const d = deal(id); if (!portao(d, LEAD)) return; if (!d.f.resultado) d.f.resultado = "Atendeu · interessado"; if (!d.f.tentativas) d.f.tentativas = "1"; log(d, "Chamada registada · " + d.f.resultado); fase(d, 1); avisar({ msg: "Chamada registada", sub: "Passou a Contacto", kind: "ok" }); },
    marcarVisita(id: number, slot?: string) { const d = deal(id); if (!portao(d, CONTACTO)) return; d.visita.slot = slot || SLOTS[0];
      if (!visitas(d).length) criarVisita(d, visitaDoSlot(d.visita.slot, { estado: "Marcada", presentes: d.f.presentes, duracao: d.f.duracao })); log(d, "Visita marcada para " + d.visita.slot); fase(d, 2); avisar({ msg: "Visita marcada", sub: d.visita.slot + " · fica na agenda do Rúben", kind: "ok" }); },
    fecharVisita(id: number) {
      const d = deal(id), L = LINHAS[d.linha];
      sincronizarVisita(d);
      if (!portao(d, [...visitas(d).map(grupoVisita), EXTERIOR, INTERIOR, ...gruposArea(S.campos, d.f), ESCOLHAS], extrasVisita(d))) return;
      const antes = d.orc && !d.orc.enviada ? d.orc : null; // um levantamento reaberto: o orçamento de antes
      d.visita.fechada = true; log(d, "Levantamento fechado"); d.orc = criarOrc(d, S);
      if (antes) preservarManuais(antes, d.orc, L);
      // a demolição calcula-se nos orçamentos novos (com o Catálogo ligado); os artigos e ajustes à mão de antes ficam
      ligarDemolicao(d.orc, antes?.demolicao);
      sincronizarEfeitos(d, S); sincronizarDemolicao(d, S); fase(d, 3); sugerirPrazo(d, S);
      avisar(antes
        ? { msg: "Orçamento refeito com a visita", sub: "Os preços e o desconto que tinha mudado mantêm-se", kind: "auto" }
        : { msg: "Orçamento criado com as medidas da visita", sub: `Modelo "${L.modelo}" · custos do Catálogo`, kind: "auto" });
    },
    /** Volta a abrir o levantamento (só antes de a proposta ser enviada): a visita fica editável e o negócio volta à Visita. */
    reabrirVisita(id: number) {
      const d = deal(id);
      if (d.fase !== 3 || !d.orc || d.orc.enviada) { avisar({ msg: "Já não se pode reabrir", sub: "A proposta já foi enviada ao cliente", kind: "bad" }); return; }
      d.visita.fechada = false; d.fase = 2; d.valida = null; d.orc.verif = false; d.orc.aprov = null;
      log(d, "Levantamento reaberto", "w");
      avisar({ msg: "De volta à visita", sub: "Ao fechar o levantamento, o orçamento refaz-se: os preços e o desconto que mudou mantêm-se", kind: "" });
    },
    /** Voltou à visita mas afinal não muda nada: o orçamento fica exatamente como estava (sem o refazer nem pedir os campos). */
    desistirVisita(id: number) {
      const d = deal(id);
      if (d.fase !== 2 || !d.orc) return;
      d.visita.fechada = true; d.fase = 3; d.valida = null; S.pulse = null;
      log(d, "Voltou ao orçamento sem mudar a visita");
      avisar({ msg: "De volta ao orçamento", sub: "Ficou tudo como estava", kind: "" });
    },
    /** O cliente pediu alterações a uma proposta enviada (e ainda não aceite): a versão atual fica guardada como substituída
     *  e abre-se a seguinte, para mexer só no orçamento ou também na visita (que então reabre). */
    novaVersao(id: number, motivos: string[], nota: string, onde: "orcamento" | "visita") {
      const d = deal(id), o = d.orc;
      // 14/10: também depois de aceite, enquanto o contrato não está assinado (o contrato enviado fica anulado)
      if (!o?.enviada || o.contrato === "assinado" || d.fase !== 3) { avisar({ msg: "Não há proposta para refazer", sub: o?.contrato === "assinado" ? "O contrato já foi assinado" : "A proposta ainda não foi enviada", kind: "bad" }); return; }
      const n = versaoAtual(o);
      (o.versoes ??= []).push({ n, enviada: o.enviada, aceite: o.aceite ?? undefined, substituida: agora(), total: tot(d, S).pf, totalIva: totaisIva(d, S).total, motivos: [...motivos], nota: nota.trim() || undefined, onde,
        prod: (d.visita.prod ?? []).map((p) => ({ ...p })), semParte: [...(d.visita.semParte ?? [])] });
      if (o.contrato === "enviado") log(d, "Contrato CT 2026/" + d.id + " anulado (a proposta vai mudar)", "w");
      o.enviada = null; o.verif = false; o.aprov = null; o.aceite = null; o.contrato = null; o.pedidoCliente = null;
      const porque = [...motivos, nota.trim()].filter(Boolean).join(", ").toLowerCase();
      log(d, `Proposta v${n} substituída${porque ? ": o cliente pediu " + porque : ""}`, "w");
      if (onde === "visita") {
        d.visita.fechada = false; d.fase = 2; d.valida = null;
        avisar({ msg: `A preparar a versão ${n + 1}`, sub: "De volta à visita. Ao fechar o levantamento, o orçamento refaz-se", kind: "" });
      } else avisar({ msg: `A preparar a versão ${n + 1}`, sub: `Mude o que o cliente pediu e envie. A v${n} fica guardada`, kind: "" });
    },
    /** 21/10: a versão nova faz-se num só sítio: mexer nos produtos da visita refaz o orçamento logo (sem voltar à visita);
     *  os preços, o desconto e as linhas à mão mantêm-se (preservarManuais). Só com a proposta por enviar. */
    refazerOrcamento(id: number) {
      const d = deal(id), antes = d.orc, L = LINHAS[d.linha];
      if (!antes || antes.enviada || d.fase !== 3) return;
      d.orc = criarOrc(d, S);
      preservarManuais(antes, d.orc, L);
      ligarDemolicao(d.orc, antes.demolicao);
      sincronizarEfeitos(d, S); sincronizarDemolicao(d, S);
    },
    /** 21/10: a versão nova pronta: verifica e envia ao portal num toque. Com bloqueios (margem abaixo do mínimo sem aprovação), não envia e diz porquê. */
    enviarVersao(id: number): boolean {
      const d = deal(id), o = d.orc;
      if (!o || o.enviada || d.fase !== 3) return false;
      // o início previsto da proposta é o do plano (o editor muda-o lá); sem ele, o primeiro dia útil possível
      if (!d.f.inicio_prev) d.f.inicio_prev = o.inicioObra ?? isoDia(iniciosRapidos(new Date())[0].data);
      o.verif = true;
      if (bloqueado(d, S)) { avisar({ msg: "Ainda não dá para enviar", sub: "A margem ficou abaixo do mínimo: baixe o desconto ou peça aprovação à Direção", kind: "bad" }); return false; }
      A.enviar(id);
      return !!o.enviada;
    },
    /** Produtos do Catálogo na visita: escolher (com a quantidade sugerida), mudar a quantidade, "o cliente fornece", tirar. */
    produto(id: number, p: Produto, q: number) { const v = deal(id).visita; if (p.servico) garantirServico(S, p.servico); v.prod = juntarProduto(v.prod ?? [], fotografia(p, q)); },
    produtoQtd(id: number, pid: string, q: number) { const v = deal(id).visita; v.prod = mudarQtd(v.prod ?? [], pid, q); },
    produtoCliente(id: number, pid: string, cliente: boolean) { const v = deal(id).visita; v.prod = marcarCliente(v.prod ?? [], pid, cliente); },
    tirarProduto(id: number, pid: string) { const v = deal(id).visita; v.prod = tirarProduto(v.prod ?? [], pid); },
    /** 21/10: trocar um produto por outro do Catálogo, no mesmo lugar e com a mesma quantidade (e "o cliente fornece"). */
    trocarProduto(id: number, pid: string, p: Produto) {
      const v = deal(id).visita, i = (v.prod ?? []).findIndex((x) => x.id === pid);
      if (i < 0) return;
      const velho = v.prod![i];
      if (p.servico) garantirServico(S, p.servico);
      const novo = fotografia(p, velho.q, velho.cliente);
      v.prod = v.prod!.filter((x, k) => k === i || x.id !== p.id).map((x) => (x.id === pid ? novo : x));
    },
    /** 21/10: tirar (ou repor) uma parte da estimativa de materiais do modelo (ex.: o cliente já tem o pavimento). */
    parteModelo(id: number, parte: string, fora: boolean) {
      const v = deal(id).visita, s = new Set(v.semParte ?? []);
      if (fora) s.add(parte); else s.delete(parte);
      v.semParte = [...s];
    },
    /** A resposta à pergunta de um serviço que obriga a produto (ex.: "O cliente mantém a sanita?"). */
    manter(id: number, sid: SvcId, r: "sim" | "nao" | null) { const v = deal(id).visita; v.manter ??= {}; if (r) v.manter[sid] = r; else delete v.manter[sid]; },
    /** O cliente compra o produto deste serviço (só quando o cliente fornece materiais): texto do que compra, ou null para desfazer. */
    clienteCompra(id: number, sid: SvcId, texto: string | null) { const v = deal(id).visita; v.clienteCompra ??= {}; if (texto) v.clienteCompra[sid] = texto; else delete v.clienteCompra[sid]; },
    verificar(id: number) {
      const d = deal(id); d.orc!.verif = true; S.pulse = "verif";
      const A2 = alertas(d, S);
      log(d, "Orçamento verificado · " + A2.filter((a) => a.k === "x").length + " bloqueio(s), " + A2.filter((a) => a.k === "w").length + " aviso(s)", A2.some((a) => a.k === "x") ? "x" : "a");
    },
    irVerif() { S.pulse = "verif"; },
    sugerido(id: number, i: number, v: number) { const d = deal(id); const l = d.orc!.linhas[i]; if (l.t === "svc") l.pu = v; else { l.preco = v; (d.orc!.precosMan ??= {})[l.d] = v; } d.orc!.aprov = null; log(d, "Preço corrigido para " + eur(v) + " €"); avisar({ msg: "Preço corrigido", sub: "A margem da linha volta ao alvo de " + S.cfg.alvo + "%", kind: "ok" }); },
    /** O preço de uma linha mudado à mão na lista do orçamento: o preço por unidade (serviço) ou o preço da linha (materiais, levantamento, produto). */
    precoLinha(id: number, i: number, v: number) {
      const d = deal(id), o = d.orc!, l = o.linhas[i];
      if (!l || o.enviada || !(v >= 0)) return;
      if (l.t === "mat" && l.d === LINHA_DEMOLICAO) { A.demolicaoAjuste(id, "preco", r2(v)); return; } // a demolição: o preço final ajustado
      if (l.t === "svc") l.pu = r2(v); else { l.preco = r2(v); (o.precosMan ??= {})[l.d] = l.preco; }
      o.aprov = null; d.fresh = false;
    },
    /** A quantidade de uma linha de serviço (no detalhe da linha). */
    qtdLinha(id: number, i: number, q: number) {
      const d = deal(id), o = d.orc!, l = o.linhas[i];
      if (l?.t !== "svc" || o.enviada || !(q >= 0)) return;
      l.q = r2(q); o.aprov = null; sincronizarDemolicao(d, S); sugerirPrazo(d, S);
    },
    /** Os dias de uma tarefa do prazo previsto (null volta aos dias das horas do orçamento). */
    prazoTarefa(id: number, chave: string, dias: number | null) {
      const d = deal(id), o = d.orc!;
      if (o.enviada) return;
      if (dias == null) { if (o.prazo) delete o.prazo[chave]; }
      else if (dias >= 0.5) (o.prazo ??= {})[chave] = Math.round(dias * 2) / 2;
      else return;
      if (o.prazo && !Object.keys(o.prazo).length) delete o.prazo;
      o.aprov = null; sugerirPrazo(d, S);
    },
    /** O prazo de execução da proposta passa a ser o do prazo previsto (e volta a acompanhá-lo). */
    /** O início previsto da obra (só muda as datas do plano: o custo e o preço não). */
    /** As condições de pagamento escolhidas no plano da obra; "Por fases" guarda as prestações sugeridas. */
    pagamentoPlano(id: number, pagamento: string, fases?: Orcamento["pagFases"]) {
      const d = deal(id), o = d.orc;
      if (!o || o.enviada) return;
      if (fases?.length) o.pagFases = fases; else delete o.pagFases;
      A.campo(id, "pagamento", pagamento);
    },
    /** O reforço no plano da obra: pessoas por ofício. Os dias mudados à mão mantêm-se (e contam com a equipa nova). */
    equipaObra(id: number, n: number) {
      const d = deal(id), o = d.orc;
      if (!o || o.enviada) return;
      if (n > 1) o.equipa = n; else delete o.equipa;
      o.aprov = null; sugerirPrazo(d, S);
    },
    inicioObra(id: number, iso: string | null) {
      const o = deal(id).orc;
      if (!o) return;
      if (iso) o.inicioObra = iso; else delete o.inicioObra;
    },
    usarPrazoPrevisto(id: number) {
      const d = deal(id);
      if (!d.orc || d.orc.enviada) return;
      delete d.f.prazo_exec; sugerirPrazo(d, S);
    },
    /** Liga (ou desliga) a demolição e entulho num orçamento (os de exemplo vêm sem ela). Desligar devolve as linhas de serviço. */
    demolicaoLigar(id: number, on: boolean) {
      const d = deal(id), o = d.orc!;
      if (o.enviada) return;
      if (on) { delete o.semDemolicao; ligarDemolicao(o); sincronizarDemolicao(d, S); }
      else if (o.demolicao) {
        o.semDemolicao = true;
        for (const it of o.demolicao.itens) {
          const sv = it.de ? garantirServico(S, it.de) : null;
          if (it.de && sv) o.linhas.splice(Math.max(0, o.linhas.findIndex((l) => l.t === "mat")), 0, { t: "svc", sid: it.de, q: it.q, cu: r2(custoUn(sv, S)), pu: sv.preco });
        }
        delete o.demolicao;
        o.linhas = o.linhas.filter((l) => !(l.t === "mat" && l.d === LINHA_DEMOLICAO));
      }
      o.aprov = null;
    },
    /** Um artigo de demolição no orçamento: a quantidade (0 tira-o). */
    demolicaoItem(id: number, codigo: string, q: number) {
      const d = deal(id), o = d.orc!;
      if (!o.demolicao || o.enviada || !(q >= 0)) return;
      const it = o.demolicao.itens.find((x) => x.codigo === codigo);
      if (it) { if (q > 0) it.q = r2(q); else o.demolicao.itens = o.demolicao.itens.filter((x) => x !== it); }
      else if (q > 0) o.demolicao.itens.push({ codigo, q: r2(q) });
      o.aprov = null; sincronizarDemolicao(d, S);
    },
    /** Um valor da demolição mexido à mão (meio, n.º, preço do contentor, horas, toneladas, preço final); null repõe o cálculo. */
    demolicaoAjuste<K extends ChaveAjuste>(id: number, k: K, v: AjustesDem[K] | null) {
      const d = deal(id), o = d.orc!;
      if (!o.demolicao || o.enviada) return;
      if (v == null) delete o.demolicao.aj[k]; else o.demolicao.aj[k] = v;
      // mudar o meio repõe o n.º (passa a ser o do meio novo)
      if (k === "meio") delete o.demolicao.aj.n;
      o.aprov = null; sincronizarDemolicao(d, S);
    },
    /** Volta ao preço calculado de uma linha de materiais (esquece o preço à mão). */
    reporPreco(id: number, i: number) {
      const d = deal(id), o = d.orc!, l = o.linhas[i];
      if (l?.t === "mat" && l.d === LINHA_DEMOLICAO) { A.demolicaoAjuste(id, "preco", null); return; }
      if (l?.t !== "mat" || !o.precosMan || o.enviada) return;
      delete o.precosMan[l.d];
      const p = (d.visita.prod ?? []).find((x) => !x.cliente && PREFIXO_PROD + textoProduto(x) === l.d);
      if (p) l.preco = precoProduto(p); else sincronizarEfeitos(d, S);
      o.aprov = null;
    },
    vistoAviso(id: number, key: string) { const d = deal(id); d.orc!.avisosVistos[key] = true; log(d, "Aviso visto: " + key.slice(2), "w"); },
    pedirAprov(id: number) {
      const d = deal(id); d.orc!.aprov = "pedida"; log(d, "Pedida aprovação à Direção", "w");
      avisar({ msg: "Pedido enviado à Direção", sub: "Aparece no Hoje da Direção. Mude de papel em cima para aprovar.", kind: "", act: { label: "Ver como Direção", fn: () => run(() => { S.role = "direcao"; S.view = "hoje"; S.deal = null; }) } });
    },
    aprovar(id: number) { const d = deal(id); d.orc!.aprov = "ok"; log(d, "Exceção aprovada pela Direção"); avisar({ msg: "Exceção aprovada", sub: d.nome + " · o comercial já pode enviar", kind: "ok" }); },
    recusarAprov(id: number) { const d = deal(id); d.orc!.aprov = null; log(d, "Exceção recusada pela Direção", "x"); avisar({ msg: "Exceção recusada", sub: "O comercial tem de corrigir o preço", kind: "bad" }); },
    enviar(id: number) {
      const d = deal(id); if (!portao(d, [PROPOSTA[0]])) return;
      const A2 = alertas(d, S).filter((a) => a.k === "w"); d.orc!.enviada = "hoje";
      const v = d.orc!.versoes?.length ? ` v${versaoAtual(d.orc!)}` : "";
      log(d, "Proposta" + v + " enviada ao portal do cliente" + (A2.length ? " · " + A2.length + " aviso(s) registados" : ""));
      avisar({ msg: "Proposta" + v + " enviada", sub: v ? "Está no portal do cliente; a anterior aparece como substituída" : "Está no portal do cliente", kind: "ok" });
    },
    aceitar(id: number) {
      const d = deal(id); d.orc!.aceite = "hoje"; d.orc!.pedidoCliente = null; log(d, "O cliente aceitou a proposta no portal");
      if (d.orc!.vendaDireta) { criarCliente(S, d); fase(d, 4); prepararObra(d); avisar({ msg: "Venda direta aceite", sub: "Cliente criado · passou a Financeiro", kind: "auto" }); }
      else avisar({ msg: "O cliente aceitou a proposta", sub: "Falta o comercial gerar o contrato", kind: "ok" });
    },
    recusar(id: number) { const d = deal(id); d.perdido = true; log(d, "O cliente recusou a proposta", "x"); avisar({ msg: "Negócio perdido", sub: d.nome, kind: "bad", act: { label: "Anular", fn: () => run(() => { d.perdido = false; }) } }); },
    enviarContrato(id: number) { const d = deal(id); if (d.orc?.contratoPedido) { avisar({ msg: "O contrato está com o Jurídico", sub: "Só se envia depois de validado", kind: "bad" }); return; } if (!portao(d, [PROPOSTA[1]])) return; d.orc!.contrato = "enviado"; log(d, "Contrato gerado e enviado para assinatura no portal"); avisar({ msg: "Contrato gerado", sub: "Já está no portal do cliente, por assinar", kind: "ok" }); },
    /** No portal (15/10): o cliente assina com o desenho ou a Chave Móvel Digital; guarda-se a assinatura e segue como "assinar". */
    assinarCom(id: number, a: Assinatura) {
      const d = deal(id), o = d.orc;
      if (!o || o.contrato !== "enviado") return;
      o.assinatura = { ...a };
      log(d, "Assinatura do contrato: " + (a.tipo === "digital" ? "Chave Móvel Digital" + (a.id ? " (" + a.id + ")" : "") : "desenhada no ecrã") + " · " + a.q);
      A.assinar(id);
    },
    assinar(id: number) { const d = deal(id); d.orc!.contrato = "assinado"; log(d, "Contrato assinado pelo cliente"); criarCliente(S, d); fase(d, 4); prepararObra(d); avisar({ msg: "Contrato assinado", sub: "Cliente criado sozinho · passou a Financeiro", kind: "auto" }); },
    /** Volta a emitir a encomenda de cliente no Inventário (se não chegou lá ao validar o pagamento). */
    emitirEc(id: number) {
      const d = deal(id);
      if (!exigePerm("finance.validate_payment")) return;
      if (!d.fin.pago) { avisar({ msg: "Primeiro, o pagamento", sub: "A encomenda de cliente emite-se quando o Financeiro valida o pagamento", kind: "bad" }); return; }
      if (d.obra.ec) return;
      if (emitirEc(d)) avisar({ msg: "Encomenda " + d.obra.ec!.n + " emitida", sub: "Já está no Inventário", kind: "ok" });
    },
    /** Trabalhos a mais (contrato assinado, obra por acabar): a adenda vai ao cliente para assinar. */
    criarAdenda(id: number, itens: { sid: string; q: number }[], motivo: string) {
      const d = deal(id);
      if (d.orc?.contrato !== "assinado" && !(d.orc?.vendaDireta && d.orc.aceite)) { avisar({ msg: "Ainda não há contrato", sub: "Antes do contrato, muda-se a proposta (nova versão)", kind: "bad" }); return; }
      if (d.obra.plano?.estado === "concluída") { avisar({ msg: "A obra já acabou", kind: "bad" }); return; }
      const linhas = itens.filter((x) => Number.isFinite(x.q) && x.q > 0).map((x) => linhaAdenda(S, x.sid, r2(x.q))).filter((x): x is NonNullable<typeof x> => !!x);
      if (!linhas.length) return;
      const n = "AD 2026/" + d.id + "-" + ((d.adendas?.length ?? 0) + 1);
      (d.adendas ??= []).push({ n, estado: "enviada", criada: agora(), motivo, linhas });
      log(d, "Adenda " + n + " enviada ao cliente: " + linhas.map((x) => x.n.toLowerCase()).join(", ") + " · +" + eur(totalAdenda(linhas)) + " € · +" + diasAdenda(linhas) + " dias");
      avisar({ msg: "Adenda " + n + " enviada", sub: "Está no portal do cliente para assinar", kind: "ok" });
    },
    /** O cliente assina a adenda (no portal): as tarefas entram no plano e o plano volta a aprovação, se já estava aprovado. */
    assinarAdenda(id: number, n: string) {
      const d = deal(id), a = d.adendas?.find((x) => x.n === n), p = d.obra.plano;
      if (!a || a.estado !== "enviada") return;
      a.estado = "assinada"; a.assinada = agora();
      log(d, "Adenda " + n + " assinada pelo cliente");
      if (p && p.estado !== "concluída") {
        const novas = juntarAoPlano(p, a);
        // 21/10: os materiais das tarefas da adenda (os consumíveis da receita de cada serviço) vão numa encomenda de ajuste
        novas.forEach((t, i) => { const x = a.linhas[i]; if (x) { t.mats = materiaisDoServico(x.sid, x.q); t.encomendado = []; } });
        ajustar(d, "adenda " + n);
        const voltou = p.estado === "aprovado";
        if (voltou) p.estado = "por aprovar";
        log(d, "Plano: " + a.linhas.length + " " + (a.linhas.length === 1 ? "tarefa" : "tarefas") + " da adenda juntas" + (voltou ? " · volta a aprovação das Operações" : ""), voltou ? "w" : "a");
        avisar({ msg: "Adenda assinada", sub: voltou ? "As tarefas entraram no plano: as Operações aprovam de novo" : "As tarefas entraram no plano da obra", kind: "ok" });
      } else avisar({ msg: "Adenda assinada", kind: "ok" });
    },
    /** No portal do cliente: pede alterações à proposta (o comercial vê no histórico e faz uma nova versão). */
    pedirAlteracoes(id: number, texto: string, motivos: string[] = []) {
      const d = deal(id), o = d.orc;
      if (!o?.enviada || o.aceite || o.contrato === "assinado") return;
      const nota = texto.trim();
      o.pedidoCliente = { motivos: [...motivos], nota: nota || undefined, q: agora() };
      const porque = [...motivos, nota].filter(Boolean);
      log(d, "O cliente pediu alterações no portal" + (porque.length ? ": " + porque.join(", ") : ""), "w");
      avisar({ msg: "Pedido enviado ao comercial", sub: "Recebe uma nova versão da proposta no portal", kind: "ok" });
    },
    /** No portal do cliente (15/10): recusa a proposta por completo, com os motivos. O negócio fica perdido (o comercial pode anular). */
    recusarProposta(id: number, motivos: string[], texto: string) {
      const d = deal(id), o = d.orc;
      if (!o?.enviada || o.aceite || o.contrato === "assinado") return;
      const nota = texto.trim();
      o.recusada = { motivos: [...motivos], nota: nota || undefined, q: agora() };
      o.pedidoCliente = null;
      d.perdido = true;
      d.motivoPerda = [...motivos, nota].filter(Boolean).join(", ") || "Recusou a proposta";
      log(d, "O cliente recusou a proposta no portal: " + d.motivoPerda, "x");
      avisar({ msg: "O cliente recusou a proposta", sub: d.motivoPerda, kind: "bad", act: { label: "Anular", fn: () => run(() => { d.perdido = false; o.recusada = null; log(d, "Recusa anulada pelo comercial"); }) } });
    },
    /** No portal do cliente: avisa que pagou, com a referência (o Financeiro confirma na conta e valida). */
    avisarPagamento(id: number, ref: string) {
      const d = deal(id);
      if (!d.fin.fatura || d.fin.pago) return;
      d.f.comprovativo = ref.trim() || "Comprovativo enviado no portal";
      if (!d.f.data_pag) d.f.data_pag = new Date().toISOString().slice(0, 10);
      log(d, "O cliente avisou no portal que pagou · " + d.f.comprovativo);
      avisar({ msg: "Comprovativo enviado", sub: "O Financeiro confirma na conta e valida o pagamento (sai o recibo)", kind: "ok" });
    },
    /** No portal do cliente (21/10): escolhe como paga a fatura (transferência, referência MB ou débito direto). */
    escolherMetodo(id: number, metodo: string) {
      const d = deal(id);
      if (!d.fin.fatura || d.fin.pago || d.f.comprovativo || d.f.metodo === metodo) return;
      d.f.metodo = metodo;
      log(d, "O cliente escolheu pagar por " + metodo.toLowerCase());
    },
    /** No portal do cliente (21/10): autoriza o débito direto na sua conta; o valor é debitado no vencimento e o Financeiro valida. */
    autorizarDebito(id: number, ibanCurto: string, titular: string) {
      const d = deal(id);
      if (!d.fin.fatura || d.fin.pago) return;
      Object.assign(d.f, { metodo: "Débito direto", debito_iban: ibanCurto, debito_titular: titular.trim(), comprovativo: "Débito direto autorizado · " + ibanCurto });
      log(d, `O cliente autorizou o débito direto na conta ${ibanCurto} (${titular.trim()})`);
      avisar({ msg: "Débito direto autorizado", sub: "O valor é debitado no vencimento; o Financeiro confirma e sai o recibo", kind: "ok" });
    },
    emitir(id: number) {
      const d = deal(id);
      if (!exigePerm("finance.invoice")) return;
      // 19/10: na V2 a fatura emite-se no programa certificado e regista-se no Financeiro do negócio (registarFatura)
      if (lerVersao() !== "atual") { avisar({ msg: "A fatura não se emite na Olyvia", sub: "Emita-a no programa de faturação certificado e registe-a no Financeiro do negócio", kind: "bad" }); return; }
      if (!portao(d, [FINANCEIRO[0], FINANCEIRO[1]])) return;
      d.fin.fatura = { n: "FT 2026/" + S.ft++, q: "hoje" }; log(d, d.fin.fatura.n + " emitida e enviada ao portal do cliente"); avisar({ msg: d.fin.fatura.n + " emitida", sub: "Enviada ao portal do cliente", kind: "ok" });
    },
    /** V2: regista a fatura emitida no programa certificado (o número, a data "dd/mm/aaaa" e a tranche). A primeira fica também como a fatura do negócio. */
    registarFatura(id: number, numero: string, dataPt: string, nomeTranche: string): boolean {
      const d = deal(id);
      if (!exigePerm("finance.invoice")) return false;
      if (!d.fin.fatura) d.fin.fatura = { n: numero.trim(), q: dataPt.slice(0, 5) };
      log(d, `Fatura ${numero.trim()} registada · ${nomeTranche} · emitida no programa certificado`);
      return true;
    },
    /** V2: o pagamento de uma tranche que não põe a obra a andar (já arrancou, ou não é a do disparo): só o recibo. Devolve o número (null: sem permissão). */
    reciboTranche(id: number, numeroFatura: string): string | null {
      const d = deal(id);
      if (!exigePerm("finance.validate_payment")) return null;
      const rc = "RC 2026/" + S.rc++;
      log(d, `Pagamento da ${numeroFatura} validado · ${rc} emitido`);
      return rc;
    },
    validar(id: number) {
      const d = deal(id);
      if (!exigePerm("finance.validate_payment")) return;
      // o sinal (a primeira prestação), com IVA, como na fatura
      if (!d.f.valor_recebido) d.f.valor_recebido = String(valorSinal(d, S));
      if (!d.f.data_pag) d.f.data_pag = new Date().toISOString().slice(0, 10);
      if (!portao(d, [FINANCEIRO[2]])) return;
      d.fin.pago = true; d.fin.recibo = { n: "RC 2026/" + S.rc++, q: "hoje" };
      log(d, "Pagamento validado · " + d.fin.recibo.n + " emitido");
      // 16/10: o pagamento validado emite logo a encomenda de cliente no Inventário novo (sem aprovação) e passa o negócio à Obra;
      // o plano veio do contrato (o negócio que ainda não o tenha ganha-o aqui): depois disto só pode faltar aprová-lo
      if (!d.obra.plano) d.obra.plano = planoDoOrcamento(d, S);
      const ok = emitirEc(d);
      fase(d, 5);
      const F = faltaParaArrancar(d);
      avisar({ msg: "Recibo " + d.fin.recibo.n + " emitido", sub: "Passou a Obra" + (F.length ? " · falta " + F.join(", ") : " · pronta a arrancar"), kind: "ok" });
      if (ok) avisar({ msg: "Encomenda " + d.obra.ec!.n + " no Inventário", sub: "Stock reservado; o que falta vai numa encomenda a fornecedor, por aprovar no Inventário", kind: "auto", atraso: 500, act: { label: "Ver no Inventário", fn: () => run(() => A.abrirInv(id)) } });
    },
    abrirPlano(id: number) { S.view = "operacoes"; S.op = id; S.deal = null; },
    /** Abre o Inventário; com um negócio, abre a encomenda de cliente dele (Saídas para clientes). */
    /** Abre Armazém › Receção do Inventário, filtrada pelo cliente/obra deste negócio (as encomendas a fornecedor da EC dele). */
    abrirRececao(id: number) { const ec = S.deals.find((x) => x.id === id)?.obra.ec; if (ec?.ref) pedirRececaoClienteInv(ec.ref); S.view = "inventario"; S.deal = null; },
    abrirInv(id?: number) { const ec = id != null ? S.deals.find((x) => x.id === id)?.obra.ec : null; if (ec?.ref) pedirAbrirEcInv(ec.n); S.view = "inventario"; S.deal = null; },
    irObra() { S.pulse = "sec-5"; },
    trocar(id: number, ti: number) {
      const d = deal(id); const t = d.obra.plano!.tasks[ti];
      const old = TECS.find((x) => x.id === t.tec)!;
      const alt = TECS.find((x) => x.sk === t.sk && x.id !== t.tec && diaDeFerias(x, d.obra.plano!, t.dia, t.dur) == null);
      if (!alt) return;
      t.tec = alt.id; log(d, `Plano: ${t.nome} passa de ${old.n} para ${alt.n}`); avisar({ msg: "Técnico trocado", sub: `${t.nome} · ${alt.n}`, kind: "ok" });
    },
    adiar(id: number, ti: number) {
      const d = deal(id), p = d.obra.plano!; const t = p.tasks[ti]; const tec = TECS.find((x) => x.id === t.tec)!;
      let nd = t.dia;
      while (diaDeFerias(tec, p, nd, t.dur) != null && nd < t.dia + 60) nd++;
      if (p.origem !== "orcamento") nd = Math.max(nd, 5); // o plano de exemplo: a fase seguinte não pode passar à frente
      const shift = nd - t.dia;
      // adia esta e as que começam depois dela (as anteriores ficam)
      p.tasks.forEach((x, i) => { if (i === ti || (i > ti && x.dia >= t.dia)) x.dia += shift; });
      log(d, `Plano: ${t.nome} adiado para ${rotuloDia(p, t.dia)}`);
      avisar({ msg: "Tarefa adiada", sub: "A obra acaba a " + rotuloDia(p, Math.max(...p.tasks.map((x) => x.dia + x.dur - 1))), kind: "ok" });
    },
    /** As Operações escolhem o técnico de uma tarefa (do mesmo ofício). */
    trocarTec(id: number, ti: number, tec: string) {
      const d = deal(id), t = d.obra.plano?.tasks[ti], novo = TECS.find((x) => x.id === tec);
      if (!t || !novo || t.tec === tec) return;
      const velho = TECS.find((x) => x.id === t.tec);
      guardarBase(d.obra.plano!);
      t.tec = tec; log(d, `Plano: ${t.nome} passa ${velho ? `de ${velho.n} ` : ""}para ${novo.n}`);
      avisarTecnico(d.obra.plano!, ti, `Tem uma tarefa nova: ${t.nome}, a partir de ${rotuloDia(d.obra.plano!, t.dia)}`, agora());
      if (velho) avisarTecnico(d.obra.plano!, ti, `${t.nome} passou para ${novo.n.split(" ")[0]}: já não é consigo`, agora(), velho.id);
      if (A.planoMudou(d)) return;
      avisar({ msg: "Técnico trocado", sub: `${t.nome} · ${novo.n}`, kind: "ok" });
    },
    /* -------------------------------------------- 15/10: as Operações ajustam o plano antes de arrancar (ajustesPlano.ts) */
    /** Um plano aprovado que muda volta a "por aprovar" (diz-o); devolve true se avisou. */
    planoMudou(d: Negocio): boolean {
      const p = d.obra.plano;
      if (p?.estado !== "aprovado") return false;
      p.estado = "por aprovar"; log(d, "Plano mudado depois de aprovado · volta a por aprovar", "w");
      avisar({ msg: "O plano mudou", sub: "Volta a por aprovar. Aprove de novo para os técnicos receberem as tarefas", kind: "" });
      return true;
    },
    /** A duração (dias úteis, ou h: horas úteis), o dia de início e a nota de uma tarefa. Só antes de a obra arrancar. */
    ajustarTarefa(id: number, ti: number, m: { dur?: number; h?: number; dia?: number; nota?: string }) {
      const d = deal(id), p = d.obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado === "em curso" || p.estado === "concluída") return;
      const antes = JSON.stringify(p.tasks.map((x) => [x.dia, x.dur, x.h]));
      if (m.dur != null) mudarDuracao(p, ti, m.dur);
      if (m.h != null) mudarHoras(p, ti, m.h);
      if (m.dia != null) mudarInicio(p, ti, m.dia);
      if (m.nota != null) { const n = m.nota.trim(); if ((t.nota ?? "") !== n) { t.nota = n || undefined; log(d, `Plano: nota em ${t.nome}${n ? ": " + n : " apagada"}`); } }
      if (JSON.stringify(p.tasks.map((x) => [x.dia, x.dur, x.h])) === antes) return;
      const quanto = m.h != null ? `${nfmt(t.h)} h` : `${t.dur} ${t.dur === 1 ? "dia" : "dias"}`;
      avisarTecnico(p, ti, `${t.nome} mudou: ${quanto} a partir de ${rotuloDia(p, t.dia)}`, agora());
      const fim = Math.max(...p.tasks.map((x) => x.dia + x.dur)) - 1, dif = diferencas(p).dias;
      log(d, `Plano: ${t.nome} · ${quanto} a partir de ${rotuloDia(p, t.dia)} · a obra acaba a ${rotuloDia(p, fim)}`);
      if (A.planoMudou(d)) return;
      avisar({ msg: "Plano ajustado", sub: `Acaba a ${rotuloDia(p, fim)}${dif ? ` · ${dif > 0 ? "+" : "−"}${Math.abs(dif)} ${Math.abs(dif) === 1 ? "dia" : "dias"} face ao orçamento` : ""}`, kind: "ok" });
    },
    /* -------------------------------------------- 15/10: o ciclo da tarefa na obra (obraOps.ts): técnico → fotografia → supervisor */
    /** O técnico começa a tarefa (ou volta a ela depois de uma correção). */
    comecarTarefa(id: number, ti: number) {
      const d = deal(id), t = d.obra.plano?.tasks[ti];
      if (!t || d.obra.plano!.estado !== "em curso") return;
      const e = t.exec ?? { estado: "em curso", horas: 0, fotos: [] };
      e.estado = "em curso"; t.exec = e;
    },
    /** O técnico regista as horas, junta ou tira fotografias e escreve uma nota. */
    registarTarefa(id: number, ti: number, m: { horas?: number; foto?: string; tirarFoto?: number; nota?: string }) {
      const d = deal(id), t = d.obra.plano?.tasks[ti];
      if (!t || d.obra.plano!.estado !== "em curso") return;
      const e = t.exec ?? { estado: "em curso", horas: 0, fotos: [] };
      if (e.estado === "validada") return;
      if (e.estado !== "feita") e.estado = "em curso";
      if (m.horas != null) e.horas = Math.max(0, Math.round(m.horas * 2) / 2);
      if (m.foto) e.fotos = [...e.fotos, m.foto].slice(-4);
      if (m.tirarFoto != null) e.fotos = e.fotos.filter((_, i) => i !== m.tirarFoto);
      if (m.nota != null) e.nota = m.nota.trim() || undefined;
      t.exec = e;
    },
    /** O técnico marca como feita: precisa das horas e de uma fotografia; vai para o supervisor validar. */
    marcarFeita(id: number, ti: number) {
      const d = deal(id), t = d.obra.plano?.tasks[ti];
      if (!t || !t.exec || d.obra.plano!.estado !== "em curso") return;
      const F = faltaParaFeita(t);
      if (F.length) { avisar({ msg: "Ainda não dá para marcar como feita", sub: "Falta " + F.join(" e "), kind: "bad" }); return; }
      t.exec.estado = "feita"; t.exec.feita = agora(); t.exec.motivo = undefined;
      const quem = TECS.find((x) => x.id === t.tec)?.n ?? "Técnico";
      // 21/10: sem registo do dia (o ecrã antigo), o "feita" leva o que está registado
      const ev = (t.exec.envios ??= []), ultimo = ev[ev.length - 1];
      if (ultimo?.k === "registo" && ultimo.dia === d.obra.plano!.dia) ultimo.k = "feita";
      else ev.push({ q: agora(), dia: d.obra.plano!.dia, quem, k: "feita", horas: t.exec.horas, fotos: t.exec.fotos.slice(), nota: t.exec.nota });
      (d.obra.diario ??= []).push({ q: agora(), quem, t: `${t.nome} feita: ${nfmt(t.exec.horas)} h${t.exec.nota ? `. ${t.exec.nota}` : ""}`, k: "horas", fotos: t.exec.fotos.slice(0, 2) });
      log(d, `Obra: ${t.nome} feita por ${quem} · por validar`);
      avisar({ msg: "Tarefa marcada como feita", sub: "O responsável de obra valida a seguir", kind: "ok" });
    },
    /** O supervisor valida: a tarefa fica com o visto no Gantt e as horas contam no previsto e real. */
    validarTarefa(id: number, ti: number) {
      const d = deal(id), t = d.obra.plano?.tasks[ti];
      if (!t?.exec || t.exec.estado !== "feita") return;
      t.exec.estado = "validada"; t.exec.validada = agora();
      // 21/10: validar a correção valida também a tarefa corrigida
      const orig = t.corrige != null ? d.obra.plano!.tasks[t.corrige] : null;
      if (orig?.exec && orig.exec.estado !== "validada") {
        orig.exec.estado = "validada"; orig.exec.validada = agora(); orig.exec.motivo = undefined;
        (orig.exec.envios ??= []).push({ q: agora(), dia: d.obra.plano!.dia, quem: PAPEIS[S.role].nome === "Filipe" ? "Filipe Rocha" : PAPEIS[S.role].nome, k: "validada", nota: "Validada depois da correção." });
      }
      (t.exec.envios ??= []).push({ q: agora(), dia: d.obra.plano!.dia, quem: PAPEIS[S.role].nome === "Filipe" ? "Filipe Rocha" : PAPEIS[S.role].nome, k: "validada" });
      (d.obra.diario ??= []).push({ q: agora(), quem: PAPEIS[S.role].nome, t: `Validou ${t.nome.toLowerCase()}.`, k: "validacao" });
      log(d, `Obra: ${t.nome} validada`);
      const falta = d.obra.plano!.tasks.filter((x) => x.exec?.estado !== "validada").length;
      avisar({ msg: `${t.nome} validada`, sub: falta ? `${falta} ${falta === 1 ? "tarefa ainda não validada" : "tarefas ainda não validadas"}` : "Todas as tarefas validadas: pode registar o fim da obra", kind: "ok" });
    },
    /** 21/10: o responsável de obra dá a tarefa por feita ele próprio, com uma fotografia (poupa tempo ao técnico): fica logo validada. */
    darPorFeita(id: number, ti: number, m: { fotos: string[]; nota: string }) {
      const d = deal(id), p = d.obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado !== "em curso" || t.dia > p.dia || t.exec?.estado === "validada") return;
      if (p.tasks.some((x) => x.corrige === ti && x.exec?.estado !== "validada")) return;
      if (!m.fotos.length) { avisar({ msg: "Ainda não dá para dar por feita", sub: "Falta uma fotografia", kind: "bad" }); return; }
      const eu = PAPEIS[S.role].nome === "Filipe" ? "Filipe Rocha" : PAPEIS[S.role].nome, nota = m.nota.trim() || "Dada por feita pelo responsável de obra.";
      const e: ExecTarefa = t.exec ?? { estado: "em curso", horas: 0, fotos: [] };
      // as horas: as registadas pelo técnico ou, sem registo, as previstas
      if (!(e.horas > 0)) e.horas = t.h;
      e.fotos = [...e.fotos, ...m.fotos].slice(-6); e.nota = nota; e.motivo = undefined;
      e.estado = "feita"; e.feita = agora();
      (e.envios ??= []).push({ q: agora(), dia: p.dia, quem: eu, k: "feita", fotos: m.fotos.slice(), nota });
      t.exec = e;
      (d.obra.diario ??= []).push({ q: agora(), quem: eu, t: `${t.nome}: ${nota}`, k: "horas", fotos: m.fotos.slice(0, 2) });
      // salta a validação: quem a daria é quem a deu por feita
      A.validarTarefa(id, ti);
    },
    /** O supervisor pede correção, com o motivo: volta ao técnico. */
    pedirCorrecao(id: number, ti: number, motivo: string, extra?: { horas: number; tec?: string | null }) {
      const d = deal(id), t = d.obra.plano?.tasks[ti];
      if (!t?.exec || t.exec.estado !== "feita" || !motivo.trim()) return;
      // 21/10: com o tempo estimado, a correção é uma tarefa nova para o técnico (atrasa o plano se não couber hoje) e volta à validação
      if (extra) {
        const p = d.obra.plano!, fimAntes = rotuloDia(p, fimDe(p.tasks) - 1);
        const nt = aplicarCorrecao(p, ti, motivo.trim(), extra.horas, extra.tec ?? t.tec);
        const c = p.tasks[nt], fimDepois = rotuloDia(p, fimDe(p.tasks) - 1), quem = TECS.find((x) => x.id === c.tec)?.n ?? "o técnico";
        t.exec.estado = "corrigir"; t.exec.motivo = motivo.trim();
        const eu = PAPEIS[S.role].nome === "Filipe" ? "Filipe Rocha" : PAPEIS[S.role].nome;
        (t.exec.envios ??= []).push({ q: agora(), dia: p.dia, quem: eu, k: "correcao", nota: `${motivo.trim()} · nova tarefa para ${quem.split(" ")[0]}, ${nfmt(extra.horas)} h a ${rotuloDia(p, c.dia)}` });
        (d.obra.diario ??= []).push({ q: agora(), quem: eu, t: `Pediu correção em ${t.nome.toLowerCase()}: ${motivo.trim()}. Nova tarefa para ${quem} (${nfmt(extra.horas)} h, ${rotuloDia(p, c.dia)})${fimAntes !== fimDepois ? `; a obra passa a acabar a ${fimDepois}` : ""}.`, k: "correcao" });
        log(d, `Obra: correção pedida em ${t.nome} · ${motivo.trim()} · ${nfmt(extra.horas)} h para ${quem}${fimAntes !== fimDepois ? ` · fim ${fimAntes} → ${fimDepois}` : ""}`, "w");
        avisar({ msg: `Correção enviada a ${quem.split(" ")[0]}`, sub: `Tem a tarefa no Hoje ${c.dia === p.dia ? "de hoje" : `a ${rotuloDia(p, c.dia)}`}${fimAntes !== fimDepois ? ` · a obra passa a acabar a ${fimDepois}` : " · a data de fim mantém-se"}`, kind: "" });
        return;
      }
      t.exec.estado = "corrigir"; t.exec.motivo = motivo.trim();
      (t.exec.envios ??= []).push({ q: agora(), dia: d.obra.plano!.dia, quem: PAPEIS[S.role].nome === "Filipe" ? "Filipe Rocha" : PAPEIS[S.role].nome, k: "correcao", nota: motivo.trim() });
      (d.obra.diario ??= []).push({ q: agora(), quem: PAPEIS[S.role].nome, t: `Pediu correção em ${t.nome.toLowerCase()}: ${motivo.trim()}`, k: "correcao" });
      log(d, `Obra: correção pedida em ${t.nome} · ${motivo.trim()}`, "w");
      avisar({ msg: "Correção pedida", sub: "Volta ao técnico, com o motivo", kind: "" });
    },
    /** O dia seguinte da obra (o protótipo não tem relógio): as tarefas de hoje mudam. */
    diaSeguinte(id: number) {
      const d = deal(id), p = d.obra.plano;
      if (!p || p.estado !== "em curso") return;
      const fim = Math.max(...p.tasks.map((x) => x.dia + x.dur));
      if (p.dia + 1 >= fim) { avisar({ msg: "É o último dia do plano", sub: "Registe o fim da obra quando estiver tudo validado", kind: "" }); return; }
      p.dia += 1; log(d, `Obra: dia ${p.dia + 1} de ${fim}`);
    },
    /* -------------------------------------------- 21/10: o dia a dia da obra (trabalhoObra.ts) */
    /** O dia da obra para trás ou para a frente (o protótipo não tem relógio): os registos feitos ficam. */
    irParaDia(id: number, dia: number) {
      const d = deal(id), p = d.obra.plano;
      if (!p || p.estado !== "em curso") return;
      const fim = Math.max(...p.tasks.map((x) => x.dia + x.dur)), nd = Math.max(0, Math.min(fim - 1, Math.round(dia)));
      if (nd === p.dia) return;
      p.dia = nd;
    },
    /** O técnico escolhe quem é no Hoje dele. */
    souTec(tec: string) { if (TECS.some((x) => x.id === tec)) S.tec = tec; },
    /** O técnico marca (ou desmarca) um passo das instruções; a tarefa começa com o primeiro. */
    marcarPasso(id: number, ti: number, k: number) {
      const d = deal(id), t = d.obra.plano?.tasks[ti];
      if (!t || d.obra.plano!.estado !== "em curso") return;
      const e = t.exec ?? { estado: "em curso", horas: 0, fotos: [] };
      if (e.estado === "validada" || e.estado === "feita") return;
      const L = new Set(e.passos ?? []);
      if (L.has(k)) L.delete(k); else L.add(k);
      e.passos = [...L].sort((a, b) => a - b); t.exec = e;
    },
    /** O registo do dia do técnico: as horas de hoje, as fotografias e a descrição. Com `feita`, pede a validação. */
    enviarRegisto(id: number, ti: number, m: { horas: number; fotos: string[]; nota: string; feita?: boolean }) {
      const d = deal(id), p = d.obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado !== "em curso") return;
      const e = t.exec ?? { estado: "em curso", horas: 0, fotos: [] };
      if (e.estado === "validada" || e.estado === "feita") return;
      const nota = m.nota.trim(), horas = Math.max(0, Math.round(m.horas * 2) / 2);
      const F: string[] = [];
      if (!(horas > 0)) F.push("as horas de hoje");
      if (!m.fotos.length) F.push("uma fotografia");
      if (!nota) F.push("o que fez hoje");
      if (F.length) { avisar({ msg: "Ainda não dá para enviar", sub: "Falta " + F.join(", ").replace(/, ([^,]*)$/, " e $1"), kind: "bad" }); return; }
      const quem = TECS.find((x) => x.id === t.tec)?.n ?? "Técnico", I = instrucoesDe(t);
      const feitos = (e.passos ?? []).map((k) => I.passos[k]).filter(Boolean);
      const ja = new Set((e.envios ?? []).flatMap((x) => x.passos ?? []));
      e.horas = Math.round((e.horas + horas) * 2) / 2;
      e.fotos = [...e.fotos, ...m.fotos].slice(-6);
      e.nota = nota; e.motivo = undefined;
      const envio: Envio = { q: agora(), dia: p.dia, quem, k: m.feita ? "feita" : "registo", horas, fotos: m.fotos.slice(), nota, passos: feitos.filter((x) => !ja.has(x)) };
      (e.envios ??= []).push(envio);
      if (m.feita) { e.estado = "feita"; e.feita = agora(); } else e.estado = "em curso";
      t.exec = e;
      (d.obra.diario ??= []).push({ q: agora(), quem, t: `${t.nome}: ${nota}${m.feita ? " · pronta a validar" : ""}`, k: "horas", fotos: m.fotos.slice(0, 2) });
      log(d, `Obra: registo de ${quem} em ${t.nome} · ${nfmt(horas)} h${m.feita ? " · feita, por validar" : ""}`);
      avisar(m.feita
        ? { msg: "Enviado ao responsável de obra", sub: "Valida a seguir. O cliente já vê as fotografias no portal.", kind: "ok" }
        : { msg: "Registo de hoje enviado", sub: "O responsável e o cliente já o veem", kind: "ok" });
    },
    /** As Operações ajustam o plano com a obra em curso (dias, início, técnico), com o motivo; podem avisar o cliente no portal. */
    ajustarAoVivo(id: number, ti: number, m: AjusteVivo, motivo: string, cliente: boolean) {
      const d = deal(id), p = d.obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado !== "em curso" || !motivo.trim()) return;
      const prev = preverAjuste(p, ti, m);
      if (!prev.texto) { avisar({ msg: "Nada mudou", sub: "Mude os dias, o início ou o técnico", kind: "" }); return; }
      const fimAntes = rotuloDia(p, prev.fimAntes - 1), tecAntes = t.tec;
      aplicarAjuste(p, ti, m);
      // 21/10: o técnico (e o que sai, se mudou) recebe o aviso no Hoje
      avisarTecnico(p, ti, `${t.nome}: ${prev.texto}`, agora());
      if (tecAntes && tecAntes !== t.tec) avisarTecnico(p, ti, `${t.nome} passou para outro técnico: já não é consigo`, agora(), tecAntes);
      const fimDepois = rotuloDia(p, prev.fimDepois - 1);
      const alt: Alteracao = { q: agora(), dia: p.dia, quem: PAPEIS[S.role].nome === "Filipe" ? "Filipe Rocha" : PAPEIS[S.role].nome, t: prev.texto, motivo: motivo.trim(), fimAntes, fimDepois, cliente };
      if (cliente) alt.avisoCliente = textoAvisoCliente(t.nome, motivo.trim(), fimAntes, fimDepois);
      (d.obra.alteracoes ??= []).unshift(alt);
      (d.obra.diario ??= []).push({ q: agora(), quem: alt.quem, t: `Plano ajustado: ${prev.texto} (${motivo.trim().toLowerCase()})${cliente ? " · cliente avisado" : ""}`, k: "marco" });
      log(d, `Plano ajustado em obra: ${prev.texto} · ${motivo.trim()}${cliente ? " · cliente avisado no portal" : ""}`, prev.fimDepois > prev.fimAntes ? "w" : "a");
      avisar({ msg: "Plano ajustado", sub: `${prev.fimDepois !== prev.fimAntes ? `Acaba a ${fimDepois}` : "A data de fim mantém-se"}${cliente ? " · o cliente vê o aviso no portal" : ""}`, kind: "ok" });
    },
    /** 21/10: uma mensagem na conversa da obra (do cliente no portal, ou da empresa na página da obra). */
    mensagemObra(id: number, de: "cliente" | "empresa", texto: string) {
      const d = deal(id), t = texto.trim();
      if (!t) return;
      const quem = de === "cliente" ? d.nome : S.role === "operacoes" ? "Filipe Rocha" : PAPEIS[S.role].nome;
      (d.obra.chat ??= []).push({ de, quem, t, q: agora(), lida: de === "empresa" });
      if (de === "cliente") log(d, "Mensagem do cliente no portal: " + t);
      // as mensagens do cliente que estavam por ler ficam lidas quando a empresa responde
      if (de === "empresa") for (const m of d.obra.chat) if (m.de === "cliente") m.lida = true;
    },
    /** A empresa leu a conversa. */
    lerChat(id: number) { for (const m of deal(id).obra.chat ?? []) if (m.de === "cliente") m.lida = true; },
    /** Uma ocorrência no diário de obra (ex.: um imprevisto). */
    ocorrencia(id: number, texto: string) {
      const d = deal(id); if (!texto.trim()) return;
      const quem = S.role === "tecnico" ? TECS.find((x) => x.id === (S.tec ?? "hn"))?.n ?? "Técnico" : PAPEIS[S.role].nome;
      (d.obra.diario ??= []).push({ q: agora(), quem, t: texto.trim(), k: "ocorrencia" });
      if (S.role === "tecnico") avisar({ msg: "Problema enviado ao responsável de obra", sub: "O Filipe vê-o já na página da obra", kind: "ok" });
      log(d, "Obra: ocorrência · " + texto.trim(), "w");
    },
    /** Segurança e licenças: marcar um ponto como tratado. */
    tratarSeguranca(id: number, k: string) {
      const d = deal(id); (d.obra.seg ??= {})[k] = agora();
      log(d, "Obra: segurança · " + k + " tratado");
    },
    /* -------------------------------------------- 21/10: o validador junta, muda de fase e tira tarefas (tarefasValidador.ts) */
    novaTarefaPlano(id: number, n: NovaTarefa): number | null {
      const d = deal(id), p = d.obra.plano, s = S.svc[n.sid];
      if (!p || !s || p.estado === "concluída") return null;
      // 21/10: só o gestor das Operações cria tarefas; por isso não há aprovação
      if (S.role !== "operacoes") { avisar({ msg: "Só o gestor da obra cria tarefas", sub: "Peça ao gestor das Operações", kind: "bad" }); return null; }
      const t = criarTarefa(p, s, n), ti = juntarTarefa(p, t);
      avisarTecnico(p, ti, `Tem uma tarefa nova: ${t.nome}, a partir de ${rotuloDia(p, t.dia)}`, agora());
      const tec = TECS.find((x) => x.id === t.tec);
      log(d, `Plano: tarefa nova · ${t.nome} (fase ${t.fase ?? "—"}, ${t.dur} ${t.dur === 1 ? "dia" : "dias"}${tec ? ", " + tec.n : ""})`);
      // 21/10: os materiais da tarefa nova vão já numa encomenda de cliente de ajuste (e a tarefa espera por eles)
      ajustar(d, "tarefa nova " + t.nome);
      if (!A.planoMudou(d)) avisar({ msg: "Tarefa juntada ao plano", sub: `${t.nome} · ${rotuloDia(p, t.dia)}`, kind: "ok" });
      return ti;
    },
    moverTarefaPlano(id: number, ti: number, m: { fase?: number; dia?: number }) {
      const d = deal(id), p = d.obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado === "em curso" || p.estado === "concluída") return;
      const antes = `${t.fase}-${t.dia}`;
      moverTarefa(p, ti, m);
      if (`${t.fase}-${t.dia}` === antes) return;
      avisarTecnico(p, ti, `${t.nome} mudou: fase ${t.fase ?? "—"}, a partir de ${rotuloDia(p, t.dia)}`, agora());
      log(d, `Plano: ${t.nome} · fase ${t.fase ?? "—"}, a partir de ${rotuloDia(p, t.dia)}`);
      if (!A.planoMudou(d)) avisar({ msg: m.fase != null ? `Passou para a fase ${t.fase}` : "Tarefa mudada", sub: `${t.nome} · ${rotuloDia(p, t.dia)}`, kind: "ok" });
    },
    tirarTarefaPlano(id: number, ti: number) {
      const d = deal(id), p = d.obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado === "concluída" || !tirarTarefa(p, ti)) return;
      if (t.tec) avisarTecnico(p, -1, `${t.nome} saiu do plano`, agora(), t.tec);
      log(d, `Plano: tarefa ${t.nome} tirada`);
      // 21/10: a encomenda de ajuste que só servia esta tarefa anula-se (se ainda nada saiu para a obra)
      const an = anularAjustesDaTarefa(d, t, agora());
      if (an.anuladas.length) log(d, `Encomenda de ajuste ${an.anuladas.join(", ")} anulada no Inventário: a tarefa saiu do plano`, "w");
      if (an.ficam.length) log(d, `${an.ficam.join(", ")} fica: já saíram materiais para a obra (o que sobrar volta ao armazém)`, "w");
      if (!A.planoMudou(d)) avisar({ msg: "Tarefa tirada do plano", sub: t.nome, kind: "ok" });
    },
    /** Os materiais de uma tarefa (a lista inteira, já mudada). */
    matsTarefa(id: number, ti: number, mats: MatTarefa[]) {
      const p = deal(id).obra.plano, t = p?.tasks[ti];
      if (!p || !t || p.estado === "concluída") return;
      if (JSON.stringify(t.mats) !== JSON.stringify(mats)) avisarTecnico(p, ti, `Os materiais de ${t.nome} mudaram`, agora());
      // 21/10: numa tarefa do orçamento, o que a receita já contava fica como encomendado; só o que se junta vai à encomenda de ajuste
      if (!t.nova && !t.encomendado) t.encomendado = materiaisDaTarefa(t, S.svc).map((m) => ({ ...m }));
      t.mats = mats.filter((m) => m.q > 0).map((m) => ({ ...m }));
    },
    /** 21/10: encomenda o que os materiais mudados à mão pedem a mais (encomenda de cliente de ajuste, no Inventário). */
    encomendarMateriais(id: number) {
      const d = deal(id);
      if (!d.obra.ec?.ref) { avisar({ msg: "Ainda sem encomenda de cliente", sub: "Os materiais novos encomendam-se logo a seguir à inicial, quando o pagamento for validado", kind: "" }); return; }
      if (!ajustar(d, "materiais mudados no plano")) avisar({ msg: "Nada por encomendar", sub: "Os materiais do plano já estão encomendados", kind: "" });
    },
    /** O técnico viu o aviso. */
    avisoLido(id: number, k: number) {
      const a = deal(id).obra.plano?.avisos?.[k];
      if (a && !a.lido) a.lido = agora();
    },
    /** Volta ao plano que veio do orçamento (datas, dias e técnicos; as notas ficam). */
    reporPlano(id: number) {
      const d = deal(id), p = d.obra.plano;
      if (!p || p.estado === "em curso" || p.estado === "concluída" || !reporBase(p)) return;
      log(d, "Plano reposto como veio do orçamento");
      if (A.planoMudou(d)) return;
      avisar({ msg: "Plano reposto", sub: "Como veio do orçamento", kind: "ok" });
    },
    /** O início do plano (as Operações confirmam ou mudam a data do orçamento; "aaaa-mm-dd"). */
    inicioPlano(id: number, iso: string) {
      const d = deal(id), p = d.obra.plano;
      if (!p || p.origem !== "orcamento" || p.estado === "em curso" || p.estado === "concluída") return;
      p.inicio = iso; log(d, `Plano: a obra começa a ${rotuloDia(p, 0)}`);
      avisar({ msg: "Início mudado", sub: `${rotuloDia(p, 0)} · acaba a ${rotuloDia(p, Math.max(...p.tasks.map((x) => x.dia + x.dur - 1)))}`, kind: "ok" });
    },
    aprovarPlano(id: number) {
      const d = deal(id);
      if (!d.fin.pago) { avisar({ msg: "Primeiro, o pagamento", sub: "O plano aprova-se depois de o Financeiro confirmar o pagamento", kind: "bad" }); return; }
      if (conflitos(d.obra.plano!).length) { avisar({ msg: "Há um conflito por resolver", sub: "Troque o técnico ou adie a fase", kind: "bad" }); return; }
      d.obra.plano!.estado = "aprovado"; log(d, "Plano aprovado pelas Operações");
      // o início do plano passa para a preparação da obra (não se escreve duas vezes)
      const p = d.obra.plano!;
      if (p.origem === "orcamento" && !d.f.inicio) { const i = inicioDoPlano(p); if (i) d.f.inicio = isoDia(i); } avisar({ msg: "Plano aprovado", sub: "Os técnicos recebem as tarefas na app", kind: "ok" });
    },
    arrancar(id: number) {
      const d = deal(id);
      // 19/10: o pagamento, o plano e os materiais garantidos no Inventário (preparacaoObra.ts: faltaParaArrancar)
      { const F = faltaParaArrancar(d); if (F.length) { avisar({ msg: "Ainda não dá para arrancar", sub: "Falta " + F.join(", "), kind: "bad" }); return; } }
      if (!portao(d, [OBRA[0]])) return;
      d.obra.plano!.estado = "em curso"; log(d, "Obra arrancou"); avisar({ msg: "Obra em curso", sub: "Os técnicos registam as horas na app", kind: "ok" });
    },
    fimObra(id: number) {
      const d = deal(id);
      if (d.obra.plano?.estado !== "em curso") return;
      // 21/10: só com tudo completo (encerrarObra.ts): tarefas feitas e validadas, mensagens, materiais, adendas, segurança
      { const F = faltaParaEncerrar(d, S); if (F.length) { avisar({ msg: "Ainda não dá para encerrar a obra", sub: "Falta: " + F.join(", "), kind: "bad" }); return; } }
      if (!portao(d, [OBRA[1]])) return;
      d.obra.plano!.estado = "concluída"; d.obra.real = realObra(d, S); d.obra.realFases = realPorFase(d, S);
      log(d, "Obra concluída · margem real " + pct(d.obra.real.m));
      A.enviarAuto(id); // 15/10: o auto de receção vai logo ao portal do cliente
      avisar({ msg: "Obra concluída", sub: "Margem real " + pct(d.obra.real.m) + " · o comercial vê o resultado no negócio", kind: "ok", act: { label: "Ver negócio", fn: () => run(() => { A.abrir(id); A.irObra(); }) } });
    },
    /* ---------------------------------------------- auto de receção e adendas assinadas no portal (15/10) */
    /** O auto de receção da obra concluída vai ao portal do cliente (uma vez). */
    enviarAuto(id: number) {
      const d = deal(id);
      if (d.obra.plano?.estado !== "concluída" || d.obra.auto) return;
      d.obra.auto = { n: "AR 2026/" + d.id, q: agora(), estado: "por assinar" };
      log(d, "Auto de receção " + d.obra.auto.n + " enviado ao portal do cliente");
    },
    /** O cliente assina o auto no portal (com observações ou "está tudo bem"): começa a garantia e recebe o relatório da obra. */
    assinarAuto(id: number, a: Assinatura, reservas?: string) {
      const d = deal(id), au = d.obra.auto;
      if (!au || au.estado !== "por assinar") return;
      const r = reservas?.trim();
      Object.assign(au, { estado: "assinado", assinatura: { ...a }, assinado: a.q, reservas: r || undefined });
      log(d, "Auto de receção " + au.n + " assinado pelo cliente" + (r ? ", com observações: " + r : " · está tudo bem"), r ? "w" : "a");
      avisar({ msg: "Auto de receção assinado", sub: r ? "Com observações: o responsável de obra vê-as" : "Começa a garantia; o cliente recebeu o relatório da obra", kind: "ok" });
    },
    /** No protótipo, o comercial simula o cliente a assinar o auto (Chave Móvel Digital). */
    simularAuto(id: number) {
      const d = deal(id), t = new Date(), p = (n: number) => String(n).padStart(2, "0");
      A.assinarAuto(id, { tipo: "digital", nome: d.f.nome_fiscal || d.nome, q: `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}`, id: "CMD-SIM" + String(d.id).slice(-3) });
    },
    /** O cliente pede alterações a cláusulas do contrato no portal: o contrato enviado fica substituído e vai ao Jurídico. */
    pedirAlteracoesContrato(id: number, clausulas: PedidoClausula[]) {
      const d = deal(id), o = d.orc;
      const cs = clausulas.map((x) => ({ c: x.c, nota: x.nota.trim() })).filter((x) => x.c);
      if (!o || o.contrato !== "enviado" || !cs.length) return;
      (o.contratoVersoes ??= []).push({ n: o.contratoVersoes.length + 1, substituido: agora(), pedido: cs, revisto: o.contratoRevisto ?? undefined });
      o.contrato = null; o.contratoPedido = { clausulas: cs, q: agora() }; o.contratoRevisto = null;
      log(d, "O cliente pediu alterações ao contrato: " + cs.map((x) => x.c + (x.nota ? " («" + x.nota + "»)" : "")).join(", ") + " · vai ao Jurídico", "w");
      avisar({ msg: "Pedido enviado à equipa jurídica", sub: "O contrato volta ao portal depois de revisto", kind: "ok" });
    },
    /** O Jurídico abre (e fecha) o editor da revisão do contrato. */
    abrirRevisao(id: number) { S.revisao = id; },
    fecharRevisao() { S.revisao = null; },
    /** O Jurídico reescreve uma cláusula (texto vazio: volta ao texto do modelo). */
    reverClausula(id: number, c: string, texto: string) {
      const o = deal(id).orc;
      if (!o?.contratoPedido) return;
      const t = texto.trim(), cl = (o.clausulas ??= {});
      if (t) cl[c] = t; else delete cl[c];
    },
    /** O Jurídico valida o contrato revisto: só então o comercial o pode enviar outra vez ao cliente. */
    validarContrato(id: number) {
      const d = deal(id), o = d.orc;
      if (!o?.contratoPedido) return;
      o.contratoRevisto = { por: PAPEIS.juridico.nome, q: agora() };
      o.contratoPedido = null; S.revisao = null;
      log(d, `Contrato revisto e validado pelo Jurídico (${PAPEIS.juridico.nome}) · versão ${(o.contratoVersoes?.length ?? 0) + 1}`);
      avisar({ msg: "Contrato validado", sub: "O comercial já o pode enviar ao cliente", kind: "ok", act: { label: "Mudar para Rúben", fn: () => run(() => { A.role("comercial"); }) } });
    },
    /** O cliente assina a adenda no portal (desenho ou Chave Móvel Digital); o resto é o de "assinarAdenda" (as tarefas entram no plano). */
    assinarAdendaCom(id: number, n: string, a: Assinatura) {
      const ad = deal(id).adendas?.find((x) => x.n === n);
      if (!ad || ad.estado !== "enviada") return;
      ad.assinatura = { ...a };
      A.assinarAdenda(id, n);
    },
    /** No protótipo, o comercial simula o cliente a assinar a adenda (Chave Móvel Digital), como no auto. */
    simularAdenda(id: number, n: string) {
      const d = deal(id), t = new Date(), p = (k: number) => String(k).padStart(2, "0");
      A.assinarAdendaCom(id, n, { tipo: "digital", nome: d.f.nome_fiscal || d.nome, q: `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}`, id: "CMD-SIM" + String(d.id).slice(-3) });
    },
    /** 21/10: o cliente não aceita a adenda no portal (com o porquê): nada muda no contrato nem no plano; o comercial vê e pode refazê-la. */
    recusarAdenda(id: number, n: string, motivo: string) {
      const d = deal(id), a = d.adendas?.find((x) => x.n === n);
      if (!a || a.estado !== "enviada") return;
      const m = motivo.trim();
      Object.assign(a, { estado: "recusada", recusada: agora(), recusa: m || undefined });
      log(d, "O cliente não aceitou a adenda " + n + (m ? ": «" + m + "»" : ""), "w");
      avisar({ msg: "Resposta enviada", sub: "O contrato e o plano da obra ficam como estavam", kind: "ok" });
    },
    /** 21/10: o comercial retira a adenda enviada (ainda não assinada): sai do portal do cliente. */
    anularAdenda(id: number, n: string) {
      const d = deal(id), a = d.adendas?.find((x) => x.n === n);
      if (!a || a.estado !== "enviada") return;
      a.estado = "anulada";
      log(d, "Adenda " + n + " retirada do portal do cliente");
      avisar({ msg: "Adenda " + n + " retirada", sub: "Já não aparece no portal do cliente", kind: "ok" });
    },
    aprender(id: number) {
      const d = deal(id); const s = S.svc.revest; const old = s.h; s.h = r2(s.h * REAL.revest); d.obra.aprendido = true;
      log(d, `Receita do revestimento atualizada: ${nfmt(old)} → ${nfmt(s.h)} h/m²`);
      avisar({ msg: "Receita atualizada no Catálogo", sub: `Revestimento: ${nfmt(old)} → ${nfmt(s.h)} h/m². Os próximos orçamentos já usam este valor.`, kind: "ok" });
    },
    vendaDireta(id: number, v: boolean) { const d = deal(id); d.orc!.vendaDireta = v; log(d, v ? "Marcado como venda direta (sem contrato)" : "Deixou de ser venda direta"); },
    perder(id: number) { S.confirmPerda = id; },
    perderSim(id: number) {
      const d = deal(id);
      // 19/10: com contrato (ou venda direta aceite), não se perde: anula-se o contrato (a encomenda no Inventário vai com ele)
      if (d.fase >= 4) { S.confirmPerda = null; avisar({ msg: "Com contrato, anula-se o contrato", sub: "Use «Anular contrato» (Direção)", kind: "bad" }); return; }
      d.perdido = true; S.confirmPerda = null; log(d, "Marcado como perdido", "x");
      avisar({ msg: "Negócio perdido", sub: d.nome, kind: "bad", act: { label: "Anular", fn: () => run(() => { d.perdido = false; log(d, "Perda anulada"); }) } });
      S.view = "negocios"; S.deal = null;
    },
    perderNao() { S.confirmPerda = null; },
    /** 19/10: a Direção anula o contrato assinado (ou a venda direta aceite) antes de a obra arrancar: o negócio fica perdido, com o motivo, e a
     *  encomenda de cliente é eliminada no Inventário (reservas libertadas, encomendas a fornecedor ligadas anuladas). Não se desfaz. */
    anularContrato(id: number, motivo: string) {
      if (!exigePerm("contracts.cancel")) return;
      const d = deal(id), o = d.orc, vd = !!o?.vendaDireta;
      if (d.perdido || !o || !(o.contrato === "assinado" || (vd && o.aceite))) { avisar({ msg: "Não há contrato para anular", sub: "Só se anula um contrato assinado ou uma venda direta aceite", kind: "bad" }); return; }
      const p = d.obra.plano;
      if (p && (p.estado === "em curso" || p.estado === "concluída")) { avisar({ msg: "A obra já arrancou", sub: "Anular agora pede o acerto do que já foi feito: fora do protótipo", kind: "bad" }); return; }
      const m = motivo.trim();
      if (m.length < 3) { avisar({ msg: "Escreva o motivo (mínimo 3 caracteres)", kind: "bad" }); return; }
      const doc = vd ? `Venda VD 2026/${d.id}` : `Contrato CT 2026/${d.id}`, antes = d.motivoPerda, ec = d.obra.ec;
      // primeiro o negócio: a sincronização com o Inventário (que corre ao eliminar a encomenda) já o vê perdido e não o anula outra vez
      d.anulado = { q: agora(), por: PAPEIS[S.role].n, motivo: m, origem: "negocio" };
      d.perdido = true; d.motivoPerda = (vd ? "Venda anulada: " : "Contrato anulado: ") + m;
      if (ec?.ref) {
        const r = anularEcNoInventario(ec.ref, m);
        if (!r.ok) {
          d.anulado = undefined; d.perdido = false; d.motivoPerda = antes;
          avisar({ msg: "Não foi possível anular", sub: r.erro, kind: "bad" });
          return;
        }
      }
      S.confirmPerda = null;
      log(d, `${doc} ${vd ? "anulada" : "anulado"} por ${PAPEIS[S.role].n}: ${m}`, "x");
      if (ec?.ref) log(d, `Encomenda de cliente ${ec.n} eliminada no Inventário: reservas libertadas e encomendas a fornecedor anuladas`, "x");
      if (d.fin.pago) log(d, "O sinal já pago devolve-se fora da Olyvia (nota de crédito no programa certificado)", "w");
      avisar({ msg: `${doc} ${vd ? "anulada" : "anulado"}`, sub: ec?.ref ? `A encomenda ${ec.n} foi eliminada no Inventário: reservas libertadas e encomendas a fornecedor anuladas` : "O negócio fica perdido, com o motivo", kind: "bad" });
    },
    /** 19/10: a encomenda de cliente do negócio foi eliminada no Inventário: o negócio anula-se sozinho (perdido, com o motivo de lá). */
    ecEliminadaNoInventario(id: number, motivo: string) {
      const d = S.deals.find((x) => x.id === id);
      if (!d || d.perdido) return;
      d.anulado = { q: agora(), por: "Inventário", motivo, origem: "inventario" };
      d.perdido = true; d.motivoPerda = "Encomenda de cliente eliminada no Inventário: " + motivo;
      log(d, `Encomenda de cliente ${d.obra.ec?.n ?? ""} eliminada no Inventário: ${motivo} · o negócio fica anulado (perdido)`, "x");
      avisar({ msg: "Negócio anulado no Inventário", sub: `${d.nome} · ${d.obra.ec?.n ?? "encomenda"} eliminada: ${motivo}`, kind: "bad" });
    },
    nec(id: number, v: string) { const a = deal(id).visita.nec; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); },
    novaVisita(id: number) {
      const d = deal(id);
      const n = criarVisita(d, { tipo: "Revisita", estado: "Marcada", quem: "Rúben (comercial)", presentes: d.f.presentes || "O cliente", duracao: "1 h" });
      log(d, `Visita ${n} criada`);
      return n;
    },
    cancelarVisita(id: number, n: number, cancelar = true) {
      const d = deal(id), i = visitas(d).indexOf(n) + 1;
      if (cancelar) { d.f[`v${n}_estado`] = "Cancelada"; delete d.f[`v${n}_auto`]; log(d, `Visita ${i} cancelada`, "w"); }
      else { d.f[`v${n}_estado`] = "Marcada"; delete d.f[`v${n}_motivo`]; log(d, `Visita ${i} volta a marcada`); }
    },
    apagarVisita(id: number, n: number) {
      const d = deal(id);
      d.vis = visitas(d).filter((x) => x !== n);
      for (const k of Object.keys(d.f)) if (k.startsWith(`v${n}_`)) delete d.f[k];
      log(d, `Visita ${n} apagada`, "w");
    },
    campo(id: number, k: string, v: string) {
      const d = deal(id); d.f[k] = v;
      // 19/10: as prestações "Por fases" guardam-se com a escolha (a mesma fonte para a proposta, o portal e o Financeiro V2); outra condição esquece-as
      if (k === "pagamento" && d.orc && !d.orc.enviada) {
        if (v !== PAGAMENTO_FASES) delete d.orc.pagFases;
        else if (!d.orc.pagFases?.length) d.orc.pagFases = sugerirPorFases(planoObra(d, S));
      }
      if (d.sug) delete d.sug[k]; // mexido por alguém: deixa de ser sugestão
      derivar(d, k);
      // o cliente deixa de fornecer materiais: saem as marcas "o cliente fornece" e "o cliente compra" (14/10/2026)
      if (k === "materiais_cliente" && v !== "Sim") {
        if (d.visita.prod) d.visita.prod = d.visita.prod.map((p) => (p.cliente ? marcarCliente([p], p.id, false)[0] : p));
        delete d.visita.clienteCompra;
      }
      // a resposta mexe logo no orçamento, enquanto a proposta não foi enviada
      if (d.orc && !d.orc.enviada && (CAMPOS_COM_EFEITO.has(k) || CAMPOS_COM_EFEITO.has(chaveBase(k)) || k === "diag_tipo_area")) sincronizarEfeitos(d, S);
      // o acesso e o contentor mexem na conta do entulho (o meio, o fator de acesso)
      if (d.orc && !d.orc.enviada && ["contentor", "dist_entulho", "andar", "tem_elevador", "estacionamento"].includes(k)) sincronizarDemolicao(d, S);
    },
    confirmar(id: number, ks: string[]) { const d = deal(id); if (d.sug) for (const k of ks) delete d.sug[k]; },
    localizacao(id: number, m: { morada: string; cp: string; localidade: string; concelho: string }, lat: number, lon: number, precisao: number) {
      const d = deal(id), f = d.f;
      if (d.sug) for (const k of ["morada", "cp", "localidade"]) delete d.sug[k];
      if (m.morada) f.morada = m.morada;
      if (m.cp) f.cp = m.cp;
      if (m.localidade) { f.localidade = m.localidade; derivar(d, "localidade"); }
      if (m.concelho && !f.concelho) f.concelho = m.concelho;
      f.gps = `${lat.toFixed(6)},${lon.toFixed(6)}`; f.gps_precisao = String(Math.round(precisao));
      log(d, `Morada preenchida pela localização do dispositivo (± ${Math.round(precisao)} m)`);
    },
    servico(id: number, sid: SvcId) { const a = deal(id).visita.off; const i = a.indexOf(sid); if (i >= 0) a.splice(i, 1); else a.push(sid); },
    extra(id: number, sid: SvcId, q: number) {
      const d = deal(id);
      if (q > 0) { garantirServico(S, sid); d.visita.extra[sid] = q; } else delete d.visita.extra[sid];
    },
    /** Uma fotografia numa etapa da visita (por omissão, a área); o total sobe também. */
    foto(id: number, etapa: EtapaFotos = "area") { const v = deal(id).visita; v.fotosPor = fotosPor(v); v.fotosPor[etapa] = (v.fotosPor[etapa] || 0) + 1; v.fotos++; },
    recalc(id: number, i: number) { const d = deal(id), l = d.orc!.linhas[i]; if (l.t === "svc") l.cu = custoUnLinha(S.svc[l.sid], S); d.orc!.aprov = null; avisar({ msg: "Custo atualizado com o Catálogo", kind: "ok" }); },
  };
  // depois de cada ação, a visita de cada negócio acompanha as necessidades
  for (const k of Object.keys(A) as (keyof typeof A)[]) {
    const f = A[k] as (...a: unknown[]) => unknown;
    (A as Record<string, unknown>)[k] = (...a: unknown[]) => {
      const r = f(...a);
      for (const d of S.deals) sincronizarVisita(d);
      return r;
    };
  }
  return A;
}
export type Acoes = ReturnType<typeof acoes>;
