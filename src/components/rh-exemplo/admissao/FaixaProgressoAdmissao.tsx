// A faixa de progresso no topo da ficha de quem está em admissão: Convite, Ficha, Aprovação do RH, Contrato, Assinado, Acesso.
// Cada passo diz em texto se está feito, é o atual ou falta (o ícone e o texto, nunca só a cor); o atual leva aria-current.
import { Check, Circle, CircleDot, XCircle } from "lucide-react";
import { useAdmissao } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { passoDaFaixa } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const PASSOS = ["convite", "ficha", "aprovacao", "contrato", "assinado", "acesso"] as const;

export function FaixaProgressoAdmissao({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const adm = useAdmissao(pessoaId);
  if (!adm) return null;
  const atual = passoDaFaixa(adm.estado);
  const concluida = adm.estado === "acesso_ativo";
  const rejeitada = adm.estado === "rejeitada";
  return (
    <nav aria-label={t("rhAdm.faixa.rotulo")} className="px-6 pb-3">
      <ol className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2">
        {PASSOS.map((passo, i) => {
          const feito = i < atual || (concluida && i === atual);
          const eAtual = i === atual && !concluida;
          const Icone = rejeitada && eAtual ? XCircle : feito ? Check : eAtual ? CircleDot : Circle;
          return (
            <li
              key={passo} aria-current={eAtual ? "step" : undefined}
              className={cn(
                "flex min-h-7 items-center gap-1.5 text-xs",
                eAtual ? "font-semibold text-foreground" : feito ? "text-foreground" : "text-muted-foreground",
                rejeitada && eAtual && "text-destructive",
              )}
            >
              <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(`rhAdm.faixa.${passo}`)}
              <span className="sr-only">
                {` — ${t(rejeitada && eAtual ? "rhAdm.faixa.rejeitado" : feito ? "rhAdm.faixa.feito" : eAtual ? "rhAdm.faixa.atual" : "rhAdm.faixa.falta")}`}
              </span>
            </li>
          );
        })}
      </ol>
      {adm.emailConvite && <p className="mt-1 text-xs text-muted-foreground">{t("rhAdm.faixa.convitePara", { email: adm.emailConvite })}</p>}
    </nav>
  );
}
