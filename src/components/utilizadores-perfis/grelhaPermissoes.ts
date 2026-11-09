// A grelha recurso × ação do editor de papéis (puro, sem React). v2 (03/11/2026, aprovada): UMA tabela por grupo do editor,
// partida em secções; cada linha é um recurso INTEIRO.
//
// Regras de decisão:
// - Recurso = o código sem a ação final (leads.edit -> leads; hr.pessoas.saude.view -> hr.pessoas.saude). Todas as permissões do
//   mesmo recurso ficam na mesma linha, mesmo que o editor as arrume em subgrupos diferentes (leads.view/create/assign, que
//   agruparPorMenu põe em «Por contactar», juntam-se à linha Leads). A linha fica na secção onde aparece a primeira permissão.
// - Secções = os subgrupos do grupo (os blocos diretos fazem uma secção sem título), salvo planos próprios (PLANOS): Negócios tem
//   «Pessoas» (pessoas.*, leads.*, clients.*, contacts.*) e «Fases do negócio» (negocios.* + quotes.view_costs + client_contracts.cancel,
//   uma linha por fase: Contacto, Visita, Negócio, Financeiro, Obra, Geral). Só apresentação: os códigos gravados não mudam.
// - O rótulo da linha nunca repete o título da secção: secção de uma só linha com o mesmo nome perde o título (e junta-se às
//   secções sem título vizinhas); numa secção com mais linhas, a que coincidir ganha " (geral)".
// - Colunas fixas: Ver (view), Criar (create/criar), Editar (edit/update/editar), Eliminar (delete). A primeira da linha que cabe numa
//   coluna fica nela; uma segunda (edit e update) vai para Outras. As linhas das fases são só ações (tudo em Outras).
// - Variantes (.own, .outros, .chefia, .rh): a ação é o segmento anterior e a permissão vai SEMPRE para Outras (a coluna Ver é sempre
//   o "ver tudo"; hr.pessoas.view.own é um chip).
// - Rótulo do chip: o nome da permissão da base, encurtado (sem artigo depois do verbo, sem "do negócio"/"da obra"/o nome da linha no
//   fim: "Editar o orçamento do negócio" -> "Editar orçamento"; "Converter leads" na linha Leads -> "Converter"). Sem nome legível
//   (o nome é o próprio código), o rótulo da ação (distintivoAcao) com a variante: "Ver (só as suas)". Rótulos repetidos na mesma
//   linha voltam ao nome completo.
// - Secção "só ações": nenhuma linha com Ver/Criar/Editar/Eliminar -> desenha-se como lista de chips por linha, sem colunas.
import { categoriaVirtual, distintivoAcao, ehAcaoConhecida, ROTULOS_CATEGORIA, type GrupoMenu } from "./gruposPermissoes";
import type { Permissao } from "./tipos";

export type ColunaFixa = "ver" | "criar" | "editar" | "eliminar";

export const COLUNAS_FIXAS: readonly ColunaFixa[] = ["ver", "criar", "editar", "eliminar"];

const ACAO_PARA_COLUNA: Record<string, ColunaFixa> = {
  view: "ver", create: "criar", criar: "criar", edit: "editar", update: "editar", editar: "editar", delete: "eliminar",
};

/** Sufixos que qualificam a ação anterior (âmbito ou quem decide), com o texto que se junta ao rótulo. */
const VARIANTES: Record<string, string> = { own: "só as suas", outros: "por outros", chefia: "chefia", rh: "RH" };

