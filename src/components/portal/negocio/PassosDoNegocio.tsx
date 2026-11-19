// Os passos do cliente no portal, iguais aos da pré-visualização «Ver como o cliente» da ficha do negócio (src/emylia/PortalCliente.tsx):
// barra de 5 passos e cartão «Passo n de 5». Só apresentação: o passo vem da proposta e do contrato reais do negócio.
import { formatCurrency } from "@/lib/utils";
import { usePortalT } from "@/portal-i18n";

/** Cada passo guarda as CHAVES dos textos (nome, título e texto); quem mostra traduz com `t()` no idioma de então. */
export const PASSOS_PORTAL = [
  { id: 1, nome: "pc.negocios.passos.1.nome", titulo: "pc.negocios.passos.1.titulo", texto: "pc.negocios.passos.1.texto" },
  { id: 2, nome: "pc.negocios.passos.2.nome", titulo: "pc.negocios.passos.2.titulo", texto: "pc.negocios.passos.2.texto" },
  { id: 3, nome: "pc.negocios.passos.3.nome", titulo: "pc.negocios.passos.3.titulo", texto: "pc.negocios.passos.3.texto" },
  { id: 4, nome: "pc.negocios.passos.4.nome", titulo: "pc.negocios.passos.4.titulo", texto: "pc.negocios.passos.4.texto" },
  { id: 5, nome: "pc.negocios.passos.5.nome", titulo: "pc.negocios.passos.5.titulo", texto: "pc.negocios.passos.5.texto" },
] as const;

export type PassoPortal = 1 | 2 | 3 | 4 | 5;

/** O passo do cliente, a partir do estado da proposta e do contrato do negócio. Contrato assinado = obra em curso; proposta aceite = falta assinar. */
export function passoDoNegocio(propostaEstado?: string | null, contratoEstado?: string | null): PassoPortal {
  if (contratoEstado === "signed" || contratoEstado === "active") return 4;
  if (propostaEstado === "accepted") return 3;
  return 1;
}

interface PassosDoNegocioProps {
  passo: PassoPortal;
  titulo: string;
  subtitulo?: string;
  total?: number | null;
  prazo?: string | null;
}

export function PassosDoNegocio({ passo, titulo, subtitulo, total, prazo }: PassosDoNegocioProps) {
  const { t } = usePortalT();
  const atual = PASSOS_PORTAL[passo - 1];
  return (
    <section aria-labelledby="portal-negocio-titulo" className="space-y-4">
      <div>
        <h2 id="portal-negocio-titulo" className="text-xl font-bold text-foreground">{titulo}</h2>
        {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      <ol aria-label={t("pc.negocios.passos.lista")} className="grid grid-cols-5 gap-2">
        {PASSOS_PORTAL.map((p) => {
          const feito = p.id < passo;
          const ativo = p.id === passo;
          return (
            <li key={p.id} aria-current={ativo ? "step" : undefined} className="min-w-0 space-y-1.5">
              <div className={`h-1.5 rounded-full ${feito || ativo ? "bg-primary" : "bg-muted"}`} aria-hidden="true" />
              <p className={`text-[11px] leading-tight sm:text-xs ${ativo ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {t(p.nome)}
                {feito && <span className="sr-only"> {t("pc.negocios.passos.feito")}</span>}
                {ativo && <span className="sr-only"> {t("pc.negocios.passos.atual")}</span>}
              </p>
            </li>
          );
        })}
      </ol>
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("pc.negocios.passos.passoDe", { passo, total: PASSOS_PORTAL.length })}</p>
          <h3 className="text-lg font-semibold text-foreground">{t(atual.titulo)}</h3>
          <p className="text-sm text-muted-foreground">{t(atual.texto)}</p>
        </div>
        {(total != null || prazo) && (
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-3">
            {total != null && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("pc.negocios.passos.totalComIva")}</dt>
                <dd className="text-lg font-bold text-foreground">{formatCurrency(total)}</dd>
              </div>
            )}
            {prazo && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("pc.negocios.passos.prazo")}</dt>
                <dd className="text-lg font-bold text-foreground">{prazo}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}
