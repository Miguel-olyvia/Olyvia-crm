import { useEffect, useState } from "react";
import { Skeleton } from "./ui";
import { historicoDe, type EventoRow } from "../lib/dados";

/**
 * O que já aconteceu a uma coisa.
 *
 * O módulo escreve histórico desde o primeiro dia — criar, atribuir, fechar,
 * lançar custo, anexar, assinar, mudar de sítio — e nunca o tinha mostrado a
 * ninguém. Um registo que ninguém lê é um registo que não existe.
 *
 * Serve qualquer entidade. Começou pelo equipamento, que é onde a pergunta
 * aparece primeiro: "esta máquina tem dado problemas?".
 */

const ROTULO: Record<string, string> = {
  criado: "Criado",
  criada: "Criada",
  alterado: "Alterado",
  desativado: "Desativado",
  reativado: "Reativado",
  mudou_de_sitio: "Mudou de sítio",
  duplicado: "Duplicado",
  duplicada: "Duplicada",
};

/** Os nomes que uma pessoa reconhece. `categoria_id` não é um deles. */
const CAMPO: Record<string, string> = {
  nome: "nome",
  categoria_id: "categoria",
  num_serie: "número de série",
  criticidade: "criticidade",
  local_id: "sítio",
  ativo: "em uso",
  centro_custo_id: "centro de custo",
};

function comoValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  const s = String(v);
  // Um uuid não diz nada a ninguém. Melhor dizer que mudou do que mostrá-lo.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) ? "outro" : s;
}

function oQueMudou(e: EventoRow): string | null {
  const depois = e.depois ?? {};
  const antes = e.antes ?? {};
  const campos = Object.keys(depois).filter((k) => k in CAMPO);
  if (campos.length === 0) return null;

  return campos
    .map((k) => `${CAMPO[k]}: ${comoValor(antes[k])} → ${comoValor(depois[k])}`)
    .join(" · ");
}

export default function Historico({
  entidade,
  entidadeId,
  nomesPorId,
}: {
  entidade: string;
  entidadeId: string;
  /** Para trocar ids de utilizador por nomes. O que faltar fica sem autor. */
  nomesPorId?: ReadonlyMap<string, string>;
}) {
  const [eventos, setEventos] = useState<EventoRow[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void historicoDe(entidade, entidadeId).then((e) => {
      if (vivo) setEventos(e);
    });
    return () => {
      vivo = false;
    };
  }, [entidade, entidadeId]);

  if (eventos === null) return <Skeleton className="h-16 w-full" />;
  if (eventos.length === 0) {
    return <p className="text-xs text-slate-400">Sem histórico ainda.</p>;
  }

  return (
    <ol className="space-y-2">
      {eventos.map((e) => {
        const mudou = oQueMudou(e);
        const autor = e.autor_id ? nomesPorId?.get(e.autor_id) : null;
        return (
          <li key={e.id} className="flex gap-2 text-xs">
            <span className="w-24 shrink-0 tabular-nums text-slate-400">
              {new Date(e.criado_em).toLocaleDateString("pt-PT", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-700">
                {ROTULO[e.tipo] ?? e.tipo.replace(/_/g, " ")}
              </span>
              {mudou && <span className="text-slate-500"> — {mudou}</span>}
              {autor && <span className="text-slate-400"> · {autor}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
