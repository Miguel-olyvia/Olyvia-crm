// Os dados para o cliente pagar uma fatura no portal (15/10/2026): a referência Multibanco e a transferência.
// No protótipo são de exemplo, mas estáveis: a mesma fatura dá sempre a mesma referência. Na app real vêm do
// fornecedor de pagamentos (ex.: entidade e referência geradas por fatura) e do IBAN da empresa.

/** A entidade Multibanco e o IBAN da empresa (de exemplo). */
export const PAGAMENTO_EMPRESA = { entidade: "21312", iban: "PT50 0035 0000 1234 5678 9015 4", titular: "Mudelar, Lda." } as const;

/** Agrupa os dígitos de 3 em 3 (como aparece no talão Multibanco). */
export const em3 = (s: string) => s.replace(/(\d{3})(?=\d)/g, "$1 ");

/** A referência Multibanco (9 dígitos) de uma fatura: o número do negócio, o da fatura e 3 dígitos de controlo. */
export function referenciaMb(negocio: number, fatura: string): string {
  const nFat = Number((fatura.match(/(\d+)\s*$/) ?? ["", "0"])[1]) % 1000;
  const base = String(negocio % 1000).padStart(3, "0") + String(nFat).padStart(3, "0");
  // controlo simples (soma ponderada), só para a referência não parecer sequencial
  const ctl = [...base].reduce((a, c, i) => a + Number(c) * (i + 3) * 7, 0) % 1000;
  return base + String(ctl).padStart(3, "0");
}

/** A data em que vence: a emissão mais os dias do vencimento ("15 dias" por omissão), em dd/mm. */
export function vencimento(emitida: Date, prazo = "15 dias"): string {
  const dias = Number((prazo.match(/\d+/) ?? ["15"])[0]);
  const v = new Date(emitida);
  v.setDate(v.getDate() + dias);
  return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}`;
}

/** 21/10: as três formas de pagar uma fatura, à escolha do cliente no portal. */
export const METODOS_PAGAMENTO = ["Transferência", "Referência MB", "Débito direto"] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];
/** O método guardado no negócio, ou a transferência quando ainda não há escolha (ou era um método antigo, ex.: cheque). */
export const metodoDe = (m?: string): MetodoPagamento => (METODOS_PAGAMENTO as readonly string[]).includes(m ?? "") ? (m as MetodoPagamento) : "Transferência";

/** Um IBAN português para o débito direto: PT50 e 21 dígitos (espaços à parte). */
export const ibanValido = (iban: string) => /^PT50\d{21}$/.test(iban.replace(/\s/g, "").toUpperCase());
/** O IBAN como fica à vista depois de autorizado: só os últimos 4 dígitos. */
export const ibanCurto = (iban: string) => "PT50 ···· " + iban.replace(/\s/g, "").slice(-4);
