import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { obterIdioma } from "@/lib/idiomaDocumento/registo";
import type { ResumoDaVersao } from "./useVersoesDoTemplate";
import { ID_PAINEL_ADICIONAR, idDaAbaDeIdioma } from "./idsDeIdioma";
import { useNomeParaFrase } from "./nomeParaFrase";

export interface BarraDeIdiomasProps {
  base: string;
  ativo: string;
  versoes: string[];
  completudes: Record<string, ResumoDaVersao>;
  faltamAdicionar: string[];
  adicionando: boolean;
  /** Sem permissão para gerir minutas: a barra não oferece adicionar nem remover. */
  somenteLeitura?: boolean;
  onSelecionar: (codigo: string) => void;
  onAbrirAdicionar: () => void;
  onFecharAdicionar: () => void;
  onAdicionar: (codigo: string, copiarDoBase: boolean) => void;
  onRemover: (codigo: string) => void;
  onMarcarRevisto: (codigo: string) => void;
}

const nomeNativo = (codigo: string) => obterIdioma(codigo)?.nomeNativo ?? codigo;
const ALVO = "min-h-11";

function PainelAdicionar({ base, faltam, onAdicionar, onCancelar }: {
  base: string;
  faltam: string[];
  onAdicionar: (codigo: string, copiar: boolean) => void;
  onCancelar: () => void;
}) {
  const { t } = useTranslation();
  const nomeParaFrase = useNomeParaFrase();
  const titulo = useId();
  const idCopiar = useId();
  const tituloRef = useRef<HTMLParagraphElement>(null);
  const [escolha, setEscolha] = useState(faltam[0] ?? "");
  const [copiar, setCopiar] = useState(true);
  const nomeBase = nomeParaFrase(base);

  // Ao abrir, o foco vai para o título do painel (o botão que o abriu pode ter desaparecido do ecrã).
  useEffect(() => { tituloRef.current?.focus(); }, []);

  return (
    <div id={ID_PAINEL_ADICIONAR} role="group" aria-labelledby={titulo} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p id={titulo} ref={tituloRef} tabIndex={-1} className="text-sm font-medium outline-none">{t("contractTemplates.versoes.adicionar.titulo")}</p>
      {faltam.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("contractTemplates.versoes.adicionar.semIdiomas")}</p>
      ) : (
        <>
          <RadioGroup value={escolha} onValueChange={setEscolha} aria-label={t("contractTemplates.versoes.adicionar.escolha")} className="flex flex-wrap gap-2">
            {faltam.map((codigo) => {
              const id = `${idCopiar}-${codigo}`;
              return (
                <label key={codigo} htmlFor={id} className={cn(ALVO, "flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm", escolha === codigo && "border-primary")}>
                  <RadioGroupItem id={id} value={codigo} aria-label={nomeNativo(codigo)} />
                  <span>{nomeNativo(codigo)}</span>
                </label>
              );
            })}
          </RadioGroup>
          <div className="space-y-1">
            <label htmlFor={idCopiar} className={cn(ALVO, "flex cursor-pointer items-center gap-2 text-sm")}>
              <Checkbox id={idCopiar} checked={copiar} onCheckedChange={(v) => setCopiar(v === true)} aria-label={t("contractTemplates.versoes.adicionar.copiar", { base: nomeBase })} />
              <span>{t("contractTemplates.versoes.adicionar.copiar", { base: nomeBase })}</span>
            </label>
            <p className="pl-6 text-xs text-muted-foreground">{t("contractTemplates.versoes.adicionar.copiarAjuda", { base: nomeBase })}</p>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {faltam.length > 0 && (
          <Button type="button" className={ALVO} onClick={() => onAdicionar(escolha, copiar)} disabled={!escolha}>
            {t("contractTemplates.versoes.adicionar.confirmar")}
          </Button>
        )}
        <Button type="button" variant="outline" className={ALVO} onClick={onCancelar}>
          {t("contractTemplates.versoes.adicionar.cancelar")}
        </Button>
      </div>
    </div>
  );
}

