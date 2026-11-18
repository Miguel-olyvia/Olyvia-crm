// Ponto de entrada do idioma do portal (cliente e fornecedor).
export { PortalLanguageProvider } from "./PortalLanguageProvider";
export { PortalSeletorIdioma } from "./PortalSeletorIdioma";
export { usePortalIdioma, type PortalIdiomaEstado } from "./usePortalIdioma";
export { usePortalT, type PortalTraducao } from "./usePortalT";
export { usePortalFormato, type PortalFormato } from "./usePortalFormato";
export { traduzir, traduzirN } from "./traduzir";
export { traduzirEm } from "./traduzirEm";
export {
  marcarMensagem,
  mensagemDeChave,
  mensagemDeTexto,
  resolverMensagem,
  resolverMensagemMarcada,
  type MensagemDoPortal,
} from "./mensagem";
export {
  formatarData,
  formatarDataHora,
  formatarDataIso,
  localeDateFns,
  padraoDeFormato,
  type EstiloDeData,
} from "./formato";
export { CHAVE_IDIOMA_PORTAL, IDIOMA_OMISSAO, IDIOMAS_DO_PORTAL, type ParamsDeTraducao, type PortalIdioma } from "./tipos";
