// Supplier portal, error messages by `hint` (sp.erro.*), used by spErrorMessage (spRpc.ts).
// Still untranslated in this phase: the raw server messages (`message` of the RAISE EXCEPTIONs, in Portuguese),
// which the screen shows as they come: not_found, too_many_rows, conflict, validation and order_closed when the
// server sends text; and the messages of hints the screen does not write.
export const fornecedorEnErro: Record<string, string> = {
  "sp.erro.tentarDeNovo": "Try again",
  "sp.erro.desconhecido": "Unknown error",
  "sp.erro.semAcesso": "No active access to the supplier portal. Please contact the company that invited you.",
  "sp.erro.soPrincipalCatalogo": "Only the primary user of the account can change the catalogue.",
  "sp.erro.soPrincipalDados": "Only the primary user of the account can make this change.",
  "sp.erro.naoEncontrado": "The item does not exist or is no longer available.",
  "sp.erro.demasiadasLinhas": "Too many rows: the maximum is 5000 per import.",
  "sp.erro.jaExiste": "An item with this reference already exists.",
  "sp.erro.dadosInvalidos": "Invalid data.",
  "sp.erro.encomendaAtualizada":
    "The company has updated this order in the meantime. Review the updated details and confirm again.",
  "sp.erro.encomendaFechada": "This order has already been received or cancelled and can no longer be confirmed.",
  "sp.erro.semLigacao": "Unable to reach the server. Check your internet connection and try again.",
  "sp.erro.demorou": "The operation took too long. Try again or use a smaller file.",
  "sp.erro.semPermissao": "You do not have permission to perform this action.",
  "sp.erro.inesperado": "An unexpected error occurred. Please try again.",
};
