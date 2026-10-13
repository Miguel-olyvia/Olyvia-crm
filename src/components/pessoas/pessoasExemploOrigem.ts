// DADOS DE EXEMPLO da origem e da saúde de cada pessoa (canal, campanha, formulário, via de entrada e saúde de 0 a 100).
// Nada disto vem da base. Sem formulário (e via "manual"), a pessoa foi "Registada à mão".
import type { Pessoa } from "./pessoasTipos";

type Origem = Pick<Pessoa, "canal" | "campanha" | "formulario" | "viaEntrada" | "saude">;

const PEDIDO = "Pedido de orçamento";

const ORIGENS: Record<string, Origem> = {
  "p-marta": { canal: "Recomendação", viaEntrada: "indicacao", saude: 82 },
  "p-rui": { canal: "Site", campanha: "Cozinhas 2026", formulario: PEDIDO, viaEntrada: "formulario", saude: 74 },
  "p-helena": { canal: "Facebook Ads", campanha: "Pinturas de outono", formulario: PEDIDO, viaEntrada: "formulario", saude: 58 },
  "p-paulo": { canal: "Recomendação", viaEntrada: "indicacao", saude: 90 },
  "p-sofia": { canal: "Google Ads", formulario: "Contacto geral", viaEntrada: "formulario", saude: 45 },
  "p-nuno": { canal: "Site", campanha: "Janelas 2026", formulario: PEDIDO, viaEntrada: "formulario", saude: 38 },
  "p-ines": { canal: "Chamada recebida", viaEntrada: "telefone", saude: 22 },
  "p-tiago": { canal: "Facebook Ads", campanha: "Isolamento 2026", formulario: PEDIDO, viaEntrada: "formulario", saude: 30 },
  "p-clara": { canal: "Google Ads", campanha: "Cozinhas 2026", formulario: PEDIDO, viaEntrada: "formulario", saude: 66 },
  "p-vasco": { canal: "Recomendação", viaEntrada: "indicacao", saude: 71 },
  "p-beatriz": { canal: "Site", formulario: "Contacto geral", viaEntrada: "formulario", saude: 55 },
  "p-hugo": { canal: "Instagram", campanha: "Remodelações", formulario: "Casa de banho", viaEntrada: "formulario", saude: 62 },
  "p-lucia": { canal: "Evento", campanha: "Feira Casa Viva", viaEntrada: "manual", saude: 28 },
  "p-rita": { canal: "Google Ads", campanha: "Pinturas de outono", formulario: "Pedido de visita", viaEntrada: "formulario", saude: 77 },
  "p-goncalo": { canal: "LinkedIn", campanha: "Obras para empresas", formulario: PEDIDO, viaEntrada: "formulario", saude: 60 },
  "p-joana": { canal: "Chamada recebida", viaEntrada: "telefone", saude: 15 },
  "p-fabio": { canal: "Site", formulario: PEDIDO, viaEntrada: "formulario", saude: 20 },
};

/** A origem e a saúde de exemplo de uma pessoa (vazio se o id não tem dados). */
export const origemExemplo = (id: string): Partial<Origem> => ORIGENS[id] ?? {};
