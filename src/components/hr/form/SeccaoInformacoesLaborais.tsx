/**
 * Passo 3 -- Informacoes laborais: encaixar a pessoa na estrutura da empresa.
 *
 * "Quem reporta a" pertence a este passo e nao ao organograma: e no momento da
 * admissao que se sabe a resposta, e e o unico momento em que alguem a escreve
 * espontaneamente.
 *
 * O LOCAL DE TRABALHO E UM SELECTOR, ja nao texto livre. Sem locais criados o
 * selector nao finge que "nao ha nada": diz que ainda nao ha locais e, a quem
 * pode, oferece criar um ali mesmo. O campo aceita ficar vazio -- vazio
 * significa "o local predefinido da pessoa".
 *
 * "Entidade legal" NAO existe aqui: e sempre a da organizacao activa.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import type { RascunhoLaborais } from "@/lib/hr/novaPessoa";
import { TIPOS_LOCAL, type LocalTrabalho, type TipoLocal } from "@/types/hr";

interface SeccaoInformacoesLaboraisProps {
  valor: RascunhoLaborais;
  onPatch: (patch: Partial<RascunhoLaborais>) => void;
  erroDe: (campoId: string) => string | null;
  locais: LocalTrabalho[];
  locaisALoad: boolean;
  podeCriarLocal: boolean;
  onCriarLocal: (dados: { nome: string; tipo: TipoLocal }) => Promise<string>;
  colegas: Array<{ id: string; nome_completo: string }>;
}

export function SeccaoInformacoesLaborais({
  valor,
  onPatch,
  erroDe,
  locais,
  locaisALoad,
  podeCriarLocal,
  onCriarLocal,
  colegas,
}: SeccaoInformacoesLaboraisProps) {
  const { t } = useTranslation();
  const [dialogoLocal, setDialogoLocal] = useState(false);
  const [nomeNovoLocal, setNomeNovoLocal] = useState("");
  const [tipoNovoLocal, setTipoNovoLocal] = useState<TipoLocal>("escritorio");
  const [aCriarLocal, setACriarLocal] = useState(false);

  const criarLocal = async () => {
    if (nomeNovoLocal.trim() === "") {
      toast.error(t("hr.locais.erroNomeVazio"));
      return;
    }
    setACriarLocal(true);
    try {
      const id = await onCriarLocal({ nome: nomeNovoLocal, tipo: tipoNovoLocal });
      onPatch({ local_id: id });
      toast.success(t("hr.locais.criado"));
      setNomeNovoLocal("");
      setDialogoLocal(false);
    } catch (e) {
      toast.error(await getFriendlyErrorMessage(e, t("hr.erros.guardar")));
    } finally {
      setACriarLocal(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="hr-novo-cargo"
          label={t("hr.columns.cargo")}
          ajuda={t("hr.form.ajudaCargo")}
          valor={valor.cargo}
          onChange={(v) => onPatch({ cargo: v })}
        />

        <div className="space-y-1.5">
          <CampoSelect
            id="hr-novo-local"
            label={t("hr.laborais.local")}
            valor={valor.local_id}
            vazioLabel={t("hr.horario.localPredefinido")}
            placeholder={
              locaisALoad
                ? t("common.loading")
                : locais.length === 0
                  ? t("hr.locais.semLocais")
                  : undefined
            }
            disabled={locaisALoad}
            opcoes={locais.map((local) => ({ value: local.id, label: local.nome }))}
            onChange={(v) => onPatch({ local_id: v })}
          />
          {locais.length === 0 && !locaisALoad && (
            <p className="text-xs text-muted-foreground">
              {podeCriarLocal ? t("hr.locais.semLocaisPodeCriar") : t("hr.locais.semLocaisPedir")}
            </p>
          )}
          {podeCriarLocal && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setDialogoLocal(true)}
            >
              <MapPin className="mr-1 h-3.5 w-3.5" />
              {t("hr.locais.criar")}
            </Button>
          )}
        </div>

        <CampoSelect
          id="hr-novo-reporta-a"
          label={t("hr.detalhes.reportaA")}
          valor={valor.reporta_a_pessoa_id}
          vazioLabel={t("employees.form.noSupervisor")}
          placeholder={colegas.length === 0 ? t("hr.form.primeiraPessoa") : undefined}
          opcoes={colegas.map((colega) => ({ value: colega.id, label: colega.nome_completo }))}
          onChange={(v) => onPatch({ reporta_a_pessoa_id: v })}
        />
        <CampoTexto
          id="hr-novo-data-admissao"
          label={t("employees.form.hireDate")}
          tipo="date"
          valor={valor.data_admissao}
          erro={erroDe("hr-novo-data-admissao")}
          onChange={(v) => onPatch({ data_admissao: v })}
        />
        <CampoTexto
          id="hr-novo-data-antiguidade"
          label={t("hr.laborais.dataAntiguidade")}
          ajuda={t("hr.form.ajudaAntiguidade")}
          tipo="date"
          valor={valor.data_antiguidade}
          onChange={(v) => onPatch({ data_antiguidade: v })}
        />
      </div>

      <Dialog open={dialogoLocal} onOpenChange={setDialogoLocal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.locais.criar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoTexto
              id="hr-novo-local-nome"
              label={t("hr.locais.nome")}
              valor={nomeNovoLocal}
              onChange={setNomeNovoLocal}
            />
            <CampoSelect
              id="hr-novo-local-tipo"
              label={t("hr.locais.tipo")}
              valor={tipoNovoLocal}
              opcoes={TIPOS_LOCAL.map((tipo) => ({
                value: tipo,
                label: t(`hr.locais.tipos.${tipo}`),
              }))}
              onChange={(v) => setTipoNovoLocal(v as TipoLocal)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoLocal(false)} disabled={aCriarLocal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={criarLocal} disabled={aCriarLocal}>
              {aCriarLocal && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
