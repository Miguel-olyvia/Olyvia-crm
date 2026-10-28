// O rascunho do formulário fica SÓ na memória desta página: sobrevive a mudar de passo e a sair do formulário e voltar
// dentro da mesma sessão, e desaparece ao recarregar. De propósito não vai para o armazenamento do navegador: quem
// denuncia de um computador partilhado não deve deixar lá o que escreveu.
//
// Cada rascunho tem uma chave (a página pública e a app não partilham rascunho): o que a pessoa escreveu identificada,
// dentro da app, nunca aparece no formulário público.
import type { DadosFormulario } from "../lib/formulario";

export interface Rascunho {
  dados: DadosFormulario;
  passo: number;
  chave?: string;
}

const CHAVE_PUBLICA = "publico";

let guardado: Rascunho | null = null;

/** O rascunho guardado, se for o desta chave (sem chave, o do formulário público). */
export function lerRascunho(chave: string = CHAVE_PUBLICA): Rascunho | null {
  return guardado && (guardado.chave ?? CHAVE_PUBLICA) === chave ? guardado : null;
}

/**
 * Guarda o rascunho SEM o modo (anónima ou identificada) nem a identidade (nome, email, telefone, contacto): o rascunho nunca
 * leva quem é a pessoa, nem sequer em memória (desenho do canal, 6.3). Ao voltar, o passo 0 pergunta outra vez.
 */
export function guardarRascunho(r: Rascunho): void {
  guardado = {
    ...r,
    dados: { ...r.dados, anonima: null, nome: "", email: "", telefone: "", podemContactar: false, soResponsavel: true },
  };
}

export function limparRascunho(): void {
  guardado = null;
}
