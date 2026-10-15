// A aba «Pedidos do RH» do portal: o que o RH pede à pessoa (cartão de cidadão, comprovativo de IBAN, fotografia...), cada um
// com prazo e estado (Por enviar, Enviado, Aceite, Recusado com motivo). «Enviar» abre o seletor de ficheiros simulado (só os
// nomes, no máximo 4 por documento). Em baixo, o histórico «Enviados por mim».
import { useState } from "react";
import { CalendarClock, ClipboardList, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enviarFicheirosPeloLink } from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import { HOJE_EXEMPLO_RH } from "@/components/rh-exemplo/dados/hojeExemplo";
import {
  chaveErroPortal, pedidoRhAtrasado, pedidoRhPedeAcao, type PedidoRh,
} from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { SeloPedidoRh } from "./aspeto";
import { diaMes, diaMesDoDia, tituloPedidoRh } from "./textosPortal";
import { SeletorFicheiros } from "./SeletorFicheiros";

function FormularioEnvio({ token, pedido, aoEnviar }: { token: string | undefined; pedido: PedidoRh; aoEnviar: () => void }) {
  const { t } = useTranslation();
  const [nomes, setNomes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const tipo = pedido.tipo === "outro" ? "cartao_cidadao" : pedido.tipo;
  const enviar = () => {
    const r = enviarFicheirosPeloLink(token, pedido.id, nomes);
    if (r.ok) return aoEnviar();
    setErro(t(chaveErroPortal(r.erro)));
  };
  return (
    <div className="space-y-3 rounded-md border p-3">
      <SeletorFicheiros nomes={nomes} aoMudar={(n) => { setNomes(n); setErro(null); }} tipo={tipo} />
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <Button type="button" className="min-h-11" onClick={enviar}>{t("rhPortal.pedidosRh.enviarFicheiros")}</Button>
    </div>
  );
}

function ItemPorTratar({ token, pedido }: { token: string | undefined; pedido: PedidoRh }) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const atrasado = pedidoRhAtrasado(pedido, HOJE_EXEMPLO_RH);
  const titulo = tituloPedidoRh(t, pedido);
  return (
    <li data-testid={`pedido-rh-${pedido.id}`} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-medium">{titulo}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("rhPortal.pedidosRh.prazo", { data: diaMesDoDia(pedido.prazo) })}
            {atrasado && <span className="font-medium text-destructive"> · {t("rhPortal.pedidosRh.atrasado")}</span>}
          </p>
        </div>
        <SeloPedidoRh estado={pedido.estado} t={t} />
      </div>
      {pedido.nota && <p className="text-sm text-muted-foreground">{pedido.nota}</p>}
      {pedido.estado === "recusado" && pedido.motivoRecusa && (
        <p role="status" className="rounded-md border-l-4 border-destructive bg-destructive/5 px-3 py-1.5 text-sm">
          {t("rhPortal.pedidosRh.recusadoMotivo", { motivo: pedido.motivoRecusa })}
        </p>
      )}
      {pedidoRhPedeAcao(pedido) && (
        <>
          <Button
            type="button" variant={aberto ? "outline" : "default"} className={cn("min-h-11 gap-2", FOCO)} aria-expanded={aberto}
            aria-label={t("rhPortal.pedidosRh.enviarAria", { titulo })} onClick={() => setAberto(!aberto)}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {pedido.estado === "recusado" ? t("rhPortal.pedidosRh.enviarDeNovo") : t("rhPortal.pedidosRh.enviar")}
          </Button>
          {aberto && <FormularioEnvio token={token} pedido={pedido} aoEnviar={() => setAberto(false)} />}
        </>
      )}
    </li>
  );
}

function Historico({ enviados }: { enviados: PedidoRh[] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-enviados-titulo" className="space-y-2">
      <h3 id="portal-enviados-titulo" className="text-base font-semibold">{t("rhPortal.pedidosRh.enviadosPorMim")}</h3>
      <ul className="space-y-2">
        {enviados.map((p) => (
          <li key={p.id} data-testid={`enviado-${p.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-card p-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{tituloPedidoRh(t, p)}</p>
              <p className="text-xs text-muted-foreground">
                {p.enviadoEm ? t("rhPortal.pedidosRh.enviadoEm", { data: diaMes(p.enviadoEm) }) : ""} · {p.ficheiros.join(", ")}
              </p>
            </div>
            <SeloPedidoRh estado={p.estado} t={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PortalPedidosRh({ token, pedidos }: { token: string | undefined; pedidos: PedidoRh[] }) {
  const { t } = useTranslation();
  const porTratar = pedidos.filter(pedidoRhPedeAcao);
  const enviados = pedidos.filter((p) => !pedidoRhPedeAcao(p));
  return (
    <div className="space-y-6">
      {porTratar.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("rhPortal.pedidosRh.nada")}</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label={t("rhPortal.pedidosRh.lista")}>
          {porTratar.map((p) => <ItemPorTratar key={p.id} token={token} pedido={p} />)}
        </ul>
      )}
      {enviados.length > 0 && <Historico enviados={enviados} />}
    </div>
  );
}
