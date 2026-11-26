/**
 * «Registar ativo» e «Editar ativo» (painel lateral), em poucos passos: primeiro o essencial (grupo, equipamento do catálogo se for
 * serviço, nome, tipo, se é COMPRADO ou ALUGADO e o que cada um pede: valor, data de compra e vida útil, ou renda e datas do contrato)
 * e, numa secção recolhida, o resto (código, número de série, valor residual, manutenção, centro de custo, localização, notas). Cada
 * campo traz uma ajuda curta, e uma frase diz quanto custa por mês com o que já está escrito. O grupo e a forma escolhem-se ao
 * registar e não mudam (em edição só se lêem). A regra «serviço precisa de equipamento do catálogo» é um passo guiado com pesquisa.
 * As validações são as da base, junto do campo; um erro da base (ATV02 a ATV33) vem traduzido e, se é de um campo, fica nesse campo
 * (e abre a secção recolhida quando o campo está lá).
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CamposTocadosProvider, CampoSelect, CampoTexto, type OpcaoSelect } from "@/components/rh-exemplo/form/Campos";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useAtivosOpcoes } from "@/hooks/ativos/useAtivosOpcoes";
import { useTranslation } from "@/hooks/useTranslation";
import { hojeLocal } from "@/lib/hr/custoBase";
import { cn } from "@/lib/utils";
import { CampoNumero } from "./CampoNumero";
import { CamposAluguer, CamposComprado, FormaFixa, SeletorForma } from "./CamposFormaAtivo";
import { SeletorEquipamento } from "./SeletorEquipamento";
import { campoDoCodigo } from "./lib/errosAtivo";
import { vidaDoCatalogoEmMeses } from "./lib/previaAtivo";
import { GRUPOS_ATIVO, type Ativo, type GrupoAtivo, type OpcaoArmazem, type OpcoesAtivo, type OrigemVida } from "./lib/tipos";
import { argumentosDoAtivo, eAlugado, numeroTexto, tiposDoGrupo, validarAtivo, type CamposAtivo, type ErrosAtivo } from "./lib/validarAtivo";

export interface AvisoGuardado {
  nome: string;
  edicao: boolean;
}

interface Props {
  aberto: boolean;
  /** O grupo do ativo novo (em edição vale o do próprio ativo). */
  grupo: GrupoAtivo;
  /** O ativo a editar; `null` = registar. */
  ativo: Ativo | null;
  aoFechar: () => void;
  /** Ao fechar o painel, devolve o foco a quem o abriu (a página guarda a origem). */
  aoFecharFoco?: (e: Event) => void;
  /** Depois de gravar: o nome e se foi uma edição (a página diz «registado» ou «atualizado»). */
  aoGuardar?: (aviso: AvisoGuardado) => void;
}

/** A vida habitual de cada grupo, já preenchida (o RH usa 36 meses nos equipamentos). Serviço fica vazio: usa a do modelo. */
const VIDA_POR_OMISSAO: Record<GrupoAtivo, string> = { servico: "", estrutura: "60", pessoa: "36" };

/** Os campos que vivem na secção recolhida. */
const AVANCADOS: ReadonlyArray<keyof ErrosAtivo> = ["codigo", "numSerie", "residual", "manutencao", "centroCusto", "localizacao", "notas"];

/** Um valor em euros como se escreve no campo: «1234,50» (com vírgula e dois decimais), «1200» se for inteiro, vazio se for 0. */
const euroTexto = (n: number): string => (n === 0 ? "" : numeroTexto(n));

/** A origem da vida de um ativo que já existe: a que ficou guardada, ou «à mão» (um serviço sem vida própria usa o modelo). */
const origemDaVida = (a: Ativo): OrigemVida => a.vidaOrigem ?? "manual";

