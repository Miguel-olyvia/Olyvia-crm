// «Trocas com a pessoa» (lado do RH): o que o RH enviou, o que pediu e o que a pessoa pediu, com as ações a funcionar em
// memória: aceitar ou recusar (com motivo de pelo menos 3 caracteres) o que a pessoa enviou, e responder (enviar o
// documento ou recusar com motivo) ao que a pessoa pediu. Tudo se reflete já no portal da pessoa: é a mesma loja.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MotivoAdmissaoDialog } from "@/components/rh-exemplo/admissao/MotivoAdmissaoDialog";
import {
  rhAceitarPedido, rhPrepararPedidoDaPessoa, rhRecusarPedido, rhRecusarPedidoDaPessoa,
} from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import {
  estadoRecebido, type DocRecebido, type PedidoPessoa, type PedidoRh, type PortalPessoa,
} from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { SeloPedidoPessoa, SeloPedidoRh, SeloRecebido } from "./aspeto";
import { diaMes, diaMesDoDia, tituloPedidoPessoa, tituloPedidoRh } from "./textosPortal";
import { RhResponderPedidoDialog } from "./RhResponderPedidoDialog";

type Recusa = { tipo: "pedidoRh" | "pedidoPessoa"; id: string; titulo: string } | null;

function Linha({ testId, topo, selo, children }: { testId: string; topo: ReactNode; selo: ReactNode; children?: ReactNode }) {
  return (
    <li data-testid={testId} className="space-y-2 rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">{topo}</div>
        {selo}
      </div>
      {children}
    </li>
  );
}

