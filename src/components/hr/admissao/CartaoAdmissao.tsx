/**
 * O cartao de um processo no pipeline: quem e, o cargo, os DOIS selos (admissao e portal), a validade do link, quando foi
 * submetida ou devolvida, a faixa de progresso e a acao «Rever».
 *
 * So metadados, os que `rpc_hr_admissao_listar` devolve: nunca o token, o rascunho nem os dados da submissao. O e-mail de
 * destino NAO esta aqui porque a lista nao o traz (esta na ficha, no cartao do convite). Para quem nao tem
 * `hr.onboarding.restrito`, um processo cancelado ou rejeitado chega `terminado`: so se sabe que terminou, sem datas e sem
 * revisao.
 */
import { ClipboardCheck, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { FaixaProgressoAdmissao } from "@/components/hr/admissao/FaixaProgressoAdmissao";
import { fraseDoPortal } from "@/components/hr/admissao/aspectoSelos";
import { SelosAdmissao } from "@/components/hr/admissao/SelosAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import type { ItemPipeline } from "@/lib/hr/admissaoPipeline";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import { cn } from "@/lib/utils";

interface CartaoAdmissaoProps {
  item: ItemPipeline;
  /** `hr.onboarding.approve`: so quem pode aprovar abre a revisao (a base recusaria com HRA31). */
  podeRever: boolean;
  aoRever: (item: ItemPipeline) => void;
  aoAbrirFicha: (pessoaId: string) => void;
}

export function CartaoAdmissao({ item, podeRever, aoRever, aoAbrirFicha }: CartaoAdmissaoProps) {
  const { t } = useTranslation();
  const terminado = item.estado === "terminado";
  const frase = fraseDoPortal(t, item.estadoPortal, item.validUntil);
  const submetidoEm = formatarDataHora(item.submetidoEm);
  const devolvidaEm = formatarDataHora(item.devolvidaEm);
  const revisavel = podeRever && !terminado && item.estado !== "desconhecido";

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <button
            type="button"
            onClick={() => aoAbrirFicha(item.pessoaId)}
            aria-label={t("rhAdm.cartao.abrirFicha", { nome: item.nome })}
            className={cn("relative min-h-11 min-w-0 rounded-sm text-left text-sm font-medium hover:underline", FOCO)}
          >
            {item.nome}
          </button>
          {!terminado && (
            <p className="text-sm text-muted-foreground">{item.cargo ?? t("rhAdm.cartao.semCargo")}</p>
          )}
        </div>
        {revisavel && (
          <Button
            type="button"
            size="sm"
            variant={item.estado === "submetida" ? "default" : "outline"}
            className={cn("min-h-11 gap-2", FOCO)}
            aria-label={t("rhAdm.cartao.reverRotulo", { nome: item.nome })}
            onClick={() => aoRever(item)}
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {t("rhAdm.cartao.rever")}
          </Button>
        )}
      </div>

      <SelosAdmissao estado={item.estado} estadoPortal={item.estadoPortal} />

      <div className="space-y-1 text-sm">
        {item.estado === "submetida" && (
          <p className="flex items-center gap-1.5 font-medium">
            <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("rhAdm.cartao.esperaRH")}
          </p>
        )}
        {frase && <p>{frase}</p>}
        {submetidoEm && <p className="text-muted-foreground">{t("rhAdm.cartao.submetidoEm", { data: submetidoEm })}</p>}
        {devolvidaEm && <p className="text-muted-foreground">{t("rhAdm.cartao.devolvidaEm", { data: devolvidaEm })}</p>}
        {terminado && <p className="text-muted-foreground">{t("rhAdm.cartao.restrito")}</p>}
      </div>

      <FaixaProgressoAdmissao estado={item.estado} />
    </li>
  );
}