function camposIniciais(grupo: GrupoAtivo, a: Ativo | null): CamposAtivo {
  if (!a) {
    return {
      grupo, nome: "", tipo: "", catEquipamentoId: "", codigo: "", numSerie: "", dataCompra: hojeLocal(), valorCompra: "", valorResidual: "",
      vidaMeses: VIDA_POR_OMISSAO[grupo], manutencaoAno: "", centroCustoId: "", localizacao: "", notas: "",
      forma: "comprado", vidaOrigem: "manual", vidaCatalogoMeses: null, rendaMensal: "", inicioAluguer: hojeLocal(), fimAluguer: "", armazemId: "",
    };
  }
  return {
    grupo: a.grupo, nome: a.nome, tipo: a.tipo ?? "", catEquipamentoId: a.catEquipamentoId ?? "", codigo: a.codigo ?? "", numSerie: a.numSerie ?? "",
    dataCompra: a.dataCompra ?? "", valorCompra: a.valorCompra === null ? "" : numeroTexto(a.valorCompra), valorResidual: euroTexto(a.valorResidual),
    vidaMeses: a.vidaMeses === null ? "" : String(a.vidaMeses),
    manutencaoAno: euroTexto(a.manutencaoAno), centroCustoId: a.centroCustoId ?? "", localizacao: a.localizacao ?? "", notas: a.notas ?? "",
    forma: a.forma, vidaOrigem: origemDaVida(a), vidaCatalogoMeses: null, rendaMensal: a.rendaMensal === null ? "" : numeroTexto(a.rendaMensal),
    inicioAluguer: a.inicioAluguer ?? "", fimAluguer: a.fimAluguer ?? "", armazemId: a.armazem?.id ?? "",
  };
}

const temAvancados = (c: CamposAtivo): boolean => [c.codigo, c.numSerie, c.valorResidual, c.manutencaoAno, c.centroCustoId, c.localizacao, c.notas].some((v) => v !== "");

interface FormularioProps {
  grupo: GrupoAtivo;
  ativo: Ativo | null;
  opcoes: OpcoesAtivo | null;
  erroOpcoes: string | null;
  aoFechar: () => void;
  aoGuardar?: (aviso: AvisoGuardado) => void;
}

