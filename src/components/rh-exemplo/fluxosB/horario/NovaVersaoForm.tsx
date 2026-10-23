/**
 * Nova versao do horario (fluxo 4): escolher o TIPO (cinco), editar com o editor desse tipo, indicar a data de
 * efeito, o MOTIVO (obrigatorio) e um anexo opcional. A versao em vigor fecha na vespera; a antiga nunca se apaga.
 *
 * Em modo «corrigir» (uma versao que ja cobre o passado) nao ha data nem anexo: o botao abre a confirmacao com
 * autorizacao e motivo, e a linha corrigida fica marcada.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { gravarCorreccaoDeVersao, gravarNovaVersao } from "@/components/rh-exemplo/dados/accoesHorarioB";
import { MotivoMinimoDialog } from "@/components/rh-exemplo/fluxosB/MotivoMinimoDialog";
import { EditorDoTipo } from "@/components/rh-exemplo/fluxosB/horario/EditoresTipo";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import {
  MOTIVO_MINIMO_CARACTERES,
  TIPOS_HORARIO,
  type ConfigHorario,
  type TipoHorario,
  type VersaoHorario,
} from "@/components/rh-exemplo/lib/horarioTipos";

interface NovaVersaoFormProps {
  pessoaId: string;
  configBase: ConfigHorario;
  /** Presente = corrigir esta versao (passado) em vez de criar uma nova. */
  corrigir?: VersaoHorario;
  onFechar: () => void;
  idPrefixo?: string;
}

function EscolhaDoTipo(props: { tipo: TipoHorario; onChange: (tipo: TipoHorario) => void; idPrefixo: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("rhExemplo.hor.tipo.titulo")}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TIPOS_HORARIO.map((valor) => (
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

export function NovaVersaoForm({ pessoaId, configBase, corrigir, onFechar, idPrefixo = "rhb-nv" }: NovaVersaoFormProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConfigHorario>(configBase);
  const [desde, setDesde] = useState(hojeIso());
  const [motivo, setMotivo] = useState("");
  const [anexoNome, setAnexoNome] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarAberto, setConfirmarAberto] = useState(false);

  const guardarNova = () => {
    const resultado = gravarNovaVersao(pessoaId, { config, desde, motivo, anexoNome });
    setErro(resultado);
    if (resultado === null) {
      toast.success(t("rhExemplo.hor.versaoGravada"));
      onFechar();
    }
  };

  const confirmarCorreccao = (motivoEscrito: string): string | null => {
    if (!corrigir) return "rhExemplo.hor.erro.versaoInexistente";
    const resultado = gravarCorreccaoDeVersao(pessoaId, { versaoId: corrigir.id, config, motivo: motivoEscrito, autorizado: true });
    if (resultado === null) {
      toast.success(t("rhExemplo.hor.correccaoGravada"));
      onFechar();
    }
    return resultado;
  };

  return (
    <section aria-label={t(corrigir ? "rhExemplo.hor.corrigirTitulo" : "rhExemplo.hor.novaVersaoTitulo")} className="space-y-4 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{t(corrigir ? "rhExemplo.hor.corrigirTitulo" : "rhExemplo.hor.novaVersaoTitulo")}</h3>
      <EscolhaDoTipo tipo={config.tipo} onChange={(tipo) => setConfig({ ...config, tipo })} idPrefixo={idPrefixo} />
      <EditorDoTipo config={config} onChange={setConfig} idPrefixo={idPrefixo} />

      {!corrigir && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefixo}-desde`}>{t("rhExemplo.hor.dataDeEfeito")}</Label>
            <Input id={`${idPrefixo}-desde`} type="date" className="min-h-11" min={hojeIso()} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefixo}-anexo`}>{t("rhExemplo.hor.anexoOpcional")}</Label>
            <Input id={`${idPrefixo}-anexo`} type="file" className="min-h-11" onChange={(e) => setAnexoNome(e.target.files?.[0]?.name ?? null)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idPrefixo}-motivo`}>{t("rhExemplo.fluxosB.motivoObrigatorio", { minimo: String(MOTIVO_MINIMO_CARACTERES) })}</Label>
            <Textarea id={`${idPrefixo}-motivo`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(erro)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {corrigir ? (
          <Button type="button" className="min-h-11" onClick={() => setConfirmarAberto(true)}>
            {t("rhExemplo.hor.corrigirBotao")}
          </Button>
        ) : (
          <Button type="button" className="min-h-11" onClick={guardarNova}>
            {t("rhExemplo.hor.guardarVersao")}
          </Button>
        )}
        <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
          {t("common.cancel")}
        </Button>
      </div>

      <MotivoMinimoDialog
        aberto={confirmarAberto}
        titulo={t("rhExemplo.hor.corrigirConfirmarTitulo")}
        descricao={t("rhExemplo.hor.corrigirConfirmarDescricao")}
        rotuloConfirmar={t("rhExemplo.hor.corrigirBotao")}
        rotuloAutorizacao={t("rhExemplo.hor.autorizoCorrigir")}
        onConfirmar={confirmarCorreccao}
        onFechar={() => setConfirmarAberto(false)}
        idPrefixo={`${idPrefixo}-corr`}
      />
    </section>
  );
}
