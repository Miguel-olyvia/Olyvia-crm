/**
 * Os dias que originaram o valor de uma linha das contas («Dias: 2, 3, 6, 7»). Com poucos dias aparecem logo; com muitos ficam
 * dentro de «Ver os dias» (`<details>`/`<summary>`, que o teclado e os leitores de ecra ja sabem abrir). O que se le e texto, nao cor.
 */
import { useTranslation } from "@/hooks/useTranslation";

/** Acima disto a lista fica recolhida. */
const MAX_DIAS_VISIVEIS = 6;

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** Datas curtas: so o dia do mes quando todas caem no mesmo mes («2, 3, 6»); com mais de um mes, «2/9, 3/10». Sem datas validas, vazio. */
function diasEmTexto(validas: readonly string[]): string {
  const mesmoMes = new Set(validas.map((d) => d.slice(0, 7))).size <= 1;
  return validas
    .map((d) => {
      const dia = Number(d.slice(8, 10));
      return mesmoMes ? String(dia) : `${dia}/${Number(d.slice(5, 7))}`;
    })
    .join(", ");
}

export function DiasDaConta({ dias }: { dias: readonly string[] }) {
  const { t } = useTranslation();
  // A contagem e o limiar de recolher usam as datas validas que se mostram, nao as entradas (pode haver dias sem data).
  const validas = dias.filter((d) => DATA_VALIDA.test(d));
  const texto = diasEmTexto(validas);
  if (!texto) return null;
  const lista = <p className="text-xs">{t("rhContas.dias", { dias: texto })}</p>;
  if (validas.length <= MAX_DIAS_VISIVEIS) return <div className="mt-0.5">{lista}</div>;
  return (
    <details className="mt-0.5 text-xs">
      <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
        {t("rhContas.verDias", { n: String(validas.length) })}
      </summary>
      {lista}
    </details>
  );
}
