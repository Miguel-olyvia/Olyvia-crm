// As pessoas de exemplo da página Pessoas e os campos extra das pessoas da seed. Só dados: nada aqui toca no Estado, na seed nem na VERSAO.
// Cada pessoa nova é um negócio copiado de um negócio base da seed (ver dealsPessoas.ts), com um número único (90201 em diante) que não existe no Estado.
// Os negócios de uma pessoa de exemplo não existem no Estado e não abrem nada: nas listas são texto e o botão da ficha leva ao separador Negócios (ver semPaginaPropria).
// `base` só dá a linha, o dono e o orçamento da cópia; `idAbrivel` já não é usado pelos ecrãs (nenhum botão abre um negócio de exemplo); só os testes o consultam.
// Cada pessoa usa um base diferente, menos dois pares (Hotel Praia Dourada e Armando Figueiredo no 1027; Bruno Teixeira e Modas Aurora no 1038): só há dois
// negócios de cozinha com orçamento (1027, 1031) para três pessoas que precisam dele, e só quatro de casa de banho sem orçamento para cinco.
import type { Orcamento } from "./motor";
import type { ExemploNegocio } from "./exemplosDocs";
import type { EstadoToque } from "./toquesDocs";
import type { MotivoPerda } from "./perdaDocs";

export type Qualificacao = "MQL" | "SQL";
/** O significado de cada sigla, em português (Marketing Qualified Lead e Sales Qualified Lead). */
export const NOME_QUALIFICACAO: Record<Qualificacao, string> = { MQL: "qualificada para marketing", SQL: "qualificada para vendas" };
/** Uma empresa: o nome dela é o nome da pessoa na lista (o que se mostra); aqui ficam a pessoa de contacto e o NIF. */
export interface Empresa { contacto: string; nif: string }
export interface ExtraPessoa { qualificacao?: Qualificacao; nif?: string; empresa?: Empresa }

export interface ToqueExemplo {
  /** Dias depois da chegada da pessoa. */
  dias: number;
  via: "online" | "mao";
  origem: string;
  campanha?: string;
  /** Só nos toques online: o formulário por onde entrou. */
  formulario?: "site" | "campanha" | "outdoor";
  estado?: EstadoToque;
  motivo?: string;
}

export interface PessoaExemplo extends ExtraPessoa {
  /** O número do negócio de exemplo: acima de todos os da seed, de S.seq e dos 90101 a 90109 dos negócios extra de exemplosDocs.ts. */
  id: number;
  nome: string;
  tel: string;
  /** O negócio da seed que se copia (a linha, a fase e o orçamento vêm dele). */
  base: number;
  servico: string;
  /** "Rua, localidade": a localidade é a última parte. */
  local: string;
  /** Quando entrou ("dd/mm", ou "dd/mm hh:mm"). Nunca depois de hoje (10/10). */
  quando: string;
  /** A origem do negócio, como na seed: site, telefone, recomendação ou campanha. */
  origem: string;
  fase: number;
  /** Campos da ficha que mudam em relação ao negócio base (resultado do contacto, tentativas, tipo de cliente...). */
  f: Record<string, string>;
  orc?: Partial<Orcamento>;
  /** A visita marcada ou feita ("qui 15/10 · 10:00"); omitido, fica a do negócio base. */
  slot?: string;
  /** O motivo da perda: a pessoa já nasce perdida. */
  perdida?: MotivoPerda;
  toques: ToqueExemplo[];
  /** Os negócios que a pessoa tem além do principal (números 90301 em diante). */
  negocios?: ExemploNegocio[];
}

const SITE: ToqueExemplo = { dias: 0, via: "online", origem: "Site", formulario: "site" };
const CHAMADA: ToqueExemplo = { dias: 0, via: "mao", origem: "Chamada" };
const INDICACAO: ToqueExemplo = { dias: 0, via: "mao", origem: "Indicação" };
const VOLTOU: Omit<ToqueExemplo, "dias"> = { via: "online", origem: "Site", formulario: "site", estado: "associada", motivo: "O telefone já existia nesta ficha, por isso não criou uma lead nova." };
const ATENDEU = "Atendeu · interessado";
const LIGAR_MAIS_TARDE = "Atendeu · ligar mais tarde";

