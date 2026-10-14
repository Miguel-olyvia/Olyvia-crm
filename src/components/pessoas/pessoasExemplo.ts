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

/** Valores por defeito dos campos obrigatórios; os dados de exemplo de cada pessoa sobrepõem-nos. */
const PADRAO = { viaEntrada: "manual", saude: 50 } as const;

const doNegocio = (n: NegocioMes): Pessoa => ({
  ...PADRAO, id: n.pessoaId, nome: n.pessoa, contacto: n.contacto, comercial: n.comercial, ...PROPRIOS[n.pessoaId], ...extrasExemplo(n.pessoaId),
});

const PESSOAS_COM_NEGOCIO: Pessoa[] = DADOS_EXEMPLO.negocios.map(doNegocio);

/**
 * Leads sem negócio no quadro do mês: três novas, duas com visita (a da Rita é hoje, na morada da lead; a do Gonçalo ficou por
 * concluir, noutra morada), uma com empresa e duas perdidas (a do Negócio tem um negócio histórico). O Paulo, cliente, também
 * tem uma visita marcada (noutra morada).
 */
const LEADS_NOVAS: Pessoa[] = [
  {
    ...PADRAO, id: "p-beatriz", nome: "Beatriz Sampaio", comercial: "Ana Ribeiro", origem: "site", etapa: "nova", ultimoContactoDias: 2,
    contacto: { telefone: "921 234 510", email: "beatriz.sampaio@exemplo.pt" },
  },
  {
    ...PADRAO, id: "p-hugo", nome: "Hugo Teixeira", comercial: "Bruno Costa", origem: "formulario",
    etapa: "nova", ultimoContactoDias: 1, contacto: { telefone: "922 345 611", email: "hugo.teixeira@exemplo.pt" },
  },
  {
    ...PADRAO, id: "p-lucia", nome: "Lúcia Faria", comercial: "Carla Mendes", origem: "campanha", etapa: "emContacto", ultimoContactoDias: 21,
    contacto: { telefone: "923 456 712", email: null },
  },
  {
    ...PADRAO, id: "p-rita", nome: "Rita Albuquerque", comercial: "Ana Ribeiro", origem: "formulario", etapa: "visitaMarcada", ultimoContactoDias: 2,
    contacto: { telefone: "924 567 813", email: "rita.albuquerque@exemplo.pt" },
  },
  {
    ...PADRAO, id: "p-goncalo", nome: "Gonçalo Matias", comercial: "Bruno Costa", origem: "campanha", etapa: "visitaMarcada", ultimoContactoDias: 6,
    contacto: { telefone: "925 678 914", email: "goncalo.matias@exemplo.pt" },
  },
  {
    ...PADRAO, id: "p-joana", nome: "Joana Bastos", comercial: "Carla Mendes", origem: "telefone", etapa: "emContacto", ultimoContactoDias: 8,
    contacto: { telefone: "926 789 015", email: null },
  },
  {
    ...PADRAO, id: "p-fabio", nome: "Fábio Lemos", comercial: "Bruno Costa", origem: "site", etapa: "visitaMarcada", ultimoContactoDias: 20,
    contacto: { telefone: "927 890 116", email: "fabio.lemos@exemplo.pt" },
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

const contactoDe = (id: string) => PESSOAS_EXEMPLO.find((p) => p.id === id)!.contacto;
const orc = (id: string, valor: number, escolhido = false) => ({ id, valor, escolhido });

/** Um negócio aberto que só existe nesta página (fora do quadro do mês, sem detalhes): mostra pessoas com vários negócios. */
const aberto = (n: Omit<NegocioMes, "contacto" | "contrato">): NegocioMes => ({ ...n, contrato: null, contacto: contactoDe(n.pessoaId) });

/** Negócios novos em aberto, só da página Pessoas: um cliente com negócio novo e uma lead com três negócios, em fases diferentes. */
const ABERTOS_EXTRA: NegocioMes[] = [
  aberto({
    id: "x1", pessoaId: "p-marta", pessoa: "Marta Silveira", servico: "Cozinha", comercial: "Ana Ribeiro", dias: 5, parado: 2,
    proximoPrazo: "2026-10-16", orcamentos: [orc("x1-o1", 3200, true)], proposta: null,
  }),
  aberto({
    id: "x2", pessoaId: "p-paulo", pessoa: "Paulo Neves", servico: "Climatização", comercial: "Bruno Costa", dias: 18, parado: 10,
    proximoPrazo: "2026-10-10", orcamentos: [orc("x2-o1", 4100, true)], proposta: { estado: "enviada" },
  }),
  aberto({
    id: "x3", pessoaId: "p-vasco", pessoa: "Vasco Pinto", servico: "Casa de banho", comercial: "Ana Ribeiro", dias: 2, parado: 0,
    proximoPrazo: "2026-10-15", orcamentos: [], proposta: null,
  }),
  aberto({
    id: "x4", pessoaId: "p-vasco", pessoa: "Vasco Pinto", servico: "Janelas", comercial: "Ana Ribeiro", dias: 9, parado: 4,
    proximoPrazo: "2026-10-14", orcamentos: [orc("x4-o1", 5600, true)], proposta: { estado: "rascunho" },
  }),
  aberto({
    id: "x5", pessoaId: "p-clara", pessoa: "Clara Dias", servico: "Armários", comercial: "Diogo Lopes", dias: 3, parado: 1,
    proximoPrazo: "2026-10-17", orcamentos: [orc("x5-o1", 4800), orc("x5-o2", 5300)], proposta: null,
  }),
];

/** Um negócio perdido há meses, de uma lead que também foi perdida (no passo Negócio). */
const HISTORICO_FABIO: NegocioHistorico = {
  id: "h3", pessoaId: "p-fabio", pessoa: "Fábio Lemos", servico: "Porta de entrada", comercial: "Bruno Costa",
  dias: 45, parado: null, proximoPrazo: null, contacto: contactoDe("p-fabio"),
  orcamentos: [orcamento("h3-o1", 2800)], proposta: { estado: "enviada" }, contrato: null, mes: "2026-09", resultado: "perdido",
};

/** Os ids dos negócios que estão no quadro de Negócio e metas (só esses se abrem lá). */
export const IDS_NEGOCIOS_DO_QUADRO: ReadonlySet<string> = new Set(DADOS_EXEMPLO.negocios.map((n) => n.id));

export const NEGOCIOS_PESSOAS_EXEMPLO: NegocioPessoa[] = [...DADOS_EXEMPLO.negocios, ...ABERTOS_EXTRA, ...HISTORICOS, HISTORICO_FABIO];

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
