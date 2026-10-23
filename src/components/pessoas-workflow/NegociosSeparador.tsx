import { useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { GrupoRadios } from "@/components/negocio-metas/GrupoRadios";
import { useConsequenciasAtivo } from "@/hooks/pessoas/bandeirasNegocio";
import { usePodeConfigurarPessoas } from "@/hooks/pessoas/usePodeConfigurarPessoas";
import { chaveErroNegocios } from "@/hooks/pessoas/workflow/errosWorkflow";
import { useConsequencias, type ConsequenciasHook } from "@/hooks/pessoas/workflow/useConsequencias";
import {
  CANCELAMENTOS, CONVERSOES_AO_GANHAR, RECUSAS, validarReflexao,
  type Cancelamento, type ConversaoAoGanhar, type Recusa,
} from "@/hooks/pessoas/workflow/configNegocios";
import { ConsequenciasTabela } from "./ConsequenciasTabela";
import { edicaoDaConfig, type EdicaoNegocios } from "./edicaoNegocios";
import type { ConfigNegociosHook } from "@/hooks/pessoas/workflow/useConfigNegocios";

const W = "pessoasPagina.real.workflow.";
const N = `${W}neg.`;

type Aviso = "guardada" | "semAlteracoes";
type Edicao = EdicaoNegocios;

/** Nenhuma opção está indisponível (todas se escolhem). */
const semMotivo = <T extends string>(opcoes: readonly T[]): Record<T, null> => Object.fromEntries(opcoes.map((o) => [o, null])) as Record<T, null>;

/**
 * O separador «Negócios»: NÃO é um workflow, são cinco campos da configuração do fecho da organização (o que acontece ao ganhar, o que fazer
 * quando a proposta ou o contrato são recusados, o cancelamento dentro do prazo e o prazo de reflexão, que fica em branco até o jurídico o
 * validar). «Guardar» escreve só pela função da base (via o hook) e nunca toca em Contratos: se a base avisa que Contratos continua a converter a
 * pessoa em cliente ao assinar, o separador diz-o. Enquanto grava, o botão fica `aria-disabled` (continua focável) e um duplo clique dá um só
 * pedido. O resultado e o erro vão para regiões que o leitor de ecrã anuncia; o que se escolheu fica no ecrã depois de um erro.
 */
export interface NegociosSeparadorProps {
  config: ConfigNegociosHook;
  /** O que está escrito por gravar. Se o diálogo o guarda (para sobreviver à troca de separador e avisar ao fechar), vem aqui; sem ele, vive no separador. */
  edicao?: EdicaoNegocios | null;
  aoEditar?: (edicao: EdicaoNegocios | null) => void;
}

export function NegociosSeparador(props: NegociosSeparadorProps) {
  // A bandeira decide qual dos dois entra (nunca os dois): com ela desligada nada do ecrã das consequências se monta nem se lê.
  return useConsequenciasAtivo() ? <NegociosComConsequencias {...props} /> : <NegociosCorpo {...props} />;
}

/** Com a bandeira ligada: lê as consequências e a permissão `pessoas.config` (a base volta a decidir em cada gravação). Sem a permissão, ou enquanto ela carrega, é só leitura. */
function NegociosComConsequencias(props: NegociosSeparadorProps) {
  const pode = usePodeConfigurarPessoas();
  const hook = useConsequencias(true);
  return <NegociosCorpo {...props} consequencias={{ hook, pode }} />;
}

interface NegociosCorpoProps extends NegociosSeparadorProps {
  /** Com o ecrã das consequências ligado: o que se leu e se pode mudar. A tabela traz as escolhas das recusas e o prazo, no lugar dos grupos soltos. */
  consequencias?: { hook: ConsequenciasHook; pode: boolean };
}

function NegociosCorpo({ config, edicao: edicaoFora, aoEditar, consequencias }: NegociosCorpoProps) {
  const { t } = useTranslation();
  const somenteLeitura = consequencias !== undefined && !consequencias.pode;
  const id = useId();
  const campoPrazo = useRef<HTMLInputElement>(null);
  const [edicaoLocal, setEdicaoLocal] = useState<Edicao | null>(null);
  const controlado = aoEditar !== undefined;
  const edicao = controlado ? (edicaoFora ?? null) : edicaoLocal;
  const setEdicao = controlado ? aoEditar : setEdicaoLocal;
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [avisoConversao, setAvisoConversao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroPrazo, setErroPrazo] = useState<"formato" | "intervalo" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // O estado só muda no render seguinte: a referência é o que trava o segundo clique.
  const emCurso = useRef(false);
  // A tabela das consequências grava por conta própria (interruptores e recusa do orçamento): enquanto o faz, o resto não grava.
  const [tabelaOcupada, setTabelaOcupada] = useState(false);

  if (config.estado === "a-carregar") return <p role="status" className="text-sm text-muted-foreground">{t(`${N}loading`)}</p>;
  if (config.estado === "erro") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <p>{t(`${N}loadError`)}</p>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={config.recarregar}>{t(`${N}retry`)}</Button>
      </div>
    );
  }
  if (config.estado === "sem-config" || !config.dados) return <p className="text-sm text-muted-foreground">{t(`${N}noConfig`)}</p>;

  const atual: Edicao = edicao ?? edicaoDaConfig(config.dados);
  const aGuardar = ocupado || config.aGuardar;
  const mudar = (parcial: Partial<Edicao>) => {
    setEdicao({ ...atual, ...parcial });
    setAviso(null);
    setAvisoConversao(false);
    setErro(null);
    setErroPrazo(null);
  };
  const guardar = async () => {
    if (emCurso.current || tabelaOcupada) return;
    const prazo = validarReflexao(atual.reflexao);
    if ("erro" in prazo) {
      setErroPrazo(prazo.erro);
      campoPrazo.current?.focus();
      return;
    }
    emCurso.current = true;
    setOcupado(true);
    setAviso(null);
    setAvisoConversao(false);
    setErro(null);
    try {
      const resultado = await config.guardar({
        conversaoAoGanhar: atual.conversaoAoGanhar, recusaProposta: atual.recusaProposta, recusaContrato: atual.recusaContrato,
        cancelamentoNoPrazo: atual.cancelamentoNoPrazo, reflexaoDias: prazo.valor,
      });
      // Com o «depois» da base, o ecrã passa a mostrar o que a base tem (já está na cache). Sem ele, se a base diz que não mudou nada o que
      // se enviou já era o que ela tinha e a edição deixa de estar por gravar; se mudou, fica o que se enviou até a leitura voltar.
      if (resultado.depois || !resultado.mudou) setEdicao(null);
      setAviso(resultado.mudou ? "guardada" : "semAlteracoes");
      setAvisoConversao(resultado.avisoConversaoContratos);
    } catch (falha) {
      setErro(chaveErroNegocios(falha));
    } finally {
      emCurso.current = false;
      setOcupado(false);
    }
  };
  const mensagem = aGuardar ? t(`${N}saving`) : aviso === "guardada" ? t(`${N}saved`) : aviso === "semAlteracoes" ? t(`${N}unchanged`) : "";
  const idErroPrazo = `${id}-prazo-erro`;
  // Com a tabela das consequências, os grupos das recusas e do cancelamento e o prazo vivem nela; o resto do ecrã fica igual.
  const bloqueado = aGuardar || somenteLeitura || tabelaOcupada;
  const prazoComoTexto = (
    <p className="text-sm">
      <span className="text-muted-foreground">{t(`${N}reflexion.label`)}</span>{" "}
      <span className="font-medium">{atual.reflexao.trim() === "" ? t(`${N}cons.noDeadline`) : atual.reflexao}</span>
    </p>
  );
  const blocoPrazo: ReactNode = somenteLeitura ? prazoComoTexto : (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-prazo`}>{t(`${N}reflexion.label`)}</Label>
      <Input
        ref={campoPrazo} id={`${id}-prazo`} value={atual.reflexao} inputMode="numeric" autoComplete="off"
        aria-invalid={erroPrazo ? true : undefined} aria-describedby={erroPrazo ? `${id}-prazo-dica ${id}-prazo-exemplo ${idErroPrazo}` : `${id}-prazo-dica ${id}-prazo-exemplo`}
        readOnly={bloqueado} className={cn("min-h-11 max-w-40", FOCO, erroPrazo && "border-destructive")}
        onChange={(e) => mudar({ reflexao: e.target.value })}
      />
      <p id={`${id}-prazo-dica`} className="text-sm text-muted-foreground">{t(`${N}reflexion.hint`)}</p>
      <p id={`${id}-prazo-exemplo`} className="text-sm text-muted-foreground">{t(`${N}reflexion.example`)}</p>
      {erroPrazo && (
        <p id={idErroPrazo} role="alert" className="flex items-center gap-1.5 text-sm text-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {t(`${N}reflexion.error.${erroPrazo === "formato" ? "format" : "range"}`)}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(`${N}intro`)}</p>
      {somenteLeitura ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{t(`${N}conv.title`)}</span>{" "}
          <span className="font-medium">{t(`${N}conv.${atual.conversaoAoGanhar}`)}</span>
        </p>
      ) : (
      <GrupoRadios<ConversaoAoGanhar>
        legenda={t(`${N}conv.title`)} ajuda={t(`${N}conv.hint`)} exemplo={t(`${N}conv.example`)} bloqueado={bloqueado} valor={atual.conversaoAoGanhar} opcoes={CONVERSOES_AO_GANHAR}
        indisponiveis={semMotivo(CONVERSOES_AO_GANHAR)} rotulo={(c) => t(`${N}conv.${c}`)} aoMudar={(conversaoAoGanhar) => mudar({ conversaoAoGanhar })}
      />
      )}
      {consequencias ? (
        <ConsequenciasTabela
          consequencias={consequencias.hook} pode={consequencias.pode} bloqueado={aGuardar} prazo={blocoPrazo} aoOcupar={setTabelaOcupada}
          edicao={atual} aoMudar={(parcial) => mudar(parcial)}
        />
      ) : (<>
      <GrupoRadios<Recusa>
        legenda={t(`${N}propRefused.title`)} ajuda={t(`${N}propRefused.hint`)} exemplo={t(`${N}propRefused.example`)} bloqueado={aGuardar} valor={atual.recusaProposta} opcoes={RECUSAS}
        indisponiveis={semMotivo(RECUSAS)} rotulo={(r) => t(`${N}refusal.${r}`)} aoMudar={(recusaProposta) => mudar({ recusaProposta })}
      />
      <GrupoRadios<Recusa>
        legenda={t(`${N}contRefused.title`)} ajuda={t(`${N}contRefused.hint`)} exemplo={t(`${N}contRefused.example`)} bloqueado={aGuardar} valor={atual.recusaContrato} opcoes={RECUSAS}
        indisponiveis={semMotivo(RECUSAS)} rotulo={(r) => t(`${N}refusal.${r}`)} aoMudar={(recusaContrato) => mudar({ recusaContrato })}
      />
      <GrupoRadios<Cancelamento>
        legenda={t(`${N}cancel.title`)} ajuda={t(`${N}cancel.hint`)} exemplo={t(`${N}cancel.example`)} bloqueado={aGuardar} valor={atual.cancelamentoNoPrazo} opcoes={CANCELAMENTOS}
        indisponiveis={semMotivo(CANCELAMENTOS)} rotulo={(c) => t(`${N}cancel.${c}`)} aoMudar={(cancelamentoNoPrazo) => mudar({ cancelamentoNoPrazo })}
      />
      {blocoPrazo}
      </>)}
      {erro && (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">{t(`${N}error.title`)}</p>
          <p>{t(erro)}</p>
        </div>
      )}
      {/* Uma só região anunciada: o resultado («Configuração guardada.») e o aviso de que Contratos continua a converter, juntos. */}
      <div role="status" aria-live="polite" className="min-h-5 space-y-2">
        <p className="text-sm text-muted-foreground">{mensagem}</p>
        {avisoConversao && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t(`${N}notice`)}</p>}
      </div>
      {!somenteLeitura && (
        <Button
          type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-busy={aGuardar || undefined} aria-disabled={aGuardar || tabelaOcupada || undefined}
          onClick={() => void guardar()}
        >
          {aGuardar ? t(`${N}saving`) : t(`${N}save`)}
        </Button>
      )}
    </div>
  );
}
