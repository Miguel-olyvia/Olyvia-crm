// Dados de exemplo do canal de denúncias, relativos a «hoje» (15/10/2026). Tudo inventado; só vive em memória.
import { QUEM_SISTEMA } from "../lib/formulario";
import type { Denuncia, EventoHistorico, Identidade, Responsavel } from "../lib/tipos";

export const ORGANIZACAO_EXEMPLO = "Casa Aurora, Lda. (exemplo)";

export const RESPONSAVEIS: readonly Responsavel[] = [
  { id: "r1", nome: "Helena Matos", area: "Compliance" },
  { id: "r2", nome: "Rui Barbosa", area: "Jurídico" },
  { id: "r3", nome: "Carla Nunes", area: "Recursos Humanos" },
  { id: "r4", nome: "Paulo Seixas", area: "Auditoria interna" },
];

/** Quem está a usar a gestão nos dados de exemplo: a responsável do canal. */
export const RESPONSAVEL_ATUAL = RESPONSAVEIS[0];

export const nomeDoResponsavel = (id: string | null): string | null =>
  RESPONSAVEIS.find((r) => r.id === id)?.nome ?? null;

const pessoa = (nome: string, email: string, telefone = ""): Identidade => ({
  nome, email, telefone, podemContactar: true, soResponsavel: true,
});

type Extra = [em: string, quem: string, acao: string, detalhe?: string];

function historico(codigo: string, recebidaEm: string, confirmadaEm: string | null, extras: Extra[] = []): EventoHistorico[] {
  const base: Extra[] = [[`${recebidaEm}T09:00`, QUEM_SISTEMA, "recebida"]];
  if (confirmadaEm) base.push([`${confirmadaEm}T10:15`, RESPONSAVEL_ATUAL.nome, "rececao_confirmada"]);
  return [...base, ...extras].map(([em, quem, acao, detalhe], i) => ({
    id: `h-${codigo}-${i}`, em, quem, acao, ...(detalhe ? { detalhe } : {}),
  }));
}

function denuncia(parcial: Partial<Denuncia> & Pick<Denuncia, "codigo" | "pin" | "tipo" | "descricao" | "recebidaEm" | "estado">): Denuncia {
  const seq = parcial.codigo.slice(-4);
  return {
    id: `d${seq}`,
    resumo: parcial.descricao.split(". ")[0].slice(0, 90),
    quando: "Nas últimas semanas",
    aindaAcontece: "nao_sei",
    onde: "Sede, Lisboa",
    envolvidos: "",
    testemunhas: "nao_sei",
    jaReportado: "",
    anexos: [],
    anonima: true,
    identidade: null,
    confirmadaEm: null,
    responsavelId: null,
    denunciados: [],
    conflitos: [],
    gravidade: "media",
    avaliacaoInicial: "",
    mensagens: [],
    notas: [],
    decisao: null,
    motivoArquivo: null,
    historico: historico(parcial.codigo, parcial.recebidaEm, parcial.confirmadaEm ?? null),
    ...parcial,
  };
}

const msg = (id: string, autor: "responsavel" | "denunciante", em: string, texto: string, anexos: { nome: string; tamanho: number }[] = []) =>
  ({ id, autor, em, texto, anexos });

