/**
 * Focar um campo que PODE ainda nao existir no DOM.
 *
 * Os blocos recolhiveis do formulario (morada, banco) desmontam o conteudo
 * enquanto fechados: um `getElementById(...)?.focus()` logo a seguir a abrir o
 * bloco (ou a mudar de passo) falha em silencio porque o campo so aparece no
 * render seguinte. Aqui espera-se, frame a frame, ate o campo existir.
 *
 * Um campo DESACTIVADO nao recebe foco (o `focus()` do navegador nao faz nada,
 * e quem usa leitor de ecra nao ouviria coisa nenhuma): chama-se `aoNaoFocar`
 * para o chamador levar o foco para um sitio com sentido.
 */
export type MotivoSemFoco = "ausente" | "desactivado";

const TENTATIVAS_POR_OMISSAO = 20;

function estaDesactivado(elemento: HTMLElement): boolean {
  return (
    (elemento as HTMLButtonElement | HTMLInputElement).disabled === true ||
    elemento.getAttribute("aria-disabled") === "true"
  );
}

export function focarQuandoExistir(
  campoId: string,
  aoNaoFocar?: (motivo: MotivoSemFoco) => void,
  tentativas: number = TENTATIVAS_POR_OMISSAO,
): void {
  const elemento = document.getElementById(campoId);
  if (!elemento) {
    if (tentativas <= 0) {
      aoNaoFocar?.("ausente");
      return;
    }
    requestAnimationFrame(() => focarQuandoExistir(campoId, aoNaoFocar, tentativas - 1));
    return;
  }
  if (estaDesactivado(elemento)) {
    aoNaoFocar?.("desactivado");
    return;
  }
  elemento.focus();
}
