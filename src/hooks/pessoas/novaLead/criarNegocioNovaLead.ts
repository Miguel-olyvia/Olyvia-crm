// O negócio que nasce com a «Nova lead»: quem entra quer logo um negócio a ser trabalhado, e o Pipeline só mostra negócios. Chama
// neg_criar_negocio pelo mesmo caminho da ficha (useMutacoesNegocio): título = nome da pessoa, fecho «contrato», sem reabrir a abordagem.
// O id do negócio escolhe-se ANTES de chamar e reusa-se ao repetir: quem repete nunca cria um segundo negócio com outro id.
import { FECHO_POR_OMISSAO } from "@/components/negocio-metas/fechoNegocio";
import { chamarNeg } from "../chamarNeg";
import { MAX_TITULO } from "../paramsNegocio";

export interface PedidoNegocioNovaLead {
  organizationId: string;
  entityId: string;
  /** O id do negócio (`p_id`), escolhido por quem chama e reusado ao repetir. */
  negocioId: string;
  /** O nome da pessoa. */
  titulo: string;
}

export const novoIdNegocio = (): string => crypto.randomUUID();

export async function criarNegocioNovaLead(p: PedidoNegocioNovaLead): Promise<void> {
  await chamarNeg("neg_criar_negocio", {
    p_id: p.negocioId,
    p_organization_id: p.organizationId,
    p_entity_id: p.entityId,
    p_titulo: p.titulo.trim().slice(0, MAX_TITULO),
    p_fecho: FECHO_POR_OMISSAO,
    p_reabrir_abordagem: false,
  });
}
