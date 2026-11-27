/**
 * «Registar ativo» e «Editar ativo» (painel lateral), em poucos passos: primeiro o essencial (grupo, equipamento do catálogo se for
 * serviço, nome, tipo, se é COMPRADO ou ALUGADO e o que cada um pede: valor, data de compra e vida útil, ou renda e datas do contrato)
 * e, numa secção recolhida, o resto (código, número de série, valor residual, manutenção, centro de custo, localização, notas). Cada
 * campo traz uma ajuda curta, e uma frase diz quanto custa por mês com o que já está escrito. O grupo e a forma escolhem-se ao
 * registar e não mudam (em edição só se lêem). A regra «serviço precisa de equipamento do catálogo» é um passo guiado com pesquisa.
 * As validações são as da base, junto do campo; um erro da base (ATV02 a ATV33) vem traduzido e, se é de um campo, fica nesse campo
 * (e abre a secção recolhida quando o campo está lá).
 */
import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from "react";
import { Check, ChevronDown, CircleCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { euros } from "@/components/rh-exemplo/custo/formato";
import { CamposTocadosProvider, CampoSelect, CampoTexto, type OpcaoSelect } from "@/components/rh-exemplo/form/Campos";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useAtivosOpcoes } from "@/hooks/ativos/useAtivosOpcoes";
import { useTranslation } from "@/hooks/useTranslation";
import { hojeLocal } from "@/lib/hr/custoBase";
import { cn } from "@/lib/utils";
import { AvisoAtivo } from "./AvisoAtivo";
import { CampoNumero } from "./CampoNumero";
import { CamposAluguer, CamposComprado, FormaFixa, Previa, SeletorForma } from "./CamposFormaAtivo";
import { SeletorEquipamento } from "./SeletorEquipamento";
import { ICONE_GRUPO, TOM_GRUPO, iconeDoAtivo } from "./lib/ativosUi";
import { campoDoCodigo } from "./lib/errosAtivo";
import { previaDaConta, vidaDoCatalogoEmMeses } from "./lib/previaAtivo";
import { GRUPOS_ATIVO, type Ativo, type GrupoAtivo, type OpcaoArmazem, type OpcoesAtivo, type OrigemVida } from "./lib/tipos";
import { argumentosDoAtivo, eAlugado, numeroDoCampo, numeroTexto, tiposDoGrupo, validarAtivo, type CamposAtivo, type ErrosAtivo } from "./lib/validarAtivo";

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
    <fieldset className="space-y-2.5">
      <legend className="text-sm font-medium leading-none">{t("ativos.campo.grupoPergunta")}</legend>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {GRUPOS_ATIVO.map((g) => {
          const Icone = ICONE_GRUPO[g];
          return (
            <label
              key={g}
              className={cn(
                "relative flex min-h-11 cursor-pointer flex-row items-center gap-3 rounded-xl border-[1.5px] bg-card p-3 text-sm transition-[border-color,box-shadow,background-color] hover:bg-muted/50 motion-reduce:transition-none sm:flex-col sm:items-start sm:p-3.5",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:checked]:border-primary has-[:checked]:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
              )}
            >
              <input type="radio" name="ativo-grupo" value={g} checked={valor === g} onChange={() => onChange(g)} className="peer sr-only" />
              <span aria-hidden="true" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TOM_GRUPO[g])}>
                <Icone className="h-5 w-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{t(`ativos.grupo.${g}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`ativos.grupo.${g}.curto`)}</span>
              </span>
              <CircleCheck aria-hidden="true" className="absolute right-3 top-3 hidden h-4 w-4 text-primary peer-checked:block dark:text-violet-300" />
            </label>
          );
        })}
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
  // O passo em que se está (o da secção com o foco, ou o último escolhido no indicador): só muda o destaque, nunca esconde campos.
  const [passoAtual, setPassoAtual] = useState(1);

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
  const eInstalacoes = g === "estrutura" && campos.tipo === "instalacoes";
  const mostraArmazem = eInstalacoes && opcoes?.podeVerArmazens === true;
  // Só se diz que falta acesso quando as opções já chegaram e dizem que não (enquanto carregam, ainda não se sabe).
  const semAcessoAoStock = eInstalacoes && opcoes != null && opcoes.podeVerArmazens === false;
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

  const valorGrande = alugado ? numeroDoCampo(campos.rendaMensal) : numeroDoCampo(campos.valorCompra);
  const IconeDoAtivo = iconeDoAtivo(g, campos.tipo || null);
  const tipoTexto = campos.tipo && g !== "servico" ? t(`ativos.tipo.${g}.${campos.tipo}`) : null;

  /** O indicador de passos é só navegação: leva à secção (todos os campos estão sempre no formulário, pela mesma ordem). */
  const irPara = (n: number) => {
    setPassoAtual(n);
    if (n === 4) setAvancadoAberto(true);
    const seccao = formulario.current?.querySelector<HTMLElement>(`[data-passo="${n}"]`);
    if (!seccao) return;
    const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    seccao.scrollIntoView?.({ block: "start", behavior: suave ? "smooth" : "auto" });
    // Depois de a secção recolhida abrir, o foco vai para o primeiro campo dela.
    requestAnimationFrame(() => seccao.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), button:not([disabled]), [role=combobox], textarea")?.focus({ preventScroll: true }));
  };
  const aoFocar = (ev: FocusEvent<HTMLDivElement>) => {
    const n = Number((ev.target as HTMLElement).closest<HTMLElement>("[data-passo]")?.dataset.passo);
    if (n && n !== passoAtual) setPassoAtual(n);
  };
  const PASSOS = [t("ativos.ui.passo.grupo"), t("ativos.ui.passo.identificacao"), t("ativos.ui.passo.aquisicao"), t("ativos.ui.passo.detalhes")];
  const SECCAO = "scroll-mt-4 space-y-5";
  const TITULO = "flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
  const NUMERO = "grid h-5 w-5 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground";

  return (
    <CamposTocadosProvider onTocar={() => {}} rotuloObrigatorio={t("ativos.campo.obrigatorio")}>
      <form ref={formulario} className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void guardar(); }}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-6">
          <div className="grid gap-5 lg:grid-cols-[11rem_minmax(0,1fr)_15rem] lg:gap-7">
            <nav aria-label={t("ativos.ui.passos")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
              <ol className="flex gap-1.5 lg:sticky lg:top-0 lg:flex-col">
                {PASSOS.map((nome, i) => {
                  const n = i + 1;
                  const atual = passoAtual === n;
                  const feito = passoAtual > n;
                  return (
                    <li key={n} className="shrink-0">
                      <button
                        type="button" onClick={() => irPara(n)} aria-current={atual ? "step" : undefined}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none",
                          atual && "bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary dark:bg-primary/20 dark:text-violet-300 dark:hover:text-violet-300",
                          FOCO,
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-current text-xs font-bold",
                            feito && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {feito ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
                        </span>
                        {nome}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div className="min-w-0 space-y-8" onFocus={aoFocar}>
              {erroOpcoes && <AvisoAtivo tom="erro" role="alert">{erroOpcoes}</AvisoAtivo>}
              <section data-passo="1" className={SECCAO} aria-labelledby="ativo-passo-1">
                <h3 id="ativo-passo-1" className={TITULO}><span aria-hidden="true" className={NUMERO}>1</span>{PASSOS[0]}</h3>
                {edicao ? (
                  <p className="text-sm text-muted-foreground">
                    {t("ativos.campo.grupo")}: <span data-testid="grupo-do-ativo" className="font-medium text-foreground">{t(`ativos.grupo.${g}`)}</span>
                  </p>
                ) : (
                  <SeletorGrupo valor={g} onChange={mudarGrupo} />
                )}
                {ativo !== null && ativo.ocupacoes.length > 0 && (
                  <AvisoAtivo tom="aviso" role="note" data-testid="aviso-edicao-passado" className="text-xs leading-5">{t("ativos.aviso.editarMudaPassado")}</AvisoAtivo>
                )}
              </section>

              <section data-passo="2" className={SECCAO} aria-labelledby="ativo-passo-2">
                <h3 id="ativo-passo-2" className={TITULO}><span aria-hidden="true" className={NUMERO}>2</span>{PASSOS[1]}</h3>
                {g === "servico" && <SeletorEquipamento id="ativo-modelo" opcoes={listaEquipamentos} valor={campos.catEquipamentoId} onChange={escolherModelo} erro={erro("modelo")} />}
                <CampoTexto id="ativo-nome" label={t("ativos.campo.nome")} valor={campos.nome} onChange={(v) => mudar({ nome: v })} obrigatorio ajuda={t("ativos.ajuda.nome")} erro={erro("nome")} />
                {g !== "servico" && (
                  <CampoSelect
                    id="ativo-tipo" label={t("ativos.campo.tipo")} valor={campos.tipo} onChange={mudarTipo} obrigatorio
                    vazioLabel={t("ativos.campo.tipoEscolher")} opcoes={tiposDoGrupo(g).map((x) => ({ value: x, label: t(`ativos.tipo.${g}.${x}`) }))} erro={erro("tipo")}
                  />
                )}
                {/* A ligação ao armazém logo por baixo do tipo, para se ver que existe (antes ficava no fim, depois do valor e da vida útil). */}
                {mostraArmazem && (
                  <CampoSelect
                    id="ativo-armazem" label={t("ativos.campo.armazem")} valor={campos.armazemId} onChange={(v) => mudar({ armazemId: v })}
                    vazioLabel={t("ativos.campo.armazemNenhum")} opcoes={armazens.map((w) => ({ value: w.id, label: w.nome }))} ajuda={t("ativos.ajuda.armazem")} erro={erro("armazem")}
                  />
                )}
                {semAcessoAoStock && (
                  <p data-testid="armazem-sem-acesso" className="text-xs leading-5 text-muted-foreground">{t("ativos.ajuda.armazemSemAcesso")}</p>
                )}
              </section>

              <section data-passo="3" className={SECCAO} aria-labelledby="ativo-passo-3">
                <h3 id="ativo-passo-3" className={TITULO}><span aria-hidden="true" className={NUMERO}>3</span>{PASSOS[2]}</h3>
                {g !== "servico" && (edicao ? <FormaFixa forma={campos.forma} /> : <SeletorForma valor={campos.forma} aoMudar={(forma) => mudar({ forma })} />)}
                {alugado
                  ? <CamposAluguer campos={camposFinais} mudar={mudar} erro={erro} />
                  : <CamposComprado campos={camposFinais} mudar={mudar} erro={erro} equipamentos={listaEquipamentos} ajudaVidaServico={ajudaDaVidaDoModelo} aoTocarVida={() => setVidaTocada(true)} />}
              </section>

              <section data-passo="4" className={SECCAO} aria-labelledby="ativo-passo-4">
                <h3 id="ativo-passo-4" className={TITULO}><span aria-hidden="true" className={NUMERO}>4</span>{PASSOS[3]}</h3>
                <Collapsible open={avancadoAberto} onOpenChange={setAvancadoAberto} className="rounded-xl border">
                  <CollapsibleTrigger className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-left text-sm font-medium hover:bg-muted", FOCO)}>
                    {t("ativos.maisDetalhes")}
                    <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", avancadoAberto && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 border-t p-3.5">
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
              </section>

              {aviso && <AvisoAtivo tom="erro" role="alert">{aviso}</AvisoAtivo>}
            </div>

            {/* A pré-visualização: o que está escrito, como vai aparecer, e quanto custa por mês. */}
            <aside className="lg:sticky lg:top-0 lg:self-start">
              <div className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TOM_GRUPO[g])}>
                    <IconeDoAtivo className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-[15px] font-semibold leading-snug">{campos.nome.trim() || t("ativos.ui.previa.novo")}</p>
                    <p className="truncate text-xs text-muted-foreground">{[t(`ativos.grupo.${g}`), tipoTexto].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <p className="w-fit max-w-full truncate rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary dark:bg-primary/20 dark:text-violet-300">
                  {campos.codigo.trim() || t("ativos.ui.previa.codigoAuto")}
                </p>
                <div className="border-t pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t(alugado ? "ativos.detalhe.rendaRotulo" : "ativos.col.valorCompra")}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                    {valorGrande !== null && Number.isFinite(valorGrande) && valorGrande > 0 ? euros(valorGrande, "—") : "—"}
                  </p>
                </div>
                {g !== "servico" && <Previa previa={previaDaConta(camposFinais)} className="text-muted-foreground" />}
              </div>
            </aside>
          </div>
        </div>

        <SheetFooter className="gap-2 border-t bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:gap-3 sm:space-x-0 sm:px-8">
          <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11 rounded-xl px-5", FOCO)}>{t("ativos.sheet.cancelar")}</Button>
          <Button type="submit" disabled={aGuardar} className={cn("min-h-11 rounded-xl px-6 font-semibold", FOCO)}>{t(edicao ? "ativos.sheet.guardarEditar" : "ativos.sheet.guardar")}</Button>
        </SheetFooter>
      </form>
    </CamposTocadosProvider>
  );
}

export function AtivoSheet({ aberto, grupo, ativo, aoFechar, aoFecharFoco, aoGuardar }: Props) {
  const { t } = useTranslation();
  const { opcoes, erro } = useAtivosOpcoes(aberto);
  const grupoReal = ativo?.grupo ?? grupo;
  const Icone = ICONE_GRUPO[grupoReal];
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[960px]" onCloseAutoFocus={aoFecharFoco}>
        <SheetHeader className="space-y-0 border-b px-4 py-5 pr-12 text-left sm:px-8">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-violet-300">
              {ativo ? <Icone className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </span>
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-2xl font-bold tracking-tight">{t(ativo ? "ativos.sheet.tituloEditar" : "ativos.sheet.tituloNovo")}</SheetTitle>
              <SheetDescription>{t(ativo ? "ativos.sheet.ajudaEditar" : "ativos.sheet.ajudaNovo")}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        {/* Um formulário por ativo (ou por grupo de partida): os campos recomeçam sempre limpos. */}
        <Formulario key={ativo?.id ?? `novo-${grupoReal}`} grupo={grupoReal} ativo={ativo} opcoes={opcoes} erroOpcoes={erro} aoFechar={aoFechar} aoGuardar={aoGuardar} />
      </SheetContent>
    </Sheet>
  );
}