export function denunciasDeExemplo(): Denuncia[] {
  return [
    denuncia({
      codigo: "DEN-2026-0041", pin: "482915", tipo: "seguranca", estado: "recebida", recebidaEm: "2026-10-11",
      descricao: "A saída de emergência do armazém está bloqueada por paletes há duas semanas. Já houve quase um acidente.",
      quando: "Desde 28/09", aindaAcontece: "sim", onde: "Armazém, porta 3", anonima: false,
      identidade: pessoa("Nuno Ferreira", "nuno.ferreira@exemplo.pt", "912 345 678"),
      gravidade: "alta", avaliacaoInicial: "Risco para a segurança de pessoas: confirmar e inspecionar esta semana.",
    }),
    denuncia({
      codigo: "DEN-2026-0040", pin: "733104", tipo: "dados", estado: "recebida", recebidaEm: "2026-10-14",
      descricao: "Uma folha com salários e moradas de toda a equipa está numa pasta partilhada aberta a qualquer pessoa da empresa.",
      quando: "Ontem", aindaAcontece: "sim", onde: "Pasta partilhada «Administrativo»",
    }),
    denuncia({
      codigo: "DEN-2026-0039", pin: "205861", tipo: "corrupcao", estado: "em_analise", recebidaEm: "2026-09-21",
      confirmadaEm: "2026-09-23", responsavelId: "r2", gravidade: "alta",
      descricao: "Um chefe de compras aceita convites e presentes de um fornecedor antes de cada adjudicação. A proposta mais cara tem ganhado sempre.",
      quando: "Desde o início do ano", aindaAcontece: "sim", onde: "Departamento de compras", envolvidos: "Chefia de compras e um fornecedor de embalagens",
      testemunhas: "sim", avaliacaoInicial: "Indícios plausíveis. Pedir contratos de 2025 e 2026 e cruzar com a lista de fornecedores.",
      mensagens: [
        msg("m39-1", "responsavel", "2026-09-23T10:20", "Recebemos a tua denúncia. Consegues indicar em que adjudicações notaste isto?"),
        msg("m39-2", "denunciante", "2026-09-25T18:42", "Duas em Março e uma em Junho. Junto uma troca de mensagens.", [{ nome: "mensagens-fornecedor.pdf", tamanho: 214_000 }]),
        msg("m39-3", "responsavel", "2026-09-29T09:05", "Obrigado, já temos o material. Estamos a pedir os contratos e voltamos a escrever."),
      ],
      notas: [{ id: "n39-1", quem: "Rui Barbosa", em: "2026-09-29T09:30", texto: "Cruzar com o registo de presentes. Não envolver a chefia de compras." }],
    }),
    denuncia({
      codigo: "DEN-2026-0038", pin: "917340", tipo: "fraude", estado: "mais_info", recebidaEm: "2026-09-28",
      confirmadaEm: "2026-09-29", responsavelId: "r4", anonima: false,
      identidade: pessoa("Marta Pires", "marta.pires@exemplo.pt"),
      descricao: "Há despesas de deslocação lançadas duas vezes, com a mesma fatura, em nome de um colega do comercial.",
      quando: "Setembro", onde: "Contabilidade", envolvidos: "Um colega do comercial",
      mensagens: [msg("m38-1", "responsavel", "2026-10-06T11:00", "Podes dizer-nos em que dias foram lançadas as despesas e enviar as faturas que viste?")],
    }),
    denuncia({
      codigo: "DEN-2026-0037", pin: "560298", tipo: "assedio", estado: "em_analise", recebidaEm: "2026-10-01",
      confirmadaEm: "2026-10-03", responsavelId: "r1", denunciados: ["r3"], gravidade: "alta", anonima: false,
      identidade: pessoa("Inês Cardoso", "ines.cardoso@exemplo.pt", "963 111 222"),
      descricao: "A minha chefia faz comentários humilhantes à frente da equipa e retirou-me tarefas sem explicação depois de eu me queixar.",
      quando: "Desde Junho", aindaAcontece: "sim", onde: "Equipa de apoio ao cliente", envolvidos: "A coordenadora da equipa", testemunhas: "sim",
      jaReportado: "Falei com a coordenadora e nada mudou.",
      avaliacaoInicial: "Queixa grave e atual. O caso fica fora de Recursos Humanos por a visada pertencer à área.",
    }),
    denuncia({
      codigo: "DEN-2026-0036", pin: "384726", tipo: "conflito", estado: "em_analise", recebidaEm: "2026-08-24",
      confirmadaEm: "2026-08-26", responsavelId: "r2", conflitos: ["r4"], anonima: false,
      identidade: pessoa("Tiago Lopes", "tiago.lopes@exemplo.pt"),
      descricao: "O responsável de auditoria contratou a empresa do cunhado para rever as contas do ano, sem consulta a outras empresas.",
      quando: "Em Julho", onde: "Auditoria interna", envolvidos: "Responsável de auditoria",
    }),
    denuncia({
      codigo: "DEN-2026-0035", pin: "671850", tipo: "discriminacao", estado: "em_analise", recebidaEm: "2026-07-20",
      confirmadaEm: "2026-07-22", responsavelId: "r1", gravidade: "media",
      descricao: "Candidaturas de pessoas com mais de 50 anos são postas de lado nas entrevistas de logística, mesmo com a melhor experiência.",
      quando: "Nos últimos seis meses", aindaAcontece: "sim", onde: "Recrutamento", avaliacaoInicial: "A confirmar com dados de contratações de 2026.",
      mensagens: [msg("m35-1", "responsavel", "2026-08-03T15:10", "Já recolhemos as candidaturas do ano. Estamos a analisá-las.")],
    }),
    denuncia({
      codigo: "DEN-2026-0034", pin: "129047", tipo: "assedio", estado: "em_analise", recebidaEm: "2026-06-08",
      confirmadaEm: "2026-06-10", responsavelId: "r3", gravidade: "alta",
      descricao: "Um colega manda mensagens insistentes fora de horas e faz comentários de cariz sexual nas reuniões de equipa.",
      quando: "Desde Maio", aindaAcontece: "sim", onde: "Loja do Porto", testemunhas: "sim",
    }),
    denuncia({
      codigo: "DEN-2026-0033", pin: "846213", tipo: "seguranca", estado: "concluida", recebidaEm: "2026-07-06",
      confirmadaEm: "2026-07-07", responsavelId: "r1", anonima: false, gravidade: "media",
      identidade: pessoa("Sandra Vaz", "sandra.vaz@exemplo.pt"),
      descricao: "Os extintores da oficina estão com a validade ultrapassada desde Março e ninguém os verificou.",
      quando: "Desde Março", onde: "Oficina", avaliacaoInicial: "Confirmável por inspeção direta.",
      decisao: {
        resultado: "procedente", em: "2026-09-18T16:30",
        medidas: "Extintores substituídos a 20/07 e inspeção trimestral passou a ser registada.",
        fundamentacao: "A inspeção confirmou os extintores fora de validade e a ausência de registos de verificação.",
      },
    }),
    denuncia({
      codigo: "DEN-2026-0032", pin: "097765", tipo: "outro", estado: "arquivada", recebidaEm: "2026-06-25",
      confirmadaEm: "2026-06-26", responsavelId: "r2",
      descricao: "Acho que alguém anda a usar o carro da empresa ao fim de semana, mas não sei quem.",
      quando: "Não sei", onde: "Parque da sede", gravidade: "baixa",
      motivoArquivo: "Sem elementos suficientes e sem resposta ao pedido de informação em 30 dias.",
      mensagens: [msg("m32-1", "responsavel", "2026-06-27T09:00", "Consegues dizer que carro e em que fim de semana? Sem isso não conseguimos avançar.")],
    }),
  ].map((d) => ({ ...d, historico: [...d.historico, ...eventosFinais(d)] }));
}

/** Os acontecimentos que explicam o estado em que cada denúncia de exemplo está. */
function eventosFinais(d: Denuncia): EventoHistorico[] {
  const e = (i: number, em: string, quem: string, acao: string, detalhe?: string): EventoHistorico =>
    ({ id: `h-${d.codigo}-x${i}`, em, quem, acao, ...(detalhe ? { detalhe } : {}) });
  const eu = RESPONSAVEL_ATUAL.nome;
  const nome = nomeDoResponsavel(d.responsavelId);
  const lista: EventoHistorico[] = [];
  if (nome && d.confirmadaEm) lista.push(e(1, `${d.confirmadaEm}T10:30`, eu, "responsavel_atribuido", nome));
  if (d.decisao) lista.push(e(2, d.decisao.em, nome ?? eu, "concluida", d.decisao.resultado));
  if (d.motivoArquivo) lista.push(e(3, "2026-07-30T11:00", nome ?? eu, "arquivada", d.motivoArquivo));
  if (d.estado === "mais_info") lista.push(e(4, "2026-10-06T11:00", nome ?? eu, "informacao_pedida"));
  return lista;
}
