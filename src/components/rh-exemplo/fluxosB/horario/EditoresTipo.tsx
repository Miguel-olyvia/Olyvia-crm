/**
 * O editor que corresponde a cada tipo de horario (fluxo 4): padrao (horas por dia da semana), repartido (dois
 * periodos com intervalo), isencao (sem controlo de picagem, so a marca e as horas de referencia), livre (so o
 * total de horas por semana) e banco de horas (como o padrao, mais os limites do saldo).
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { EditorBancoLimites } from "@/components/rh-exemplo/fluxosB/horario/EditorBancoLimites";
import {
  formatarHorasMinutos,
  ORDEM_SEMANA,
} from "@/components/rh-exemplo/fluxosB/horario/formatos";
import {
  minutosDoDiaPadrao,
  minutosPlaneadosDaSemana,
  type ConfigHorario,
  type DiaPadrao,
  type PeriodosRepartido,
} from "@/components/rh-exemplo/lib/horarioTipos";

interface EditorProps {
  config: ConfigHorario;
  onChange: (config: ConfigHorario) => void;
  idPrefixo: string;
  disabled?: boolean;
}

const CLASSE_CAMPO = "min-h-11";

function CampoNumero(props: {
  id: string;
  rotulo: string;
  valor: number;
  onChange: (valor: number) => void;
  disabled?: boolean;
  passo?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.rotulo}</Label>
      <Input
        id={props.id}
        type="number"
        inputMode="decimal"
        min={0}
        step={props.passo ?? 1}
        className={CLASSE_CAMPO}
        disabled={props.disabled}
        value={Number.isFinite(props.valor) ? props.valor : ""}
        onChange={(e) => props.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
      />
    </div>
  );
}

function CampoHora(props: { id: string; rotulo: string; valor: string; onChange: (valor: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.rotulo}</Label>
      <Input id={props.id} type="time" className={CLASSE_CAMPO} disabled={props.disabled} value={props.valor} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

/** Os sete dias da semana como caixas, de segunda a domingo. */
function DiasDaSemana(props: { dias: number[]; onChange: (dias: number[]) => void; idPrefixo: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const alternar = (dia: number) =>
    props.onChange(props.dias.includes(dia) ? props.dias.filter((d) => d !== dia) : [...props.dias, dia].sort((a, b) => a - b));
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{t("rhExemplo.hor.diasDeTrabalho")}</legend>
      <div className="flex flex-wrap gap-2">
        {ORDEM_SEMANA.map((dia) => (
          <label key={dia} className="flex min-h-11 min-w-14 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              id={`${props.idPrefixo}-dia-${dia}`}
              className="h-5 w-5 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              checked={props.dias.includes(dia)}
              disabled={props.disabled}
              onChange={() => alternar(dia)}
            />
            {t(`rhExemplo.hor.dia.${dia}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function GradePadrao({ config, onChange, idPrefixo, disabled }: EditorProps) {
  const { t } = useTranslation();
  const mudarDia = (dia: number, parcial: Partial<DiaPadrao>) =>
    onChange({ ...config, padrao: config.padrao.map((d, i) => (i === dia ? { ...d, ...parcial } : d)) });
  return (
    <div className="space-y-2">
      {ORDEM_SEMANA.map((dia) => {
        const linha = config.padrao[dia];
        const id = `${idPrefixo}-pad-${dia}`;
        return (
          <div key={dia} className="grid grid-cols-2 items-end gap-2 rounded-md border p-2 sm:grid-cols-6">
            <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium sm:col-span-1">
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                checked={linha.trabalha}
                disabled={disabled}
                onChange={(e) => mudarDia(dia, { trabalha: e.target.checked })}
              />
              {t(`rhExemplo.hor.dia.${dia}`)}
            </label>
            <CampoHora id={`${id}-entrada`} rotulo={t("rhExemplo.hor.entrada")} valor={linha.entrada} disabled={disabled || !linha.trabalha} onChange={(v) => mudarDia(dia, { entrada: v })} />
            <CampoHora id={`${id}-saida`} rotulo={t("rhExemplo.hor.saida")} valor={linha.saida} disabled={disabled || !linha.trabalha} onChange={(v) => mudarDia(dia, { saida: v })} />
            <CampoNumero id={`${id}-pausa`} rotulo={t("rhExemplo.hor.pausaMin")} valor={linha.pausaMin} disabled={disabled || !linha.trabalha} onChange={(v) => mudarDia(dia, { pausaMin: v })} />
            <p className="col-span-2 pb-3 text-sm tabular-nums text-muted-foreground">
              {t("rhExemplo.hor.horasDoDia", { horas: formatarHorasMinutos(minutosDoDiaPadrao(linha)) })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function EditorRepartido({ config, onChange, idPrefixo, disabled }: EditorProps) {
  const { t } = useTranslation();
  const r = config.repartido;
  const mudar = (parcial: Partial<PeriodosRepartido>) => onChange({ ...config, repartido: { ...r, ...parcial } });
  return (
    <div className="space-y-3">
      <DiasDaSemana dias={r.dias} onChange={(dias) => mudar({ dias })} idPrefixo={`${idPrefixo}-rep`} disabled={disabled} />
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="grid grid-cols-2 gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t("rhExemplo.hor.periodo1")}</legend>
          <CampoHora id={`${idPrefixo}-p1i`} rotulo={t("rhExemplo.hor.entrada")} valor={r.p1Inicio} disabled={disabled} onChange={(v) => mudar({ p1Inicio: v })} />
          <CampoHora id={`${idPrefixo}-p1f`} rotulo={t("rhExemplo.hor.saida")} valor={r.p1Fim} disabled={disabled} onChange={(v) => mudar({ p1Fim: v })} />
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t("rhExemplo.hor.periodo2")}</legend>
          <CampoHora id={`${idPrefixo}-p2i`} rotulo={t("rhExemplo.hor.entrada")} valor={r.p2Inicio} disabled={disabled} onChange={(v) => mudar({ p2Inicio: v })} />
          <CampoHora id={`${idPrefixo}-p2f`} rotulo={t("rhExemplo.hor.saida")} valor={r.p2Fim} disabled={disabled} onChange={(v) => mudar({ p2Fim: v })} />
        </fieldset>
      </div>
      <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.repartidoAjuda")}</p>
    </div>
  );
}

function EditorIsencaoOuLivre({ config, onChange, idPrefixo, disabled }: EditorProps) {
  const { t } = useTranslation();
  const chave = config.tipo === "isencao" ? "isencao" : "livre";
  const valor = config[chave];
  const mudar = (parcial: Partial<typeof valor>) => onChange({ ...config, [chave]: { ...valor, ...parcial } });
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {t(chave === "isencao" ? "rhExemplo.hor.isencaoAjuda" : "rhExemplo.hor.livreAjuda")}
      </p>
      <DiasDaSemana dias={valor.dias} onChange={(dias) => mudar({ dias })} idPrefixo={`${idPrefixo}-${chave}`} disabled={disabled} />
      <div className="max-w-xs">
        <CampoNumero id={`${idPrefixo}-horas`} rotulo={t("rhExemplo.hor.horasSemanais")} valor={valor.horasSemanais} passo={0.5} disabled={disabled} onChange={(v) => mudar({ horasSemanais: v })} />
      </div>
    </div>
  );
}

export function EditorDoTipo(props: EditorProps) {
  const { t } = useTranslation();
  const { config } = props;
  const total = minutosPlaneadosDaSemana(config);
  return (
    <div className="space-y-3">
      {(config.tipo === "padrao" || config.tipo === "banco") && <GradePadrao {...props} />}
      {config.tipo === "banco" && <EditorBancoLimites {...props} />}
      {config.tipo === "repartido" && <EditorRepartido {...props} />}
      {(config.tipo === "isencao" || config.tipo === "livre") && <EditorIsencaoOuLivre {...props} />}
      <p className="text-sm font-medium tabular-nums" aria-live="polite">
        {t("rhExemplo.hor.totalSemanal", { horas: formatarHorasMinutos(total) })}
      </p>
    </div>
  );
}