/** Rótulos PT-PT dos recursos que não são uma categoria de ROTULOS_CATEGORIA (sobretudo códigos com mais de um segmento). */
export const ROTULOS_RECURSO: Record<string, string> = {
  negocios: "Negócio", pessoas: "Pessoas",
  "hr.module": "Acesso ao módulo", "hr.pessoas": "Ficha", "hr.pessoas.afectacoes": "Afetações", "hr.pessoas.bancarios": "Dados bancários",
  "hr.pessoas.colocacao": "Colocação", "hr.pessoas.conta": "Conta de acesso", "hr.pessoas.emergencia": "Contactos de emergência",
  "hr.pessoas.identificacao": "Identificação", "hr.pessoas.morada": "Morada", "hr.pessoas.pessoais": "Dados pessoais",
  "hr.pessoas.acessos_sensiveis": "Acessos a dados sensíveis", "hr.pessoas.duplicados": "Duplicados",
  "hr.pessoas.saude": "Saúde", "hr.pessoas.sindicalizacao": "Sindicalização", "hr.pessoas.convite": "Convite",
  "hr.onboarding": "Onboarding", "hr.admissao.obrigatorios": "Documentos obrigatórios",
  "hr.pessoas.documentos": "Documentos da pessoa", "hr.pessoas.documentos.conteudo": "Conteúdo dos documentos",
  "hr.pessoas.documentos.modelos": "Modelos de documentos", "hr.pessoas.vinculos": "Vínculos", "hr.pessoas.vinculos.horas": "Horas do vínculo",
  "hr.contratos.regras": "Regras dos contratos", "hr.cargos.salario": "Salário do cargo", "hr.pessoas.laborais": "Dados laborais",
  "hr.pessoas.retribuicao": "Retribuição da pessoa", "hr.assiduidade": "Assiduidade", "hr.assiduidade.equipa": "Assiduidade da equipa",
  "hr.assiduidade.faltas": "Faltas", "hr.assiduidade.justificacao": "Justificações de faltas", "hr.assiduidade.obras": "Registo em obra",
  "hr.pessoas.horario": "Horário", "hr.pessoas.horario_realizado": "Horário realizado", "hr.ausencias": "Ausências da pessoa",
  "hr.ausencias.direitos": "Direitos", "hr.ausencias.historico": "Histórico", "hr.ausencias.justificacao": "Justificações",
  "hr.ausencias.tipos": "Tipos de ausência", "hr.processamento.lancamentos": "Lançamentos", "hr.processamento.periodo": "Períodos",
  "hr.vencimento.codigos": "Códigos de vencimento", "hr.vencimento.subsidio": "Subsídios", "hr.locais": "Centros de trabalho",
  "hr.denuncias": "Denúncias",
  "operations.costs": "Custos", "operations.orders": "Ordens", "operations.locations": "Locais", "operations.checklists": "Checklists",
  "operations.plans": "Planos", "operations.settings": "Definições da operação",
  "platform.pending_submissions": "Submissões pendentes", "platform.auth_audit_log": "Registo de autenticações",
  "platform.support_access": "Acesso de suporte", "platform.dashboard": "Dashboard da plataforma",
  "platform.organizations": "Organizações da plataforma", "platform.security": "Segurança", "platform.settings": "Definições da plataforma",
  "platform.users": "Utilizadores da plataforma", "exports.audit": "Auditoria de exportações", "rgpd.erasure": "Apagamento RGPD",
  "scheduling.boards": "Quadros", "scheduling.items": "Itens", "scheduling.resources": "Recursos", "scheduling.rules": "Regras",
  scheduling: "Agendamentos", campaigns: "Campanhas", channels: "Origens", lists: "Listas",
};

export interface CodigoSeparado {
  /** O código sem a ação (nem a variante). */
  recurso: string;
  acao: string;
  /** own, outros, chefia, rh; null sem variante. */
  variante: string | null;
}

export function separarCodigo(codigo: string): CodigoSeparado {
  const partes = codigo.split(".");
  const fim = partes[partes.length - 1] ?? "";
  if (partes.length >= 3 && Object.prototype.hasOwnProperty.call(VARIANTES, fim)) {
    return { recurso: partes.slice(0, -2).join("."), acao: partes[partes.length - 2] ?? "", variante: fim };
  }
  if (partes.length < 2) return { recurso: codigo, acao: "", variante: null };
  return { recurso: partes.slice(0, -1).join("."), acao: fim, variante: null };
}

const humanizar = (s: string): string => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function rotuloRecurso(recurso: string): string {
  const ultimo = recurso.split(".").pop() ?? recurso;
  return ROTULOS_RECURSO[recurso] ?? ROTULOS_CATEGORIA[recurso] ?? ROTULOS_CATEGORIA[ultimo] ?? humanizar(ultimo);
}

export interface ChipOutra {
  permissao: Permissao;
  rotulo: string;
}

export interface LinhaGrelha {
  /** Única no grupo. */
  chave: string;
  rotulo: string;
  fixas: Partial<Record<ColunaFixa, Permissao>>;
  outras: ChipOutra[];
  /** Todas as permissões da linha, pela ordem do catálogo. */
  permissoes: Permissao[];
}

