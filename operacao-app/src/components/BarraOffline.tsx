import { useEffect, useState } from "react";
import { enviarPendentes, filaOffline, useOffline } from "../lib/offline";
import { Button, cx } from "./ui";
import { AlertTriangle, CheckCircle } from "./icons";
import { dataHora } from "../lib/formatar";

/**
 * O estado da rede e do que está por enviar, no topo de todas as páginas.
 *
 *  · sem rede                 → "Sem rede — N alterações por enviar"
 *  · com rede, a enviar       → "A enviar N alterações…"
 *  · acabou de enviar         → "Enviadas N alterações" (some ao fim de 6 s)
 *  · a base recusou alguma    → a lista, com a mensagem da base e
 *                               "Tentar outra vez" / "Descartar"
 *  · nada disto               → não aparece
 */
export default function BarraOffline() {
  const { online, acoes, aEnviar, ultimo } = useOffline();
  const [verResultado, setVerResultado] = useState(false);
  const [abertas, setAbertas] = useState(false);

  useEffect(() => {
    if (!ultimo || ultimo.enviadas === 0) return;
    setVerResultado(true);
    const id = window.setTimeout(() => setVerResultado(false), 6000);
    return () => window.clearTimeout(id);
  }, [ultimo]);

  const pendentes = acoes.filter((a) => a.estado === "pendente");
  const recusadas = acoes.filter((a) => a.estado === "conflito");
  const n = pendentes.length;
  const plural = (k: number, um: string, varios: string) => (k === 1 ? um : varios);

  if (online && n === 0 && recusadas.length === 0 && !verResultado) return null;

  return (
    <div className="mb-4 space-y-2 print:hidden" aria-live="polite">
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-sm text-white">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
          <span className="flex-1">
            <b>Sem rede</b>
            {n > 0
              ? ` — ${n} ${plural(n, "alteração por enviar", "alterações por enviar")}. Vão sozinhas quando a rede voltar.`
              : " — podes continuar a trabalhar. O que fizeres fica guardado no telemóvel."}
          </span>
        </div>
      )}

      {online && n > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-900 ring-1 ring-sky-200">
          <span className="flex-1">
            {aEnviar
              ? `A enviar ${n} ${plural(n, "alteração feita", "alterações feitas")} sem rede…`
              : `${n} ${plural(n, "alteração", "alterações")} por enviar.`}
          </span>
          {!aEnviar && (
            <Button size="sm" variant="secondary" onClick={() => void enviarPendentes()}>
              Enviar agora
            </Button>
          )}
        </div>
      )}

      {online && verResultado && ultimo && ultimo.enviadas > 0 && n === 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle width={16} height={16} className="shrink-0" />
          {ultimo.enviadas} {plural(ultimo.enviadas, "alteração feita sem rede foi enviada", "alterações feitas sem rede foram enviadas")}.
        </div>
      )}

      {recusadas.length > 0 && (
        <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-900 ring-1 ring-red-200">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setAbertas((x) => !x)}
            aria-expanded={abertas}
          >
            <AlertTriangle width={16} height={16} className="shrink-0" />
            <span className="flex-1">
              A base não aceitou {recusadas.length}{" "}
              {plural(recusadas.length, "coisa feita sem rede", "coisas feitas sem rede")}. Nada se perdeu —{" "}
              <span className="underline">{abertas ? "esconder" : "ver o que foi"}</span>
            </span>
          </button>
          {abertas && (
            <ul className="mt-2 space-y-2">
              {recusadas.map((a) => (
                <li key={a.id} className={cx("rounded-lg bg-white px-3 py-2 ring-1 ring-red-100")}>
                  <p className="font-medium text-slate-800">{a.rotulo}</p>
                  <p className="text-xs text-slate-500">feito a {dataHora(a.criadaEm)}</p>
                  <p className="mt-1 text-sm text-red-800">{a.erro}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await filaOffline().tentarOutraVez(a.id);
                        void enviarPendentes();
                      }}
                    >
                      Tentar outra vez
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void filaOffline().descartar(a.id)}>
                      Descartar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
