// DADOS DE EXEMPLO da página "Pessoas". Não vêm da base de dados. Os 10 pessoaId e os
// dados de contacto e comercial vêm de `DADOS_EXEMPLO.negocios` (Negócio e metas), para a
// relação pessoa-negócio ser uma só. A origem, a etapa e o último contacto são campos
// próprios desta página, de exemplo.
import { DADOS_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { atividadeExemplo, extrasExemplo } from "./pessoasExemploFicha";
import type {
  CodigoMatch, EtapaPessoa, ItemAtividade, NegocioHistorico, NegocioPessoa, OrigemPessoa, Pessoa, Submissao, TipoSubmissao,
} from "./pessoasTipos";

type CamposProprios = { origem: OrigemPessoa; etapa: EtapaPessoa; ultimoContactoDias: number };

/** Os campos próprios das 10 pessoas que já têm negócio no mês. */
const PROPRIOS: Record<string, CamposProprios> = {
  "p-marta": { origem: "indicacao", etapa: "cliente", ultimoContactoDias: 3 },
  "p-rui": { origem: "site", etapa: "cliente", ultimoContactoDias: 5 },
  "p-helena": { origem: "campanha", etapa: "cliente", ultimoContactoDias: 9 },
  "p-paulo": { origem: "indicacao", etapa: "cliente", ultimoContactoDias: 2 },
  "p-sofia": { origem: "formulario", etapa: "cliente", ultimoContactoDias: 12 },
  "p-nuno": { origem: "site", etapa: "qualificada", ultimoContactoDias: 8 },
  "p-ines": { origem: "telefone", etapa: "cliente", ultimoContactoDias: 30 },
  "p-tiago": { origem: "campanha", etapa: "emContacto", ultimoContactoDias: 16 },
  "p-clara": { origem: "formulario", etapa: "visitaMarcada", ultimoContactoDias: 1 },
  "p-vasco": { origem: "indicacao", etapa: "qualificada", ultimoContactoDias: 4 },
};

const doNegocio = (n: NegocioMes): Pessoa => ({
  id: n.pessoaId, nome: n.pessoa, contacto: n.contacto, comercial: n.comercial, ...PROPRIOS[n.pessoaId], ...extrasExemplo(n.pessoaId),
});

const PESSOAS_COM_NEGOCIO: Pessoa[] = DADOS_EXEMPLO.negocios.map(doNegocio);

/** As três leads novas, sem negócio. */
const LEADS_NOVAS: Pessoa[] = [
  {
    id: "p-beatriz", nome: "Beatriz Sampaio", comercial: "Ana Ribeiro", origem: "site", etapa: "nova", ultimoContactoDias: 2,
    contacto: { telefone: "921 234 510", email: "beatriz.sampaio@exemplo.pt" },
  },
  {
    id: "p-hugo", nome: "Hugo Teixeira", comercial: "Bruno Costa", origem: "formulario", origemDetalhe: "Casa de banho",
    etapa: "nova", ultimoContactoDias: 1, contacto: { telefone: "922 345 611", email: "hugo.teixeira@exemplo.pt" },
  },
  {
    id: "p-lucia", nome: "Lúcia Faria", comercial: "Carla Mendes", origem: "campanha", etapa: "emContacto", ultimoContactoDias: 21,
    contacto: { telefone: "923 456 712", email: null },
  },
];

export const PESSOAS_EXEMPLO: Pessoa[] = [
  ...PESSOAS_COM_NEGOCIO,
  ...LEADS_NOVAS.map((p) => ({ ...p, ...extrasExemplo(p.id) })),
];

/** A atividade de exemplo (chamadas, emails e registo da ficha), gerada a partir do último contacto de cada pessoa. */
export const ATIVIDADE_EXEMPLO: ItemAtividade[] = atividadeExemplo(PESSOAS_EXEMPLO);

const orcamento = (id: string, valor: number) => ({ id, valor, escolhido: true });

/** Dois negócios que já terminaram, fora do quadro do mês (o tipo de Negócios fica como está). */
const HISTORICOS: NegocioHistorico[] = [
  {
    id: "h1", pessoaId: "p-marta", pessoa: "Marta Silveira", servico: "Pintura interior", comercial: "Ana Ribeiro",
    dias: 120, parado: null, proximoPrazo: null, contacto: PESSOAS_EXEMPLO[0].contacto,
    orcamentos: [orcamento("h1-o1", 4300)], proposta: { estado: "aceite" }, contrato: { estado: "assinado" },
    mes: "2026-06", resultado: "ganho",
  },
  {
    id: "h2", pessoaId: "p-nuno", pessoa: "Nuno Barros", servico: "Portão", comercial: "Carla Mendes",
    dias: 60, parado: null, proximoPrazo: null, contacto: PESSOAS_EXEMPLO[5].contacto,
    orcamentos: [orcamento("h2-o1", 3100)], proposta: { estado: "enviada" }, contrato: null,
    mes: "2026-08", resultado: "perdido",
  },
];

export const NEGOCIOS_PESSOAS_EXEMPLO: NegocioPessoa[] = [...DADOS_EXEMPLO.negocios, ...HISTORICOS];

/**
 * A distribuição dos códigos 01 a 06: a ÚNICA tabela a mudar quando os utilizadores
 * confirmarem. Cada linha diz o código, o tipo e quem são as candidatas da lista.
 */
const DISTRIBUICAO: { codigo: CodigoMatch; tipo: TipoSubmissao; candidatas: Submissao["candidatas"] }[] = [
  { codigo: "CONFLITO", tipo: "contacto", candidatas: [{ pessoaId: "p-helena", via: "email" }, { pessoaId: "p-paulo", via: "telefone" }] },
  { codigo: "MATCH_FORTE", tipo: "cliente", candidatas: [{ pessoaId: "p-marta", via: "ambos" }] },
  { codigo: "MATCH_FORTE", tipo: "lead", candidatas: [{ pessoaId: "p-clara", via: "ambos" }] },
  { codigo: "MATCH_EMAIL", tipo: "lead", candidatas: [{ pessoaId: "p-hugo", via: "email" }] },
  { codigo: "MATCH_TELEFONE", tipo: "cliente", candidatas: [{ pessoaId: "p-rui", via: "telefone" }] },
  { codigo: "MATCH_EMAIL", tipo: "contacto", candidatas: [{ pessoaId: "p-sofia", via: "email" }] },
];

type DadosSubmissao = Omit<Submissao, "codigo" | "tipo" | "candidatas">;

/** O resto de cada submissão (formulário, campanha, data, campos e deduplicação), pela mesma ordem. */
const DADOS: DadosSubmissao[] = [
  {
    id: "s1", nomeFicha: "Helena Tavares", formulario: "Pedido de orçamento", campanha: "Outono 2026", data: "2026-10-12T18:40",
    campos: [
      { rotulo: "Nome", valor: "Helena Tavares" }, { rotulo: "Email", valor: "helena.tavares@exemplo.pt" },
      { rotulo: "Telefone", valor: "914 567 803" }, { rotulo: "Serviço", valor: "Pintura exterior" },
    ],
    _meta: { emailIgual: true, telefoneIgual: true }, visitaPedida: null,
  },
  {
    id: "s2", nomeFicha: "Marta Silveira", formulario: "Pedido de visita", campanha: "Pinturas de outono", data: "2026-10-13T09:15",
    campos: [
      { rotulo: "Nome", valor: "Marta Silveira" }, { rotulo: "Email", valor: "marta.silveira@exemplo.pt" },
      { rotulo: "Telefone", valor: "912 345 601" }, { rotulo: "Serviço", valor: "Pintura exterior" },
    ],
    _meta: { emailIgual: true, telefoneIgual: true }, visitaPedida: "Pintura exterior",
  },
  {
    id: "s3", nomeFicha: "Clara Dias", formulario: "Pedido de orçamento", campanha: "Cozinhas 2026", data: "2026-10-12T11:05",
    campos: [
      { rotulo: "Nome", valor: "Clara Dias" }, { rotulo: "Email", valor: "clara.dias@exemplo.pt" },
      { rotulo: "Telefone", valor: "918 901 207" }, { rotulo: "Mensagem", valor: "Podem enviar a proposta revista?" },
    ],
    _meta: { emailIgual: true, telefoneIgual: true }, visitaPedida: null,
  },
  {
    id: "s4", nomeFicha: "Hugo Teixeira", formulario: "Casa de banho", campanha: "Remodelações", data: "2026-10-10T16:30",
    campos: [
      { rotulo: "Nome", valor: "Hugo Teixeira" }, { rotulo: "Email", valor: "hugo.teixeira@exemplo.pt" },
      { rotulo: "Telefone", valor: "922 000 111" }, { rotulo: "Serviço", valor: "Casa de banho" },
    ],
    _meta: { emailIgual: true, telefoneIgual: false }, visitaPedida: null,
  },
  {
    id: "s5", nomeFicha: "Rui Figueiredo", formulario: "Pedido de orçamento", campanha: "Cozinhas 2026", data: "2026-10-11T10:20",
    campos: [
      { rotulo: "Nome", valor: "Rui Figueiredo" }, { rotulo: "Email", valor: "rui.figueiredo@exemplo.pt" },
      { rotulo: "Telefone", valor: "913 456 702" }, { rotulo: "Serviço", valor: "Armários" },
    ],
    _meta: { emailIgual: false, telefoneIgual: true }, visitaPedida: null,
  },
  {
    id: "s6", nomeFicha: "Sofia Matos", formulario: "Contacto geral", campanha: "Sem campanha", data: "2026-10-09T14:50",
    campos: [
      { rotulo: "Nome", valor: "Sofia Matos" }, { rotulo: "Email", valor: "sofia.matos@exemplo.pt" },
      { rotulo: "Telefone", valor: "915 000 222" }, { rotulo: "Mensagem", valor: "Preciso de uma segunda opinião." },
    ],
    _meta: { emailIgual: true, telefoneIgual: false }, visitaPedida: null,
  },
];

export const SUBMISSOES_EXEMPLO: Submissao[] = DADOS.map((d, i) => ({ ...d, ...DISTRIBUICAO[i] }));
