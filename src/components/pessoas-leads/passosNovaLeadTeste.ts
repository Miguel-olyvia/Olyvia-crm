// 4/11: ajudas dos testes da «Nova lead» guiada (um passo de cada vez): «Continuar» passa ao passo seguinte e «Criar lead» só existe no
// último. Só para os testes.
import { fireEvent, screen } from "@testing-library/react";

const passoAtual = () => document.querySelector('[aria-current="step"]')?.textContent ?? "";

/** Carrega em «Continuar» (passa ao passo seguinte, se o passo atual estiver bem preenchido). */
export const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

/** Vai do primeiro passo («Como chegou») ao dos dados base («Quem é»), se ainda lá não estiver. */
export function irParaContacto() {
  if (!screen.queryByLabelText(/Nome próprio|Apelido/)) continuar();
}

/** Avança até ao último passo e carrega em «Criar lead». Num passo que não deixa avançar (campos em falta, campos a carregar), fica nele. */
export function criar() {
  for (let k = 0; k < 6 && !screen.queryByRole("button", { name: "Criar lead" }); k++) {
    const b = screen.queryByRole("button", { name: "Continuar" }) as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const antes = passoAtual();
    fireEvent.click(b);
    if (passoAtual() === antes) return;
  }
  const c = screen.queryByRole("button", { name: "Criar lead" });
  if (c) fireEvent.click(c);
}

/** Vai até ao último passo («Confirmar»), sem criar. */
export function irParaConfirmar() {
  for (let k = 0; k < 6 && !screen.queryByRole("button", { name: /Criar lead|A criar/ }); k++) {
    const b = screen.queryByRole("button", { name: "Continuar" }) as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    fireEvent.click(b);
  }
}
