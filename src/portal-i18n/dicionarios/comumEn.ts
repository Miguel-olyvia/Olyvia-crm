// Common texts for the customer and supplier portals, in English (`pt.*` keys; "pt" is the area prefix, not the language).
// Keep this file under 400 lines: to grow it, create `comumEn.<theme>.ts` exporting a
// `Record<string, string>` and spread it here. Every key added here must also exist in `comumPt.ts`.
export const comumEn: Record<string, string> = {
  // Actions
  "pt.sair": "Sign out",
  "pt.fechar": "Close",
  "pt.cancelar": "Cancel",
  "pt.tentarNovamente": "Try again",
  "pt.dialogo.fechar": "Close",

  // States
  "pt.aCarregar": "Loading…",
  "pt.semResultados": "No results",

  // Generic errors
  "pt.erro.generico": "Something went wrong. Please try again.",
  "pt.erro.rede": "We could not reach the server. Check your connection and try again.",
  "pt.erro.semPermissao": "You do not have permission to view this page.",

  // Months (1 = January)
  "pt.mes.1": "January",
  "pt.mes.2": "February",
  "pt.mes.3": "March",
  "pt.mes.4": "April",
  "pt.mes.5": "May",
  "pt.mes.6": "June",
  "pt.mes.7": "July",
  "pt.mes.8": "August",
  "pt.mes.9": "September",
  "pt.mes.10": "October",
  "pt.mes.11": "November",
  "pt.mes.12": "December",
};