export interface SecaoGrelha {
  chave: string;
  /** null: secção sem título (blocos diretos do grupo, ou título omitido para não repetir o da linha). */
  titulo: string | null;
  linhas: LinhaGrelha[];
  /** Nenhuma linha tem Ver/Criar/Editar/Eliminar: desenha-se como lista de chips. */
  soAcoes: boolean;
  permissoes: Permissao[];
}

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Um nome que é o próprio código (sem nome legível na base). */
const pareceCodigo = (nome: string): boolean => /^[a-z0-9_.]+$/.test(nome);

/**
 * O nome da base, mais curto: sem artigo depois do verbo e sem o contexto no fim ("do negócio", "da obra", "de pessoas", "de <linha>").
 * `tirarLinha`: tira também o nome da linha solto no fim ("Converter leads" na linha Leads); não se usa nas linhas das fases, onde
 * "Registar contacto" na linha Contacto ficaria um "Registar" solto.
 */
export function encurtarNome(nome: string, rotuloLinha: string, tirarLinha = true): string {
  // "Editar o orçamento" -> "Editar orçamento"; mas "Ver a própria ficha" fica (sem o artigo deixava de ser português).
  let s = nome.trim().replace(/^(\S+)\s+(o|a|os|as)\s+(?!(?:própri|su|seu)\S*\s)/i, "$1 ");
  const linha = escapar(rotuloLinha.toLocaleLowerCase("pt"));
  const contextos = ["negócio", "negócios", "obra", "pessoas", linha];
  const padroes = [new RegExp(`\\s+(?:do|da|dos|das|de)\\s+(?:${contextos.join("|")})$`, "i")];
  // "Ver a própria ficha" na linha Ficha não pode ficar "Ver a própria".
  if (tirarLinha && !/\s(?:própri|sua|seu)\S*\s/i.test(s)) padroes.push(new RegExp(`\\s+${linha}$`, "i"));
  padroes.forEach((r) => {
    const curto = s.replace(r, "");
    if (curto.trim().length > 0) s = curto;
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rotuloChip(p: Permissao, rotuloLinha: string, soAcoes: boolean): string {
  const { acao, variante } = separarCodigo(p.codigo);
  if (!pareceCodigo(p.nome)) return encurtarNome(p.nome, rotuloLinha, !soAcoes);
  if (!ehAcaoConhecida(acao)) return p.nome;
  const base = distintivoAcao(acao).rotulo;
  return variante ? `${base} (${VARIANTES[variante]})` : base;
}

/** Ordem explícita dos chips das fases do Negócio, pelo fluxo (um índice global serve todas as linhas das fases). */
const FLUXO_NEGOCIO: readonly string[] = [
  "negocios.contacto.registar", "negocios.visita.gerir",
  "negocios.orcamento.editar", "negocios.margem.aprovar", "negocios.proposta.enviar", "negocios.proposta.decidir",
  "negocios.contrato.editar", "client_contracts.cancel", "quotes.view_costs",
  "negocios.registar_fatura", "negocios.validar_pagamento",
  "negocios.obra.planear", "negocios.obra.executar", "negocios.obra.materiais", "negocios.obra.imprevistos", "negocios.obra.fechar",
  "negocios.perder",
];

/**
 * Ordem dos chips nas restantes linhas, pelo tipo de ação: 0 ver/consultar, 1 criar/registar, 2 editar/gerir, 3 aprovar/validar,
 * 4 exportar/importar, 5 configurar, 6 destrutivas/perigosas (sempre por último, como as marcadas perigosas na base). Uma ação que
 * não esteja aqui fica com as de editar/gerir. Empates: a ordem do catálogo.
 */
const TIPO_ACAO: readonly (readonly [number, RegExp])[] = [
  [6, /^(delete|delete_sent|anular|cancel|archive|perder)$/],
  [5, /^(config|settings|manage_roles|manage_permissions|manage_templates|regras)$/],
  [4, /^(export|export_sensitive|import|importar|download_proof|generate_pdf)$/],
  [3, /^(aprovar|approve|validar|decidir|confirm|confirm_stock_exit|sign_employer|fechar|revert_receipt|validate_payment)$/],
  [1, /^(create|criar|registar|pedir|enviar|emitir|picar|link|duplicate|clone|copy|add_contacts|send_signature|handle_calls)$/],
  [0, /^(view|view_.+|conteudo|self|consultar|reveal|restrito|sensitive)$/],
];

export function ordemChip(p: Permissao): number {
  const fluxo = FLUXO_NEGOCIO.indexOf(p.codigo);
  if (fluxo >= 0) return fluxo;
  if (p.perigosa) return 100 + 6;
  const { acao } = separarCodigo(p.codigo);
  return 100 + (TIPO_ACAO.find(([, r]) => r.test(acao))?.[0] ?? 2);
}

/** Rótulos de chip escolhidos à mão, quando o nome da base não diz o quê (ex.: "Configurar" solto). */
const ROTULOS_CHIP: Record<string, string> = {
  "client_contracts.cancel": "Anular contrato",
  "quotes.view_costs": "Ver custos do orçamento",
  "quotes.manage": "Ver custos e ações em massa",
  // 06/11: em Definições › Lixo, deals.delete não elimina pedidos de proposta — é o «Eliminar definitivamente» do Lixo.
  "deals.delete": "Eliminar definitivamente do Lixo",
};

function montarLinha(chave: string, rotulo: string, permissoes: Permissao[], soAcoes: boolean): LinhaGrelha {
  const fixas: Partial<Record<ColunaFixa, Permissao>> = {};
  const restantes: Permissao[] = [];
  permissoes.forEach((p) => {
    const { acao, variante } = separarCodigo(p.codigo);
    // 06/11: uma permissão com rótulo à mão (ROTULOS_CHIP) é um chip em Outras: a coluna (ex.: «Eliminar») não diria o quê.
    const coluna = soAcoes || variante || ROTULOS_CHIP[p.codigo] ? undefined : ACAO_PARA_COLUNA[acao];
    if (coluna && !fixas[coluna]) fixas[coluna] = p;
    else restantes.push(p);
  });
  restantes.sort((a, b) => ordemChip(a) - ordemChip(b)); // estável: empates ficam pela ordem do catálogo
  const rotulos = restantes.map((p) => ROTULOS_CHIP[p.codigo] ?? rotuloChip(p, rotulo, soAcoes));
  const outras = restantes.map((p, i) => ({
    permissao: p,
    rotulo: rotulos.indexOf(rotulos[i]) !== rotulos.lastIndexOf(rotulos[i]) ? p.nome : rotulos[i],
  }));
  return { chave, rotulo, fixas, outras, permissoes };
}

/** Onde uma permissão fica na grelha: linha (chave, rótulo, só ações), e, nos planos, secção e ordem. */
interface Destino {
  chave: string;
  rotulo: string;
  soAcoes: boolean;
  secao?: string;
  ordem?: number;
}

interface Plano {
  secoes: string[];
  destino: (p: Permissao) => Destino;
}

const FASES: readonly (readonly [string, string])[] = [
  ["negocios_contacto", "Contacto"], ["negocios_visita", "Visita"], ["negocios_negocio", "Negócio"],
  ["negocios_financeiro", "Financeiro"], ["negocios_obra", "Obra"], ["negocios_geral", "Geral"],
];
const ORDEM_PESSOAS = ["pessoas", "leads", "clients", "contacts"];
const SECAO_PESSOAS = "Pessoas";
const SECAO_FASES = "Fases do negócio";

/** Negócios: os dados da pessoa por recurso; o resto (negocios.* e as movidas para as fases) uma linha por fase. */
const PLANO_NEGOCIOS: Plano = {
  secoes: [SECAO_PESSOAS, SECAO_FASES],
  destino: (p) => {
    const { recurso } = separarCodigo(p.codigo);
    const prefixo = p.codigo.split(".")[0] ?? "";
    const categoria = categoriaVirtual(p);
    const fase = FASES.findIndex(([c]) => c === categoria);
    if (fase >= 0 && !ORDEM_PESSOAS.includes(prefixo)) {
      return { chave: `fase:${categoria}`, rotulo: FASES[fase][1], soAcoes: true, secao: SECAO_FASES, ordem: fase };
    }
    // Recurso da pessoa: leads.view/create/assign (fase «Por contactar» no agrupamento) juntam-se à linha Leads.
    const raiz = ORDEM_PESSOAS.includes(prefixo) ? prefixo : recurso;
    const ordem = ORDEM_PESSOAS.indexOf(raiz);
    return {
      chave: raiz, rotulo: raiz === "pessoas" ? "Pessoas (ecrã)" : rotuloRecurso(raiz), soAcoes: false,
      secao: SECAO_PESSOAS, ordem: ordem >= 0 ? ordem : ORDEM_PESSOAS.length,
    };
  },
};

const PLANOS: Record<string, Plano> = { "Negócios": PLANO_NEGOCIOS };

/**
 * 06/11: permissões que, na grelha, ficam na linha doutro recurso. deals.delete (o «Eliminar definitivamente» do Lixo) junta-se à
 * linha Lixo (trash.view), em Definições; sem isto fazia uma linha «Pedidos de Proposta» sozinha.
 */
const LINHA_POR_CODIGO: Readonly<Record<string, string>> = { "deals.delete": "trash" };

const destinoPadrao = (p: Permissao): Destino => {
  const recurso = LINHA_POR_CODIGO[p.codigo] ?? separarCodigo(p.codigo).recurso;
  return { chave: recurso, rotulo: rotuloRecurso(recurso), soAcoes: false };
};

const normalizarRotulo = (s: string): string => s.toLocaleLowerCase("pt").trim();

/** As secções e linhas de um grupo do editor. Cada permissão do grupo aparece exatamente uma vez. */
export function secoesDoGrupo(g: GrupoMenu): SecaoGrelha[] {
  const plano = PLANOS[g.rotulo];
  const entradas: { p: Permissao; secao: string | null }[] = [
    ...g.blocos.flatMap((b) => b.permissoes.map((p) => ({ p, secao: null }))),
    ...g.subgrupos.flatMap((s) => s.permissoes.map((p) => ({ p, secao: s.rotulo }))),
  ];

  interface Acumulada { destino: Destino; secao: string | null; permissoes: Permissao[]; indice: number }
  const linhas = new Map<string, Acumulada>();
  entradas.forEach(({ p, secao }, indice) => {
    const destino = plano ? plano.destino(p) : destinoPadrao(p);
    const atual = linhas.get(destino.chave);
    if (atual) atual.permissoes.push(p);
    else linhas.set(destino.chave, { destino, secao: destino.secao ?? secao, permissoes: [p], indice });
  });

  // Secções pela ordem do plano, ou pela primeira aparição.
  const porSecao = new Map<string, { titulo: string | null; linhas: Acumulada[] }>();
  (plano?.secoes ?? []).forEach((s) => porSecao.set(s, { titulo: s, linhas: [] }));
  [...linhas.values()].forEach((l) => {
    const chave = l.secao ?? "";
    if (!porSecao.has(chave)) porSecao.set(chave, { titulo: l.secao, linhas: [] });
    porSecao.get(chave)?.linhas.push(l);
  });

  const secoes: SecaoGrelha[] = [];
  porSecao.forEach((s, chave) => {
    if (s.linhas.length === 0) return;
    const ordenadas = [...s.linhas].sort((a, b) => (a.destino.ordem ?? 0) - (b.destino.ordem ?? 0) || a.indice - b.indice);
    let titulo = s.titulo;
    const montadas = ordenadas.map((l) => {
      let rotulo = l.destino.rotulo;
      if (titulo && normalizarRotulo(rotulo) === normalizarRotulo(titulo) && ordenadas.length > 1) rotulo = `${rotulo} (geral)`;
      return montarLinha(l.destino.chave, rotulo, l.permissoes, l.destino.soAcoes);
    });
    if (titulo && montadas.length === 1 && normalizarRotulo(montadas[0].rotulo) === normalizarRotulo(titulo)) titulo = null;
    const anterior = secoes[secoes.length - 1];
    if (titulo === null && anterior && anterior.titulo === null) {
      anterior.linhas.push(...montadas);
      return;
    }
    secoes.push({ chave: chave || `sem-titulo-${secoes.length}`, titulo, linhas: montadas, soAcoes: false, permissoes: [] });
  });

  return secoes.map((s) => ({
    ...s,
    soAcoes: s.linhas.every((l) => Object.keys(l.fixas).length === 0),
    permissoes: s.linhas.flatMap((l) => l.permissoes),
  }));
}

export type EstadoConjunto = boolean | "indeterminate";

/** Marcado se todas estão concedidas, desmarcado se nenhuma, indeterminado se algumas. */
export function estadoConjunto(lista: readonly Permissao[], concedida: (codigo: string) => boolean): EstadoConjunto {
  const n = lista.filter((p) => concedida(p.codigo)).length;
  if (n === 0 || lista.length === 0) return false;
  return n === lista.length ? true : "indeterminate";
}
