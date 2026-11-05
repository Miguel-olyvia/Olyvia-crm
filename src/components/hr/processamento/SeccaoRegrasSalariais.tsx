/**
 * Configuracao > "Regras salariais": as regras da ORGANIZACAO, versionadas (20270107600000, Entrega B): subsidio de almoco, horas
 * extra e limite anual, IHT, km, ajudas de custo e as faixas de trabalho noturno. A regra em vigor, o historico de versoes e um
 * formulario que grava uma versao nova a partir de uma data, DEPOIS de confirmar o que muda.
 *
 * Ver quem tem `hr.vencimento.subsidio.view` ou `.codigos.view` (decidido pela pagina); gravar so quem tem
 * `hr.vencimento.codigos.gerir`. Enquanto a migration nao estiver aplicada as RPCs nao existem: diz-se numa linha calma
 * («Disponivel depois da proxima atualizacao da base»), sem erro vermelho, e o resto do ecra nao e afectado.
 * O calculo do processamento ainda NAO usa estas regras (Entrega C): o formulario di-lo.
 *
 * Acessibilidade: um so `role="alert"` (o resumo de erros, com ligacoes para os campos e o foco nele); os erros por campo ligam-se
 * por `aria-describedby`; as unidades dizem-se por extenso; a lista de faixas anuncia o que se adiciona e remove e leva o foco.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "@/hooks/useTranslation";
import { useRegrasSalariais } from "@/hooks/useRegrasSalariais";
import { hojeEmLisboa, localeDaLingua } from "@/lib/hr/periodoFolha";
import {
  diferencasDaRegra,
  faixaVazia,
  formDeRegra,
  MAX_FAIXAS,
  minutosDaHora,
  validarRegraSalarial,
  type CampoDaRegra,
  type DiferencasDaRegra,
  type ErrosRegraSalarial,
  type FaixaDoPayload,
  type FaixaForm,
  type FormRegraSalarial,
  type ModoDaFaixa,
  type PayloadRegraSalarial,
} from "@/lib/hr/regrasSalariais";
import { toast } from "@/lib/toast";
import type { RegraSalarial } from "@/types/hr";

type T = (chave: string, vars?: Record<string, string>) => string;

const ID_RESUMO = "regras-resumo-erros";
const ID_AJUDA_FAIXAS = "regras-faixas-ajuda";

/** Os campos pela ordem em que aparecem: a do resumo de erros. `id` e o do primeiro controlo; `rotulo` a chave do nome. */
const CAMPOS: ReadonlyArray<{ campo: string; id: string; rotulo: string; seccao?: string }> = [
  { campo: "limite", id: "regras-limiteHoras", rotulo: "hr.regrasSalariais.campoLimite", seccao: "hr.regrasSalariais.secSubsidio" },
  { campo: "valorHora", id: "regras-valorHora", rotulo: "hr.regrasSalariais.campoValorHora", seccao: "hr.regrasSalariais.secSubsidio" },
  { campo: "valorDia", id: "regras-valorDia", rotulo: "hr.regrasSalariais.campoValorDia", seccao: "hr.regrasSalariais.secSubsidio" },
  { campo: "hePctDiaUtil", id: "regras-hePctDiaUtil", rotulo: "hr.regrasSalariais.campoHePctDiaUtil", seccao: "hr.regrasSalariais.secHorasExtra" },
  { campo: "hePctFeriado", id: "regras-hePctFeriado", rotulo: "hr.regrasSalariais.campoHePctFeriado", seccao: "hr.regrasSalariais.secHorasExtra" },
  { campo: "hePctDescanso", id: "regras-hePctDescanso", rotulo: "hr.regrasSalariais.campoHePctDescanso", seccao: "hr.regrasSalariais.secHorasExtra" },
  { campo: "heLimiteHoras", id: "regras-heLimiteHoras", rotulo: "hr.regrasSalariais.campoHeLimite", seccao: "hr.regrasSalariais.secHorasExtra" },
  { campo: "ihtPct", id: "regras-ihtPct", rotulo: "hr.regrasSalariais.campoIht" },
  { campo: "kmValor", id: "regras-kmValor", rotulo: "hr.regrasSalariais.campoKm" },
  { campo: "ajudasDia", id: "regras-ajudasDia", rotulo: "hr.regrasSalariais.campoAjudas" },
];

