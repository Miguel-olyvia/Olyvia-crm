// A grelha recurso × ação do editor de papéis (puro, sem React). Cada subgrupo do editor é uma tabela; cada linha é um recurso.
//
// Regras de decisão (03/11/2026):
// - Recurso = o código sem a ação final (leads.edit -> leads; hr.pessoas.saude.view -> hr.pessoas.saude). Um bloco (BlocoCategoria)
//   com um só recurso dá uma linha com o rótulo do bloco; um bloco que mistura recursos (Negócios › Pessoas: leads.*, clients.*,
//   contacts.*) dá uma linha por recurso, com o rótulo do recurso (ROTULOS_RECURSO, ROTULOS_CATEGORIA ou o fim do código).
// - Colunas fixas: Ver (view), Criar (create/criar), Editar (edit/update/editar), Eliminar (delete). A primeira permissão da linha
//   que cabe numa coluna fica nela; uma segunda (edit e update na mesma linha) vai para Outras. Célula sem permissão: "–".
// - Variantes (.own, .outros, .chefia, .rh no fim do código): a ação é o segmento anterior e a permissão vai SEMPRE para Outras,
//   com o rótulo da ação e a variante entre parênteses: hr.pessoas.view.own -> "Ver (só as suas)" na linha hr.pessoas;
//   hr.ausencias.aprovar.chefia -> "Aprovar (chefia)". Assim a coluna Ver é sempre o "ver tudo" e nunca se confunde com o "só as suas".
// - Outras: o rótulo da ação (distintivoAcao); se a ação não tiver rótulo próprio (o texto viria do código, às vezes em inglês) ou
//   se dois chips da linha ficassem com o mesmo rótulo, usa-se o nome da permissão da base.
import { distintivoAcao, ehAcaoConhecida, ROTULOS_CATEGORIA, type BlocoCategoria } from "./gruposPermissoes";
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
  "negocios.contacto": "Contacto", "negocios.visita": "Visita", "negocios.orcamento": "Orçamento", "negocios.margem": "Margem",
  "negocios.proposta": "Proposta", "negocios.contrato": "Contrato", "negocios.obra": "Obra",
  "hr.module": "Acesso ao módulo", "hr.pessoas": "Ficha", "hr.pessoas.afectacoes": "Afetações", "hr.pessoas.bancarios": "Dados bancários",
  "hr.pessoas.colocacao": "Colocação", "hr.pessoas.conta": "Conta de acesso", "hr.pessoas.emergencia": "Contactos de emergência",
  "hr.pessoas.identificacao": "Identificação", "hr.pessoas.morada": "Morada", "hr.pessoas.pessoais": "Dados pessoais",
  "hr.pessoas.acessos_sensiveis": "Acessos a dados sensíveis", "hr.pessoas.duplicados": "Duplicados",
  "hr.pessoas.saude": "Saúde", "hr.pessoas.sindicalizacao": "Sindicalização", "hr.pessoas.convite": "Convite",
  "hr.onboarding": "Onboarding", "hr.admissao.obrigatorios": "Documentos obrigatórios",
  "hr.pessoas.documentos": "Documentos", "hr.pessoas.documentos.conteudo": "Conteúdo dos documentos",
  "hr.pessoas.documentos.modelos": "Modelos de documentos", "hr.pessoas.vinculos": "Vínculos", "hr.pessoas.vinculos.horas": "Horas do vínculo",
  "hr.contratos.regras": "Regras dos contratos", "hr.cargos.salario": "Salário do cargo", "hr.pessoas.laborais": "Dados laborais",
  "hr.pessoas.retribuicao": "Retribuição", "hr.assiduidade": "Assiduidade", "hr.assiduidade.equipa": "Assiduidade da equipa",
  "hr.assiduidade.faltas": "Faltas", "hr.assiduidade.justificacao": "Justificações de faltas", "hr.assiduidade.obras": "Registo em obra",
  "hr.pessoas.horario": "Horário", "hr.pessoas.horario_realizado": "Horário realizado", "hr.ausencias": "Ausências",
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
  if (partes.length >= 3 && VARIANTES[fim]) {
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
  /** Única na tabela: categoria do bloco + recurso. */
  chave: string;
  rotulo: string;
  fixas: Partial<Record<ColunaFixa, Permissao>>;
  outras: ChipOutra[];
  /** Todas as permissões da linha (fixas e outras), pela ordem do catálogo. */
  permissoes: Permissao[];
}

function rotuloChip(p: Permissao): string {
  const { acao, variante } = separarCodigo(p.codigo);
  if (!ehAcaoConhecida(acao)) return p.nome;
  const base = distintivoAcao(acao).rotulo;
  return variante ? `${base} (${VARIANTES[variante]})` : base;
}

function montarLinha(chave: string, rotulo: string, permissoes: Permissao[]): LinhaGrelha {
  const fixas: Partial<Record<ColunaFixa, Permissao>> = {};
  const restantes: Permissao[] = [];
  permissoes.forEach((p) => {
    const { acao, variante } = separarCodigo(p.codigo);
    const coluna = variante ? undefined : ACAO_PARA_COLUNA[acao];
    if (coluna && !fixas[coluna]) fixas[coluna] = p;
    else restantes.push(p);
  });
  const rotulos = restantes.map(rotuloChip);
  const outras = restantes.map((p, i) => ({
    permissao: p,
    rotulo: rotulos.indexOf(rotulos[i]) !== rotulos.lastIndexOf(rotulos[i]) ? p.nome : rotulos[i],
  }));
  return { chave, rotulo, fixas, outras, permissoes };
}

/** As linhas de uma tabela (os blocos de um subgrupo, ou os blocos diretos de um grupo). */
export function linhasDosBlocos(blocos: readonly BlocoCategoria[]): LinhaGrelha[] {
  return blocos.flatMap((b) => {
    const porRecurso = new Map<string, Permissao[]>();
    b.permissoes.forEach((p) => {
      const { recurso } = separarCodigo(p.codigo);
      porRecurso.set(recurso, [...(porRecurso.get(recurso) ?? []), p]);
    });
    const unico = porRecurso.size === 1;
    return [...porRecurso.entries()].map(([recurso, lista]) =>
      montarLinha(`${b.categoria}|${recurso}`, unico ? b.rotulo : rotuloRecurso(recurso), lista));
  });
}

/** As permissões de uma coluna fixa da tabela (as linhas sem permissão nessa coluna não contam). */
export const permissoesDaColuna = (linhas: readonly LinhaGrelha[], coluna: ColunaFixa): Permissao[] =>
  linhas.flatMap((l) => (l.fixas[coluna] ? [l.fixas[coluna] as Permissao] : []));

/** As permissões da coluna Outras da tabela. */
export const permissoesOutras = (linhas: readonly LinhaGrelha[]): Permissao[] => linhas.flatMap((l) => l.outras.map((c) => c.permissao));

export type EstadoConjunto = boolean | "indeterminate";

/** Marcado se todas estão concedidas, desmarcado se nenhuma, indeterminado se algumas. */
export function estadoConjunto(lista: readonly Permissao[], concedida: (codigo: string) => boolean): EstadoConjunto {
  const n = lista.filter((p) => concedida(p.codigo)).length;
  if (n === 0 || lista.length === 0) return false;
  return n === lista.length ? true : "indeterminate";
}
