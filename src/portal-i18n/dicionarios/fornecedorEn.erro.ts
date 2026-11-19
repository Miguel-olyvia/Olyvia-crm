// Supplier portal, error messages (sp.erro.*), used by spErrorMessage and by the hintMessages (spRpc.ts).
// The raw server messages (`message` of the RAISE EXCEPTIONs, in Portuguese) are NOT translated: the screen shows them
// as they come (not_found, too_many_rows, conflict, validation, order_closed and duplicate_note when the server
// sends text). The messages below are the fallbacks and the ones the screen itself writes.
export const fornecedorEnErro: Record<string, string> = {
  "sp.erro.tentarDeNovo": "Try again",
  "sp.erro.desconhecido": "Unknown error",
  "sp.erro.semAcesso": "No active access to the supplier portal. Please contact the company that invited you.",
  "sp.erro.soPrincipalCatalogo": "Only the account's main user can change the catalogue.",
  "sp.erro.soPrincipalDados": "Only the account's main contact can make this change.",
  "sp.erro.naoEncontrado": "The item does not exist or is no longer available.",
  "sp.erro.demasiadasLinhas": "Too many rows: the maximum is 5000 per import.",
  "sp.erro.jaExiste": "An item with this reference already exists.",
  "sp.erro.dadosInvalidos": "Invalid data.",
  "sp.erro.encomendaAtualizada":
    "The company has updated this order in the meantime. Review the updated details and confirm again.",
  "sp.erro.encomendaFechada": "This order has already been received or cancelled: it can no longer be confirmed.",
  "sp.erro.semLigacao": "No connection to the server. Check your internet connection and try again.",
  "sp.erro.demorou": "The operation took too long. Try again or use a smaller file.",
  "sp.erro.semPermissao": "You do not have permission for this operation.",
  "sp.erro.inesperado": "An unexpected error occurred. Please try again.",

  // Shipping with a delivery note
  "sp.erro.confirmeAntesDeExpedir": "Confirm the order before shipping it.",
  "sp.erro.guiaRepetida": "A delivery note with this number already exists for this company. Check the delivery note number.",
  "sp.erro.encomendaNaoDisponivel": "The order does not exist or is no longer available in the portal.",
  "sp.erro.encomendaFechadaExpedir": "This order has already been received or cancelled: it can no longer be shipped.",
  "sp.erro.guiaNaoDisponivel": "The delivery note does not exist or is no longer available in the portal.",
  "sp.erro.guiaCancelada": "This delivery note was cancelled by the company: files can no longer be attached.",

  // Delivery note file
  "sp.erro.ficheiroTipo": "File type not allowed (PDF, JPEG, PNG or WEBP only).",
  "sp.erro.ficheiroVazio": "The file is empty.",
  "sp.erro.ficheiroGrande": "The file must be 10 MB or smaller.",
  "sp.erro.ficheiroNaoCarregado": "The file was not uploaded: {motivo}",
  "sp.erro.ficheiroRecusado": "The file was rejected.",
};
