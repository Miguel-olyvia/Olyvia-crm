// O rascunho do formulário fica SÓ na memória desta página: sobrevive a mudar de passo e a sair do formulário e voltar
// dentro da mesma sessão, e desaparece ao recarregar. De propósito não vai para o armazenamento do navegador: quem
// denuncia de um computador partilhado não deve deixar lá o que escreveu.
import type { DadosFormulario } from "../lib/formulario";

export interface Rascunho {
  dados: DadosFormulario;
  passo: number;
}

let guardado: Rascunho | null = null;

export const lerRascunho = (): Rascunho | null => guardado;

export function guardarRascunho(r: Rascunho): void {
  guardado = r;
}

export function limparRascunho(): void {
  guardado = null;
}