/** Que campo do formulario corresponde a cada campo do payload, e como se escreve o valor. */
const DO_PAYLOAD: Record<CampoDaRegra, { campo: string; tipo: "duracao" | "pct" | "euros" }> = {
  subsidio_limite_min: { campo: "limite", tipo: "duracao" },
  subsidio_valor_hora: { campo: "valorHora", tipo: "euros" },
  subsidio_valor_dia: { campo: "valorDia", tipo: "euros" },
  he_pct_dia_util: { campo: "hePctDiaUtil", tipo: "pct" },
  he_pct_feriado: { campo: "hePctFeriado", tipo: "pct" },
  he_pct_descanso: { campo: "hePctDescanso", tipo: "pct" },
  he_limite_anual_min: { campo: "heLimiteHoras", tipo: "duracao" },
  iht_pct: { campo: "ihtPct", tipo: "pct" },
  km_valor: { campo: "kmValor", tipo: "euros" },
  ajudas_custo_dia: { campo: "ajudasDia", tipo: "euros" },
};

/** "22 de outubro de 2026" (por extenso, no idioma da interface). Sem hora, em UTC para nao andar um dia. */
function dataExtenso(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(d);
}

function horasEMinutos(minutos: number, t: T): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? t("hr.regrasSalariais.duracaoHoras", { h: String(h) }) : t("hr.regrasSalariais.duracaoHorasMinutos", { h: String(h), m: String(m) });
}

interface Unidade {
  /** O que se ve (curto). */
  curta: string;
  /** O que se le (por extenso). */
  extenso: string;
}

interface CampoProps {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  erro?: string;
  ajuda?: string;
  unidade?: Unidade;
  tipo?: "text" | "hora" | "date";
  /** Nome acessivel completo quando o rotulo visivel nao chega (ex.: «Faixa 2: de»). */
  nomeAcessivel?: string;
  /** Ids extra para aria-describedby (ajuda comum, erro de um campo irmao). */
  descritorExtra?: string;
  /** Marca o campo como invalido mesmo sem mostrar o erro aqui (o erro mostra-se no campo irmao). */
  invalido?: boolean;
}

