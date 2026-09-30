import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "./icons";
import { cx } from "./ui";
import { chaveDoDia, grelhaDoMes, mesmoDia, noMesDe, somarDias } from "../domain/agenda";

/**
 * Escolher um dia, sem sair do teclado nem do polegar.
 *
 * Um `<input type="date">` resolvia isto em duas linhas, e resolve-o mal: cada
 * browser desenha o seu, no telemóvel abre um seletor de sistema que tapa o
 * ecrã todo, e nenhum deles mostra o mês inteiro — que é precisamente o que
 * ajuda quem está a marcar trabalho a ver onde caem os fins de semana.
 *
 * Este mostra o mês, marca hoje, marca o dia escolhido, e fecha-se ao escolher.
 */

const DIAS = ["S", "T", "Q", "Q", "S", "S", "D"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export default function SeletorDeData({
  valor,
  aoEscolher,
  rotulo,
}: {
  valor: Date;
  aoEscolher: (d: Date) => void;
  /** O que o botão mostra quando está fechado. */
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(() => new Date(valor.getFullYear(), valor.getMonth(), 1));
  const caixa = useRef<HTMLDivElement>(null);

  // Reabrir no mês do dia escolhido, e não onde se deixou o folhear.
  useEffect(() => {
    if (aberto) setMes(new Date(valor.getFullYear(), valor.getMonth(), 1));
  }, [aberto, valor]);

  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  const hoje = new Date();

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-expanded={aberto}
        className={cx(
          // `first-letter` e não `capitalize`: capitalize põe maiúscula em CADA
          // palavra, e "quarta-feira, 16 de setembro" saía "Quarta-Feira, 16 De
          // Setembro" — que não é português.
          "rounded-lg px-3 py-2 text-sm font-medium transition-colors first-letter:uppercase",
          aberto ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-100"
        )}
      >
        {rotulo}
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-elevated">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            >
              <ChevronLeft width={16} height={16} />
            </button>
            <span className="text-sm font-medium capitalize text-slate-800">
              {MESES[mes.getMonth()]} {mes.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Mês seguinte"
              onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            >
              <ChevronRight width={16} height={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {DIAS.map((d, i) => (
              <span
                key={i}
                className="pb-1 text-center text-[10px] font-medium uppercase text-slate-400"
              >
                {d}
              </span>
            ))}

            {grelhaDoMes(mes).map((d) => {
              const escolhido = mesmoDia(d, valor);
              const eHoje = mesmoDia(d, hoje);
              const desteMes = noMesDe(d, mes);
              const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;

              return (
                <button
                  key={chaveDoDia(d)}
                  type="button"
                  onClick={() => {
                    aoEscolher(d);
                    setAberto(false);
                  }}
                  className={cx(
                    "h-8 rounded-md text-xs tabular-nums transition-colors",
                    escolhido
                      ? "bg-brand font-semibold text-white"
                      : eHoje
                        ? "bg-brand-50 font-semibold text-brand-800"
                        : desteMes
                          ? fimDeSemana
                            ? "text-slate-400 hover:bg-slate-100"
                            : "text-slate-700 hover:bg-slate-100"
                          : "text-slate-300 hover:bg-slate-50"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                aoEscolher(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
                setAberto(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-50"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => {
                aoEscolher(somarDias(hoje, 1));
                setAberto(false);
              }}
              className="rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100"
            >
              Amanhã
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
