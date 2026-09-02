import { Card } from "./ui";
import { ChevronDown, Ferramenta } from "./icons";

/**
 * O mesmo trabalho, nos dois sistemas, lado a lado.
 *
 * Escolhi **um técnico encontra uma avaria numa inspeção** e não um caso
 * qualquer: é o momento em que o dinheiro se ganha ou se perde. Uma avaria
 * encontrada e não reparada é uma segunda visita, ou uma reclamação.
 *
 * Três decisões neste desenho:
 *
 *  · **Passos curtos, três a cinco palavras.** Isto é para ser contado num
 *    relance, não lido. Quem quiser o detalhe tem-no mais abaixo na página.
 *
 *  · **O nome do sistema numa faixa de cor, com o VS ao meio.** Sem isso são
 *    duas listas que por acaso estão lado a lado; ninguém percebe que é um
 *    confronto. Nove contra três é o argumento inteiro, e quem só olhar dois
 *    segundos tem de levar isso.
 *
 *  · **Os passos que desaparecem estão marcados**, não apagados. Ver o que
 *    deixa de se fazer vale mais do que ver a lista curta já limpa — é a
 *    diferença entre "é mais simples" e "estes cinco passos deixam de
 *    existir".
 *
 * O que aqui está do lado do Infraspeak é a instalação deles como está hoje,
 * não o produto no seu melhor: a caixa que abriria a reparação sozinha existe
 * lá e está desligada. Está dito na página, e tem de continuar a estar.
 */

interface Passo {
  texto: string;
  /** Um passo que deixa de existir do nosso lado. */
  desaparece?: boolean;
  /** Um passo que o sistema faz sozinho. */
  sozinho?: boolean;
}

const INFRASPEAK: Passo[] = [
  { texto: "Responde “Não Conforme”" },
  { texto: "Escreve o que viu nas observações", desaparece: true },
  { texto: "Fecha a ocorrência" },
  { texto: "Alguém tem de ler o histórico", desaparece: true },
  { texto: "Abre um Pedido — noutro ecrã", desaparece: true },
  { texto: "Escreve outra vez o que se passou", desaparece: true },
  { texto: "Converte o Pedido em Ocorrência", desaparece: true },
  { texto: "Marca na agenda" },
  { texto: "Confere férias e folgas à mão", desaparece: true },
];

const OLYVIA: Passo[] = [
  { texto: "Responde “Não Conforme”" },
  { texto: "A reparação abre-se sozinha, com o problema lá dentro", sozinho: true },
  { texto: "Marca na agenda — férias e choques aparecem sozinhos" },
];

export default function ComparacaoDeFluxo() {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Ferramenta width={17} height={17} className="text-brand-600" />
        Um técnico encontra uma avaria
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-600">
        O mesmo trabalho, do princípio ao fim, nos dois sistemas.
      </p>

      {/* Três colunas e não duas: o "VS" no meio é o que faz isto ler-se como
          uma comparação e não como duas listas que por acaso estão ao lado. */}
      <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-2">
        <Coluna
          titulo="Infraspeak"
          numero={INFRASPEAK.length}
          passos={INFRASPEAK}
          tom="cinzento"
          remate="E se ninguém ler o histórico, a avaria morre ali."
        />

        <div className="flex items-center justify-center sm:px-1">
          {/* No telemóvel as colunas empilham, e uma linha por cima e por baixo
              do VS mantém a leitura de cima para baixo. */}
          <span className="h-px flex-1 bg-slate-200 sm:hidden" aria-hidden="true" />
          <span
            className="mx-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold uppercase tracking-wide text-white sm:mx-0"
            aria-hidden="true"
          >
            vs
          </span>
          <span className="h-px flex-1 bg-slate-200 sm:hidden" aria-hidden="true" />
        </div>

        <Coluna
          titulo="Olyvia"
          numero={OLYVIA.length}
          passos={OLYVIA}
          tom="roxo"
          remate="Ninguém reescreve nada, e nada depende de alguém se lembrar."
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Os cinco passos riscados são os que deixam de existir. Não é o mesmo trabalho mais
        arrumado: é trabalho que já não se faz.
      </p>
    </Card>
  );
}

function Coluna({
  titulo,
  numero,
  passos,
  tom,
  remate,
}: {
  titulo: string;
  numero: number;
  passos: Passo[];
  tom: "cinzento" | "roxo";
  remate: string;
}) {
  const roxo = tom === "roxo";
  return (
    <div
      className={
        roxo
          ? "rounded-xl bg-brand-50/50 p-3.5 ring-1 ring-inset ring-brand-100"
          : "rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200"
      }
    >
      {/* O nome do sistema é o que tem de saltar. Antes vinha a seguir ao
          número, em cinzento, e ninguém percebia que aquilo era um confronto. */}
      <div
        className={
          roxo
            ? "-m-3.5 mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-xl bg-brand-600 px-3.5 py-2.5"
            : "-m-3.5 mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-xl bg-slate-600 px-3.5 py-2.5"
        }
      >
        <span className="text-base font-bold tracking-tight text-white">{titulo}</span>
        <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-xs font-semibold text-white">
          {numero} passos
        </span>
      </div>

      <ol className="space-y-0">
        {passos.map((p, i) => (
          <li key={p.texto}>
            <div className="flex items-start gap-2">
              <span
                className={
                  roxo
                    ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white font-mono text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200"
                    : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white font-mono text-[10px] font-semibold text-slate-400 ring-1 ring-inset ring-slate-200"
                }
              >
                {i + 1}
              </span>
              <span
                className={
                  p.desaparece
                    ? "min-w-0 text-sm leading-snug text-slate-400 line-through decoration-slate-300"
                    : "min-w-0 text-sm leading-snug text-slate-700"
                }
              >
                {p.texto}
                {p.sozinho && (
                  <span className="ml-1.5 whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                    sozinho
                  </span>
                )}
              </span>
            </div>
            {i < passos.length - 1 && (
              <ChevronDown
                width={12}
                height={12}
                className="my-0.5 ml-[6px] text-slate-300"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      <p
        className={
          roxo
            ? "mt-3 border-t border-brand-100 pt-2.5 text-xs leading-relaxed text-brand-800"
            : "mt-3 border-t border-slate-200 pt-2.5 text-xs leading-relaxed text-slate-500"
        }
      >
        {remate}
      </p>
    </div>
  );
}
