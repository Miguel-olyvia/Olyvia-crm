// Os pedidos de exemplo: nascem das sementes (a etapa e a visita que cada pessoa traz em `pessoasExemploFicha.ts`), para nenhum
// caso de exemplo se perder quando a visita passa a ser do pedido. Só em memória, sem Supabase.
import type { NegocioMes, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { NEGOCIOS_PESSOAS_EXEMPLO, SEMENTES_EXEMPLO } from "./pessoasExemplo";
import { papelEAbertos } from "./juntarPessoas";
import { MORADA_VISITA_VAZIA, moradaDaLead } from "./moradaVisita";
import type { PessoaSemente, VisitaSemente } from "./pessoaSemente";
import type { PapelPessoa, PedidoNegocio } from "./pessoasTipos";

/** Uma semente com o que decide se gera pedido: o papel e os negócios abertos (ver `papelEAbertos`). */
export interface EntradaPedido {
  pessoa: PessoaSemente;
  papel: PapelPessoa;
  abertos: readonly NegocioMes[];
}

/** A visita de uma ficha antiga (etapa "Com visita", sem visita guardada): o próximo contacto, com a morada da lead. */
function visitaDaEtapa(pessoa: PessoaSemente): VisitaSemente | null {
  if (pessoa.etapa !== "visitaMarcada" || !pessoa.proximoContacto) return null;
  const lead = moradaDaLead(pessoa);
  return {
    data: pessoa.proximoContacto, hora: pessoa.proximoHora ?? "", comercial: pessoa.comercial,
    igualALead: lead !== null, moradaVisita: lead ?? MORADA_VISITA_VAZIA,
  };
}

/** A visita da semente passa a visita do pedido: Levantamento, Feita ou Por fazer; a nota de acesso passa a ser a nota. */
const paraVisitaDoPedido = (id: string, comercial: string, v: VisitaSemente): VisitaNegocio => ({
  id, data: v.data, hora: v.hora, feitoPor: v.comercial || comercial, estado: v.feita ? "feita" : "porFazer", tipo: "levantamento",
  quemVaiEstar: "", duracao: "", morada: { ...v.moradaVisita }, igualALead: v.igualALead, nota: v.notaAcesso ?? "",
});

/**
 * Uma lead "nova" só conta como contactada se já tem uma chamada registada; qualquer outra etapa, ou uma visita, quer dizer
 * que já se falou com ela.
 */
const estaContactada = ({ pessoa }: EntradaPedido, temVisita: boolean): boolean =>
  temVisita || pessoa.etapa !== "nova" || pessoa.resultadoContacto !== undefined;

/** Uma lead sem negócio aberto tem sempre um pedido; quem tem visita (um cliente, por exemplo) também, ao lado dos negócios. */
const geraPedido = ({ pessoa, papel, abertos }: EntradaPedido): boolean =>
  pessoa.visita !== undefined || (papel === "lead" && abertos.length === 0);

/**
 * Os pedidos de exemplo de cada pessoa, pela ordem das pessoas (`pd-1`, `pd-2`...). A visita é a guardada na semente ou, nas
 * fichas antigas (etapa "visitaMarcada" sem visita, com próximo contacto), a que se deduz do próximo contacto.
 */
export function pedidosDeExemplo(entradas: readonly EntradaPedido[], hoje: string): PedidoNegocio[] {
  return entradas.filter(geraPedido).map((entrada, i) => {
    const { pessoa } = entrada;
    const id = `pd-${i + 1}`;
    const da = pessoa.visita ?? visitaDaEtapa(pessoa);
    return {
      id, pessoaId: pessoa.id, servico: da?.servico ?? "", comercial: pessoa.comercial, criadoEm: pessoa.desde ?? hoje,
      contactado: estaContactada(entrada, da !== null),
      visitas: da ? [paraVisitaDoPedido(`${id}-v1`, pessoa.comercial, da)] : [],
      ...(da?.levantamento ? { levantamento: da.levantamento } : {}),
    };
  });
}

/** Os pedidos das pessoas de exemplo (as leads sem negócio aberto e quem tem uma visita marcada). */
export const PEDIDOS_EXEMPLO: PedidoNegocio[] = pedidosDeExemplo(
  SEMENTES_EXEMPLO.map((pessoa) => ({ pessoa, ...papelEAbertos(NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => n.pessoaId === pessoa.id)) })),
  HOJE_EXEMPLO,
);
