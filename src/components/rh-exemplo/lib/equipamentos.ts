/**
 * Os equipamentos atribuídos a uma pessoa (fluxo 11, separador Custo): telemóvel, portátil, viatura, fardamento, ferramentas.
 * Contas puras, sem dados de lado nenhum. Cada equipamento tem o seu «como conta» (`comoConta.ts`): pago de uma vez, repartido
 * por N meses (por omissão 36, o do fluxo 11: portátil de 900 € / 36 = 25 € por mês) ou todos os meses. Conta do mês da
 * entrega e, ao devolver, deixa de contar a partir do mês seguinte ao da devolução.
 */
import {
  amortizadoAte,
  donoDoMes,
  mesesDecorridos,
  valorDoAtivoNoMes,
  type AtivoAlugadoConta,
  type AtivoCompradoConta,
  type OcupacaoParaConta,
} from "@/components/ativos/lib/contaAtivo";
import {
  contaRepartida,
  situacaoDoItem,
  validarConta,
  valorNoMes,
  type ContaItem,
  type ErroConta,
  type ItemParaConta,
  type SituacaoConta,
} from "./comoConta";
import { arredondar, indiceDoMes, mesDaData, type MesIso } from "./custo";

export const TIPOS_EQUIPAMENTO = ["telemovel", "portatil", "viatura", "fardamento", "ferramentas", "outro"] as const;
export type TipoEquipamento = (typeof TIPOS_EQUIPAMENTO)[number];

export const ESTADOS_DEVOLUCAO = ["bom", "desgaste", "danificado"] as const;
export type EstadoDevolucao = (typeof ESTADOS_DEVOLUCAO)[number];

/** O que o ativo diz de si, sempre que a linha do RH é um ativo (comprado ou alugado). */
interface IdentidadeDoAtivo {
  codigo: string | null;
  nome: string;
  tipo: string | null;
  estado: "ativo" | "desativado";
}

/**
 * O ativo de uma linha do RH, como a lista da base o projeta (`ativo`). É a ÚNICA fonte do valor e da conta: com ele, as chaves
 * `valor` e `conta_*` da linha são só compatibilidade e nunca contam.
 */
export type AtivoDoEquipamento =
  | (AtivoCompradoConta & IdentidadeDoAtivo & { vidaOrigem: string | null })
  | (AtivoAlugadoConta & IdentidadeDoAtivo);

export interface EquipamentoPessoa {
  id: string;
  pessoaId: string;
  tipo: TipoEquipamento;
  descricao: string;
  /** Valor de aquisição, em euros (no «todos os meses», o valor de cada mês). Numa linha com ativo, só compatibilidade. */
  valor: number;
  /** Data de entrega (AAAA-MM-DD). */
  entrega: string;
  /** Como conta: de uma vez, repartido por N meses ou todos os meses. Numa linha com ativo, só compatibilidade (ignora-se). */
  conta: ContaItem;
  estado: "atribuido" | "devolvido";
  devolucao: string | null;
  estadoDevolucao: EstadoDevolucao | null;
  autor: string;
  /** O ativo a que a linha pertence; `null` só na farda (que continua a contar pelo «como conta»). Ausente = sem ativo. */
  ativoId?: string | null;
  ativo?: AtivoDoEquipamento | null;
  /** O dia desde o qual esta linha conta (`conta_desde`): a entrega, ou o dia seguinte se outra ocupação do ativo foi devolvida nesse dia. */
  contaDesde?: string;
}

/** O equipamento visto como um valor que conta (para `comoConta.ts`). Só a farda e as linhas sem ativo. */
export const itemDoEquipamento = (e: Pick<EquipamentoPessoa, "valor" | "entrega" | "conta" | "devolucao">): ItemParaConta => ({
  valor: e.valor,
  data: e.entrega,
  conta: e.conta,
  devolucao: e.devolucao,
});

