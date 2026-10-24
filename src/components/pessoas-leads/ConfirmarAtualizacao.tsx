import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaBloqueio } from "@/hooks/pessoas/novaLead/tiposNovaLead";

const N = "pessoasPagina.real.newLead.dup.";

interface ConfirmarProps {
  pessoa: PessoaBloqueio;
  aGuardar: boolean;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}

/**
 * O segundo ecrã de «Atualizar dados»: diz exatamente o que vai mudar (o email e o telefone antigos e novos, os campos que se juntam à
 * lead, a lead que volta a Nova, a abordagem que se reabre). O foco começa em «Voltar»: confirmar é o passo que escreve.
 */
export function ConfirmarAtualizacao({ pessoa, aGuardar, aoConfirmar, aoVoltar }: ConfirmarProps) {
  const { t } = useTranslation();
  const voltar = useRef<HTMLButtonElement>(null);
  useEffect(() => voltar.current?.focus(), []);
  const plano = pessoa.atualizar;
  if (!plano) return null;
  const antigo = (v: string | null): string => v ?? t(`${N}notGiven`);
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">{t(`${N}confirm.title`, { name: pessoa.nome })}</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        {plano.email && <li>{t(`${N}confirm.email`, { old: antigo(plano.email.antigo), new: plano.email.novo })}</li>}
        {plano.telefone && <li>{t(`${N}confirm.phone`, { old: antigo(plano.telefone.antigo), new: plano.telefone.novo })}</li>}
        <li>{t(`${N}confirm.fields`)}</li>
        {plano.reabrirLead && <li>{t(`${N}confirm.reopenLead`)}</li>}
        {plano.reabrirAbordagem && <li>{t(`${N}confirm.reopenApproach`)}</li>}
      </ul>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button ref={voltar} type="button" variant="outline" className={`min-h-11 ${FOCO}`} disabled={aGuardar} onClick={aoVoltar}>
          {t(`${N}confirm.back`)}
        </Button>
        <Button type="button" className={`min-h-11 ${FOCO}`} disabled={aGuardar} aria-busy={aGuardar} onClick={aoConfirmar}>
          {aGuardar ? t(`${N}confirm.saving`) : t(`${N}confirm.ok`)}
        </Button>
      </div>
    </div>
  );
}
