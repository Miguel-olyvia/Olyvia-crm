import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dadosEmFalta } from "../lib/encomendas";
import { hrefDoDado, type DadoEmFalta } from "../domain/encomendas";
import { cx } from "./ui";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";

/**
 * "Dados em falta que pioram o plano": ficha do local, medidas da visita,
 * prazos dos fornecedores, ofícios sem gente… cada um com o sítio onde se
 * preenche. Não é obrigatório nada — só diz o que se perde. Não mostra nada
 * se não faltar nada (ou se o SQL desta versão ainda não correu).
 */
export default function ObraDadosEmFalta({ obraId, recarga = 0 }: { obraId: string; recarga?: number }) {
  const [dados, setDados] = useState<DadoEmFalta[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    dadosEmFalta(obraId)
      .then((d) => vivo && setDados(d))
      .catch(() => vivo && setDados([]));
    return () => {
      vivo = false;
    };
  }, [obraId, recarga]);

  if (dados.length === 0) return null;
  const graves = dados.filter((d) => d.gravidade === 1).length;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2" data-testid="dados-em-falta">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={aberto}
      >
        <span className="text-sm font-medium text-amber-900">
          Dados em falta que pioram o plano
          <span className="ml-1.5 font-normal text-amber-800">
            · {dados.length}
            {graves > 0 && graves < dados.length ? ` (${graves} mudam datas ou quantidades)` : ""}
          </span>
        </span>
        <span className="shrink-0 text-xs text-amber-800">{aberto ? "Fechar" : "Ver"}</span>
      </button>
      {aberto && (
        <ul className="mt-2 divide-y divide-amber-100">
          {dados.map((d) => (
            <li key={d.chave} className="py-1.5" data-chave={d.chave}>
              <p className={cx("text-sm", d.gravidade === 1 ? "font-medium text-amber-950" : "text-amber-900")}>{d.titulo}</p>
              <p className="text-xs text-amber-800">{d.detalhe}</p>
              <Onde d={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Onde({ d }: { d: DadoEmFalta }) {
  const href = hrefDoDado(d, OLYVIA_URL);
  if (!d.onde) return null;
  const classe = "mt-0.5 inline-block text-xs font-medium text-violet-700 hover:underline";
  if (!href) return <p className="mt-0.5 text-xs text-slate-500">Onde: {d.onde}</p>;
  if (d.destino === "ops") {
    return (
      <Link to={href} className={classe}>
        {d.onde} →
      </Link>
    );
  }
  return (
    <a href={href} className={classe}>
      {d.onde} ↗
    </a>
  );
}
