// Fábricas só para os testes (nenhum código da página as importa): uma pessoa, um negócio e um resumo com valores
// por defeito, que cada teste altera no que lhe interessa.
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { etapaEfetiva, estaAtrasada } from "./etapaPessoa";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";

export const pessoaBase = (id = "a", extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana Ribeiro", origem: "site", viaEntrada: "formulario",
  saude: 50, etapa: "emContacto", ultimoContactoDias: 9, ...extra,
});

export const negocioBase = (id = "n", extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id, pessoaId: "a", pessoa: "A", servico: "Serviço", comercial: "Ana Ribeiro", dias: 3, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});

/** Um resumo coerente com a pessoa e os negócios abertos (a etapa e o "atrasada" saem das mesmas funções da página). */
export function resumoBase(pessoa: Pessoa, abertos: NegocioMes[] = [], hoje = "2026-10-13", papel: ResumoPessoa["papel"] = "lead"): ResumoPessoa {
  const entrada = { pessoa, papel, abertos };
  return {
    pessoa, papel, negocios: abertos, abertos, emJogo: 0, atrasada: estaAtrasada(entrada, hoje), formulario: pessoa.formulario ?? null,
    etapa: etapaEfetiva(entrada), faseEtapa: null, piorAberto: null, saude: null, semNegocio: abertos.length === 0, soHistorico: false,
  };
}