/** A data de hoje (AAAA-MM-DD) pelos componentes locais; os testes passam o `hoje` à mão. */
function hojeReal(agora: Date = new Date()): string {
  const dois = (n: number): string => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

const ocupacaoDaLinha = (e: EquipamentoPessoa): OcupacaoParaConta => ({ contaDesde: e.contaDesde ?? e.entrega, devolucao: e.devolucao });

/** A linha tem ativo: o valor e a conta vêm dele, nunca de `comoConta.ts`. */
const temAtivo = (e: EquipamentoPessoa): e is EquipamentoPessoa & { ativo: AtivoDoEquipamento } => e.ativo !== null && e.ativo !== undefined;

/**
 * O que o equipamento conta no mês. Com ativo: a quota (comprado) ou a renda (alugado) SÓ se a pessoa tem o equipamento no dia de
 * referência do mês (o dia da devolução conta); senão 0 e o mês é de outra pessoa ou da estrutura. Sem ativo (a farda): `comoConta.ts`.
 */
export const valorDoEquipamentoNoMes = (e: EquipamentoPessoa, mes: MesIso, hoje: string = hojeReal()): number => {
  if (!temAtivo(e)) return valorNoMes(itemDoEquipamento(e), mes);
  return donoDoMes(ocupacaoDaLinha(e), e.ativo, mes, hoje) ? valorDoAtivoNoMes(e.ativo, mes) : 0;
};

/** O estado de uma linha com ativo: o que esta pessoa pagou até `mes` e o que falta amortizar do ativo (o alugado não tem total). */
function situacaoDoAtivo(e: EquipamentoPessoa & { ativo: AtivoDoEquipamento }, mes: MesIso, hoje: string): SituacaoConta {
  const { ativo } = e;
  const doMes = valorDoEquipamentoNoMes(e, mes, hoje);
  const primeiro = indiceDoMes(mesDaData(e.contaDesde ?? e.entrega));
  const ultimo = Math.min(indiceDoMes(mes), e.devolucao ? indiceDoMes(mesDaData(e.devolucao)) : Infinity);
  const ocupacao = ocupacaoDaLinha(e);
  let contado = 0;
  let mesesContados = 0;
  for (let i = primeiro; i <= ultimo; i += 1) {
    const m = `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    if (!donoDoMes(ocupacao, ativo, m, hoje)) continue;
    const v = valorDoAtivoNoMes(ativo, m);
    if (v > 0) {
      contado = arredondar(contado + v);
      mesesContados += 1;
    }
  }
  const base = { doMes, contado, mesesContados };
  if (ativo.forma === "alugado") return { ...base, falta: null, mesesFalta: null, completo: false };
  // Já não é desta pessoa (devolveu) ou o ativo foi desativado: nada mais vai contar a esta linha.
  const terminada = (e.devolucao !== null && indiceDoMes(mes) >= indiceDoMes(mesDaData(e.devolucao))) || ativo.desativadoEm !== null;
  const vida = ativo.vidaMeses ?? 0;
  const mesesFalta = terminada ? 0 : Math.max(0, vida - mesesDecorridos(ativo, mes));
  return {
    ...base,
    falta: terminada ? 0 : Math.max(0, arredondar(ativo.valorCompra - ativo.valorResidual - amortizadoAte(ativo, mes))),
    mesesFalta,
    completo: !terminada && vida > 0 && mesesFalta === 0,
  };
}

/** O estado do equipamento no mês `mes` («AAAA-MM»): o que conta no mês, o que já contou e o que falta. */
export const situacaoDoEquipamento = (e: EquipamentoPessoa, mes: MesIso, hoje: string = hojeReal()): SituacaoConta =>
  temAtivo(e) ? situacaoDoAtivo(e, mes, hoje) : situacaoDoItem(itemDoEquipamento(e), mes);

/** Os equipamentos que contam neste mês no custo da pessoa. */
export const equipamentosDoMes = (lista: readonly EquipamentoPessoa[], mes: MesIso, hoje: string = hojeReal()): EquipamentoPessoa[] =>
  lista.filter((e) => valorDoEquipamentoNoMes(e, mes, hoje) > 0);

export type ErroEquipamento =
  | "semDescricao" | "valorZero" | "semData" | "semPessoa" | ErroConta
  | "vidaInvalida" | "compraDepoisDaEntrega" | "rendaZero" | "semInicioAluguer" | "fimAntesInicioAluguer"
  | "entregaAntesDoInicio" | "entregaDepoisDoFim" | "semAtivo";
export type ErroDevolucao = "semData" | "antesDaEntrega" | "semEstado";

/** De onde vem a vida útil de um equipamento comprado: os meses de pagamento, a do equipamento do catálogo ou escrita à mão. */
export type VidaOrigem = "pagamento" | "catalogo" | "manual";
export const VIDA_MINIMA = 1;
export const VIDA_MAXIMA = 600;

interface NovoBase {
  pessoaId: string;
  /** Data de entrega (AAAA-MM-DD). */
  entrega: string;
  /** Um uuid gerado UMA vez por submissão do formulário: reenviar o mesmo `idPedido` não duplica o equipamento. */
  idPedido?: string;
}

/**
 * O que «Atribuir equipamento» envia. Quatro formas: a farda (a forma antiga, só no RH, conta pelo «como conta»; sem `forma` vale
 * o mesmo), um equipamento COMPRADO (valor, data de compra e vida útil), um ALUGADO (renda mensal e datas do contrato) e um ativo
 * que JÁ EXISTE e está livre (só se entrega).
 */
export type NovoEquipamentoBase =
  | (NovoBase & { forma?: "farda"; tipo: TipoEquipamento; descricao: string; valor: number; conta?: ContaItem })
  | (NovoBase & {
      forma: "comprado"; tipo: TipoEquipamento; descricao: string; valor: number;
      /** Sem data de compra vale a de entrega (a base recusa uma entrega daqui a mais de 7 dias sem ela). */
      dataCompra: string | null;
      vidaMeses: number; vidaOrigem: VidaOrigem; catEquipamentoId?: string | null;
    })
  | (NovoBase & {
      forma: "alugado"; tipo: TipoEquipamento; descricao: string; rendaMensal: number;
      inicioAluguer: string; fimAluguer: string | null;
    })
  | (NovoBase & { forma: "existente"; ativoId: string });

const textoVazio = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === "";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Sem `conta` vale o que o documento diz: repartido por 36 meses. */
export function validarEquipamento(e: { pessoaId: string; descricao: string; valor: number; entrega: string; conta?: ContaItem }): ErroEquipamento | null {
  if (e.pessoaId === "") return "semPessoa";
  if (e.descricao.trim() === "") return "semDescricao";
  if (!Number.isFinite(e.valor) || e.valor <= 0) return "valorZero";
  if (!DATA.test(e.entrega)) return "semData";
  return validarConta(e.conta ?? contaRepartida());
}

function validarComprado(n: Extract<NovoEquipamentoBase, { forma: "comprado" }>): ErroEquipamento | null {
  if (textoVazio(n.descricao)) return "semDescricao";
  if (!Number.isFinite(n.valor) || n.valor <= 0) return "valorZero";
  if (!DATA.test(n.entrega)) return "semData";
  if (!Number.isInteger(n.vidaMeses) || n.vidaMeses < VIDA_MINIMA || n.vidaMeses > VIDA_MAXIMA) return "vidaInvalida";
  if (n.dataCompra !== null && n.dataCompra !== "" && n.dataCompra > n.entrega) return "compraDepoisDaEntrega";
  return null;
}

function validarAlugado(n: Extract<NovoEquipamentoBase, { forma: "alugado" }>): ErroEquipamento | null {
  if (textoVazio(n.descricao)) return "semDescricao";
  if (!Number.isFinite(n.rendaMensal) || n.rendaMensal <= 0) return "rendaZero";
  if (!DATA.test(n.entrega)) return "semData";
  if (!DATA.test(n.inicioAluguer)) return "semInicioAluguer";
  const fim = textoVazio(n.fimAluguer) ? null : n.fimAluguer;
  if (fim !== null && fim < n.inicioAluguer) return "fimAntesInicioAluguer";
  if (n.entrega < n.inicioAluguer) return "entregaAntesDoInicio";
  if (fim !== null && n.entrega > fim) return "entregaDepoisDoFim";
  return null;
}

/** A validação local de uma atribuição, com o mesmo nome de erro que a base daria; cada forma valida o que lhe diz respeito. */
export function validarNovoEquipamento(n: NovoEquipamentoBase): ErroEquipamento | null {
  if (n.pessoaId === "") return "semPessoa";
  switch (n.forma) {
    case "existente":
      if (textoVazio(n.ativoId)) return "semAtivo";
      return DATA.test(n.entrega) ? null : "semData";
    case "comprado":
      return validarComprado(n);
    case "alugado":
      return validarAlugado(n);
    default:
      return validarEquipamento(n);
  }
}

export function validarDevolucao(e: EquipamentoPessoa, data: string, estado: string): ErroDevolucao | null {
  if (!DATA.test(data)) return "semData";
  if (data < e.entrega) return "antesDaEntrega";
  return (ESTADOS_DEVOLUCAO as readonly string[]).includes(estado) ? null : "semEstado";
}
