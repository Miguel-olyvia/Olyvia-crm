// Textos da ligação das horas extra à base (`rhHeReal.*`): os coeficientes de pagamento vêm dos códigos de processamento
// salarial. Módulo próprio, juntado em `useTranslation.ts`. Apenas en/pt: nas outras línguas o `t()` cai para `en`.
export const rhExemploHorasExtraRealTranslations: Record<"en" | "pt", Record<string, string>> = {
  pt: {
    "rhHeReal.ajuda": "Cada percentagem é a do código de processamento activo que paga essa origem (percentagem da hora normal). Para criar, desactivar ou mudar o modo de um código, usa o separador «Códigos». A base guarda uma só percentagem para as horas extra diurnas: não distingue a primeira hora das seguintes.",
    "rhHeReal.semCodigo": "Não há nenhum código activo, em percentagem da hora normal, para esta origem. Cria-o no separador «Códigos».",
    "rhHeReal.outroModo": "O código {codigo} ({nome}) paga esta origem por valor fixo ou à mão, não por percentagem. Altera-o no separador «Códigos».",
    "rhHeReal.invalido": "A percentagem tem de ser um número maior que 0 e até 1000.",
    "rhHeReal.guardado": "Percentagem guardada. Já vale no processamento salarial.",
    "rhHeReal.erroLeitura": "Não foi possível ler os códigos de processamento. Tenta de novo; nada foi alterado.",
    "rhHeReal.regrasSemBase": "Estes quatro valores ainda não têm onde ser guardados na base: valem só nesta sessão e voltam ao inicial ao recarregar a página.",
  },
  en: {
    "rhHeReal.ajuda": "Each percentage is that of the active payroll code that pays that source (percentage of the normal hourly rate). To create, deactivate or change the mode of a code, use the «Codes» tab. The database keeps a single percentage for daytime overtime: it does not tell the first hour from the following ones.",
    "rhHeReal.semCodigo": "There is no active code, as a percentage of the normal rate, for this source. Create it in the «Codes» tab.",
    "rhHeReal.outroModo": "Code {codigo} ({nome}) pays this source by fixed amount or by hand, not by percentage. Change it in the «Codes» tab.",
    "rhHeReal.invalido": "The percentage must be a number greater than 0 and up to 1000.",
    "rhHeReal.guardado": "Percentage saved. It already applies to payroll.",
    "rhHeReal.erroLeitura": "The payroll codes could not be read. Try again; nothing was changed.",
    "rhHeReal.regrasSemBase": "These four values have nowhere to be saved in the database yet: they only last for this session and go back to the initial values when the page reloads.",
  },
};