/** As dez pessoas novas: nenhuma existe na seed. As situações: lead nova sem contacto, lead que não atendeu, visita marcada, voltou a contactar,
 *  duas perdidas, três empresas (condomínio, retalho e hotelaria) e um cliente pessoa com qualificação histórica. */
export const PESSOAS_EXEMPLO: readonly PessoaExemplo[] = [
  { id: 90201, nome: "Inês Carvalho", tel: "932 118 450", base: 1043, servico: "Casa de banho nova", local: "Rua do Comércio 8, Setúbal", quando: "08/10 22:10", origem: "site", fase: 0,
    f: { pedido: "Quero trocar a banheira por um duche.", concelho: "Setúbal" }, toques: [SITE, { ...VOLTOU, dias: 1 }] },
  { id: 90202, nome: "Bruno Teixeira", tel: "965 220 731", base: 1038, servico: "WC social", local: "Rua do Souto 40, Braga", quando: "02/10", origem: "campanha de outono", fase: 1,
    f: { resultado: "Não atendeu", tentativas: "3", concelho: "Braga" }, toques: [{ dias: 0, via: "online", origem: "Meta Ads", campanha: "Casa de banho outubro", formulario: "campanha" }] },
  { id: 90203, nome: "Filipa Moreira", tel: "913 640 288", base: 1036, servico: "Cozinha", local: "Rua de Santa Catarina 450, Vila Nova de Gaia", quando: "03/10", origem: "campanha de outono", fase: 2,
    f: { resultado: ATENDEU, tentativas: "1", concelho: "Vila Nova de Gaia", v1_data: "2026-10-16", v1_hora: "09:30" }, slot: "sex 16/10 · 09:30",
    toques: [{ dias: 0, via: "online", origem: "Google Ads", campanha: "Cozinhas outubro", formulario: "campanha" }], qualificacao: "SQL", nif: "245678901" },
  { id: 90204, nome: "Ricardo Nogueira", tel: "926 051 377", base: 1044, servico: "WC suite", local: "Rua do Infante 33, Faro", quando: "28/09", origem: "site", fase: 1,
    f: { resultado: LIGAR_MAIS_TARDE, tentativas: "1", concelho: "Faro" }, toques: [SITE, { ...VOLTOU, dias: 8 }], qualificacao: "MQL" },
  { id: 90205, nome: "Teresa Antunes", tel: "914 377 062", base: 1031, servico: "Cozinha", local: "Rua Augusta 150, Lisboa", quando: "19/09", origem: "telefone", fase: 3,
    f: { resultado: ATENDEU, tentativas: "1", concelho: "Lisboa" }, orc: { enviada: "01/10" }, toques: [CHAMADA], perdida: "Preço" },
  { id: 90206, nome: "Duarte Gouveia", tel: "938 905 614", base: 1035, servico: "WC principal", local: "Rua da Sofia 60, Coimbra", quando: "21/09", origem: "recomendação", fase: 2,
    f: { resultado: ATENDEU, tentativas: "1", concelho: "Coimbra", v1_data: "2026-09-30", v1_hora: "15:00" }, slot: "qua 30/09 · 15:00", toques: [INDICACAO], perdida: "Adiou" },
  { id: 90207, nome: "Condomínio Jardins do Tejo", tel: "219 874 120", base: 1030, servico: "Casas de banho das partes comuns", local: "Alameda dos Jardins 20, Amadora", quando: "27/09",
    origem: "telefone", fase: 3, f: { resultado: ATENDEU, tentativas: "1", tipo_cliente: "Condomínio", concelho: "Amadora" }, orc: { vendaDireta: false, enviada: "07/10" },
    toques: [CHAMADA], empresa: { contacto: "Manuel Rebelo (administrador)", nif: "980123456" } },
  { id: 90208, nome: "Hotel Praia Dourada", tel: "289 543 210", base: 1027, servico: "Cozinha do restaurante", local: "Avenida da Liberdade 15, Albufeira", quando: "08/09", origem: "site", fase: 4,
    f: { resultado: ATENDEU, tentativas: "1", tipo_cliente: "Empresa", concelho: "Albufeira" }, orc: { enviada: "18/09", aceite: "22/09", desconto: 4 }, toques: [SITE],
    empresa: { contacto: "Sónia Batista (gerente)", nif: "509876543" },
    negocios: [{ id: 90301, titulo: "Casas de banho dos quartos", linhas: ["wc"], quando: "06/10", proposta: "por gerar", contrato: "por gerar",
      orcamentos: [{ titulo: "Casas de banho (12 quartos)", valor: 18900 }] }] },
  { id: 90209, nome: "Armando Figueiredo", tel: "917 455 208", base: 1027, servico: "Cozinha", local: "Rua de Cedofeita 77, Porto", quando: "05/09", origem: "campanha de outono", fase: 4,
    f: { resultado: ATENDEU, tentativas: "1", concelho: "Porto" }, orc: { enviada: "12/09", aceite: "16/09" },
    toques: [{ dias: 0, via: "online", origem: "Meta Ads", campanha: "Cozinhas setembro", formulario: "campanha" }], qualificacao: "SQL" },
  { id: 90210, nome: "Modas Aurora", tel: "253 410 972", base: 1038, servico: "WC dos funcionários da loja", local: "Rua de Santa Maria 18, Guimarães", quando: "05/10", origem: "site", fase: 1,
    f: { resultado: ATENDEU, tentativas: "2", tipo_cliente: "Empresa", concelho: "Guimarães" }, toques: [SITE], empresa: { contacto: "Helena Aurora (proprietária)", nif: "508765432" } },
];

