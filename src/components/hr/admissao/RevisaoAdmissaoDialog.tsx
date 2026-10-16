/**
 * A revisao do RH de uma admissao (P4 da V3a): SO DE CONSULTA. Mostra o estado do processo (os dois selos e a validade), o
 * que a pessoa submeteu com as diferencas contra a ficha (reentrada), NISS e IBAN so a pedido, os documentos, a ultima
 * devolucao, o que falta e o historico. Aprovar, devolver e rejeitar sao da V3b e estao desativados (`RevisaoDecisoes`).
 *
 * Abre quando recebe um `item`; `null` fecha e apaga tudo o que estava em memoria (incluindo um NISS ou IBAN revelado). A
 * leitura vem de `useRevisaoAdmissao` (`rever_ler`, atras de `hr.onboarding.approve`); a segunda leitura (`rever_sensivel`)
 * so corre quando o RH carrega em «Revelar», com `hr.onboarding.sensitive`.
 *
 * Acessibilidade: titulo e descricao do dialogo, foco devolvido a quem o abriu (`useDevolverFoco`), alvos de 44 px, erros em
 * `role="alert"` e em portugues (nunca o codigo nem o texto da base). Um so h1 na pagina: o dialogo usa h2 e h3.
 */
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { HistoricoAdmissao } from "@/components/hr/admissao/HistoricoAdmissao";
import { RevisaoAnexos, RevisaoDevolucao, RevisaoPendencias } from "@/components/hr/admissao/RevisaoComplementos";
import { RevisaoCampos } from "@/components/hr/admissao/RevisaoCampos";
import { RevisaoDecisoes } from "@/components/hr/admissao/RevisaoDecisoes";
import { RevisaoSensiveis } from "@/components/hr/admissao/RevisaoSensiveis";
import { fraseDoPortal } from "@/components/hr/admissao/aspectoSelos";
import { SelosAdmissao } from "@/components/hr/admissao/SelosAdmissao";
import { useDevolverFoco } from "@/components/hr/useDevolverFoco";
import { useRevisaoAdmissao, type EstadoRevisao } from "@/hooks/useRevisaoAdmissao";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { chaveDoErro, type ItemPipeline } from "@/lib/hr/admissaoPipeline";
import type { RevisaoAdmissao } from "@/lib/hr/admissaoRevisao";
import { cn } from "@/lib/utils";

interface RevisaoAdmissaoDialogProps {
  item: ItemPipeline | null;
  aoFechar: () => void;
}

/** O estado vem do resumo da base (o que ela diz agora); o item do pipeline so serve se o resumo nao o trouxe. */
function Estado({ item, revisao }: { item: ItemPipeline; revisao: RevisaoAdmissao }) {
  const { t } = useTranslation();
  const estado = revisao.estado ?? item.estado;
  const estadoPortal = revisao.estadoPortal ?? item.estadoPortal;
  const frase = fraseDoPortal(t, estadoPortal, revisao.validUntil ?? item.validUntil);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("rhAdm.revisao.estado")}</h3>
      <SelosAdmissao estado={estado} estadoPortal={estadoPortal} />
      {frase && <p className="text-sm">{frase}</p>}
    </section>
  );
}

interface CorpoProps {
  item: ItemPipeline;
  revisao: RevisaoAdmissao;
  podeRevelar: boolean;
  revelar: EstadoRevisao["revelar"];
}

function Corpo({ item, revisao, podeRevelar, revelar }: CorpoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <Estado item={item} revisao={revisao} />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("rhAdm.revisao.dados")}</h3>
        <RevisaoCampos campos={revisao.campos} />
      </section>
      {/* `key` com o processo: mudar de processo recomeca com o NISS e o IBAN escondidos. */}
      <RevisaoSensiveis key={item.conviteId} niss={revisao.niss} iban={revisao.iban} podeRevelar={podeRevelar} revelar={revelar} />
      <RevisaoAnexos anexos={revisao.anexos} />
      {revisao.devolucao && <RevisaoDevolucao devolucao={revisao.devolucao} />}
      <RevisaoPendencias pendencias={revisao.pendencias} />
      <HistoricoAdmissao eventos={revisao.eventos} />
      <RevisaoDecisoes />
    </div>
  );
}

export function RevisaoAdmissaoDialog({ item, aoFechar }: RevisaoAdmissaoDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { carregando, erro, revisao, revelar, recarregar } = useRevisaoAdmissao(item?.conviteId ?? null);
  const aoFecharFoco = useDevolverFoco(item !== null);
  // O nome fica no titulo enquanto o dialogo se fecha; o resto sai logo da memoria.
  const ultimoNome = useRef("");
  if (item) ultimoNome.current = item.nome;

  return (
    <Dialog open={item !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={aoFecharFoco}>
        <DialogHeader>
          <DialogTitle>{t("rhAdm.revisao.titulo", { nome: item?.nome ?? ultimoNome.current })}</DialogTitle>
          <DialogDescription>{t("rhAdm.revisao.descricao")}</DialogDescription>
        </DialogHeader>

        {item && carregando && !revisao && <p className="text-sm text-muted-foreground">{t("rhAdm.revisao.carregando")}</p>}

        {item && erro && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3">
            <p className="text-sm text-destructive">{t(chaveDoErro(erro.codigo, "rhAdm.erro.revisaoGenerico"))}</p>
            <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={recarregar}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {item && revisao && (
          <Corpo item={item} revisao={revisao} podeRevelar={hasPermission("hr.onboarding.sensitive")} revelar={revelar} />
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={aoFechar}>
            {t("rhAdm.revisao.fechar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
