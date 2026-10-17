// "E agora?": o próximo passo depois da chamada, em cartões de escolha única. Os que cabem mudam com o resultado (ver
// `chamadaPassos.ts`); o recomendado leva a marca "Recomendado" em texto.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ehRecomendado } from "./chamadaPassos";
import { classeCartao } from "./cartaoOpcao";
import { Visto } from "./OpcoesResultado";
import { faseDoPedido, nomeDoPedido } from "./pedidoNegocio";
import type { PassoChamada, PedidoNegocio, ResultadoContacto } from "./pessoasTipos";

interface SeletorPedidoProps {
  candidatos: readonly PedidoNegocio[];
  /** Todos os pedidos da pessoa: o nome de cada um é o mesmo em todo o lado (ver `nomeDoPedido`). */
  todos: readonly PedidoNegocio[];
  valor: string;
  aoEscolher: (pedidoId: string) => void;
}

/** "A que pedido se refere a visita?": só aparece havendo mais de um pedido sem visita; cada cartão diz o serviço e a fase. */
function SeletorPedido({ candidatos, todos, valor, aoEscolher }: SeletorPedidoProps) {
  const { t } = useTranslation();
  const nome = useId();
  const idLegenda = useId();
  return (
    <div role="radiogroup" aria-labelledby={idLegenda} className="space-y-2 pt-1">
      <p id={idLegenda} className="text-sm font-semibold text-foreground">{t("pessoasPagina.call.request")}</p>
      <div className="grid grid-cols-1 gap-2">
        {candidatos.map((p) => {
          const escolhido = valor === p.id;
          return (
            <label key={p.id} className="relative flex cursor-pointer">
              <input type="radio" name={nome} className="peer sr-only" checked={escolhido} onChange={() => aoEscolher(p.id)} />
              <span className={classeCartao(escolhido)}>
                {nomeDoPedido(t, p, todos)}
                {/* A vírgula só se lê: separa o pedido da fase no nome do rádio ("Cozinha, Contactado"); o espaço fica fora do sr-only (dentro, perde-se). */}
                <span className="sr-only">,</span>{" "}
                <span className="text-muted-foreground">{t(`pessoasPagina.board.col.${faseDoPedido(p)}`)}</span>
                <Visto escolhido={escolhido} />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface ProximoPassoChamadaProps {
  resultado: ResultadoContacto | null;
  passos: readonly PassoChamada[];
  valor: PassoChamada;
  aoEscolher: (p: PassoChamada) => void;
  /** Os pedidos a que a visita pode ir; com mais de um (e a visita escolhida), mostra o seletor. Vazio quando o pedido já vem escolhido. */
  candidatos?: readonly PedidoNegocio[];
  /** Todos os pedidos da pessoa (para os nomes); sem isto, os candidatos. */
  todos?: readonly PedidoNegocio[];
  pedidoId?: string;
  aoEscolherPedido?: (pedidoId: string) => void;
}

export function ProximoPassoChamada({ resultado, passos, valor, aoEscolher, candidatos = [], todos, pedidoId = "", aoEscolherPedido }: ProximoPassoChamadaProps) {
  const { t } = useTranslation();
  const nome = useId();
  const idLegenda = useId();
  const pedidos = todos ?? candidatos;
  // Com a visita escolhida, diz-se sempre em que pedido fica (também com um só candidato, que não pede escolha).
  const destino = valor === "marcarVisita" && candidatos.length > 0 ? candidatos.find((p) => p.id === pedidoId) ?? candidatos[0] : null;
  return (
    <div className="space-y-2">
      {/* Antes de escolher como correu não há rádios: um grupo de rádio vazio não diz nada, por isso é um simples grupo. */}
      <div role={resultado === null ? "group" : "radiogroup"} aria-labelledby={idLegenda} className="space-y-2">
        <p id={idLegenda} className="text-sm font-semibold text-foreground">{t("pessoasPagina.call.next")}</p>
        {resultado === null ? (
          <p className="text-sm text-muted-foreground">{t("pessoasPagina.call.nextWait")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {passos.map((p) => {
              const escolhido = valor === p;
              return (
                <label key={p} className="relative flex cursor-pointer">
                  <input type="radio" name={nome} className="peer sr-only" checked={escolhido} onChange={() => aoEscolher(p)} />
                  <span className={classeCartao(escolhido)}>
                    {t(`pessoasPagina.step.${p}`)}
                    {ehRecomendado(resultado, p) && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{t("pessoasPagina.call.recommended")}</span>
                    )}
                    <Visto escolhido={escolhido} />
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      {valor === "marcarVisita" && candidatos.length > 1 && aoEscolherPedido && (
        <SeletorPedido candidatos={candidatos} todos={pedidos} valor={pedidoId} aoEscolher={aoEscolherPedido} />
      )}
      {destino && <p className="text-sm text-muted-foreground">{t("pessoasPagina.call.visitGoes", { request: nomeDoPedido(t, destino, pedidos) })}</p>}
    </div>
  );
}