function Seccao({ id, titulo, vazio, n, children }: { id: string; titulo: string; vazio: string; n: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h4 id={id} className="text-sm font-semibold">{titulo} ({n})</h4>
      {n === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

const BOTAO = cn("min-h-11", FOCO);

function EnviadosAPessoa({ recebidos, vistos }: { recebidos: DocRecebido[]; vistos: readonly string[] }) {
  const { t } = useTranslation();
  return (
    <Seccao id="rh-trocas-enviados" titulo={t("rhPortal.rh.trocas.enviados")} vazio={t("rhPortal.rh.trocas.enviadosVazio")} n={recebidos.length}>
      {recebidos.map((d) => (
        <Linha
          key={d.id} testId={`rh-recebido-${d.id}`} selo={<SeloRecebido estado={estadoRecebido(d, vistos)} recusado={d.recusa !== null} t={t} />}
          topo={<>
            <p className="font-medium">{d.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {t("rhPortal.recebidos.enviadoEm", { data: diaMes(d.enviadoEm) })}
              {d.precisaAssinatura && <> · {t("rhPortal.rh.trocas.precisaAssinatura")}</>}
              {d.origemPedidoId && <> · {t("rhPortal.recebidos.respostaAoPedido")}</>}
            </p>
          </>}
        >
          {d.recusa && <p role="status" className="text-sm">{t("rhPortal.rh.trocas.recusouAssinar", { motivo: d.recusa.motivo })}</p>}
        </Linha>
      ))}
    </Seccao>
  );
}

function PedidosAPessoa({ pedidos, aceitar, recusar }: { pedidos: PedidoRh[]; aceitar: (id: string) => void; recusar: (r: Recusa) => void }) {
  const { t } = useTranslation();
  return (
    <Seccao id="rh-trocas-pedidos" titulo={t("rhPortal.rh.trocas.pedidos")} vazio={t("rhPortal.rh.trocas.pedidosVazio")} n={pedidos.length}>
      {pedidos.map((p) => {
        const titulo = tituloPedidoRh(t, p);
        return (
          <Linha
            key={p.id} testId={`rh-pedido-${p.id}`} selo={<SeloPedidoRh estado={p.estado} t={t} />}
            topo={<>
              <p className="font-medium">{titulo}</p>
              <p className="text-xs text-muted-foreground">{t("rhPortal.pedidosRh.prazo", { data: diaMesDoDia(p.prazo) })}</p>
            </>}
          >
            {p.ficheiros.length > 0 && <p className="text-xs text-muted-foreground">{t("rhPortal.rh.trocas.ficheiros", { lista: p.ficheiros.join(", ") })}</p>}
            {p.estado === "recusado" && p.motivoRecusa && <p role="status" className="text-sm">{t("rhPortal.pedidosRh.recusadoMotivo", { motivo: p.motivoRecusa })}</p>}
            {p.estado === "enviado" && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className={BOTAO} aria-label={t("rhPortal.rh.trocas.aceitarAria", { titulo })} onClick={() => aceitar(p.id)}>
                  {t("rhPortal.rh.trocas.aceitar")}
                </Button>
                <Button type="button" size="sm" variant="outline" className={cn(BOTAO, "text-destructive")} aria-label={t("rhPortal.rh.trocas.recusarAria", { titulo })} onClick={() => recusar({ tipo: "pedidoRh", id: p.id, titulo })}>
                  {t("rhPortal.rh.trocas.recusar")}
                </Button>
              </div>
            )}
          </Linha>
        );
      })}
    </Seccao>
  );
}

interface PedidosDaPessoaProps {
  pedidos: PedidoPessoa[];
  preparar: (id: string) => void;
  responder: (id: string, titulo: string) => void;
  recusar: (r: Recusa) => void;
}

function PedidosDaPessoa({ pedidos, preparar, responder, recusar }: PedidosDaPessoaProps) {
  const { t } = useTranslation();
  return (
    <Seccao id="rh-trocas-pessoa" titulo={t("rhPortal.rh.trocas.daPessoa")} vazio={t("rhPortal.rh.trocas.daPessoaVazio")} n={pedidos.length}>
      {pedidos.map((p) => {
        const titulo = tituloPedidoPessoa(t, p);
        const porTratar = p.estado === "pedido" || p.estado === "em_preparacao";
        return (
          <Linha
            key={p.id} testId={`rh-pedido-pessoa-${p.id}`} selo={<SeloPedidoPessoa estado={p.estado} t={t} />}
            topo={<>
              <p className="font-medium">{titulo}</p>
              <p className="text-xs text-muted-foreground">
                {t("rhPortal.meus.pedidoEm", { data: diaMes(p.criadoEm) })} · {t(`rhPortal.urgencia.${p.urgencia}`)}
              </p>
            </>}
          >
            {p.nota && <p className="text-sm text-muted-foreground">{p.nota}</p>}
            {p.estado === "recusado" && p.motivoRecusa && <p role="status" className="text-sm">{t("rhPortal.meus.recusadoMotivo", { motivo: p.motivoRecusa })}</p>}
            {porTratar && (
              <div className="flex flex-wrap gap-2">
                {p.estado === "pedido" && (
                  <Button type="button" size="sm" variant="outline" className={BOTAO} aria-label={t("rhPortal.rh.trocas.prepararAria", { titulo })} onClick={() => preparar(p.id)}>
                    {t("rhPortal.rh.trocas.preparar")}
                  </Button>
                )}
                <Button type="button" size="sm" className={BOTAO} aria-label={t("rhPortal.rh.trocas.responderAria", { titulo })} onClick={() => responder(p.id, titulo)}>
                  {t("rhPortal.rh.trocas.responder")}
                </Button>
                <Button type="button" size="sm" variant="outline" className={cn(BOTAO, "text-destructive")} aria-label={t("rhPortal.rh.trocas.recusarAria", { titulo })} onClick={() => recusar({ tipo: "pedidoPessoa", id: p.id, titulo })}>
                  {t("rhPortal.rh.trocas.recusar")}
                </Button>
              </div>
            )}
          </Linha>
        );
      })}
    </Seccao>
  );
}

/** `recebidos` já traz o contrato (se o RH o gerou) à cabeça, como a pessoa o vê. */
export function RhTrocasLista({ pessoaId, portal, recebidos }: { pessoaId: string; portal: PortalPessoa; recebidos: DocRecebido[] }) {
  const { t } = useTranslation();
  const [recusa, setRecusa] = useState<Recusa>(null);
  const [responder, setResponder] = useState<{ id: string; titulo: string } | null>(null);

  const confirmarRecusa = (motivo: string): boolean => {
    if (!recusa) return false;
    const r = recusa.tipo === "pedidoRh" ? rhRecusarPedido(pessoaId, recusa.id, motivo) : rhRecusarPedidoDaPessoa(pessoaId, recusa.id, motivo);
    return r.ok;
  };

  return (
    <div className="space-y-4" data-testid="rh-trocas">
      <PedidosAPessoa pedidos={portal.pedidosRh} aceitar={(id) => rhAceitarPedido(pessoaId, id)} recusar={setRecusa} />
      <PedidosDaPessoa
        pedidos={portal.pedidosPessoa} preparar={(id) => rhPrepararPedidoDaPessoa(pessoaId, id)}
        responder={(id, titulo) => setResponder({ id, titulo })} recusar={setRecusa}
      />
      <EnviadosAPessoa recebidos={recebidos} vistos={portal.vistos} />
      <MotivoAdmissaoDialog
        aberto={recusa !== null} titulo={t("rhPortal.rh.trocas.recusarTitulo", { titulo: recusa?.titulo ?? "" })}
        descricao={t("rhPortal.rh.trocas.recusarSub")} confirmar={t("rhPortal.rh.trocas.recusar")}
        aoConfirmar={confirmarRecusa} aoFechar={() => setRecusa(null)}
      />
      <RhResponderPedidoDialog
        aberto={responder !== null} pessoaId={pessoaId} pedidoId={responder?.id ?? ""} titulo={responder?.titulo ?? ""}
        aoFechar={() => setResponder(null)}
      />
    </div>
  );
}
