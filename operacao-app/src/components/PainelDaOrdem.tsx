import { Link } from "react-router-dom";
import type { OrdemNaAgenda } from "../domain/agenda";
import type { Cliente, LocalRow } from "../lib/dados";
import { useRotulos } from "../auth/Rotulos";
import {
  Badge,
  Button,
  EstadoOrdem,
  OrigemOrdem,
  PrioridadeOrdem,
  cx,
} from "./ui";
import { ChevronRight, X } from "./icons";
import MapaPequeno from "./MapaPequeno";
import type { Estado, Origem, Prioridade } from "../domain/tipos";

/**
 * A ordem espreitada, sem sair da agenda.
 *
 * Quem estava a usar disse-o assim: "ao clicar na ordem em qualquer view não
 * devia redirecionar para o detalhe, devia aparecer uma tab ao lado com o
 * detalhe, com o local etc, e opção para ver a página".
 *
 * A razão é a agenda: um gestor a marcar o dia abre seis ordens a seguir umas
 * às outras para decidir a ordem das visitas. Com navegação, cada espreitadela
 * custava duas viagens e perdia o dia que estava a ver — e o botão de voltar
 * trazia-o para o topo da lista, não para onde ele estava.
 *
 * Por isso o painel **não é uma página**: não mexe no endereço, não entra no
 * histórico do browser, e fecha-se com Esc. O que é uma página continua a
 * ser-lhe: "Abrir a ficha" leva à ordem inteira, para quem vai mesmo
 * trabalhar nela.
 *
 * Num telemóvel encosta-se em baixo — uma coluna lateral de 380px num ecrã de
 * 360 é uma coluna que tapa o que se estava a ver.
 */
export default function PainelDaOrdem({
  ordem,
  local,
  cliente,
  responsavel,
  aoFechar,
}: {
  ordem: OrdemNaAgenda;
  local: LocalRow | null;
  cliente: Cliente | null;
  responsavel: string | null;
  aoFechar: () => void;
}) {
  const rotulos = useRotulos();

  const hora = ordem.agendada_para
    ? new Date(ordem.agendada_para).toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const dia = ordem.agendada_para
    ? new Date(ordem.agendada_para).toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <>
      {/* O véu só existe no telemóvel, onde o painel tapa a agenda. No
          computador a agenda continua visível e clicável ao lado. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden"
      />

      <aside
        className={cx(
          "fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl",
          "lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[380px] lg:rounded-none lg:rounded-l-2xl lg:p-5"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-400">{ordem.codigo}</p>
            <h2 className="mt-0.5 text-base font-semibold leading-snug text-slate-900">
              {ordem.titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X width={16} height={16} />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <EstadoOrdem estado={ordem.estado as Estado} />
          <OrigemOrdem origem={ordem.origem as Origem} />
          <PrioridadeOrdem prioridade={ordem.prioridade as Prioridade} />
        </div>

        <dl className="mt-4 space-y-2.5 text-sm">
          {dia && (
            <Linha rotulo="Quando">
              {dia}
              {hora && <span className="ml-1 font-mono tabular text-slate-500">{hora}</span>}
              {!hora && <span className="ml-1 text-slate-400">· sem hora</span>}
            </Linha>
          )}
          <Linha rotulo="Cliente">{cliente?.nome ?? "—"}</Linha>
          <Linha rotulo="Onde">
            {local ? (
              <span>
                {local.nome}
                {local.morada && (
                  <span className="block text-xs text-slate-500">{local.morada}</span>
                )}
              </span>
            ) : (
              "—"
            )}
          </Linha>
          <Linha rotulo="Quem">
            {responsavel ?? (
              <Badge className="bg-amber-50 text-amber-800 ring-amber-200">sem ninguém</Badge>
            )}
          </Linha>
          {ordem.origem && (
            <Linha rotulo="Natureza">{rotulos.nome("origem", ordem.origem)}</Linha>
          )}
        </dl>

        {/* O mapa é o que faz isto valer a pena: antes de sair, reconhecer o
            sítio vale mais do que ler a morada. */}
        {local && (
          <MapaPequeno
            sitio={local}
            nome={local.nome}
            altura={170}
            className="mt-4 block"
          />
        )}

        <div className="mt-5">
          <Link to={`/ordens/${ordem.codigo}`}>
            <Button className="w-full justify-center">
              Abrir a ficha <ChevronRight width={14} height={14} />
            </Button>
          </Link>
          <p className="mt-1.5 text-center text-xs text-slate-400">
            É lá que se responde às tarefas, se lançam custos e se fecha.
          </p>
        </div>
      </aside>
    </>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-xs uppercase tracking-wide text-slate-400">
        {rotulo}
      </dt>
      <dd className="min-w-0 flex-1 text-slate-700">{children}</dd>
    </div>
  );
}
