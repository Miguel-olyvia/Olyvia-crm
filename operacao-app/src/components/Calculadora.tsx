import { useMemo, useState } from "react";
import {
  PARTIDA,
  calcular,
  contaDaMaoDeObra,
  contaDoTrabalhoPerdido,
  type Entradas,
} from "../domain/valor";
import { Card, Input } from "./ui";
import { AlertTriangle } from "./icons";

/**
 * "O que isto vale" — com os números da empresa, e não com os nossos.
 *
 * ⚠ Isto **não** calcula poupanças. Não há maneira honesta de o fazer, e uma
 * calculadora que prometesse "poupa X" seria uma brochura.
 *
 * Calcula o que hoje **não está registado em lado nenhum** — duas contas, as
 * duas ancoradas em factos da instância real: o custo de mão de obra que
 * aparece como 0,00 € em todas as ordens, e as avarias que os técnicos
 * escreveram no histórico e que nunca viraram trabalho.
 *
 * A conta aparece por extenso por baixo de cada número. É o que separa isto de
 * um valor que surge por magia: quem está a decidir tem de poder discordar de
 * uma parcela, e para discordar tem de a ver.
 */
export default function Calculadora() {
  const [e, setE] = useState<Entradas>(PARTIDA);
  const r = useMemo(() => calcular(e), [e]);

  const campo = (k: keyof Entradas) => ({
    value: Number.isFinite(e[k]) ? String(e[k]) : "",
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
      const v = ev.target.value.replace(",", ".");
      setE((x) => ({ ...x, [k]: v === "" ? Number.NaN : Number(v) }));
    },
  });

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">
        O que isto vale, com os vossos números
      </h2>
      <p className="mt-1.5 max-w-prose text-sm text-slate-600">
        Muda os números para os da empresa. Isto <strong>não</strong> calcula poupanças — mostra
        o que hoje não está registado em lado nenhum.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ── Mão de obra ── */}
        <div className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200/70">
          <h3 className="text-sm font-medium text-slate-800">
            Mão de obra sem custo associado
          </h3>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Miudo rotulo="Técnicos">
              <Input type="number" min={0} inputMode="numeric" {...campo("tecnicos")} />
            </Miudo>
            <Miudo rotulo="Horas/dia">
              <Input type="number" min={0} inputMode="decimal" {...campo("horasPorDia")} />
            </Miudo>
            <Miudo rotulo="Custo/hora">
              <Input type="number" min={0} inputMode="decimal" {...campo("custoHora")} />
            </Miudo>
          </div>

          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            {euros(r.maoDeObraPorAno)}
          </p>
          <p className="text-xs text-slate-500">por ano · {milhar(r.horasPorAno)} horas</p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-400">
            {contaDaMaoDeObra(e)}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            É o custo de mão de obra que hoje aparece como <strong>0,00 €</strong> em todas as
            ordens da vossa instância — porque o campo existe e nunca foi preenchido. Passa a
            estar em cada ordem, somado das sessões de trabalho reais.
          </p>
        </div>

        {/* ── Trabalho perdido ── */}
        <div className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200/70">
          <h3 className="text-sm font-medium text-slate-800">
            Trabalho encontrado que se perde
          </h3>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Miudo rotulo="Avarias/mês">
              <Input type="number" min={0} inputMode="numeric" {...campo("avariasPorMes")} />
            </Miudo>
            <Miudo rotulo="% perdidas">
              <Input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                {...campo("percentagemPerdida")}
              />
            </Miudo>
            <Miudo rotulo="€/reparação">
              <Input type="number" min={0} inputMode="decimal" {...campo("valorReparacao")} />
            </Miudo>
          </div>

          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            {euros(r.trabalhoPerdidoPorAno)}
          </p>
          <p className="text-xs text-slate-500">
            por ano · {milhar(r.avariasPerdidasPorAno)} reparações que não se fazem
          </p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-400">
            {contaDoTrabalhoPerdido(e)}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            O histórico dos vossos equipamentos está cheio de avarias escritas por técnicos que
            nunca viraram ordem nenhuma. Passam a abrir a reparação sozinhas, no minuto em que
            são encontradas.
          </p>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
        <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-medium">Nenhum destes números é uma promessa.</strong> São os
          vossos, multiplicados. O módulo não os faz aparecer — torna-os visíveis, que é a
          diferença entre poder decidir e ter de adivinhar.
        </span>
      </p>
    </Card>
  );
}

/**
 * Um campo pequeno, com o rótulo por cima.
 *
 * A altura do rótulo é fixa de propósito. Sem isso, um rótulo que parta em duas
 * linhas empurra o seu campo para baixo e desalinha a fila inteira — e a fila
 * ao lado deixa de estar à mesma altura desta.
 */
function Miudo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex min-h-[2.4em] items-end text-[11px] font-medium uppercase leading-tight tracking-wide text-slate-400">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

/** Sem cêntimos: a esta escala, os cêntimos são ruído e sugerem precisão a mais. */
function euros(v: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function milhar(v: number): string {
  return new Intl.NumberFormat("pt-PT").format(v);
}