function SeletorGrupo({ valor, onChange }: { valor: GrupoAtivo; onChange: (g: GrupoAtivo) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("ativos.campo.grupoPergunta")}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {GRUPOS_ATIVO.map((g) => (
          <label
            key={g}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted motion-reduce:transition-none",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:checked]:border-primary has-[:checked]:bg-primary/5",
            )}
          >
            <input type="radio" name="ativo-grupo" value={g} checked={valor === g} onChange={() => onChange(g)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
            <span className="flex flex-col">
              <span className="font-medium">{t(`ativos.grupo.${g}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`ativos.grupo.${g}.curto`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Os armazéns que se podem escolher: os do Stock e, se o ativo já está ligado a um que foi apagado, esse (para não se perder a ligação). */
function armazensEscolhiveis(opcoes: OpcoesAtivo | null, ativo: Ativo | null): OpcaoArmazem[] {
  const lista = [...(opcoes?.armazens ?? [])];
  if (ativo?.armazem && !lista.some((w) => w.id === ativo.armazem!.id)) lista.unshift({ id: ativo.armazem.id, nome: ativo.armazem.nome ?? "—", codigo: null });
  return lista;
}

function Formulario({ grupo, ativo, opcoes, erroOpcoes, aoFechar, aoGuardar }: FormularioProps) {
  const { t } = useTranslation();
  const { criar, alterar } = useAtivoMutacoes();
  const edicao = ativo !== null;
  const [campos, setCampos] = useState<CamposAtivo>(() => camposIniciais(grupo, ativo));
  const [erros, setErros] = useState<ErrosAtivo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [avancadoAberto, setAvancadoAberto] = useState(() => edicao && temAvancados(camposIniciais(grupo, ativo)));
  // Só se troca a vida por omissão ao mudar de grupo enquanto ninguém lhe mexeu.
  const [vidaTocada, setVidaTocada] = useState(edicao);
  // Um clique a seguir a outro, antes de a base responder, não envia duas vezes (o estado só muda no render seguinte).
  const ocupado = useRef(false);
  const formulario = useRef<HTMLFormElement>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (tentativa > 0) formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tentativa]);

  const mudar = (parcial: Partial<CamposAtivo>) => setCampos((c) => ({ ...c, ...parcial }));
  const g = campos.grupo;
  const alugado = eAlugado(campos);
  const equipamentos = opcoes?.equipamentos ?? [];
  const escolhido = equipamentos.find((e) => e.id === campos.catEquipamentoId) ?? null;
  // Em edição o modelo já ligado tem de aparecer na lista mesmo que ela ainda não tenha chegado.
  const listaEquipamentos = [...equipamentos];
  if (ativo?.catEquipamento && !listaEquipamentos.some((o) => o.id === ativo.catEquipamento!.id)) {
    listaEquipamentos.unshift({ id: ativo.catEquipamento.id, nome: ativo.catEquipamento.nome, vidaAnos: ativo.catEquipamento.vidaAnos, vidaHoras: ativo.catEquipamento.vidaHoras });
  }
  const opcoesCentro: OpcaoSelect[] = (opcoes?.centrosCusto ?? []).map((c) => ({ value: c.id, label: c.nome }));
  const armazens = armazensEscolhiveis(opcoes, ativo);
  const mostraArmazem = g === "estrutura" && campos.tipo === "instalacoes" && opcoes?.podeVerArmazens === true;
  // A ajuda da vida de um serviço diz o que acontece se ficar vazia, conforme o que o modelo escolhido tem (anos, só horas, nada).
  const modelo = escolhido ?? (ativo?.catEquipamento ? { vidaAnos: ativo.catEquipamento.vidaAnos, vidaHoras: ativo.catEquipamento.vidaHoras } : null);
  const ajudaDaVidaDoModelo = !modelo
    ? t("ativos.campo.vidaAjudaSemModelo")
    : modelo.vidaAnos
      ? t("ativos.campo.vidaAjudaModelo", { n: modelo.vidaAnos })
      : modelo.vidaHoras ? t("ativos.campo.vidaAjudaSoHoras") : t("ativos.campo.vidaAjudaModeloSemVida");

  // A vida do equipamento do catálogo escolhido (pessoa). Em edição, com o mesmo equipamento, fica a que o ativo já tinha (não muda sozinha
  // o custo de meses passados se o catálogo mudou entretanto).
  const vidaDoModelo = vidaDoCatalogoEmMeses(escolhido?.vidaAnos ?? null);
  const mantemVida = ativo !== null && ativo.vidaOrigem === "catalogo" && ativo.vidaMeses !== null && ativo.catEquipamentoId === campos.catEquipamentoId;
  const vidaCatalogoMeses = mantemVida ? ativo.vidaMeses : vidaDoModelo;
  const camposFinais: CamposAtivo = { ...campos, vidaCatalogoMeses };

  const mudarGrupo = (novo: GrupoAtivo) => {
    if (novo === g) return;
    setCampos((c) => ({
      ...c, grupo: novo, tipo: "", catEquipamentoId: "", armazemId: "", vidaOrigem: "manual", vidaCatalogoMeses: null,
      // O serviço nunca se aluga: volta a comprado.
      forma: novo === "servico" ? "comprado" : c.forma,
      vidaMeses: vidaTocada ? c.vidaMeses : VIDA_POR_OMISSAO[novo],
    }));
    setErros({});
  };
  const mudarTipo = (tipo: string) => mudar({ tipo, ...(tipo === "instalacoes" ? {} : { armazemId: "" }) });
  const escolherModelo = (id: string) => {
    const e = equipamentos.find((x) => x.id === id);
    mudar({ catEquipamentoId: id, ...(e && campos.nome.trim() === "" ? { nome: e.nome } : {}) });
  };

  const guardar = async () => {
    if (ocupado.current) return;
    const invalidos = validarAtivo(camposFinais);
    setErros(invalidos);
    setAviso(null);
    if (Object.keys(invalidos).length > 0) {
      if (AVANCADOS.some((k) => invalidos[k])) setAvancadoAberto(true);
      setTentativa((n) => n + 1);
      return;
    }
    ocupado.current = true;
    setAGuardar(true);
    try {
      const args = argumentosDoAtivo(camposFinais);
      const resultado = ativo ? await alterar(ativo.id, args) : await criar(campos.grupo, args);
      if (resultado.ok) {
        aoGuardar?.({ nome: campos.nome.trim(), edicao });
        aoFechar();
        return;
      }
      const campo = resultado.campo ?? campoDoCodigo(resultado.codigo);
      if (campo) {
        setErros({ [campo]: resultado.mensagem });
        if (AVANCADOS.includes(campo)) setAvancadoAberto(true);
        setTentativa((n) => n + 1);
      } else {
        setAviso(resultado.mensagem);
      }
    } finally {
      ocupado.current = false;
      setAGuardar(false);
    }
  };

  // O texto do erro: as chaves vindas da validação do ecrã traduzem-se; o texto vindo da base já está traduzido.
  const erro = (campo: keyof ErrosAtivo): string | null => {
    const e = erros[campo];
    return e ? (e.startsWith("ativos.") ? t(e) : e) : null;
  };

  return (
    <CamposTocadosProvider onTocar={() => {}} rotuloObrigatorio={t("ativos.campo.obrigatorio")}>
      <form ref={formulario} className="mt-6 space-y-5" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void guardar(); }}>
        {erroOpcoes && <p role="alert" className="text-sm font-medium text-destructive">{erroOpcoes}</p>}
        {edicao ? (
          <p className="text-sm text-muted-foreground">
            {t("ativos.campo.grupo")}: <span data-testid="grupo-do-ativo" className="font-medium text-foreground">{t(`ativos.grupo.${g}`)}</span>
          </p>
        ) : (
          <SeletorGrupo valor={g} onChange={mudarGrupo} />
        )}
        {ativo !== null && ativo.ocupacoes.length > 0 && (
          <p role="note" data-testid="aviso-edicao-passado" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            {t("ativos.aviso.editarMudaPassado")}
          </p>
        )}

        {g === "servico" && <SeletorEquipamento id="ativo-modelo" opcoes={listaEquipamentos} valor={campos.catEquipamentoId} onChange={escolherModelo} erro={erro("modelo")} />}
        <CampoTexto id="ativo-nome" label={t("ativos.campo.nome")} valor={campos.nome} onChange={(v) => mudar({ nome: v })} obrigatorio ajuda={t("ativos.ajuda.nome")} erro={erro("nome")} />
        {g !== "servico" && (
          <CampoSelect
            id="ativo-tipo" label={t("ativos.campo.tipo")} valor={campos.tipo} onChange={mudarTipo} obrigatorio
            vazioLabel={t("ativos.campo.tipoEscolher")} opcoes={tiposDoGrupo(g).map((x) => ({ value: x, label: t(`ativos.tipo.${g}.${x}`) }))} erro={erro("tipo")}
          />
        )}
        {g !== "servico" && (edicao ? <FormaFixa forma={campos.forma} /> : <SeletorForma valor={campos.forma} aoMudar={(forma) => mudar({ forma })} />)}

        {alugado
          ? <CamposAluguer campos={camposFinais} mudar={mudar} erro={erro} />
          : <CamposComprado campos={camposFinais} mudar={mudar} erro={erro} equipamentos={listaEquipamentos} ajudaVidaServico={ajudaDaVidaDoModelo} aoTocarVida={() => setVidaTocada(true)} />}

        {mostraArmazem && (
          <CampoSelect
            id="ativo-armazem" label={t("ativos.campo.armazem")} valor={campos.armazemId} onChange={(v) => mudar({ armazemId: v })}
            vazioLabel={t("ativos.campo.armazemNenhum")} opcoes={armazens.map((w) => ({ value: w.id, label: w.nome }))} ajuda={t("ativos.ajuda.armazem")} erro={erro("armazem")}
          />
        )}

        <Collapsible open={avancadoAberto} onOpenChange={setAvancadoAberto} className="rounded-md border">
          <CollapsibleTrigger className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-muted", FOCO)}>
            {t("ativos.maisDetalhes")}
            <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", avancadoAberto && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t p-3">
            <CampoTexto id="ativo-codigo" label={t("ativos.campo.codigo")} valor={campos.codigo} onChange={(v) => mudar({ codigo: v })} ajuda={t("ativos.ajuda.codigo")} erro={erro("codigo")} />
            <CampoTexto id="ativo-serie" label={t("ativos.campo.numSerie")} valor={campos.numSerie} onChange={(v) => mudar({ numSerie: v })} ajuda={t("ativos.ajuda.numSerie")} erro={erro("numSerie")} />
            {!alugado && <CampoNumero id="ativo-residual" label={t("ativos.campo.valorResidual")} valor={campos.valorResidual} onChange={(v) => mudar({ valorResidual: v })} ajuda={t("ativos.campo.valorResidualAjuda")} erro={erro("residual")} />}
            <CampoNumero id="ativo-manutencao" label={t("ativos.campo.manutencao")} valor={campos.manutencaoAno} onChange={(v) => mudar({ manutencaoAno: v })} ajuda={t("ativos.ajuda.manutencao")} erro={erro("manutencao")} />
            <CampoSelect
              id="ativo-centro" label={t("ativos.campo.centroCusto")} valor={campos.centroCustoId} onChange={(v) => mudar({ centroCustoId: v })}
              vazioLabel={t("ativos.campo.centroCustoNenhum")} opcoes={opcoesCentro} ajuda={t("ativos.ajuda.centroCusto")} erro={erro("centroCusto")}
            />
            <CampoTexto id="ativo-localizacao" label={t("ativos.campo.localizacao")} valor={campos.localizacao} onChange={(v) => mudar({ localizacao: v })} ajuda={t("ativos.ajuda.localizacao")} erro={erro("localizacao")} />
            <CampoTexto id="ativo-notas" label={t("ativos.campo.notas")} valor={campos.notas} onChange={(v) => mudar({ notas: v })} ajuda={t("ativos.ajuda.notas")} erro={erro("notas")} />
          </CollapsibleContent>
        </Collapsible>

        {aviso && <p role="alert" className="text-sm font-medium text-destructive">{aviso}</p>}
        <SheetFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("ativos.sheet.cancelar")}</Button>
          <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t(edicao ? "ativos.sheet.guardarEditar" : "ativos.sheet.guardar")}</Button>
        </SheetFooter>
      </form>
    </CamposTocadosProvider>
  );
}

export function AtivoSheet({ aberto, grupo, ativo, aoFechar, aoFecharFoco, aoGuardar }: Props) {
  const { t } = useTranslation();
  const { opcoes, erro } = useAtivosOpcoes(aberto);
  const grupoReal = ativo?.grupo ?? grupo;
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" onCloseAutoFocus={aoFecharFoco}>
        <SheetHeader>
          <SheetTitle>{t(ativo ? "ativos.sheet.tituloEditar" : "ativos.sheet.tituloNovo")}</SheetTitle>
          <SheetDescription>{t(ativo ? "ativos.sheet.ajudaEditar" : "ativos.sheet.ajudaNovo")}</SheetDescription>
        </SheetHeader>
        {/* Um formulário por ativo (ou por grupo de partida): os campos recomeçam sempre limpos. */}
        <Formulario key={ativo?.id ?? `novo-${grupoReal}`} grupo={grupoReal} ativo={ativo} opcoes={opcoes} erroOpcoes={erro} aoFechar={aoFechar} aoGuardar={aoGuardar} />
      </SheetContent>
    </Sheet>
  );
}