/** Um campo com rotulo, ajuda, unidade e erro ligados por aria-describedby; o alvo tem 44 px. */
function Campo({ id, rotulo, valor, onChange, erro, ajuda, unidade, tipo = "text", nomeAcessivel, descritorExtra, invalido }: CampoProps) {
  const descritores = [ajuda ? `${id}-ajuda` : null, descritorExtra ?? null, unidade ? `${id}-unidade` : null, erro ? `${id}-erro` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={tipo === "hora" ? "text" : tipo}
          inputMode={tipo === "text" ? "decimal" : tipo === "hora" ? "numeric" : undefined}
          placeholder={tipo === "hora" ? "HH:MM" : undefined}
          maxLength={tipo === "hora" ? 5 : undefined}
          autoComplete="off"
          className="h-11 min-w-0"
          value={valor}
          aria-label={nomeAcessivel}
          aria-invalid={erro || invalido ? true : undefined}
          aria-describedby={descritores || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {unidade && (
          <span className="shrink-0 text-sm text-muted-foreground">
            <span aria-hidden="true">{unidade.curta}</span>
            <span id={`${id}-unidade`} className="sr-only">
              {unidade.extenso}
            </span>
          </span>
        )}
      </div>
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

interface Confirmacao {
  validoDe: string;
  payload: PayloadRegraSalarial;
  diferencas: DiferencasDaRegra;
}

export function SeccaoRegrasSalariais({ podeGerir }: { podeGerir: boolean }) {
  const { t, language } = useTranslation();
  const locale = localeDaLingua(language);
  const { versoes, emVigor, maisRecente, estado, isLoading, isSaving, guardar, recarregar } = useRegrasSalariais();
  // Calculado em cada render: depois da meia-noite o dia muda, e a data proposta com ele.
  const hoje = hojeEmLisboa();

  // A mais recente que vale (pode ser uma futura; as substituidas nao contam): e a ela que a base compara a data nova.
  const [edicao, setEdicao] = useState<FormRegraSalarial | null>(null);
  const [erros, setErros] = useState<ErrosRegraSalarial>({});
  const [foco, setFoco] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const form = edicao ?? formDeRegra(maisRecente, hoje);

  useEffect(() => {
    if (!foco) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const euros = (n: number): string => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
  const numero = (n: number): string => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);

  const mudar = (patch: Partial<FormRegraSalarial>, campoComErro?: string) => {
    setEdicao({ ...form, ...patch });
    if (campoComErro && erros[campoComErro]) {
      const { [campoComErro]: _tirado, ...resto } = erros;
      setErros(resto);
    }
  };
  const mudarFaixa = (chave: string, patch: Partial<FaixaForm>) => {
    const indice = form.faixas.findIndex((f) => f.chave === chave);
    mudar({ faixas: form.faixas.map((f) => (f.chave === chave ? { ...f, ...patch } : f)) });
    if (indice >= 0) {
      const { [`faixa.${indice}.horas`]: _h, [`faixa.${indice}.valor`]: _v, ...resto } = erros;
      setErros(resto);
    }
  };
  const adicionarFaixa = () => {
    const nova = faixaVazia();
    const total = form.faixas.length + 1;
    mudar({ faixas: [...form.faixas, nova] });
    setAnuncio(t("hr.regrasSalariais.faixaAdicionada", { n: String(total), total: String(total) }));
    setFoco(`regras-faixa-${nova.chave}-inicio`);
  };
  const removerFaixa = (chave: string) => {
    const i = form.faixas.findIndex((f) => f.chave === chave);
    // O foco nao se perde: vai para o «Remover» da faixa seguinte, ou da anterior, ou para o titulo da seccao.
    const vizinha = form.faixas[i + 1] ?? form.faixas[i - 1];
    mudar({ faixas: form.faixas.filter((f) => f.chave !== chave) });
    setErros((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("faixa."))));
    setAnuncio(t("hr.regrasSalariais.faixaRemovida", { total: String(form.faixas.length - 1) }));
    setFoco(vizinha ? `regras-faixa-${vizinha.chave}-remover` : "regras-secNoturnas");
  };

  /** As entradas do resumo de erros, pela ordem do ecra: o nome do campo, a mensagem e o controlo para onde saltar. */
  const entradasDeErro = (e: ErrosRegraSalarial): Array<{ id: string; rotulo: string; mensagem: string }> => {
    const lista: Array<{ id: string; rotulo: string; mensagem: string }> = [];
    for (const c of CAMPOS) {
      if (e[c.campo]) lista.push({ id: c.id, rotulo: t(c.rotulo), mensagem: t(e[c.campo]) });
    }
    form.faixas.forEach((f, i) => {
      const n = String(i + 1);
      if (e[`faixa.${i}.horas`]) lista.push({ id: `regras-faixa-${f.chave}-inicio`, rotulo: t("hr.regrasSalariais.faixaN", { n }), mensagem: t(e[`faixa.${i}.horas`]) });
      if (e[`faixa.${i}.valor`]) lista.push({ id: `regras-faixa-${f.chave}-valor`, rotulo: t("hr.regrasSalariais.faixaN", { n }), mensagem: t(e[`faixa.${i}.valor`]) });
    });
    if (e.validoDe) lista.push({ id: "regras-validoDe", rotulo: t("hr.regrasSalariais.campoValidoDe"), mensagem: t(e.validoDe) });
    if (e.faixas) lista.push({ id: "regras-faixa-adicionar", rotulo: t("hr.regrasSalariais.secNoturnas"), mensagem: t(e.faixas) });
    return lista;
  };

  // Passo 1: validar. Com erros, o foco vai para o resumo; sem erros, pede-se confirmacao (a regra move dinheiro).
  const submeter = () => {
    if (isSaving) return;
    const { erros: encontrados, payload } = validarRegraSalarial(form);
    setErros(encontrados);
    if (!payload) {
      setFoco(ID_RESUMO);
      return;
    }
    setConfirmacao({ validoDe: form.validoDe, payload, diferencas: diferencasDaRegra(maisRecente, payload) });
  };

  // Passo 2: so depois de confirmar.
  const gravar = async () => {
    if (!confirmacao) return;
    const { validoDe, payload } = confirmacao;
    setConfirmacao(null);
    const { erro } = await guardar(validoDe, payload);
    if (erro) {
      // Uma chave de traducao, ou ja uma mensagem escrita (t devolve a propria cadeia se a chave nao existir).
      toast.error(t(erro));
      setAnuncio(t(erro));
      return;
    }
    toast.success(t("hr.regrasSalariais.guardarSucesso"));
    setAnuncio(t("hr.regrasSalariais.guardarSucesso"));
    setEdicao(null);
    setErros({});
  };

  const e = (campo: string): string | undefined => (erros[campo] ? t(erros[campo]) : undefined);

  const valorDoCampo = (campo: CampoDaRegra, n: number | null): string => {
    if (n === null) return t("hr.regrasSalariais.confirmar.semRegra");
    const tipo = DO_PAYLOAD[campo].tipo;
    return tipo === "duracao" ? horasEMinutos(n, t) : tipo === "pct" ? `${numero(n)} %` : euros(n);
  };
  const faixaCurta = (f: FaixaDoPayload): string =>
    f.preco_hora !== undefined
      ? t("hr.regrasSalariais.faixaCurtaPreco", { inicio: f.hora_inicio, fim: f.hora_fim, valor: euros(f.preco_hora) })
      : t("hr.regrasSalariais.faixaCurtaPct", { inicio: f.hora_inicio, fim: f.hora_fim, valor: numero(f.percentagem ?? 0) });
  const listaDeFaixas = (l: FaixaDoPayload[]): string => (l.length === 0 ? t("hr.regrasSalariais.confirmar.nenhuma") : l.map(faixaCurta).join("; "));
  const rotuloDoCampo = (campo: string): string => {
    const c = CAMPOS.find((x) => x.campo === campo);
    return c ? `${c.seccao ? `${t(c.seccao)}: ` : ""}${t(c.rotulo)}` : campo;
  };

  const resumoDaFaixa = (f: RegraSalarial["noturnas"][number]): string =>
    f.preco_hora !== null && f.preco_hora !== undefined
      ? t("hr.regrasSalariais.faixaResumoPreco", { inicio: f.hora_inicio, fim: f.hora_fim, valor: euros(f.preco_hora) })
      : t("hr.regrasSalariais.faixaResumoPct", { inicio: f.hora_inicio, fim: f.hora_fim, valor: numero(f.percentagem ?? 0) });

  const estadoDaVersao = (v: RegraSalarial): string =>
    v.substituida_em
      ? t("hr.regrasSalariais.corrigida")
      : v.id === emVigor?.id
      ? t("hr.regrasSalariais.emVigor")
      : v.valido_de > hoje
        ? t("hr.regrasSalariais.futura")
        : t("hr.regrasSalariais.substituida");

  const nota = (chave: string) => (
    <p role="status" className="text-sm text-muted-foreground">
      {t(chave)}
    </p>
  );

  const entradas = entradasDeErro(erros);
  const pt = (n: string): string => t(`hr.regrasSalariais.${n}`);
  const unU = (curta: string, extensoChave: string): Unidade => ({ curta, extenso: pt(extensoChave) });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{pt("titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{pt("subtitulo")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <OlyviaLoader size={28} />
          </div>
        ) : estado === "indisponivel" ? (
          <p role="status" className="text-sm text-muted-foreground" data-testid="regras-salariais-indisponivel">
            {pt("indisponivel")}
          </p>
        ) : estado === "recusado" ? (
          nota("hr.regrasSalariais.recusado")
        ) : estado === "erro" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm font-medium text-destructive">
              {pt("erroLeitura")}
            </p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void recarregar()}>
              {t("rhExemplo.leitura.tentarDeNovo")}
            </Button>
          </div>
        ) : (
          <>
            <section aria-labelledby="regras-em-vigor" className="space-y-2" data-testid="regras-salariais-em-vigor">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{pt("emVigor")}</Badge>
                <h3 id="regras-em-vigor" className="text-sm font-medium">
                  {emVigor ? t("hr.regrasSalariais.valeDesde", { de: dataExtenso(emVigor.valido_de, locale) }) : pt("semRegra")}
                </h3>
              </div>
              {emVigor && (
                <ul className="space-y-1 text-sm">
                  <li>
                    {t("hr.regrasSalariais.resumoSubsidio", {
                      limite: horasEMinutos(emVigor.subsidio_limite_min, t),
                      valorHora: euros(emVigor.subsidio_valor_hora),
                      valorDia: euros(emVigor.subsidio_valor_dia),
                    })}
                  </li>
                  <li>
                    {t("hr.regrasSalariais.resumoHorasExtra", {
                      diaUtil: numero(emVigor.he_pct_dia_util),
                      feriado: numero(emVigor.he_pct_feriado),
                      descanso: numero(emVigor.he_pct_descanso),
                      limite: horasEMinutos(emVigor.he_limite_anual_min, t),
                    })}
                  </li>
                  <li>{t("hr.regrasSalariais.resumoIht", { pct: numero(emVigor.iht_pct) })}</li>
                  <li>{t("hr.regrasSalariais.resumoKm", { valor: euros(emVigor.km_valor) })}</li>
                  <li>{t("hr.regrasSalariais.resumoAjudas", { valor: euros(emVigor.ajudas_custo_dia) })}</li>
                  {emVigor.noturnas.length === 0 ? (
                    <li>{pt("resumoSemFaixas")}</li>
                  ) : (
                    emVigor.noturnas.map((f) => <li key={`${f.hora_inicio}-${f.hora_fim}`}>{resumoDaFaixa(f)}</li>)
                  )}
                </ul>
              )}
            </section>

            {podeGerir ? (
              <form
                className="space-y-6"
                noValidate
                aria-label={pt("formulario")}
                onSubmit={(ev) => {
                  ev.preventDefault();
                  submeter();
                }}
              >
                <p className="text-sm text-muted-foreground" data-testid="regras-salariais-aviso-calculo">
                  {pt("avisoCalculo")}
                </p>

                {/* Anuncios para leitores de ecra (faixa adicionada ou removida, resultado de gravar). */}
                <p role="status" className="sr-only" data-testid="regras-salariais-anuncio">
                  {anuncio}
                </p>

                {entradas.length > 0 && (
                  <div
                    id={ID_RESUMO}
                    role="alert"
                    tabIndex={-1}
                    className="space-y-2 rounded-md border border-destructive p-3"
                    data-testid="regras-salariais-resumo-erros"
                  >
                    <p className="text-sm font-medium text-destructive">{t("hr.regrasSalariais.erro.corrija", { n: String(entradas.length) })}</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {entradas.map((en) => (
                        <li key={`${en.id}-${en.mensagem}`}>
                          <a
                            href={`#${en.id}`}
                            className="inline-flex min-h-11 items-center underline"
                            onClick={(ev) => {
                              ev.preventDefault();
                              document.getElementById(en.id)?.focus();
                            }}
                          >
                            {en.rotulo}: {en.mensagem}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">{pt("secSubsidio")}</legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <fieldset className="space-y-1.5">
                      <legend className="text-sm font-medium leading-none">{pt("campoLimite")}</legend>
                      <div className="grid grid-cols-2 gap-2">
                        <Campo
                          id="regras-limiteHoras"
                          rotulo={pt("campoHoras")}
                          valor={form.limiteHoras}
                          onChange={(v) => mudar({ limiteHoras: v }, "limite")}
                          unidade={unU("h", "unidadeHorasExt")}
                          erro={e("limite")}
                          ajuda={pt("ajudaLimite")}
                        />
                        <Campo
                          id="regras-limiteMinutos"
                          rotulo={pt("campoMinutos")}
                          valor={form.limiteMinutos}
                          onChange={(v) => mudar({ limiteMinutos: v }, "limite")}
                          unidade={unU("min", "unidadeMinutosExt")}
                          invalido={!!erros.limite}
                          descritorExtra={erros.limite ? "regras-limiteHoras-erro" : undefined}
                        />
                      </div>
                    </fieldset>
                    <Campo
                      id="regras-valorHora"
                      rotulo={pt("campoValorHora")}
                      valor={form.valorHora}
                      onChange={(v) => mudar({ valorHora: v }, "valorHora")}
                      unidade={unU("€/h", "unidadeEurosHoraExt")}
                      erro={e("valorHora")}
                      ajuda={pt("ajudaValorHora")}
                    />
                    <Campo
                      id="regras-valorDia"
                      rotulo={pt("campoValorDia")}
                      valor={form.valorDia}
                      onChange={(v) => mudar({ valorDia: v }, "valorDia")}
                      unidade={unU("€/dia", "unidadeEurosDiaExt")}
                      erro={e("valorDia")}
                      ajuda={pt("ajudaValorDia")}
                    />
                  </div>
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">{pt("secHorasExtra")}</legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Campo
                      id="regras-hePctDiaUtil"
                      rotulo={pt("campoHePctDiaUtil")}
                      valor={form.hePctDiaUtil}
                      onChange={(v) => mudar({ hePctDiaUtil: v }, "hePctDiaUtil")}
                      unidade={unU("%", "unidadePorCento")}
                      erro={e("hePctDiaUtil")}
                    />
                    <Campo
                      id="regras-hePctFeriado"
                      rotulo={pt("campoHePctFeriado")}
                      valor={form.hePctFeriado}
                      onChange={(v) => mudar({ hePctFeriado: v }, "hePctFeriado")}
                      unidade={unU("%", "unidadePorCento")}
                      erro={e("hePctFeriado")}
                    />
                    <Campo
                      id="regras-hePctDescanso"
                      rotulo={pt("campoHePctDescanso")}
                      valor={form.hePctDescanso}
                      onChange={(v) => mudar({ hePctDescanso: v }, "hePctDescanso")}
                      unidade={unU("%", "unidadePorCento")}
                      erro={e("hePctDescanso")}
                    />
                    <fieldset className="space-y-1.5">
                      <legend className="text-sm font-medium leading-none">{pt("campoHeLimite")}</legend>
                      <div className="grid grid-cols-2 gap-2">
                        <Campo
                          id="regras-heLimiteHoras"
                          rotulo={pt("campoHoras")}
                          valor={form.heLimiteHoras}
                          onChange={(v) => mudar({ heLimiteHoras: v }, "heLimiteHoras")}
                          unidade={unU("h", "unidadeHorasAnoExt")}
                          erro={e("heLimiteHoras")}
                        />
                        <Campo
                          id="regras-heLimiteMinutos"
                          rotulo={pt("campoMinutos")}
                          valor={form.heLimiteMinutos}
                          onChange={(v) => mudar({ heLimiteMinutos: v }, "heLimiteHoras")}
                          unidade={unU("min", "unidadeMinutosExt")}
                          invalido={!!erros.heLimiteHoras}
                          descritorExtra={erros.heLimiteHoras ? "regras-heLimiteHoras-erro" : undefined}
                        />
                      </div>
                    </fieldset>
                  </div>
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">{pt("secDireitos")}</legend>
                  <p className="text-sm text-muted-foreground">{pt("ajudaDireitos")}</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Campo
                      id="regras-ihtPct"
                      rotulo={pt("campoIht")}
                      valor={form.ihtPct}
                      onChange={(v) => mudar({ ihtPct: v }, "ihtPct")}
                      unidade={unU("%", "unidadePorCento")}
                      erro={e("ihtPct")}
                      ajuda={pt("ajudaIht")}
                    />
                    <Campo
                      id="regras-kmValor"
                      rotulo={pt("campoKm")}
                      valor={form.kmValor}
                      onChange={(v) => mudar({ kmValor: v }, "kmValor")}
                      unidade={unU("€/km", "unidadeEurosKmExt")}
                      erro={e("kmValor")}
                    />
                    <Campo
                      id="regras-ajudasDia"
                      rotulo={pt("campoAjudas")}
                      valor={form.ajudasDia}
                      onChange={(v) => mudar({ ajudasDia: v }, "ajudasDia")}
                      unidade={unU("€/dia", "unidadeEurosDiaExt")}
                      erro={e("ajudasDia")}
                    />
                  </div>
                </fieldset>

                <fieldset className="space-y-4">
                  <legend id="regras-secNoturnas" tabIndex={-1} className="text-sm font-medium">
                    {pt("secNoturnas")}
                  </legend>
                  <p id={ID_AJUDA_FAIXAS} className="text-sm text-muted-foreground">
                    {pt("faixaAjuda")}
                  </p>
                  {form.faixas.length === 0 && <p className="text-sm text-muted-foreground">{pt("semFaixas")}</p>}
                  <ul className="space-y-4">
                    {form.faixas.map((f, i) => {
                      const base = `regras-faixa-${f.chave}`;
                      const n = String(i + 1);
                      const ehPct = f.modo === "percentagem";
                      const ini = minutosDaHora(f.inicio);
                      const fim = minutosDaHora(f.fim, true);
                      const legenda =
                        ini !== null && fim !== null
                          ? t("hr.regrasSalariais.faixaLegenda", { n, inicio: f.inicio, fim: f.fim })
                          : t("hr.regrasSalariais.faixaN", { n });
                      const erroHoras = e(`faixa.${i}.horas`);
                      return (
                        <li key={f.chave}>
                          <fieldset className="space-y-3 rounded-md border p-3">
                            <legend className="px-1 text-sm">{legenda}</legend>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <Campo
                                id={`${base}-inicio`}
                                tipo="hora"
                                rotulo={pt("faixaInicio")}
                                nomeAcessivel={t("hr.regrasSalariais.faixaInicioN", { n })}
                                valor={f.inicio}
                                onChange={(v) => mudarFaixa(f.chave, { inicio: v })}
                                erro={erroHoras}
                                descritorExtra={ID_AJUDA_FAIXAS}
                              />
                              <Campo
                                id={`${base}-fim`}
                                tipo="hora"
                                rotulo={pt("faixaFim")}
                                nomeAcessivel={t("hr.regrasSalariais.faixaFimN", { n })}
                                valor={f.fim}
                                onChange={(v) => mudarFaixa(f.chave, { fim: v })}
                                invalido={!!erroHoras}
                                descritorExtra={[ID_AJUDA_FAIXAS, erroHoras ? `${base}-inicio-erro` : null].filter(Boolean).join(" ")}
                              />
                              <fieldset className="space-y-0">
                                <legend className="text-sm font-medium leading-none">
                                  <span className="sr-only">{t("hr.regrasSalariais.faixaPrefixoN", { n })}</span>
                                  {pt("faixaModo")}
                                </legend>
                                <RadioGroup
                                  value={f.modo}
                                  onValueChange={(v) => mudarFaixa(f.chave, { modo: v as ModoDaFaixa })}
                                  className="gap-0 pt-1.5"
                                >
                                  {(["percentagem", "preco"] as const).map((modo) => (
                                    <div key={modo} className="flex min-h-11 items-center gap-3">
                                      <RadioGroupItem id={`${base}-modo-${modo}`} value={modo} />
                                      <Label htmlFor={`${base}-modo-${modo}`} className="flex-1 cursor-pointer py-3">
                                        {pt(modo === "percentagem" ? "modoPercentagem" : "modoPreco")}
                                      </Label>
                                    </div>
                                  ))}
                                </RadioGroup>
                              </fieldset>
                              <Campo
                                id={`${base}-valor`}
                                rotulo={pt(ehPct ? "faixaValorPct" : "faixaValorPreco")}
                                nomeAcessivel={t(ehPct ? "hr.regrasSalariais.faixaValorPctN" : "hr.regrasSalariais.faixaValorPrecoN", { n })}
                                valor={f.valor}
                                onChange={(v) => mudarFaixa(f.chave, { valor: v })}
                                unidade={ehPct ? unU("%", "unidadePorCento") : unU("€/h", "unidadeEurosHoraExt")}
                                erro={e(`faixa.${i}.valor`)}
                              />
                            </div>
                            <Button
                              id={`${base}-remover`}
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => removerFaixa(f.chave)}
                              aria-label={t("hr.regrasSalariais.faixaRemoverN", { n })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                              {pt("faixaRemover")}
                            </Button>
                          </fieldset>
                        </li>
                      );
                    })}
                  </ul>
                  <Button
                    id="regras-faixa-adicionar"
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    aria-disabled={form.faixas.length >= MAX_FAIXAS ? true : undefined}
                    aria-describedby={ID_AJUDA_FAIXAS}
                    onClick={() => {
                      if (form.faixas.length < MAX_FAIXAS) adicionarFaixa();
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {pt("faixaAdicionar")}
                  </Button>
                  {e("faixas") && <p className="text-sm font-medium text-destructive">{e("faixas")}</p>}
                </fieldset>

                <div className="sm:max-w-xs">
                  <Campo
                    id="regras-validoDe"
                    tipo="date"
                    rotulo={pt("campoValidoDe")}
                    valor={form.validoDe}
                    onChange={(v) => mudar({ validoDe: v }, "validoDe")}
                    erro={e("validoDe")}
                    ajuda={pt("ajudaValidoDe")}
                  />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <span role="status" className="text-sm text-muted-foreground">
                    {isSaving ? pt("aGravar") : ""}
                  </span>
                  <Button type="submit" className="min-h-11" aria-disabled={isSaving ? true : undefined}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {pt("guardar")}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{pt("semPermissaoGerir")}</p>
            )}

            {versoes.length > 0 && (
              <section aria-labelledby="regras-historico" className="space-y-2">
                <h3 id="regras-historico" className="text-sm font-medium">
                  {pt("historico")}
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground" data-testid="regras-salariais-historico">
                  {versoes.map((v) => (
                    <li key={v.id}>
                      {v.valido_ate ? (
                        <>
                          {pt("historicoDe")} <time dateTime={v.valido_de}>{dataExtenso(v.valido_de, locale)}</time> {pt("historicoA")}{" "}
                          <time dateTime={v.valido_ate}>{dataExtenso(v.valido_ate, locale)}</time>
                        </>
                      ) : (
                        <>
                          {pt("historicoDesde")} <time dateTime={v.valido_de}>{dataExtenso(v.valido_de, locale)}</time>, {pt("historicoSemFim")}
                        </>
                      )}
                      {v.criada_por_nome ? ` (${t("hr.regrasSalariais.historicoPor", { nome: v.criada_por_nome })})` : ""}
                      {` - ${estadoDaVersao(v)}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmacao !== null} onOpenChange={(aberto) => !aberto && setConfirmacao(null)}>
        <AlertDialogContent aria-describedby="regras-confirmar-descricao regras-confirmar-lista">
          <AlertDialogHeader>
            <AlertDialogTitle>{pt("confirmar.titulo")}</AlertDialogTitle>
            <AlertDialogDescription id="regras-confirmar-descricao">
              {confirmacao ? t("hr.regrasSalariais.confirmar.valeAPartir", { data: dataExtenso(confirmacao.validoDe, locale) }) : ""}{" "}
              {pt("confirmar.naoAlteraFechados")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmacao && (
            <div id="regras-confirmar-lista" className="space-y-2 text-sm">
              <p className="font-medium">{pt("confirmar.resumo")}</p>
              {confirmacao.diferencas.campos.length === 0 && !confirmacao.diferencas.faixas.mudou ? (
                <p>{pt("confirmar.semMudancas")}</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {confirmacao.diferencas.campos.map((d) => (
                    <li key={d.campo}>
                      {t("hr.regrasSalariais.confirmar.linha", {
                        campo: rotuloDoCampo(DO_PAYLOAD[d.campo].campo),
                        antes: valorDoCampo(d.campo, d.antes),
                        depois: valorDoCampo(d.campo, d.depois),
                      })}
                    </li>
                  ))}
                  {confirmacao.diferencas.faixas.mudou && (
                    <li>
                      {t("hr.regrasSalariais.confirmar.linha", {
                        campo: pt("secNoturnas"),
                        antes: listaDeFaixas(confirmacao.diferencas.faixas.antes),
                        depois: listaDeFaixas(confirmacao.diferencas.faixas.depois),
                      })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={() => void gravar()}>
              {pt("confirmar.gravar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
