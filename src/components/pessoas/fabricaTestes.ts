// Fábricas só para os testes (nenhum código da página as importa): uma pessoa, um negócio e um resumo com valores
// por defeito, que cada teste altera no que lhe interessa.
import type { NegocioMes, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { etapaEfetiva, estaAtrasada } from "./etapaPessoa";
import type { PessoaSemente } from "./pessoaSemente";
import type { PedidoNegocio, Pessoa, ResumoPessoa } from "./pessoasTipos";

export const pessoaBase = (id = "a", extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana Ribeiro", origem: "site", viaEntrada: "formulario",
  saude: 50, ultimoContactoDias: 9, ...extra,
});

/** Uma semente (a pessoa com a etapa e a visita do exemplo): só serve para gerar pedidos de exemplo. */
export const sementeBase = (id = "a", extra: Partial<PessoaSemente> = {}): PessoaSemente => ({ ...pessoaBase(id), etapa: "emContacto", ...extra });

export const negocioBase = (id = "n", extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id, pessoaId: "a", pessoa: "A", servico: "Serviço", comercial: "Ana Ribeiro", dias: 3, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});

/**
 * Um resumo coerente com a pessoa, os negócios abertos e os pedidos (a etapa e o "atrasada" saem das mesmas funções da página).
 * Os pedidos são os da pessoa, tal como `juntarPessoas` os entrega.
 */
export function resumoBase(
  pessoa: Pessoa, abertos: NegocioMes[] = [], hoje = "2026-10-13", papel: ResumoPessoa["papel"] = "lead", pedidos: PedidoNegocio[] = [],
): ResumoPessoa {
  const entrada = { pessoa, papel, abertos, pedidos };
  return {
    pessoa, papel, negocios: abertos, abertos, pedidos, emJogo: 0, atrasada: estaAtrasada(entrada, hoje), formulario: pessoa.formulario ?? null,
    etapa: etapaEfetiva(entrada), faseEtapa: null, piorAberto: null, saude: null, semNegocio: abertos.length === 0, soHistorico: false,
  };
}

/** Uma visita de um pedido (Por fazer, Levantamento, 2026-10-20 10:00) com valores por defeito. */
export const visitaBase = (id = "v", extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-20", hora: "10:00", feitoPor: "Ana Ribeiro", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: true, nota: "", ...extra,
});

/** Um pedido por contactar, sem visitas, da pessoa "a". */
export const pedidoBase = (id = "pd-1", extra: Partial<PedidoNegocio> = {}): PedidoNegocio => ({
  id, pessoaId: "a", servico: "Cozinha", comercial: "Ana Ribeiro", criadoEm: "2026-10-01", contactado: false, visitas: [], ...extra,
});
