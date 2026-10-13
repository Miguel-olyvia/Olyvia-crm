import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BotoesPainel } from "./BotoesPainel";
import { LIMITE_NOTA_CHAMADA, PASSOS_CHAMADA, RESULTADOS_CONTACTO } from "./opcoesPessoa";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
import type { PassoChamada, ResultadoContacto } from "./pessoasTipos";
import { useFocoInicial } from "./useFocoInicial";

type PropsComTitulo = PropsPainel & { titulo: string };

/** A partir de quantos caracteres a nota avisa que está perto do limite. */
const MARGEM_AVISO_NOTA = 10;

const ETIQUETA_RESULTADO = [
  "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm transition-colors motion-reduce:transition-none",
  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
].join(" ");

/** O resultado da chamada (escolha única): radios nativos com o aspeto de botões; o escolhido leva também uma marca ✓. */
function Resultados({ valor, aoEscolher, ativo }: { valor: ResultadoContacto | null; aoEscolher: (r: ResultadoContacto) => void; ativo: boolean }) {
  const { t } = useTranslation();
  const primeiro = useFocoInicial<HTMLInputElement>(ativo);
  const nome = useId();
  const idLegenda = useId();
  return (
    <div role="radiogroup" aria-labelledby={idLegenda} className="space-y-2">
      <p id={idLegenda} className="text-sm font-medium text-foreground">{t("pessoasPagina.panel.callResult")}</p>
      <div className="flex flex-wrap gap-2">
        {RESULTADOS_CONTACTO.map((r, i) => (
          <label key={r} className="relative inline-flex cursor-pointer">
            <input
              ref={i === 0 ? primeiro : undefined} type="radio" name={nome} className="peer sr-only"
              checked={valor === r} onChange={() => aoEscolher(r)}
            />
            <span className={cn(ETIQUETA_RESULTADO, valor === r ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground hover:bg-accent")}>
              {valor === r && <Check className="h-4 w-4" aria-hidden="true" />}
              {t(`pessoasPagina.result.${r}`)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Passos({ valor, aoEscolher }: { valor: PassoChamada; aoEscolher: (p: PassoChamada) => void }) {
  const { t } = useTranslation();
  const nome = useId();
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium text-foreground">{t("pessoasPagina.panel.callStep")}</legend>
      {PASSOS_CHAMADA.map((p) => (
        <label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input type="radio" name={nome} className="h-4 w-4 accent-primary" checked={valor === p} onChange={() => aoEscolher(p)} />
          {t(`pessoasPagina.step.${p}`)}
        </label>
      ))}
    </fieldset>
  );
}

/** A nota da chamada com o contador "N de 140 caracteres"; o aviso do limite só aparece perto dele. */
function NotaChamada({ nota, aoMudar }: { nota: string; aoMudar: (n: string) => void }) {
  const { t } = useTranslation();
  const idCampo = useId();
  const idContagem = useId();
  const pertoDoLimite = nota.length >= LIMITE_NOTA_CHAMADA - MARGEM_AVISO_NOTA;
  return (
    <div className="space-y-1">
      <Label htmlFor={idCampo}>{t("pessoasPagina.panel.callNote")}</Label>
      <Textarea
        id={idCampo} value={nota} maxLength={LIMITE_NOTA_CHAMADA} rows={2} className="min-h-0"
        aria-describedby={idContagem} onChange={(e) => aoMudar(e.target.value)}
      />
      <p id={idContagem} className="text-right text-xs tabular-nums text-muted-foreground">
        {t("pessoasPagina.panel.noteCount", { count: nota.length, max: LIMITE_NOTA_CHAMADA })}
      </p>
      <span role="status" className="sr-only">{pertoDoLimite ? t("pessoasPagina.panel.noteLimit", { max: LIMITE_NOTA_CHAMADA }) : ""}</span>
    </div>
  );
}

/** Registar chamada: resultado, nota (até 140 caracteres) e próximo passo; Guardar só com resultado. */
export function PainelChamada({ id, titulo, ativo, pessoa, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const [resultado, setResultado] = useState<ResultadoContacto | null>(null);
  const [nota, setNota] = useState("");
  const [passo, setPasso] = useState<PassoChamada>("nenhum");
  useEffect(() => aoMudarConteudo(resultado !== null || nota !== ""), [resultado, nota, aoMudarConteudo]);
  const guardar = () => {
    if (!resultado) return;
    acoes.registarChamada(pessoa.id, { resultado, nota, passo });
    aoConcluir(t("pessoasPagina.live.call", { name: pessoa.nome }));
  };
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <Resultados valor={resultado} aoEscolher={setResultado} ativo={ativo} />
      <NotaChamada nota={nota} aoMudar={setNota} />
      <Passos valor={passo} aoEscolher={setPasso} />
      <BotoesPainel guardar={guardar} aoCancelar={aoFechar} desativado={resultado === null} dica={t("pessoasPagina.panel.hintResult")} />
    </MolduraPainel>
  );
}

/** Nota: um campo de texto cujo conteúdo entra na atividade. */
export function PainelNota({ id, titulo, ativo, pessoa, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const campo = useFocoInicial<HTMLTextAreaElement>(ativo);
  const idCampo = useId();
  useEffect(() => aoMudarConteudo(texto.trim() !== ""), [texto, aoMudarConteudo]);
  const guardar = () => {
    acoes.juntarNota(pessoa.id, texto);
    aoConcluir(t("pessoasPagina.live.note", { name: pessoa.nome }));
  };
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <div className="space-y-1">
        <Label htmlFor={idCampo}>{t("pessoasPagina.panel.noteLabel")}</Label>
        <Textarea id={idCampo} ref={campo} value={texto} rows={3} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <BotoesPainel guardar={guardar} aoCancelar={aoFechar} desativado={texto.trim() === ""} dica={t("pessoasPagina.panel.hintNote")} />
    </MolduraPainel>
  );
}