/** O que as pessoas da seed têm a mais (a seed não muda): a qualificação de duas leads. */
const EXTRAS_SEED: Readonly<Record<string, ExtraPessoa>> = {
  "Pedro Lopes": { qualificacao: "MQL" },
  "Carla Nunes": { qualificacao: "SQL" },
};

/** O resultado do último contacto de pessoas da seed que não é o "Atendeu · interessado" por omissão (variedade, sem mudar o seed). */
export const RESULTADO_SEED: Readonly<Record<string, string>> = {
  "Manuel Costa": LIGAR_MAIS_TARDE,
  "Sérgio Pinto": LIGAR_MAIS_TARDE,
};

/** Os negócios extra das pessoas novas, por nome (os das pessoas da seed estão em exemplosDocs.ts). */
export const NEGOCIOS_PESSOAS: Readonly<Record<string, readonly ExemploNegocio[]>> = Object.fromEntries(
  PESSOAS_EXEMPLO.filter((e) => e.negocios).map((e) => [e.nome, e.negocios!]),
);

/** Os campos extra de uma pessoa (seed ou exemplo): qualificação, NIF e empresa. */
export function extraDe(nome: string): ExtraPessoa {
  const e = PESSOAS_EXEMPLO.find((x) => x.nome === nome);
  return e ? { qualificacao: e.qualificacao, nif: e.nif, empresa: e.empresa } : EXTRAS_SEED[nome] ?? {};
}

/** A pessoa foi inventada para a demonstração (não existe na seed). */
export const ehPessoaExemplo = (nome: string): boolean => PESSOAS_EXEMPLO.some((e) => e.nome === nome);

/** O negócio que se abre ao carregar num botão: o da seed. Os de pessoas novas abrem o negócio base (os outros números ficam como estão). */
export function idAbrivel(id: number): number {
  return PESSOAS_EXEMPLO.find((e) => e.id === id)?.base ?? id;
}
