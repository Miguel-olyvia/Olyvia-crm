/**
 * Wrapper: a troca de documentos e a assinatura do contrato do Portal do colaborador LIGADAS A BASE. Do lado da pessoa fala com a
 * Edge Function `convite-admissao` (acoes `doc_*`, com a sessao do codigo por e-mail); do lado do RH fala com as RPCs
 * `rpc_hr_portal_*` e `rpc_hr_admissao_*`. Só re-exporta: a fronteira de `semBase.test.ts` deixa os ecrãs de /rh-exemplo importar
 * código real de RH apenas por aqui (pasta `hooks/`).
 */
export { usePortalDocumentosPublico, type DadosPedidoAoRh, type ResultadoCodigoSms } from "@/hooks/usePortalDocumentosPublico";
export type { ResultadoAccaoSessao } from "@/hooks/useConviteAdmissaoPublico";
export {
  envioPedeAssinatura, pedidoRhAtrasadoReal, pedidoRhPedeAcaoReal,
  type DocumentosPortal, type EnvioPortal, type PedidoPessoaPortal, type PedidoRhPortal,
} from "@/lib/hr/portalDocumentosContrato";
export {
  usePortalDocumentosRh,
  type DocumentoPartilhavel, type EnvioRh, type PedidoDaPessoa, type PedidoDoRh, type ResultadoPortalRh,
} from "@/hooks/hr/usePortalDocumentosRh";
export { useDecisoesAdmissao, type ResultadoDecisao, type ResultadoEnvioContrato } from "@/hooks/hr/useDecisoesAdmissao";
export { EnviarContratoDialog } from "@/components/hr/admissao/EnviarContratoDialog";
