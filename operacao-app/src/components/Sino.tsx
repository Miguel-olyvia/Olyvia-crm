import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { avisosDeOperacoes, marcarAvisoLido, type AvisoDoSino } from "../lib/dados";
import { Sino as IconeSino } from "./icons";
import { cx } from "./ui";
import { dataHora } from "../lib/formatar";

/**
 * O sino, deste lado.
 *
 * ⚠ **Não é um segundo sino.** É o mesmo — o do CRM — mostrado onde a pessoa
 * está. O módulo já escrevia lá desde o início; agora também lê e marca como
 * lido, com a política que o CRM tem desde sempre (cada pessoa vê e mexe nas
 * suas, `user_id = auth.uid()`). Marcar aqui apaga lá, e ao contrário também.
 *
 * A decisão original era não ter sino nenhum, para não haver dois sítios para
 * olhar. O erro estava na premissa: um técnico que passa o dia em Operações
 * não vai ao CRM ver se lhe caiu trabalho. Duas janelas para a mesma caixa não
 * são duas caixas.
 *
 * Sem SQL novo — nem uma linha.
 */

const CADA = 60_000;

export default function Sino() {
  const navegar = useNavigate();
  const [avisos, setAvisos] = useState<AvisoDoSino[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setAvisos(await avisosDeOperacoes());
  }, []);

  // De minuto a minuto. Não é tempo real, e não precisa de ser: uma ordem
  // atribuída daqui a trinta segundos continua a ser trabalho de hoje.
  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), CADA);
    return () => clearInterval(t);
  }, [carregar]);

  // Fechar ao carregar fora, como qualquer menu.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const porLer = avisos.filter((a) => !a.lido);

  const abrirAviso = async (a: AvisoDoSino) => {
    setAberto(false);
    if (!a.lido) {
      setAvisos((as) => as.map((x) => (x.id === a.id ? { ...x, lido: true } : x)));
      void marcarAvisoLido([a.id]).catch(() => {});
    }
    // O link vem escrito para o CRM (`/operacao/ordens/OT-1`). Aqui dentro a
    // aplicação já vive em /operacao, por isso o prefixo tira-se — senão o
    // caminho ficava /operacao/operacao/ordens/OT-1 e não abria nada.
    if (a.link) navegar(a.link.replace(/^\/operacao/, "") || "/");
  };

  const lerTodas = async () => {
    const ids = porLer.map((a) => a.id);
    setAvisos((as) => as.map((x) => ({ ...x, lido: true })));
    void marcarAvisoLido(ids).catch(() => {});
  };

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        aria-label={
          porLer.length === 0
            ? "Avisos"
            : `${porLer.length} ${porLer.length === 1 ? "aviso por ler" : "avisos por ler"}`
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <IconeSino width={17} height={17} />
        {porLer.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {porLer.length > 9 ? "9+" : porLer.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-800">Avisos</span>
            {porLer.length > 0 && (
              <button
                type="button"
                onClick={() => void lerTodas()}
                className="text-xs font-medium text-brand hover:underline"
              >
                Marcar todos como lidos
              </button>
            )}
          </div>

          {avisos.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">
              Nada por ler. O sino avisa quando te atribuírem trabalho, quando
              uma corretiva ficar à espera de aprovação, ou quando algo se
              atrasar.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {avisos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void abrirAviso(a)}
                    className={cx(
                      "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50",
                      !a.lido && "bg-brand-50/40"
                    )}
                  >
                    <span
                      className={cx(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        a.lido
                          ? "bg-transparent"
                          : a.prioridade === "urgent"
                            ? "bg-red-500"
                            : "bg-brand"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx(
                          "block truncate text-sm",
                          a.lido ? "text-slate-600" : "font-medium text-slate-900"
                        )}
                      >
                        {a.titulo}
                      </span>
                      {a.mensagem && (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {a.mensagem}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {dataHora(a.criado_em)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
