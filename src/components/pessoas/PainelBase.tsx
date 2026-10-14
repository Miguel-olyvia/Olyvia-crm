// A base dos painéis de ação da ficha, em linha entre o cabeçalho e as abas (sem popovers). O foco vai para o primeiro
// campo; o Esc fecha só o painel (a ficha trata disso: ver `FichaPessoa`). Os painéis já abertos ficam montados (e
// escondidos) enquanto a ficha está aberta, para não perderem o que se escreveu ao trocar de painel.
import { useId, type ReactNode } from "react";
import type { ContextoPerda, DadosChamada } from "./acoesPessoa";
import type { MotivoPerda, Pessoa, ResumoPessoa } from "./pessoasTipos";
import type { DadosAlterarVisita } from "./visitaPessoa";

export type AcaoFicha = "chamada" | "nota" | "adiar" | "perder";

/** O que a ficha pode fazer à pessoa (vem do estado da página). */
export interface AcoesFicha {
  registarChamada: (id: string, dados: Omit<DadosChamada, "hoje">) => void;
  adiar: (id: string, dias: 1 | 3 | 7) => void;
  /** O contexto diz o passo do percurso (0 a 3) em que a lead se perde e o papel (um cliente não se perde). */
  perder: (id: string, motivo: MotivoPerda, contexto: ContextoPerda) => void;
  reativar: (id: string) => void;
  juntarNota: (id: string, texto: string) => void;
  /** Muda o dia, a hora e a morada da visita já marcada. */
  alterarVisita: (id: string, dados: DadosAlterarVisita) => void;
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
  /** A pessoa com os negócios (o painel de perder diz em que passo se perde e quantos negócios ficam abertos). */
  resumo: ResumoPessoa;
  hoje: string;
  acoes: AcoesFicha;
  /** Cancelar: fecha o painel e descarta o que se escreveu. */
  aoFechar: () => void;
  /** Depois de guardar: a mensagem para o leitor de ecrã; a ficha fecha o painel. */
  aoConcluir: (mensagem: string) => void;
  /** Diz à ficha se o painel tem algo escrito (o primeiro Esc avisa antes de descartar). */
  aoMudarConteudo: (comConteudo: boolean) => void;
}
