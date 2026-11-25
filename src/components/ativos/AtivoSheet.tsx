/**
 * «Novo ativo» e «Editar ativo» (painel lateral), no padrão do `EquipamentoSheet` do RH. O grupo escolhe-se ao criar e não muda
 * (em edição só se lê). Serviço pede o modelo do catálogo (obrigatório) e a vida é opcional (vazio usa a do modelo); Estrutura e
 * Pessoas pedem o tipo e a vida (1 a 600 meses). As validações são as da base, mostradas junto do campo; um erro da base (ATV02
 * a ATV18) vem traduzido e, quando é de um campo, fica nesse campo. Só se abre a quem pode editar (a página decide).
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CamposTocadosProvider, CampoSelect, CampoTexto, type OpcaoSelect } from "@/components/rh-exemplo/form/Campos";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useAtivosOpcoes } from "@/hooks/ativos/useAtivosOpcoes";
import { useTranslation } from "@/hooks/useTranslation";
import { dataMaxima } from "@/lib/hr/custoBase";
import { cn } from "@/lib/utils";
import { CampoNumero } from "./CampoNumero";
import { campoDoCodigo } from "./lib/errosAtivo";
import { LIMITES_ATIVO, type Ativo, type GrupoAtivo, type OpcoesAtivo } from "./lib/tipos";
import { argumentosDoAtivo, tiposDoGrupo, validarAtivo, type CamposAtivo, type ErrosAtivo } from "./lib/validarAtivo";

export interface AvisoGuardado {
  nome: string;
  edicao: boolean;
}

interface Props {
  aberto: boolean;
  /** O grupo do ativo novo (em edição vale o do próprio ativo). */
  grupo: GrupoAtivo;
  /** O ativo a editar; `null` = criar. */
  ativo: Ativo | null;
  aoFechar: () => void;
  /** Depois de gravar: o nome e se foi uma edição (a página diz «registado» ou «atualizado»). */
  aoGuardar?: (aviso: AvisoGuardado) => void;
}

const euroTexto = (n: number): string => (n === 0 ? "" : String(n));

function camposIniciais(grupo: GrupoAtivo, a: Ativo | null): CamposAtivo {
  if (!a) {
    return { grupo, nome: "", tipo: "", catEquipamentoId: "", codigo: "", numSerie: "", dataCompra: "", valorCompra: "", valorResidual: "", vidaMeses: "", manutencaoAno: "", centroCustoId: "", localizacao: "", notas: "" };
  }
  return {
    grupo: a.grupo, nome: a.nome, tipo: a.tipo ?? "", catEquipamentoId: a.catEquipamentoId ?? "", codigo: a.codigo ?? "", numSerie: a.numSerie ?? "",
    dataCompra: a.dataCompra, valorCompra: String(a.valorCompra), valorResidual: euroTexto(a.valorResidual), vidaMeses: a.vidaMeses === null ? "" : String(a.vidaMeses),
    manutencaoAno: euroTexto(a.manutencaoAno), centroCustoId: a.centroCustoId ?? "", localizacao: a.localizacao ?? "", notas: a.notas ?? "",
  };
}

interface FormularioProps {
  grupo: GrupoAtivo;
  ativo: Ativo | null;
  opcoes: OpcoesAtivo | null;
  erroOpcoes: string | null;
  aoFechar: () => void;
  aoGuardar?: (aviso: AvisoGuardado) => void;
}

