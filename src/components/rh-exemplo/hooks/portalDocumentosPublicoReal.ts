/**
 * Wrapper: o lado da PESSOA da troca de documentos e da assinatura do contrato (a Edge `convite-admissao`, acoes `doc_*`, com a
 * sessao do codigo por e-mail). Separado de `portalDocumentosReal.ts` (o lado do RH) porque o Portal do colaborador e o protótipo de
 * RH chegam aqui sem sessao nem organizacao: este ficheiro NAO pode puxar `CompanyContext` nem o cliente Supabase.
 */
export { usePortalDocumentosPublico, type DadosPedidoAoRh, type ResultadoCodigoSms } from "@/hooks/usePortalDocumentosPublico";
export type { ResultadoAccaoSessao } from "@/hooks/useConviteAdmissaoPublico";
export {
  envioPedeAssinatura, pedidoRhAtrasadoReal, pedidoRhPedeAcaoReal,
  type DocumentosPortal, type EnvioPortal, type PedidoPessoaPortal, type PedidoRhPortal,
} from "@/lib/hr/portalDocumentosContrato";
