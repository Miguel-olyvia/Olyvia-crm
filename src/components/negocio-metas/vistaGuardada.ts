// A escolha Quadro | Lista fica guardada no browser. localStorage pode falhar
// (janela privada, dados bloqueados): nesse caso a página funciona na mesma,
// só não se lembra.
export type ModoVista = "quadro" | "lista";

export const CHAVE_VISTA = "negocioMetas.vista";

export function lerVista(): ModoVista {
  try {
    return window.localStorage.getItem(CHAVE_VISTA) === "lista" ? "lista" : "quadro";
  } catch {
    return "quadro";
  }
}

export function guardarVista(modo: ModoVista): void {
  try {
    window.localStorage.setItem(CHAVE_VISTA, modo);
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}