function Formulario({ grupo, ativo, opcoes, erroOpcoes, aoFechar, aoGuardar }: FormularioProps) {
  const { t } = useTranslation();
  const { criar, alterar } = useAtivoMutacoes();
  const edicao = ativo !== null;
  const [campos, setCampos] = useState<CamposAtivo>(() => camposIniciais(grupo, ativo));
  const [erros, setErros] = useState<ErrosAtivo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  // Um clique a seguir a outro, antes de a base responder, não envia duas vezes (o estado só muda no render seguinte).
  const ocupado = useRef(false);
  const formulario = useRef<HTMLFormElement>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (tentativa > 0) formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tentativa]);

  const mudar = (parcial: Partial<CamposAtivo>) => setCampos((c) => ({ ...c, ...parcial }));
  const g = campos.grupo;
  const equipamentos = opcoes?.equipamentos ?? [];
  const escolhido = equipamentos.find((e) => e.id === campos.catEquipamentoId) ?? null;
  // Em edição o modelo já ligado tem de aparecer no seletor mesmo que a lista ainda não tenha chegado.
  const opcoesModelo: OpcaoSelect[] = equipamentos.map((e) => ({ value: e.id, label: e.nome }));
  if (ativo?.catEquipamento && !opcoesModelo.some((o) => o.value === ativo.catEquipamento!.id)) {
    opcoesModelo.unshift({ value: ativo.catEquipamento.id, label: ativo.catEquipamento.nome });
  }
  const opcoesCentro: OpcaoSelect[] = (opcoes?.centrosCusto ?? []).map((c) => ({ value: c.id, label: c.nome }));
  const vidaAnosDoModelo = escolhido?.vidaAnos ?? ativo?.catEquipamento?.vidaAnos ?? null;

  const escolherModelo = (id: string) => {
    const e = equipamentos.find((x) => x.id === id);
    mudar({ catEquipamentoId: id, ...(e && campos.nome.trim() === "" ? { nome: e.nome } : {}) });
  };

  const guardar = async () => {
    if (ocupado.current) return;
    const invalidos = validarAtivo(campos);
    setErros(invalidos);
    setAviso(null);
    if (Object.keys(invalidos).length > 0) {
      setTentativa((n) => n + 1);
      return;
    }
    ocupado.current = true;
    setAGuardar(true);
    try {
      const args = argumentosDoAtivo(campos);
      const resultado = ativo ? await alterar(ativo.id, args) : await criar(campos.grupo, args);
      if (resultado.ok) {
        aoGuardar?.({ nome: campos.nome.trim(), edicao });
        aoFechar();
        return;
      }
      const campo = campoDoCodigo(resultado.codigo);
      if (campo) {
        setErros({ [campo]: resultado.mensagem });
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
      <form ref={formulario} className="mt-6 space-y-4" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void guardar(); }}>
        {edicao && (
          <p className="text-sm text-muted-foreground">
            {t("ativos.campo.grupo")}: <span data-testid="grupo-do-ativo" className="font-medium text-foreground">{t(`ativos.grupo.${g}`)}</span>
          </p>
        )}
        {erroOpcoes && <p role="alert" className="text-sm font-medium text-destructive">{erroOpcoes}</p>}
        {g === "servico" && (
          <CampoSelect
            id="ativo-modelo" label={t("ativos.campo.modelo")} valor={campos.catEquipamentoId} onChange={escolherModelo} obrigatorio
            vazioLabel={t("ativos.campo.modeloEscolher")} opcoes={opcoesModelo} ajuda={t("ativos.campo.modeloAjuda")} erro={erro("modelo")}
          />
        )}
        <CampoTexto id="ativo-nome" label={t("ativos.campo.nome")} valor={campos.nome} onChange={(v) => mudar({ nome: v })} obrigatorio erro={erro("nome")} />
        {g !== "servico" && (
          <CampoSelect
            id="ativo-tipo" label={t("ativos.campo.tipo")} valor={campos.tipo} onChange={(v) => mudar({ tipo: v })} obrigatorio
            vazioLabel={t("ativos.campo.tipoEscolher")} opcoes={tiposDoGrupo(g).map((x) => ({ value: x, label: t(`ativos.tipo.${g}.${x}`) }))} erro={erro("tipo")}
          />
        )}
        <CampoTexto id="ativo-codigo" label={t("ativos.campo.codigo")} valor={campos.codigo} onChange={(v) => mudar({ codigo: v })} erro={erro("codigo")} />
        <CampoTexto id="ativo-serie" label={t("ativos.campo.numSerie")} valor={campos.numSerie} onChange={(v) => mudar({ numSerie: v })} erro={erro("numSerie")} />
        <CampoTexto
          id="ativo-data" label={t("ativos.campo.dataCompra")} tipo="date" valor={campos.dataCompra} onChange={(v) => mudar({ dataCompra: v })} obrigatorio
          min={LIMITES_ATIVO.dataMinima} max={dataMaxima()} erro={erro("data")}
        />
        <CampoNumero id="ativo-valor" label={t("ativos.campo.valorCompra")} valor={campos.valorCompra} onChange={(v) => mudar({ valorCompra: v })} obrigatorio erro={erro("valorCompra")} />
        <CampoNumero
          id="ativo-residual" label={t("ativos.campo.valorResidual")} valor={campos.valorResidual} onChange={(v) => mudar({ valorResidual: v })}
          ajuda={t("ativos.campo.valorResidualAjuda")} erro={erro("residual")}
        />
        <CampoNumero
          id="ativo-vida" label={t("ativos.campo.vida")} valor={campos.vidaMeses} onChange={(v) => mudar({ vidaMeses: v })} modo="numeric"
          obrigatorio={g !== "servico"} erro={erro("vida")}
          ajuda={g === "servico"
            ? (vidaAnosDoModelo ? t("ativos.campo.vidaAjudaModelo", { n: vidaAnosDoModelo }) : t("ativos.campo.vidaAjudaSemModelo"))
            : t("ativos.campo.vidaAjudaIntervalo")}
        />
        <CampoNumero id="ativo-manutencao" label={t("ativos.campo.manutencao")} valor={campos.manutencaoAno} onChange={(v) => mudar({ manutencaoAno: v })} erro={erro("manutencao")} />
        <CampoSelect
          id="ativo-centro" label={t("ativos.campo.centroCusto")} valor={campos.centroCustoId} onChange={(v) => mudar({ centroCustoId: v })}
          vazioLabel={t("ativos.campo.centroCustoNenhum")} opcoes={opcoesCentro} erro={erro("centroCusto")}
        />
        <CampoTexto id="ativo-localizacao" label={t("ativos.campo.localizacao")} valor={campos.localizacao} onChange={(v) => mudar({ localizacao: v })} erro={erro("localizacao")} />
        <CampoTexto id="ativo-notas" label={t("ativos.campo.notas")} valor={campos.notas} onChange={(v) => mudar({ notas: v })} erro={erro("notas")} />
        {aviso && <p role="alert" className="text-sm font-medium text-destructive">{aviso}</p>}
        <SheetFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("ativos.sheet.cancelar")}</Button>
          <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t(edicao ? "ativos.sheet.guardarEditar" : "ativos.sheet.guardar")}</Button>
        </SheetFooter>
      </form>
    </CamposTocadosProvider>
  );
}

export function AtivoSheet({ aberto, grupo, ativo, aoFechar, aoGuardar }: Props) {
  const { t } = useTranslation();
  const { opcoes, erro } = useAtivosOpcoes(aberto);
  const grupoReal = ativo?.grupo ?? grupo;
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{ativo ? t("ativos.sheet.tituloEditar") : t("ativos.sheet.tituloNovo", { grupo: t(`ativos.grupo.${grupoReal}`) })}</SheetTitle>
          <SheetDescription>{t(ativo ? "ativos.sheet.ajudaEditar" : "ativos.sheet.ajudaNovo")}</SheetDescription>
        </SheetHeader>
        {/* Um formulário por ativo (ou por grupo novo): os campos recomeçam sempre limpos. */}
        <Formulario key={ativo?.id ?? `novo-${grupoReal}`} grupo={grupoReal} ativo={ativo} opcoes={opcoes} erroOpcoes={erro} aoFechar={aoFechar} aoGuardar={aoGuardar} />
      </SheetContent>
    </Sheet>
  );
}
