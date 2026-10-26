// Só para testes da ficha real da página de Pessoas (SEM o guia do Pipeline): as abas da ficha completa em painel lateral. O Pipeline já não tem a ficha
// antiga (nem o diálogo «Mais sobre a pessoa»): os testes destas funcionalidades (contacto, identidade, classificação, submissões, atividade) correm aqui.
import { fireEvent, screen } from "@testing-library/react";

/** Passa à aba cujo nome corresponde a `nome` (o Radix reage ao `mouseDown`). */
export function irParaAba(nome: RegExp): void {
  const aba = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(aba, { button: 0 });
  fireEvent.click(aba);
}

/** Abre a aba da ficha pedida («Registos e dados» é o Resumo, a aba de entrada) e devolve o painel da ficha. */
export function abrirApoio(item: string | RegExp): HTMLElement {
  const alvo = typeof item === "string" ? (item === "Registos e dados" ? "Resumo" : item) : item;
  irParaAba(typeof alvo === "string" ? new RegExp(`^${alvo}`) : alvo);
  return screen.getByRole("tabpanel");
}
