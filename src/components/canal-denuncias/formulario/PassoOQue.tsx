// Passo 1: o que aconteceu, quando e onde.
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { GrupoRadios } from "../comum/GrupoRadios";
import { MAX_DESCRICAO, MIN_DESCRICAO } from "../lib/formulario";
import { AINDA_ACONTECE, TIPOS, type TipoDenuncia } from "../lib/tipos";
import type { PassoProps } from "./PassoModo";

export function PassoOQue({ dados, erros, onChange }: PassoProps) {
  const { t } = useTranslation();
  const erro = (k: keyof typeof erros) => (erros[k] ? t(erros[k] as string) : undefined);
  const tamanho = dados.descricao.trim().length;
  return (
    <div className="space-y-4">
      <Campo id="den-tipo" rotulo={t("cd.campo.tipo")} obrigatorio erro={erro("tipo")}>
        {(a) => (
          <NativeSelect
            {...a}
            value={dados.tipo}
            placeholder={t("cd.campo.tipoEscolhe")}
            options={TIPOS.map((v) => ({ value: v, label: t(`cd.tipo.${v}`) }))}
            onValueChange={(v) => onChange({ tipo: v as TipoDenuncia })}
          />
        )}
      </Campo>
      <Campo
        id="den-descricao"
        rotulo={t("cd.campo.descricao")}
        obrigatorio
        erro={erro("descricao")}
        ajuda={t("cd.ajuda.descricao", { n: tamanho, max: MAX_DESCRICAO, min: MIN_DESCRICAO })}
      >
        {(a) => <Textarea {...a} rows={6} maxLength={MAX_DESCRICAO + 200} value={dados.descricao} onChange={(e) => onChange({ descricao: e.target.value })} />}
      </Campo>
      <Campo id="den-quando" rotulo={t("cd.campo.quando")} obrigatorio erro={erro("quando")} ajuda={t("cd.ajuda.quando")}>
        {(a) => <Input {...a} value={dados.quando} onChange={(e) => onChange({ quando: e.target.value })} />}
      </Campo>
      <GrupoRadios
        nome="den-ainda"
        legenda={t("cd.campo.aindaAcontece")}
        valor={dados.aindaAcontece}
        opcoes={AINDA_ACONTECE.map((v) => ({ valor: v, rotulo: t(`cd.resposta.${v}`) }))}
        onChange={(v) => onChange({ aindaAcontece: v })}
      />
      <Campo id="den-onde" rotulo={t("cd.campo.onde")} ajuda={t("cd.ajuda.onde")}>
        {(a) => <Input {...a} value={dados.onde} onChange={(e) => onChange({ onde: e.target.value })} />}
      </Campo>
    </div>
  );
}
