// O que cada passo de documento do guia abre, como dados: enviar a proposta, registar a resposta do cliente, criar o contrato e registar a
// assinatura. Funções puras sobre o negócio que a ficha trouxe: nada se grava aqui. `null` quer dizer que o passo não tem nada a abrir (falta o
// documento, a permissão ou o negócio), e então o guia mostra-o desativado com a razão em vez de um botão que não faz nada.
import { contratoVivo, propostaAceite, propostaViva } from "@/hooks/pessoas/documentosDoNegocio";
import type { NegocioFichaDb } from "@/hooks/pessoas/fichaTipos";
import { propostaRecusada } from "@/hooks/pessoas/propostaViva";
import type { PassoProcesso } from "@/components/pessoas/processo/tiposProcesso";

export const PASSOS_DOCUMENTO = ["enviarProposta", "registarRespostaCliente", "criarContrato", "registarAssinatura"] as const;
export type PassoDocumento = (typeof PASSOS_DOCUMENTO)[number];

export const ehPassoDeDocumento = (passo: PassoProcesso): passo is PassoDocumento => (PASSOS_DOCUMENTO as readonly string[]).includes(passo);

export type PlanoDocumento =
  | { passo: "enviarProposta"; propostaId: string; titulo: string; numero: string | null }
  | { passo: "registarRespostaCliente"; propostaId: string; titulo: string; numero: string | null }
  | { passo: "criarContrato"; propostaId: string; negocioId: string | null }
  | { passo: "registarAssinatura"; contratoId: string; numero: string | null };

export interface OpcoesDoPlano {
  /** `pessoas.edit` (e o âmbito do negócio). */
  podeEditar: boolean;
  /**
   * As permissões da sessão. Sem a lista (a página ainda não a leu, ou a leitura falhou) nenhum passo abre. Cada passo exige o mesmo que a página de origem:
   * enviar e responder à proposta `proposals.edit`, criar o contrato `client_contracts.create`, assinar `client_contracts.edit`.
   */
  permissoes: readonly string[] | undefined;
  /** O fecho v4: o contrato nasce dentro do negócio e um negócio que fecha na proposta não oferece contratos. */
  fechoV4: boolean;
}

export function planoDoDocumento(passo: PassoDocumento, negocio: NegocioFichaDb | undefined, opcoes: OpcoesDoPlano): PlanoDocumento | null {
  if (!negocio || !opcoes.podeEditar) return null;
  // Falha fechada: sem a lista de permissões (a carregar, ou a leitura falhou) nenhum passo de gravação abre.
  const tem = (codigo: string): boolean => opcoes.permissoes !== undefined && opcoes.permissoes.includes(codigo);
  switch (passo) {
    case "enviarProposta":
    case "registarRespostaCliente": {
      const proposta = propostaViva(negocio);
      if (!proposta || propostaRecusada(proposta)) return null;
      if (!tem("proposals.edit")) return null;
      return { passo, propostaId: proposta.id, titulo: proposta.titulo ?? "", numero: proposta.numero } as PlanoDocumento;
    }
    case "criarContrato": {
      const proposta = propostaAceite(negocio);
      if (!proposta) return null;
      if (opcoes.fechoV4 && negocio.fecho === "proposta") return null;
      if (!tem("client_contracts.create")) return null;
      return { passo, propostaId: proposta.id, negocioId: opcoes.fechoV4 ? negocio.id : null };
    }
    case "registarAssinatura": {
      const contrato = contratoVivo(negocio);
      if (!tem("client_contracts.edit")) return null;
      return contrato ? { passo, contratoId: contrato.id, numero: contrato.numero } : null;
    }
  }
}
