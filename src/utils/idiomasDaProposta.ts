// Em que idiomas se mostra (portal) ou se gera (PDF) o documento de uma proposta.
//
// Ainda não há coluna `proposals.language`, por isso a decisão junta, por esta ordem:
//   1. a escolha passada por parâmetro (descarregar, pré-visualizar, enviar);
//   2. o que a própria proposta já tenha gravado, lido SEMPRE por idiomasDoDocumento (a única porta de leitura:
//      quando a coluna existir só ela muda) — mas só se for mais do que o português de omissão;
//   3. o idioma do botão do portal, se o template tiver essa versão;
//   4. o idioma base do template (português).
// Só entram idiomas que o template oferece: pedir um que ele não tem não inventa uma versão que não existe.
//
// Vive à parte de proposalPortalData.ts para a página do portal poder decidir ao desenhar (o cliente pode trocar o
// idioma do botão sem recarregar a proposta) sem puxar o acesso à base para dentro do componente.

import {
  IDIOMA_BASE,
  idiomaBaseDoTemplate,
  idiomasDisponiveisProposta,
  idiomasDoDocumento,
  normalizarCodigo,
  parseEscolha,
  type TemplatePropostaLike,
} from "@/lib/idiomaDocumento";

export interface EntradaIdiomasDaProposta {
  /** Escolha explícita: ["pt","en"] ou «pt+en». Vazia ou nula não conta como escolha. */
  escolha?: readonly string[] | string | null;
  /** A proposta (ou o que a representa): lida por idiomasDoDocumento. */
  linha?: object | null;
  /** O template da proposta (o snapshot congelado, ou o vivo). */
  template?: TemplatePropostaLike | null;
  /** O idioma do botão do portal do cliente. */
  idiomaDoPortal?: string | null;
}

function houveEscolha(escolha: EntradaIdiomasDaProposta["escolha"]): boolean {
  if (Array.isArray(escolha)) return escolha.length > 0;
  return typeof escolha === "string" && escolha.trim() !== "";
}

/** Os idiomas do documento, por ordem; nunca vazio. */
export function resolverIdiomasDaProposta({ escolha, linha, template, idiomaDoPortal }: EntradaIdiomasDaProposta): string[] {
  const base = idiomaBaseDoTemplate(template);
  const disponiveis = idiomasDisponiveisProposta(template);
  const oferecidos = (codigos: readonly string[]): string[] => codigos.filter((c) => disponiveis.includes(c));

  if (houveEscolha(escolha)) {
    const escolhidos = oferecidos(parseEscolha(escolha));
    return escolhidos.length > 0 ? escolhidos : [base];
  }

  const gravados = idiomasDoDocumento(linha as { language?: unknown; prompt_values?: Record<string, unknown> | null } | null);
  const soPortugues = gravados.length === 1 && gravados[0] === IDIOMA_BASE;
  if (!soPortugues) {
    const daLinha = oferecidos(gravados);
    if (daLinha.length > 0) return daLinha;
  }

  const doPortal = normalizarCodigo(idiomaDoPortal);
  if (doPortal && disponiveis.includes(doPortal)) return [doPortal];
  return [base];
}
