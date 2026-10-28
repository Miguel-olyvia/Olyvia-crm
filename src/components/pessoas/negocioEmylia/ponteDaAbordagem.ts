// A ponte entre a abordagem do Pipeline (pessoa, chamadas, visita, levantamento) e o negócio da Emylia, dita campo a campo e SÓ com o que o negócio
// da Emylia tem de facto (a leitura neg_ler_negocios, migration 20261231960000, mais o que a passagem Visita → Negócio escreve):
//  - ligado: a Emylia lê-o do negócio do CRM (negocios.titulo, anew_entities.phone, negocios.morada_obra, origem, servico_pedido; o email, se já está nas
//    respostas do negócio);
//  - soNoCrm: existe na abordagem e a Emylia NÃO o recebe (as chamadas, as visitas da agenda e o levantamento são do CRM; o do orçamento da Emylia são
//    as medidas, os serviços e as respostas que ela própria recolhe). Nada se converte por palpite; fica o número, para consulta;
//  - semRegisto: não há nada a levar.
// Função pura; os textos são do ecrã (traduções), aqui só ids, estados e contagens.
import type { Negocio } from "@/emylia/motor";

export type EstadoPonte = "ligado" | "soNoCrm" | "semRegisto";

export interface LinhaPonte {
  id: "nome" | "telefone" | "moradaObra" | "origem" | "servicoPedido" | "email" | "chamadas" | "visitas" | "levantamento";
  estado: EstadoPonte;
  /** Quantos há no CRM (chamadas, visitas, levantamentos), quando só lá estão. */
  n?: number;
}

export interface FactosDaAbordagem {
  /** O email da pessoa no CRM (vazio se não tem). */
  email: string;
  chamadas: number;
  visitasMarcadas: number;
  levantamentos: number;
}

export function linhasDaPonte(d: Negocio | undefined, a: FactosDaAbordagem): LinhaPonte[] {
  const base = (id: LinhaPonte["id"]): LinhaPonte => ({ id, estado: d ? "ligado" : "semRegisto" });
  const contado = (id: LinhaPonte["id"], n: number): LinhaPonte => (n > 0 ? { id, estado: "soNoCrm", n } : { id, estado: "semRegisto" });
  const email: LinhaPonte = d?.f.email?.trim() ? { id: "email", estado: "ligado" } : { id: "email", estado: a.email.trim() ? "soNoCrm" : "semRegisto" };
  return [
    base("nome"), base("telefone"), base("moradaObra"), base("origem"), base("servicoPedido"),
    email,
    contado("chamadas", a.chamadas), contado("visitas", a.visitasMarcadas), contado("levantamento", a.levantamentos),
  ];
}
