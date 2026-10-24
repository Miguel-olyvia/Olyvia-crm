// Fábricas só para os testes (nenhum código da página as importa): uma pessoa, um negócio e um resumo com valores
// por defeito, que cada teste altera no que lhe interessa.
import type { NegocioMes, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import {
  REGISTOS_VAZIOS, type ContactoPessoa, type LevantamentoPessoa, type RegistosDaPessoa, type VisitaPessoa,
} from "@/components/negocio-metas/registosTipos";
import { derivar } from "./juntarPessoas";
import type { PessoaSemente } from "./pessoaSemente";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";

export const pessoaBase = (id = "a", extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana Ribeiro", origem: "site", viaEntrada: "formulario",
  saude: 50, ultimoContactoDias: 9, ...extra,
});

/** Uma semente (a pessoa com a etapa e a visita do exemplo): só serve para gerar registos de exemplo. */
export const sementeBase = (id = "a", extra: Partial<PessoaSemente> = {}): PessoaSemente => ({ ...pessoaBase(id), etapa: "emContacto", ...extra });

export const negocioBase = (id = "n", extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id, pessoaId: "a", pessoa: "A", servico: "Serviço", comercial: "Ana Ribeiro", dias: 3, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});

/**
 * Um resumo coerente com a pessoa, os negócios abertos e os REGISTOS dela (a etapa, o «atrasada», o próximo passo e a Parte do Quadro
 * saem das mesmas funções da página). Sem registos, a pessoa não tem nenhum.
 */
export function resumoBase(
  pessoa: Pessoa, abertos: NegocioMes[] = [], hoje = "2026-10-13", papel: ResumoPessoa["papel"] = "lead",
  registos: RegistosDaPessoa = REGISTOS_VAZIOS,
): ResumoPessoa {
  return {
    pessoa, papel, negocios: abertos, abertos, emJogo: 0, formulario: pessoa.formulario ?? null,
    ...derivar(pessoa, papel, abertos, abertos, registos, hoje), registos,
    faseEtapa: null, piorAberto: null, saude: null, semNegocio: abertos.length === 0, soHistorico: false,
  };
}

/** Uma visita (Por fazer, Levantamento, 2026-10-20 10:00) com valores por defeito. */
export const visitaBase = (id = "v", extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-20", hora: "10:00", feitoPor: "Ana Ribeiro", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: true, nota: "", ...extra,
});

/** Um contacto (chamada) da pessoa "a", por ligar, atendido e interessado. */
export const contactoBase = (id = "rc-1", extra: Partial<ContactoPessoa> = {}): ContactoPessoa => ({
  id, pessoaId: "a", data: "2026-10-10", resultado: "atendeuInteressado", nota: "", negocioId: null, ...extra,
});

/** Uma visita da pessoa "a" (Por fazer, Levantamento, 2026-10-20 10:00), por ligar. */
export const visitaPessoaBase = (id = "rv-1", extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  ...visitaBase(id), pessoaId: "a", negocioId: null, ...extra,
});

/** Um levantamento da pessoa "a", sem linhas, por ligar. */
export const levantamentoBase = (id = "rl-1", extra: Partial<LevantamentoPessoa> = {}): LevantamentoPessoa => ({
  id, pessoaId: "a", visitaId: null, data: "2026-10-12", feitoPor: "Ana Ribeiro", rascunho: { linhas: [], observacoes: "", respostas: {} }, negocioId: null, ...extra,
});

/** Os registos de uma pessoa; sem nada, vazios. */
export const registosBase = (r: Partial<RegistosDaPessoa> = {}): RegistosDaPessoa => ({ ...REGISTOS_VAZIOS, ...r });
