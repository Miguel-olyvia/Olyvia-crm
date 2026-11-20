// 19/11/2026 (auditoria): a fatura da adenda regista-se pelo ecrã com o número do Eticadata (20/11: na lista «Pagamentos»). Só para os testes:
// o ficheiro que a usa simula o ERP com vi.mock("./erpEticadata") (sem ligação, aparece «Registar sem confirmar»).
import { fireEvent, within } from "@testing-library/react";

/** Escreve o número no campo da adenda, carrega em «Registar o número da fatura» e, sem ligação ao ERP, em «Registar sem confirmar». */
export async function registarNoEcra(onde: HTMLElement, numero: string, semErp = true): Promise<void> {
  fireEvent.change(within(onde).getByLabelText(/Número da fatura no Eticadata/), { target: { value: numero } });
  fireEvent.click(within(onde).getByRole("button", { name: "Registar o número da fatura" }));
  if (semErp) fireEvent.click(await within(onde).findByRole("button", { name: "Registar sem confirmar" }));
}
