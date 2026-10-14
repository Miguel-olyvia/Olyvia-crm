// Textos das abas da assiduidade («O meu ponto» e ficha de RH), e da barra de abas da ficha nos ecrãs
// de Recursos Humanos de exemplo (/rh-exemplo). Módulo próprio, juntado em `useTranslation.ts`.
// Apenas en/pt: nas outras línguas o `t()` cai para `en`. Os marcadores {x} são substituídos por quem usa a chave.
export const rhExemploAbasTranslations: Record<"en" | "pt", Record<string, string>> = {
  pt: {
    "rhAbas.ass.label": "Secções da assiduidade",
    "rhAbas.ass.picar": "Picar",
    "rhAbas.ass.calendario": "Calendário",
    "rhAbas.ass.horasExtra": "Horas extra",
    "rhAbas.ass.banco": "Banco de horas",
    "rhAbas.ass.justificacoes": "Justificações",
    "rhAbas.ass.contadorHorasExtra": ", {n} por decidir",
    "rhAbas.ass.contadorJustificacoes": ", {n} por justificar",
    "rhAbas.just.pendentes": "Enviadas, à espera do RH",
    "rhAbas.just.aceites": "Aceites",
    "rhAbas.just.recusadas": "Recusadas",
    "rhAbas.just.vazio": "Não há marcações por justificar nem justificações enviadas.",
    "rhAbas.just.menorPrazo": "Dias úteis que restam à justificação mais urgente: {dias}",
    "rhAbas.fichaAbas.anteriores": "Mostrar as abas anteriores",
    "rhAbas.fichaAbas.seguintes": "Mostrar as abas seguintes",
  },
  en: {
    "rhAbas.ass.label": "Attendance sections",
    "rhAbas.ass.picar": "Clock in",
    "rhAbas.ass.calendario": "Calendar",
    "rhAbas.ass.horasExtra": "Overtime",
    "rhAbas.ass.banco": "Time bank",
    "rhAbas.ass.justificacoes": "Justifications",
    "rhAbas.ass.contadorHorasExtra": ", {n} to decide",
    "rhAbas.ass.contadorJustificacoes": ", {n} to justify",
    "rhAbas.just.pendentes": "Sent, waiting for HR",
    "rhAbas.just.aceites": "Accepted",
    "rhAbas.just.recusadas": "Refused",
    "rhAbas.just.vazio": "There are no missed clock-ins to justify and no justifications sent.",
    "rhAbas.just.menorPrazo": "Working days left for the most urgent justification: {dias}",
    "rhAbas.fichaAbas.anteriores": "Show previous tabs",
    "rhAbas.fichaAbas.seguintes": "Show next tabs",
  },
};
