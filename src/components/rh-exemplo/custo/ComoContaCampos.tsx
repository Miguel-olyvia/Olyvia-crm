/**
 * O campo «Como conta» (equipamentos e valores avulsos): três opções em linguagem simples — pago de uma vez, repartido por N
 * meses, todos os meses —, os campos que cada uma pede, uma ajuda curta sobre o que quer dizer «repartido» (um botão que abre
 * o texto, não só um tooltip) e a frase com o efeito calculado, que se atualiza a cada alteração. Só desenho e contas puras.
 */
import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { COMO_CONTA, MESES_MAXIMO, MESES_MINIMO, type ComoConta, type ErroConta } from "@/components/rh-exemplo/lib/comoConta";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { contaDaEscolha, fraseDaEscolha, type EscolhaConta } from "./escolhaConta";
import { euros, nomeDoMes } from "./formato";

interface Props {
  /** Prefixo dos ids, único em cada formulário. */
  idBase: string;
  escolha: EscolhaConta;
  aoMudar: (parcial: Partial<EscolhaConta>) => void;
  /** O valor em euros (no «todos os meses», o de cada mês) e a data de que parte (entrega ou data do valor). */
  valor: number;
  data: string;
  /** Se o valor acaba também com a devolução (equipamentos). */
  comDevolucao: boolean;
  erro: ErroConta | null;
}

function AjudaRepartido({ id }: { id: string }) {
  const { t } = useTranslation();
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button" aria-expanded={aberta} aria-controls={`${id}-texto`} aria-label={t("rhCustos.conta.ajudaBotao")}
        onClick={() => setAberta((v) => !v)}
        className={cn("inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground motion-reduce:transition-none", FOCO)}
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>
      {aberta && <p id={`${id}-texto`} className="basis-full rounded-md bg-muted/50 p-3 text-xs leading-5">{t("rhCustos.conta.ajudaTexto")}</p>}
    </>
  );
}

function OpcaoConta({ id, modo, escolhido }: { id: string; modo: ComoConta; escolhido: boolean }) {
  const { t } = useTranslation();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors motion-reduce:transition-none",
        escolhido ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50",
      )}
    >
      <RadioGroupItem id={id} value={modo} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block font-medium">{t(`rhCustos.conta.${modo}`)}</span>
        <span className="block text-xs text-muted-foreground">{t(`rhCustos.conta.${modo}.desc`)}</span>
      </span>
    </label>
  );
}

function CampoMes({ id, rotulo, valor, ajuda, aoMudar }: { id: string; rotulo: string; valor: string; ajuda?: string; aoMudar: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">{rotulo}</label>
      <input
        id={id} type="month" value={valor} onChange={(e) => aoMudar(e.target.value)} aria-describedby={ajuda ? `${id}-ajuda` : undefined}
        className={cn("h-11 w-full rounded-md border border-input bg-background px-3 text-sm", FOCO)}
      />
      {ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function FraseDoEfeito({ escolha, valor, data, comDevolucao }: Pick<Props, "escolha" | "valor" | "data" | "comDevolucao">) {
  const { t, language } = useTranslation();
  const frase = fraseDaEscolha(escolha, valor, data, comDevolucao);
  const texto = frase
    ? t(`rhCustos.conta.frase.${frase.chave}`, {
        valor: euros(frase.valor, "—"), n: frase.n, quota: euros(frase.quota, "—"),
        inicio: nomeDoMes(frase.inicio, language), fim: frase.fim ? nomeDoMes(frase.fim, language) : "",
      })
    : t("rhCustos.conta.frase.vazia");
  return <p role="status" className="rounded-md bg-muted/50 p-3 text-sm tabular-nums">{texto}</p>;
}

export function ComoContaCampos({ idBase, escolha, aoMudar, valor, data, comDevolucao, erro }: Props) {
  const { t } = useTranslation();
  const mesPadrao = contaDaEscolha({ ...escolha, modo: "todosMeses", inicio: "" }, data).inicio ?? "";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span id={`${idBase}-legenda`} className="text-sm font-medium leading-none">{t("rhCustos.conta.titulo")}</span>
        <AjudaRepartido id={idBase} />
      </div>
      <RadioGroup value={escolha.modo} onValueChange={(modo) => aoMudar({ modo: modo as ComoConta })} aria-labelledby={`${idBase}-legenda`}>
        {COMO_CONTA.map((m) => <OpcaoConta key={m} id={`${idBase}-${m}`} modo={m} escolhido={escolha.modo === m} />)}
      </RadioGroup>
      {escolha.modo === "repartido" && (
        <CampoTexto
          id={`${idBase}-meses`} label={t("rhCustos.conta.meses")} tipo="number" min={MESES_MINIMO} max={MESES_MAXIMO} step="1"
          valor={escolha.meses} onChange={(meses) => aoMudar({ meses })} ajuda={t("rhCustos.conta.mesesAjuda")} obrigatorio
        />
      )}
      {escolha.modo === "todosMeses" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoMes id={`${idBase}-inicio`} rotulo={t("rhCustos.conta.inicio")} valor={escolha.inicio || mesPadrao} aoMudar={(inicio) => aoMudar({ inicio })} />
          <CampoMes id={`${idBase}-fim`} rotulo={t("rhCustos.conta.fim")} valor={escolha.fim} ajuda={t("rhCustos.conta.fimAjuda")} aoMudar={(fim) => aoMudar({ fim })} />
        </div>
      )}
      <FraseDoEfeito escolha={escolha} valor={valor} data={data} comDevolucao={comDevolucao} />
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{t(`rhCustos.conta.erro.${erro}`)}</p>}
    </div>
  );
}
