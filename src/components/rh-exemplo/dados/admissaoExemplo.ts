/**
 * As admissões de exemplo: sete pessoas em fases diferentes do fluxo (a Lara e a Beatriz já existiam; as outras cinco são
 * novas e ainda não têm assiduidade nem entram no Cálculo de Setembro). Os prazos são relativos a "agora", para o aspeto
 * («Expira em 2 dias», «Expirado») nunca envelhecer. Os tokens fixos servem a página pública: `exemplo` (a preencher),
 * `lara`, `submetida`, `devolvida`, `contrato`, `assinado`, `expirada` e `revogada` (o link antigo da Lara).
 */
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { EstadoRh } from "@/components/rh-exemplo/dados/tiposLoja";
import {
  criarAdmissao, type AcaoAdmissao, type Admissao, type ContratoAdmissao, type EstadoAdmissao,
} from "@/components/rh-exemplo/lib/admissaoFluxo";
import type { PessoaDocumento } from "@/components/rh-exemplo/tipos";

export interface EstadoAdmissoes {
  porPessoa: Record<string, Admissao>;
  ordem: string[];
  contador: number;
}

const H = 60 * 60 * 1000;
const RH = "Sofia Rebelo";
const HASH = "9f2c4b7a1d3e5f60a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1";

export const ADMISSOES_ORDEM = ["p-lara", "p-beatriz", "p-marco", "p-nadia", "p-vasco", "p-eva", "p-ruben"] as const;

const DADOS_MARCO: Record<string, unknown> = {
  data_nascimento: "1997-03-14", genero: "masculino", nacionalidade: "PT", telefone_pessoal: "912 334 556",
  email_pessoal: "marco.ventura@exemplo.pt", estado_civil: "solteiro", dependentes: 0, tipo_documento: "cartao_cidadao",
  numero_documento: "14233987", validade_documento: "2031-05-02", nif: "237845120", niss: "12345678901",
  morada_linha1: "Rua das Flores 12, 3.º Esq.", morada_codigo_postal: "1200-195", morada_localidade: "Lisboa",
  iban: "PT50003500000012345678914", conta_titular: "Marco Ventura", conta_banco: "Banco Exemplo",
  tamanho_cima: "M", tamanho_baixo: "42", tamanho_calcado: "43",
};

const DADOS_NADIA: Record<string, unknown> = {
  ...DADOS_MARCO, data_nascimento: "1999-11-02", genero: "feminino", telefone_pessoal: "933 221 887",
  email_pessoal: "nadia.coelho@exemplo.pt", numero_documento: "15877412", nif: "245781963", niss: "12098765432",
  morada_linha1: "Avenida da Boavista 220", morada_codigo_postal: "4100-112", morada_localidade: "Porto",
  iban: "PT5000350000009876543210", conta_titular: "Nádia Coelho", tamanho_cima: "S", tamanho_baixo: "38", tamanho_calcado: "38",
};

type Evento = [AcaoAdmissao, EstadoAdmissao, string, number, string | null];

function comHistorico(adm: Admissao, agora: Date, eventos: Evento[]): Admissao {
  const extra = eventos.map(([acao, para, por, horasAtras, motivo], i) => ({
    id: `${adm.pessoaId}-${i + 2}`, em: new Date(agora.getTime() - horasAtras * H).toISOString(), por, acao, para, motivo,
  }));
  return { ...adm, historico: [...adm.historico, ...extra] };
}

interface Esboco {
  id: string;
  token: string;
  estado: EstadoAdmissao;
  /** Horas até o login expirar (negativo = já expirou). */
  expiraEmHoras: number;
  roleId: string;
  eventos: Evento[];
  parcial?: Partial<Admissao>;
}

function construir(e: EstadoRh, agora: Date, x: Esboco): Admissao {
  const pessoa = e.fichas[x.id].pessoa;
  const inicial = criarAdmissao({ pessoaId: x.id, roleId: x.roleId, email: pessoa.email_pessoal ?? "", token: x.token }, { agora, quem: RH });
  const criado = new Date(agora.getTime() + (x.expiraEmHoras - 7 * 24) * H).toISOString();
  const login = { ...inicial.login, criadoEm: criado, expiraEm: new Date(agora.getTime() + x.expiraEmHoras * H).toISOString() };
  const base: Admissao = { ...inicial, estado: x.estado, login, ...x.parcial };
  const primeiro = { ...base.historico[0], em: criado };
  return comHistorico({ ...base, historico: [primeiro] }, agora, x.eventos);
}

function contratoDe(pessoaId: string, titulo: string, assinada: { em: string; nome: string } | null, geradoHorasAtras: number, agora: Date): ContratoAdmissao {
  return {
    modeloId: "mod-contrato", documentoId: `doc-adm-${pessoaId}`, titulo,
    linhas: ["Contrato de exemplo.", "Este documento é apenas uma apresentação."],
    geradoEm: new Date(agora.getTime() - geradoHorasAtras * H).toISOString(), recusa: null,
    assinadoEm: assinada?.em ?? null, assinaturaNome: assinada?.nome ?? null,
  };
}

