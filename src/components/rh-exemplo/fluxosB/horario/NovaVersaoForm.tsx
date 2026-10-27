/**
 * Nova versao do horario: escolher o TIPO (padrao ou repartido, os unicos que a base guarda) e editar com o editor
 * desse tipo. Grava por ALTERAR (`savePlaneado`): vale a partir de hoje, a regra em curso fecha na vespera e o passado
 * nunca se apaga. Nao ha data de efeito, motivo nem anexo porque a base nao tem onde os guardar; corrigir o passado
 * faz-se no historico, intervalo a intervalo.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { EditorDoTipo } from "@/components/rh-exemplo/fluxosB/horario/EditoresTipo";
import type { LinhaPlaneadoParaGravar } from "@/components/rh-exemplo/lib/horario";
import { configInicialReal, configDaVersao, linhasParaNovaVersao, TIPOS_REAIS, type TipoReal, type VersaoReal } from "@/components/rh-exemplo/lib/horarioReal";
import type { ConfigHorario } from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

interface NovaVersaoFormProps {
  /** A versao em vigor, de onde parte o formulario. Sem ela (ou se nao couber num tipo) parte do padrao por omissao. */
  versaoBase: VersaoReal | null;
  editaveis: readonly HorarioPlaneado[];
  aGravar: boolean;
  onGuardar: (linhas: LinhaPlaneadoParaGravar[]) => Promise<string | null>;
  onFechar: () => void;
  idPrefixo?: string;
}

function EscolhaDoTipo(props: { tipo: string; onChange: (tipo: TipoReal) => void; idPrefixo: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("rhExemplo.hor.tipo.titulo")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {TIPOS_REAIS.map((valor) => (
          <label
            key={valor}
            className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input
              type="radio"
              name={`${props.idPrefixo}-tipo`}
              className="mt-0.5 h-5 w-5 accent-primary"
              checked={props.tipo === valor}
              onChange={() => props.onChange(valor)}
            />
            <span>
              <span className="block font-medium">{t(`rhExemplo.hor.tipo.${valor}`)}</span>
              <span className="block text-muted-foreground">{t(`rhExemplo.hor.tipo.${valor}Descricao`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function NovaVersaoForm({ versaoBase, editaveis, aGravar, onGuardar, onFechar, idPrefixo = "rhb-nv" }: NovaVersaoFormProps) {
  const { t } = useTranslation();
  const configDaBase = versaoBase ? configDaVersao(versaoBase) : null;
  const [config, setConfig] = useState<ConfigHorario>(() => configDaBase ?? configInicialReal());
  const [erro, setErro] = useState<string | null>(null);
  const baseNaoRepresentavel = versaoBase !== null && configDaBase === null;

  const guardar = async () => {
    const linhas = linhasParaNovaVersao(editaveis, config);
    if (linhas.ok === false) {
      setErro(t(linhas.erro));
      return;
    }
    const falha = await onGuardar(linhas.valor);
    if (falha) {
      setErro(t("rhExemplo.hor.real.erroGravar", { erro: falha }));
      return;
    }
    setErro(null);
    toast.success(t("rhExemplo.hor.versaoGravada"));
    onFechar();
  };

  return (
    <section aria-label={t("rhExemplo.hor.novaVersaoTitulo")} className="space-y-4 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{t("rhExemplo.hor.novaVersaoTitulo")}</h3>
      <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.real.ajudaNovaVersao")}</p>
      {baseNaoRepresentavel && (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
          {t("rhExemplo.hor.real.baseNaoRepresentavel")}
        </p>
      )}
      <EscolhaDoTipo
        tipo={config.tipo}
        onChange={(tipo) => setConfig({ ...config, tipo })}
        idPrefixo={idPrefixo}
      />
      <EditorDoTipo config={config} onChange={setConfig} idPrefixo={idPrefixo} disabled={aGravar} />

      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={aGravar} onClick={() => void guardar()}>
          {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t("rhExemplo.hor.guardarVersao")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={aGravar} onClick={onFechar}>
          {t("common.cancel")}
        </Button>
      </div>
    </section>
  );
}