function Separadores({ codigos, props }: { codigos: string[]; props: BarraDeIdiomasProps }) {
  const { t } = useTranslation();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  /** «English, 3 por traduzir, texto base mudou»: o idioma por extenso e o que há a dizer dele. */
  const nomeDaAba = (codigo: string) => {
    if (codigo === props.base) return `${nomeNativo(codigo)} ${t("contractTemplates.versoes.barra.base")}`;
    const r = props.completudes[codigo];
    return [
      nomeNativo(codigo),
      r && !r.completo ? t("contractTemplates.versoes.barra.porTraduzir", { n: r.porTraduzir }) : null,
      r?.desatualizado ? t("contractTemplates.versoes.barra.desatualizado") : null,
    ].filter(Boolean).join(", ");
  };

  const ir = (i: number) => {
    refs.current[i]?.focus();
    props.onSelecionar(codigos[i]);
  };
  const aoTeclar = (e: React.KeyboardEvent, i: number) => {
    const n = codigos.length;
    const destino =
      e.key === "ArrowRight" ? (i + 1) % n
      : e.key === "ArrowLeft" ? (i + n - 1) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (destino === null) return;
    e.preventDefault();
    ir(destino);
  };

  return (
    <div role="tablist" aria-label={t("contractTemplates.versoes.barra.rotulo")} className="flex flex-wrap gap-1 rounded-lg border bg-muted p-1">
      {codigos.map((codigo, i) => {
        const selecionada = codigo === props.ativo;
        const resumo = props.completudes[codigo];
        const ehBase = codigo === props.base;
        return (
          <button
            key={codigo}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={idDaAbaDeIdioma(codigo)}
            aria-selected={selecionada}
            aria-label={nomeDaAba(codigo)}
            tabIndex={selecionada ? 0 : -1}
            title={nomeNativo(codigo)}
            onClick={() => props.onSelecionar(codigo)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={cn(
              ALVO,
              "inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selecionada ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <span>{ehBase ? `${codigo.toUpperCase()} ${t("contractTemplates.versoes.barra.base")}` : codigo.toUpperCase()}</span>
            {!ehBase && resumo && !resumo.completo && (
              <span className="text-xs font-normal text-amber-700 dark:text-amber-400">{` · ${t("contractTemplates.versoes.barra.porTraduzir", { n: resumo.porTraduzir })}`}</span>
            )}
            {!ehBase && resumo?.desatualizado && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** O botão «Adicionar idioma». Numa minuta sem versões é o único sinal desta função (a barra ainda não aparece). */
export function BotaoAdicionarIdioma({ expandido, onClick, id }: { expandido: boolean; onClick: () => void; id?: string }) {
  const { t } = useTranslation();
  return (
    <Button id={id} type="button" variant="outline" className={ALVO} aria-expanded={expandido} aria-controls={expandido ? ID_PAINEL_ADICIONAR : undefined} onClick={onClick}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      {t("contractTemplates.versoes.barra.adicionar")}
    </Button>
  );
}

export function BarraDeIdiomasDoTemplate(props: BarraDeIdiomasProps) {
  const { t } = useTranslation();
  const nomeParaFrase = useNomeParaFrase();
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const { base, ativo, versoes, adicionando, somenteLeitura } = props;
  // Depois de adicionar ou remover, o foco vai para a aba ativa que ficar (o botão ou o painel que o tinham desaparecem).
  // Guarda-se o idioma ativo de antes: o foco só passa quando o pai muda mesmo o idioma ativo.
  const focoDepoisDeAtivoMudarDe = useRef<string | null>(null);
  useEffect(() => {
    if (focoDepoisDeAtivoMudarDe.current !== null && focoDepoisDeAtivoMudarDe.current !== ativo) {
      focoDepoisDeAtivoMudarDe.current = null;
      document.getElementById(idDaAbaDeIdioma(ativo))?.focus();
    }
  });
  const codigos = [base, ...versoes];
  const mostrarSeparadores = versoes.length > 0 || adicionando;
  const resumoAtivo = props.completudes[ativo];
  const nomeAtivo = nomeParaFrase(ativo);

  if (!mostrarSeparadores && somenteLeitura) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {mostrarSeparadores && <Separadores codigos={codigos} props={props} />}
        {!somenteLeitura && <BotaoAdicionarIdioma expandido={adicionando} onClick={adicionando ? props.onFecharAdicionar : props.onAbrirAdicionar} />}
        {!somenteLeitura && ativo !== base && (
          <Button type="button" variant="ghost" className={cn(ALVO, "text-destructive hover:text-destructive")} onClick={() => setConfirmarRemocao(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("contractTemplates.versoes.barra.remover")}
          </Button>
        )}
      </div>

      {adicionando && !somenteLeitura && (
        <PainelAdicionar
          base={base}
          faltam={props.faltamAdicionar}
          onAdicionar={(codigo, copiar) => {
            focoDepoisDeAtivoMudarDe.current = ativo;
            props.onAdicionar(codigo, copiar);
          }}
          onCancelar={props.onFecharAdicionar}
        />
      )}

      {ativo !== base && resumoAtivo?.desatualizado && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-50/60 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{t("contractTemplates.versoes.desatualizado.aviso", { base: nomeParaFrase(base) })}</span>
          {!somenteLeitura && (
            <Button type="button" variant="outline" size="sm" className={ALVO} onClick={() => props.onMarcarRevisto(ativo)}>
              {t("contractTemplates.versoes.desatualizado.revisto")}
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmarRemocao} onOpenChange={setConfirmarRemocao}>
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contractTemplates.versoes.remover.titulo", { nome: nomeAtivo })}</AlertDialogTitle>
            <AlertDialogDescription>{t("contractTemplates.versoes.remover.descricao", { base: nomeParaFrase(base) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("contractTemplates.versoes.remover.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                focoDepoisDeAtivoMudarDe.current = ativo;
                props.onRemover(ativo);
              }}
              className="bg-destructive text-destructive-foreground">
              {t("contractTemplates.versoes.remover.confirmar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
