// As variáveis dos textos do template de proposta ({{condicoes_pagamento}}, {{validade}}, …) a partir dos blocos da obra
// (propostaDaVista): os mesmos números que o documento mostra em 05 Pagamento e 06 Condições. Em português (o texto do template
// é escrito pela organização, em português). Sem obra (proposta sem negócio ou sem vista), nada: as variáveis ficam vazias.
import { condicoesDePagamentoTexto, type VariaveisDaProposta } from "@/lib/textoDaProposta";
import type { PropostaObra } from "./dadosObra";

const dois = (n: number): string => String(n).padStart(2, "0");
const dataNumerica = (x: Date): string => `${dois(x.getDate())}/${dois(x.getMonth() + 1)}/${x.getFullYear()}`;

export function variaveisDaObra(obra: PropostaObra | null | undefined): VariaveisDaProposta {
  if (!obra) return {};
  const C = obra.condicoes;
  return {
    condicoes_pagamento: condicoesDePagamentoTexto(obra.prestacoes),
    validade: Number.isNaN(C.validaAte.getTime()) ? "" : dataNumerica(C.validaAte),
    prazo: `${C.prazo} ${C.prazo === 1 ? "dia útil" : "dias úteis"}`,
    // a de omissão é a da Emylia («2 anos», DocsCliente e textosObra)
    garantia: C.garantia || "2 anos",
    cliente_nome: obra.aceitacao.cliente,
  };
}
