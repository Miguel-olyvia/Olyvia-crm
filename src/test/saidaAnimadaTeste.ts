// Só para os testes (nenhum código da página o importa): faz os diálogos do Radix terem uma saída animada no jsdom.
// Sem isto o jsdom desmonta o diálogo no mesmo instante em que fecha, e não se consegue ver o que acontece enquanto ele ainda
// está a sair (a altura em que o resto da página continua escondido do leitor de ecrã). Com isto, um diálogo fechado fica no
// DOM, com `data-state="closed"`, até `acabar()` lhe entregar o `animationend`. Chama-se ANTES de o diálogo abrir: o Radix lê o
// estilo uma só vez, quando o diálogo monta.
import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

const ENTRADA = "entrada";
const SAIDA = "saida";

export interface SaidaAnimada {
  /** Entrega o fim da animação a todos os diálogos que estão a sair: passam a desmontar. */
  acabar: () => void;
  /** Volta ao `getComputedStyle` do jsdom. */
  restaurar: () => void;
}

export function simularSaidaAnimada(): SaidaAnimada {
  const real = window.getComputedStyle.bind(window);
  const espiao = vi.spyOn(window, "getComputedStyle").mockImplementation((elemento: Element, pseudo?: string | null) => {
    const estilo = real(elemento, pseudo);
    if (elemento.getAttribute("role") !== "dialog") return estilo;
    return new Proxy(estilo, {
      get: (alvo, chave) => {
        if (chave === "animationName") return elemento.getAttribute("data-state") === "closed" ? SAIDA : ENTRADA;
        const valor = Reflect.get(alvo, chave);
        return typeof valor === "function" ? valor.bind(alvo) : valor;
      },
    });
  });
  return {
    acabar: () => {
      document.querySelectorAll('[role="dialog"][data-state="closed"]').forEach((elemento) => {
        const evento = new Event("animationend", { bubbles: true });
        Object.defineProperty(evento, "animationName", { value: SAIDA });
        fireEvent(elemento, evento);
      });
    },
    restaurar: () => espiao.mockRestore(),
  };
}
