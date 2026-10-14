/**
 * A escolha de «Como conta» tal como está nos campos do formulário (tudo texto) e a passagem para o valor da conta. Puro:
 * serve o painel de atribuir equipamento, o de registar um valor avulso e o de alterar como conta.
 */
import {
  MESES_POR_OMISSAO,
  contaRepartida,
  contaTodosMeses,
  contaUmaVez,
  fraseDaConta,
  validarConta,
  type ComoConta,
  type ContaItem,
  type FraseConta,
} from "@/components/rh-exemplo/lib/comoConta";
import { mesDaData } from "@/components/rh-exemplo/lib/custo";

export interface EscolhaConta {
  modo: ComoConta;
  /** O N do «repartido», como texto. */
  meses: string;
  /** O mês de início do «todos os meses» (AAAA-MM); vazio = o mês da data. */
  inicio: string;
  /** O mês de fim do «todos os meses» (AAAA-MM); vazio = sem fim. */
  fim: string;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A escolha por omissão: um modo, ou o valor que a conta já tem (para editar). */
export function escolhaDe(modo: ComoConta, conta?: ContaItem): EscolhaConta {
  return {
    modo: conta?.modo ?? modo,
    meses: String(conta && conta.modo === "repartido" ? conta.meses : MESES_POR_OMISSAO),
    inicio: conta?.inicio ?? "",
    fim: conta?.fim ?? "",
  };
}

/** Passa a escolha (texto) para a conta; o início em branco segue o mês da data. */
export function contaDaEscolha(e: EscolhaConta, data: string): ContaItem {
  if (e.modo === "umaVez") return contaUmaVez();
  if (e.modo === "repartido") return contaRepartida(Number(e.meses.trim().replace(",", ".")));
  const inicio = e.inicio !== "" ? e.inicio : MES.test(mesDaData(data)) ? mesDaData(data) : "";
  return contaTodosMeses(inicio, e.fim === "" ? null : e.fim);
}

/** A frase do efeito calculado, ou `null` se falta o valor, a data ou a conta não é válida. */
export function fraseDaEscolha(e: EscolhaConta, valor: number, data: string, comDevolucao: boolean): FraseConta | null {
  const conta = contaDaEscolha(e, data);
  if (!Number.isFinite(valor) || valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data) || validarConta(conta) !== null) return null;
  return fraseDaConta({ valor, data, conta, devolucao: null }, comDevolucao);
}
