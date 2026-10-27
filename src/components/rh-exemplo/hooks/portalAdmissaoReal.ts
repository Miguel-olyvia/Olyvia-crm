/**
 * Wrapper: o que o Portal do colaborador (página pública do link) precisa do portal de admissão REAL, que fala com a Edge Function
 * `convite-admissao` (estado, otp_pedir, otp_verificar, ler, sensiveis, sair). Só re-exporta: a fronteira de `semBase.test.ts` deixa
 * os ecrãs de /rh-exemplo importar código real de RH apenas por aqui (pasta `hooks/`).
 */
export { useConviteAdmissaoPublico } from "@/hooks/useConviteAdmissaoPublico";
export { idiomaDoNavegador, type IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
export { motivoDaVista, vistaDoConvite } from "@/lib/hr/portalAdmissao";
export { ConviteCartaoLinkInvalido } from "@/components/hr/convite/ConviteCartaoLinkInvalido";
export { PortalConsulta } from "@/components/hr/portal/PortalConsulta";
export { PortalMoldura } from "@/components/hr/portal/PortalMoldura";
export { PortalOtpDialogo } from "@/components/hr/portal/PortalOtpDialogo";
export { PortalEmAnalise } from "@/components/hr/portal/PortalSemAcesso";
export { PortalSessaoAtiva } from "@/components/hr/portal/PortalSessaoAtiva";
// Peças e funções para a ficha de admissão REAL desenhada com a moldura da pré-visualização (`portal/PortalFichaReal`).
export { ConviteSaudacao } from "@/components/hr/convite/ConviteSaudacao";
export { AvisoSessaoPerdida } from "@/components/hr/portal/PortalConsulta";
export { PortalDevolvida } from "@/components/hr/portal/PortalDados";
export { PortalFormulario } from "@/components/hr/portal/PortalFormulario";
export { PortalProximaFase } from "@/components/hr/portal/PortalProximaFase";
export { estadoAdmissaoDe } from "@/lib/hr/estadoAdmissao";
export { mensagemErroPortal, prazoEmAviso, restoDoPrazo, type ConvitePublico, type PortalLer, type RestoDoPrazo } from "@/lib/hr/portalAdmissao";
export type { AvisoPortal, ResultadoSensiveis } from "@/hooks/useConviteAdmissaoPublico";