function esbocos(agora: Date): Esboco[] {
  const iso = (horasAtras: number) => new Date(agora.getTime() - horasAtras * H).toISOString();
  return [
    { id: "p-lara", token: "lara", estado: "convite_enviado", expiraEmHoras: 6 * 24 + 4, roleId: "papel-colaborador", eventos: [] },
    { id: "p-beatriz", token: "exemplo", estado: "a_preencher", expiraEmHoras: 30, roleId: "papel-colaborador",
      eventos: [["abrir", "a_preencher", "Beatriz Lopes", 100, null]],
      parcial: { rascunho: { nacionalidade: "pt", telefone_pessoal: "912 345 678" }, rascunhoEm: iso(20) } },
    { id: "p-marco", token: "submetida", estado: "submetida", expiraEmHoras: 4 * 24, roleId: "papel-colaborador",
      eventos: [["abrir", "a_preencher", "Marco Ventura", 70, null], ["submeter", "submetida", "Marco Ventura", 5, null]],
      parcial: { dadosSubmetidos: DADOS_MARCO, submetidaEm: iso(5) } },
    { id: "p-nadia", token: "devolvida", estado: "devolvida", expiraEmHoras: 6 * 24 + 20, roleId: "papel-colaborador",
      eventos: [["submeter", "submetida", "Nádia Coelho", 52, null], ["devolver", "devolvida", RH, 4, null]],
      parcial: {
        dadosSubmetidos: DADOS_NADIA,
        comentarios: { nif: "O NIF não corresponde ao do cartão de cidadão anexo.", iban: "Falta o IBAN completo (25 caracteres)." },
      } },
    { id: "p-vasco", token: "contrato", estado: "contrato_por_assinar", expiraEmHoras: 5 * 24, roleId: "papel-chefia",
      eventos: [["submeter", "submetida", "Vasco Duarte", 120, null], ["aprovar", "aprovada", RH, 30, null], ["gerarContrato", "contrato_por_assinar", RH, 28, null]],
      parcial: { dadosSubmetidos: DADOS_MARCO, contrato: contratoDe("p-vasco", "Contrato de trabalho sem termo", null, 28, agora) } },
    { id: "p-eva", token: "assinado", estado: "contrato_assinado", expiraEmHoras: 3 * 24, roleId: "papel-chefia",
      eventos: [["submeter", "submetida", "Eva Tavares", 200, null], ["aprovar", "aprovada", RH, 150, null],
        ["gerarContrato", "contrato_por_assinar", RH, 148, null], ["assinarContrato", "contrato_assinado", "Eva Tavares", 3, null]],
      parcial: { dadosSubmetidos: DADOS_NADIA, contrato: contratoDe("p-eva", "Contrato de trabalho a termo certo", { em: iso(3), nome: "Eva Tavares" }, 148, agora) } },
    { id: "p-ruben", token: "expirada", estado: "a_preencher", expiraEmHoras: -48, roleId: "papel-colaborador",
      eventos: [["abrir", "a_preencher", "Rúben Faria", 200, null]] },
  ];
}

export function criarAdmissoesIniciais(e: EstadoRh, agora: Date = agoraExemplo()): EstadoAdmissoes {
  const porPessoa: Record<string, Admissao> = {};
  for (const x of esbocos(agora)) {
    const adm = construir(e, agora, x);
    // O link antigo da Lara foi substituído quando o RH reenviou o convite: serve para ver a página de «link revogado».
    porPessoa[x.id] = x.id === "p-lara" ? { ...adm, login: { ...adm.login, anteriores: ["revogada"] } } : adm;
  }
  return { porPessoa, ordem: [...ADMISSOES_ORDEM], contador: 0 };
}

/** O contrato de quem já o tem gerado (como documento na ficha), para a aba Documentos o mostrar desde o início. */
export function documentosDeAdmissao(org: string): Record<string, PessoaDocumento[]> {
  const doc = (id: string, titulo: string, assinado: boolean): PessoaDocumento => ({
    id: `doc-adm-${id}`, pessoa_id: id, organization_id: org, vinculo_id: `vin-${id}`, modelo_id: "mod-contrato", tipo: "contrato",
    titulo, estado: assinado ? "assinado" : "a_aguardar_assinatura",
    ficheiro_caminho: assinado ? "exemplo/contrato.pdf" : null, ficheiro_hash_sha256: assinado ? HASH : null,
    ficheiro_anexado_em: assinado ? `${diaIso(-1)}T12:00:00Z` : null, emitido_em: `${diaIso(-2)}T09:00:00Z`, emitido_por: "u-p-sofia",
    assinado_em: assinado ? `${diaIso(-1)}T11:00:00Z` : null, assinatura_origem: assinado ? "interna" : null,
    anulado_em: null, anulado_motivo: null, created_at: `${diaIso(-2)}T09:00:00Z`,
  });
  return {
    "p-vasco": [doc("p-vasco", "Contrato de trabalho sem termo — Vasco Duarte", false)],
    "p-eva": [doc("p-eva", "Contrato de trabalho a termo certo — Eva Tavares", true)],
  };
}
