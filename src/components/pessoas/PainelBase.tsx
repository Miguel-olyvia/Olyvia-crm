// A base dos painéis de ação da ficha, em linha entre o cabeçalho e as abas (sem popovers). O foco vai para o primeiro
// campo; o Esc fecha só o painel (a ficha trata disso: ver `FichaPessoa`). Os painéis já abertos ficam montados (e
// escondidos) enquanto a ficha está aberta, para não perderem o que se escreveu ao trocar de painel.
import { useId, type ReactNode } from "react";
import type { DadosChamada } from "./acoesPessoa";
import type { MotivoPerda, Pessoa } from "./pessoasTipos";

export type AcaoFicha = "chamada" | "nota" | "adiar" | "perder";

/** O que a ficha pode fazer à pessoa (vem do estado da página). */
export interface AcoesFicha {
  registarChamada: (id: string, dados: Omit<DadosChamada, "hoje">) => void;
  adiar: (id: string, dias: 1 | 3 | 7) => void;
  perder: (id: string, motivo: MotivoPerda) => void;
  juntarNota: (id: string, texto: string) => void;
}

/** A moldura comum: título e conteúdo, ligados por `aria-labelledby`; escondida quando o painel não é o ativo. */
export function MolduraPainel({ id, titulo, ativo, children }: { id: string; titulo: string; ativo: boolean; children: ReactNode }) {
  const idTitulo = useId();
  return (
    <section id={id} hidden={!ativo} aria-labelledby={idTitulo} className="mx-6 mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 id={idTitulo} className="text-sm font-semibold text-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

export interface PropsPainel {
  id: string;
  /** É o painel à vista: ao tornar-se ativo, o foco vai para o primeiro campo. */
  ativo: boolean;
  pessoa: Pessoa;
  hoje: string;
  acoes: AcoesFicha;
  /** Cancelar: fecha o painel e descarta o que se escreveu. */
  aoFechar: () => void;
  /** Depois de guardar: a mensagem para o leitor de ecrã; a ficha fecha o painel. */
  aoConcluir: (mensagem: string) => void;
  /** Diz à ficha se o painel tem algo escrito (o primeiro Esc avisa antes de descartar). */
  aoMudarConteudo: (comConteudo: boolean) => void;
}
