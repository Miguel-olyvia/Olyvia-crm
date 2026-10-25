// Só para testes da ficha real: a ficha antiga (registos, dados da pessoa, visitas, negócios, submissões, atividade) já não está à vista; abre a pedido,
// num diálogo por cima, a partir do menu «Mais». Isto faz esse caminho (Mais > item) e devolve o diálogo aberto.
import { fireEvent, screen } from "@testing-library/react";

/** O nome do diálogo de apoio da ficha real. */
export const NOME_DIALOGO_APOIO = "Mais sobre a pessoa";

/** Abre o menu «Mais» da ficha, escolhe o item cujo nome corresponde a `item` (por exemplo «Atividade» ou /^Negócios/) e devolve o diálogo aberto. */
export function abrirApoio(item: string | RegExp): HTMLElement {
  fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
  const nome = typeof item === "string" ? new RegExp(`^${item}`) : item;
  fireEvent.click(screen.getByRole("menuitem", { name: nome }));
  return screen.getByRole("dialog", { name: NOME_DIALOGO_APOIO });
}

/** Passa a outra aba do diálogo de apoio já aberto (o Radix reage ao `mouseDown`). */
export function irParaAba(nome: RegExp): void {
  const aba = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(aba, { button: 0 });
  fireEvent.click(aba);
}
