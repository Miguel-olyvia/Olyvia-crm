import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, EyeOff, Loader2, Pencil, Plus, Save, Shapes, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCamposEmpresa, useInvalidarCamposEmpresa } from "@/hooks/useCamposEmpresa";
import { CamposDinamicos } from "@/components/campos/CamposDinamicos";
import { DialogoCampoConfig } from "@/components/campos/DialogoCampoConfig";
import { gravarEmpresa, gravarFicha } from "@/lib/campos/api";
import {
  FICHAS, ROTULO_FICHA, ROTULO_PAPEL, ROTULO_TIPO, SECCOES_PADRAO,
  type DefCampo, type Ficha,
} from "@/lib/campos/catalogo";
import {
  combinarFicha, linhasParaGravar, rotuloSeccao, validarValores, type ValoresFormulario,
} from "@/lib/campos/definicoes";
import { MODELOS_SETOR, type ModeloSetor } from "@/lib/campos/modelosSetor";
import { DESCRICAO_TERMO, TERMOS, termosParaGravar, type Termos } from "@/lib/campos/termos";
import { cn } from "@/lib/utils";

type Separador = Ficha | "nomes";

const mensagemErro = (e: unknown) =>
  (e as { message?: string })?.message || "Não foi possível gravar.";

const vazioPorFicha = <T,>(f: (ficha: Ficha) => T) =>
  Object.fromEntries(FICHAS.map((x) => [x, f(x)])) as Record<Ficha, T>;

/** Secções da ficha pela ordem: as padrão primeiro, depois as da empresa. */
const seccoesDe = (ficha: Ficha, todos: readonly DefCampo[]) => {
  const chaves = Array.from(new Set([...SECCOES_PADRAO[ficha].map((s) => s.chave), ...todos.map((d) => d.seccao)]));
  return chaves
    .map((chave) => ({
      chave,
      rotulo: SECCOES_PADRAO[ficha].find((s) => s.chave === chave)?.rotulo ?? rotuloSeccao(chave),
      campos: todos.filter((d) => d.seccao === chave),
    }))
    .filter((s) => s.campos.length > 0);
};

/**
 * Configurações → Fichas e campos. Cada empresa adapta ao seu negócio a ficha
 * do local, o diagnóstico, o cliente e a lead, e os nomes das coisas. Os
 * campos de sistema (os que o planeamento e as sugestões usam) só mudam de
 * texto, ordem e visibilidade; os da empresa são livres.
 * Grava por rpc_cfg_gravar_ficha / rpc_cfg_gravar_empresa (20261209100000).
 */
export default function CamposConfig() {
  const { toast } = useToast();
  const { org, fichas, termos, modeloSetor, disponivel, carregando } = useCamposEmpresa();
  const invalidar = useInvalidarCamposEmpresa();

  const [separador, setSeparador] = useState<Separador>("local");
  const [rascunho, setRascunho] = useState<Record<Ficha, DefCampo[]>>(() => vazioPorFicha((f) => fichas[f].todos));
  const [sujo, setSujo] = useState<Record<Ficha, boolean>>(() => vazioPorFicha(() => false));
  const sujoRef = useRef(sujo);
  sujoRef.current = sujo;
  const [termosRasc, setTermosRasc] = useState<Termos>(termos);
  const [termosSujos, setTermosSujos] = useState(false);
  const [gravando, setGravando] = useState(false);

  const [dialogo, setDialogo] = useState<{ ficha: Ficha; campo: DefCampo | null } | null>(null);
  const [apagar, setApagar] = useState<{ ficha: Ficha; campo: DefCampo } | null>(null);
  const [modelosAbertos, setModelosAbertos] = useState(false);
  const [modeloEscolhido, setModeloEscolhido] = useState<ModeloSetor | null>(null);

  // Quando a configuração (re)carrega, as fichas sem alterações por gravar
  // passam a mostrar o que está na base.
  useEffect(() => {
    setRascunho((prev) => vazioPorFicha((f) => (sujoRef.current[f] ? prev[f] : fichas[f].todos)));
  }, [fichas]);
  useEffect(() => {
    if (!termosSujos) setTermosRasc(termos);
  }, [termos, termosSujos]);

  const podeGravar = !!org && disponivel && !gravando;
  const modeloAtual = MODELOS_SETOR.find((m) => m.chave === modeloSetor) ?? null;

  const mudarFicha = (ficha: Ficha, todos: DefCampo[]) => {
    setRascunho((p) => ({ ...p, [ficha]: todos }));
    setSujo((p) => ({ ...p, [ficha]: true }));
  };

  const guardarCampo = (ficha: Ficha, antigo: DefCampo | null, novo: DefCampo) => {
    const lista = rascunho[ficha];
    if (antigo) mudarFicha(ficha, lista.map((d) => (d === antigo ? novo : d)));
    else mudarFicha(ficha, [...lista, { ...novo, ordem: lista.length }]);
    setDialogo(null);
  };

  const alternarVisivel = (ficha: Ficha, campo: DefCampo, ativo: boolean) =>
    mudarFicha(ficha, rascunho[ficha].map((d) => (d === campo ? { ...d, ativo } : d)));

  /** Sobe/desce dentro da mesma secção. */
  const mover = (ficha: Ficha, campo: DefCampo, direcao: -1 | 1) => {
    const lista = [...rascunho[ficha]];
    const i = lista.indexOf(campo);
    let j = i + direcao;
    while (j >= 0 && j < lista.length && lista[j].seccao !== campo.seccao) j += direcao;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    mudarFicha(ficha, lista);
  };

  const confirmarApagar = () => {
    if (!apagar) return;
    const { ficha, campo } = apagar;
    // As condições que dependiam deste campo deixam de fazer sentido.
    mudarFicha(ficha, rascunho[ficha]
      .filter((d) => d !== campo)
      .map((d) => (d.condicao?.campo === campo.chave ? { ...d, condicao: null } : d)));
    setApagar(null);
  };

  const gravarUmaFicha = async (ficha: Ficha) => {
    if (!org) return;
    setGravando(true);
    try {
      await gravarFicha(org, ficha, linhasParaGravar(ficha, rascunho[ficha]));
      setSujo((p) => ({ ...p, [ficha]: false }));
      sujoRef.current = { ...sujoRef.current, [ficha]: false };
      await invalidar(org);
      toast({ title: "Gravado", description: `${ROTULO_FICHA[ficha]}: configuração gravada.` });
    } catch (e) {
      toast({ title: "Erro ao gravar", description: mensagemErro(e), variant: "destructive" });
    } finally {
      setGravando(false);
    }
  };

  const gravarNomes = async () => {
    if (!org) return;
    for (const k of TERMOS) {
      const { singular, plural } = termosRasc[k];
      if (!singular.trim() || !plural.trim() || singular.trim().length > 40 || plural.trim().length > 40) {
        toast({ title: "Nomes incompletos", description: "Cada nome precisa de singular e plural (até 40 caracteres).", variant: "destructive" });
        return;
      }
    }
    setGravando(true);
    try {
      const limpos = Object.fromEntries(TERMOS.map((k) => [k, {
        singular: termosRasc[k].singular.trim(), plural: termosRasc[k].plural.trim(),
      }])) as Termos;
      await gravarEmpresa(org, modeloSetor, termosParaGravar(limpos));
      setTermosSujos(false);
      await invalidar(org);
      toast({ title: "Gravado", description: "Nomes gravados." });
    } catch (e) {
      toast({ title: "Erro ao gravar", description: mensagemErro(e), variant: "destructive" });
    } finally {
      setGravando(false);
    }
  };

  const aplicarModelo = async (m: ModeloSetor) => {
    if (!org) return;
    setGravando(true);
    try {
      for (const f of FICHAS) {
        // Normaliza a ordem: os de sistema ficam onde sempre estiveram e os
        // da empresa vão para o fim.
        const combinada = combinarFicha(f, m.fichas[f] ?? []);
        await gravarFicha(org, f, (m.fichas[f] ?? []).length ? linhasParaGravar(f, combinada.todos) : []);
      }
      await gravarEmpresa(org, m.chave, m.termos);
      setSujo(vazioPorFicha(() => false));
      sujoRef.current = vazioPorFicha(() => false);
      setTermosSujos(false);
      await invalidar(org);
      toast({ title: "Modelo aplicado", description: `${m.nome}: fichas e nomes atualizados.` });
      setModeloEscolhido(null);
      setModelosAbertos(false);
    } catch (e) {
      toast({ title: "Erro ao aplicar o modelo", description: mensagemErro(e), variant: "destructive" });
    } finally {
      setGravando(false);
    }
  };

  if (!org) {
    return <p className="text-muted-foreground">Escolha uma empresa para configurar as fichas.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-2">Fichas e campos</h1>
          <p className="text-muted-foreground max-w-2xl">
            Adapte as fichas e os nomes ao seu negócio. Os campos de sistema são os que o planeamento e as
            sugestões usam: pode mudar-lhes o texto, a ordem e escondê-los. Os campos da empresa são seus.
          </p>
          {modeloAtual && (
            <p className="mt-1 text-sm text-muted-foreground">Modelo de partida: <strong>{modeloAtual.nome}</strong></p>
          )}
        </div>
        <Button variant="outline" onClick={() => setModelosAbertos(true)} disabled={!podeGravar}>
          <Shapes className="h-4 w-4 mr-2" /> Aplicar modelo do setor
        </Button>
      </div>

      {!carregando && !disponivel && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ainda não disponível</AlertTitle>
          <AlertDescription>
            A base de dados ainda não tem os campos configuráveis (migração 20261209100000). As fichas continuam
            a funcionar como sempre; esta página só grava depois de a migração ser aplicada.
          </AlertDescription>
        </Alert>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
      ) : (
        <Tabs value={separador} onValueChange={(v) => setSeparador(v as Separador)}>
          <TabsList className="flex-wrap h-auto">
            {FICHAS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {ROTULO_FICHA[f]}{sujo[f] ? " •" : ""}
              </TabsTrigger>
            ))}
            <TabsTrigger value="nomes">Nomes{termosSujos ? " •" : ""}</TabsTrigger>
          </TabsList>

          {FICHAS.map((f) => (
            <TabsContent key={f} value={f} className="mt-4">
              <SeparadorFicha
                ficha={f}
                todos={rascunho[f]}
                sujo={sujo[f]}
                podeGravar={podeGravar}
                gravando={gravando}
                onNovo={() => setDialogo({ ficha: f, campo: null })}
                onEditar={(c) => setDialogo({ ficha: f, campo: c })}
                onApagar={(c) => setApagar({ ficha: f, campo: c })}
                onVisivel={(c, v) => alternarVisivel(f, c, v)}
                onMover={(c, d) => mover(f, c, d)}
                onGravar={() => gravarUmaFicha(f)}
              />
            </TabsContent>
          ))}

          <TabsContent value="nomes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Nomes</CardTitle>
                <CardDescription>
                  Como se chamam as coisas na sua empresa. Aparecem no menu e nas fichas em vez dos de sempre.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {TERMOS.map((k) => (
                  <div key={k} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-3 items-end">
                    <p className="text-sm text-muted-foreground sm:pb-2">{DESCRICAO_TERMO[k]}</p>
                    <div className="space-y-1">
                      <Label htmlFor={`termo_${k}_s`}>Singular</Label>
                      <Input id={`termo_${k}_s`} value={termosRasc[k].singular} maxLength={40}
                        onChange={(e) => { setTermosRasc((p) => ({ ...p, [k]: { ...p[k], singular: e.target.value } })); setTermosSujos(true); }} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`termo_${k}_p`}>Plural</Label>
                      <Input id={`termo_${k}_p`} value={termosRasc[k].plural} maxLength={40}
                        onChange={(e) => { setTermosRasc((p) => ({ ...p, [k]: { ...p[k], plural: e.target.value } })); setTermosSujos(true); }} />
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button onClick={gravarNomes} disabled={!podeGravar || !termosSujos}>
                    {gravando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Gravar nomes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {dialogo && (
        <DialogoCampoConfig
          aberto
          onOpenChange={(a) => !a && setDialogo(null)}
          ficha={dialogo.ficha}
          campo={dialogo.campo}
          todos={rascunho[dialogo.ficha]}
          onGuardar={(c) => guardarCampo(dialogo.ficha, dialogo.campo, c)}
        />
      )}

      <AlertDialog open={!!apagar} onOpenChange={(a) => !a && setApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar «{apagar?.campo.rotulo}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Os valores já guardados não se perdem; se voltar a criar o campo com a mesma chave
              ({apagar?.campo.chave}), reaparecem. Se só o quer tirar das fichas, pode escondê-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarApagar}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={modelosAbertos} onOpenChange={(a) => { setModelosAbertos(a); if (!a) setModeloEscolhido(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Modelo do setor</DialogTitle>
            <DialogDescription>
              Um ponto de partida para o seu negócio. Substitui a configuração das 4 fichas e os nomes; nada do que
              já está preenchido se perde.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {MODELOS_SETOR.map((m) => (
              <button
                key={m.chave}
                type="button"
                onClick={() => setModeloEscolhido(m)}
                className={cn(
                  "w-full rounded-md border p-3 text-left transition-colors hover:bg-accent",
                  modeloEscolhido?.chave === m.chave && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {m.nome}
                  {m.chave === modeloSetor && <Badge variant="secondary">Atual</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{m.descricao}</p>
              </button>
            ))}
          </div>
          {modeloEscolhido && (Object.values(sujo).some(Boolean) || termosSujos) && (
            <p className="text-sm text-destructive">Há alterações por gravar: perdem-se ao aplicar o modelo.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelosAbertos(false)}>Cancelar</Button>
            <Button disabled={!modeloEscolhido || !podeGravar} onClick={() => modeloEscolhido && aplicarModelo(modeloEscolhido)}>
              {gravando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Aplicar «{modeloEscolhido?.nome ?? "…"}»
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SeparadorFichaProps {
  ficha: Ficha;
  todos: DefCampo[];
  sujo: boolean;
  podeGravar: boolean;
  gravando: boolean;
  onNovo: () => void;
  onEditar: (c: DefCampo) => void;
  onApagar: (c: DefCampo) => void;
  onVisivel: (c: DefCampo, ativo: boolean) => void;
  onMover: (c: DefCampo, d: -1 | 1) => void;
  onGravar: () => void;
}

const SeparadorFicha = ({
  ficha, todos, sujo, podeGravar, gravando, onNovo, onEditar, onApagar, onVisivel, onMover, onGravar,
}: SeparadorFichaProps) => {
  const seccoes = useMemo(() => seccoesDe(ficha, todos), [ficha, todos]);
  const temSistema = todos.some((d) => d.sistema);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{ROTULO_FICHA[ficha]}</CardTitle>
            <CardDescription>
              {temSistema
                ? "Os campos de sistema não se apagam: o planeamento e as sugestões dependem deles. Pode escondê-los."
                : "Esta ficha só tem os campos da sua empresa."}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onNovo}>
              <Plus className="h-4 w-4 mr-1" /> Campo
            </Button>
            <Button size="sm" onClick={onGravar} disabled={!podeGravar || !sujo}>
              {gravando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Gravar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {seccoes.length === 0 && (
            <p className="text-sm text-muted-foreground">Ainda não há campos. Use «+ Campo» para acrescentar o primeiro.</p>
          )}
          {seccoes.map((s) => (
            <section key={s.chave} aria-label={s.rotulo} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.rotulo}</h3>
              <ul className="divide-y rounded-md border">
                {s.campos.map((d, i) => (
                  <li key={d.chave} data-testid={`campo-${d.chave}`}
                    className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !d.ativo && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{d.rotulo}</span>
                        {d.obrigatorio && <span className="text-destructive" title="Obrigatório">*</span>}
                        {d.sistema
                          ? <Badge variant="secondary">Sistema</Badge>
                          : <Badge variant="outline">Da empresa</Badge>}
                        <Badge variant="outline" className="font-normal">{ROTULO_TIPO[d.tipo]}</Badge>
                        {!d.ativo && <Badge variant="outline" className="gap-1 font-normal"><EyeOff className="h-3 w-3" /> Escondido</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{d.chave}</span>
                        {d.papeis.length > 0 && ` · ${d.papeis.map((p) => ROTULO_PAPEL[p]).join(" · ")}`}
                        {d.condicao && ` · só se ${todos.find((x) => x.chave === d.condicao!.campo)?.rotulo ?? d.condicao.campo}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={d.ativo}
                        onCheckedChange={(v) => onVisivel(d, v)}
                        aria-label={`Visível: ${d.rotulo}`}
                      />
                      <Button variant="ghost" size="icon" aria-label={`Subir ${d.rotulo}`} disabled={i === 0} onClick={() => onMover(d, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Descer ${d.rotulo}`} disabled={i === s.campos.length - 1} onClick={() => onMover(d, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Editar ${d.rotulo}`} onClick={() => onEditar(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!d.sistema && (
                        <Button variant="ghost" size="icon" aria-label={`Apagar ${d.rotulo}`} onClick={() => onApagar(d)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>

      <PreVisualizacao ficha={ficha} todos={todos} />
    </div>
  );
};

/** Como a ficha fica para quem a preenche (os valores aqui não se gravam). */
const PreVisualizacao = ({ ficha, todos }: { ficha: Ficha; todos: DefCampo[] }) => {
  const [valores, setValores] = useState<ValoresFormulario>({});
  const seccoes = useMemo(() => seccoesDe(ficha, todos.filter((d) => d.ativo)), [ficha, todos]);
  const { erros } = validarValores(todos, valores);

  return (
    <Card className="hidden xl:block self-start">
      <CardHeader>
        <CardTitle className="text-base">Pré-visualização</CardTitle>
        <CardDescription>Como fica para quem preenche. Os valores aqui não se gravam.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {seccoes.length === 0 && <p className="text-sm text-muted-foreground">Nada visível nesta ficha.</p>}
        {seccoes.map((s) => {
          const sistema = s.campos.filter((d) => d.sistema);
          const extra = s.campos.filter((d) => !d.sistema);
          return (
            <div key={s.chave} className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{s.rotulo}</p>
              {sistema.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {sistema.map((d) => (
                    <li key={d.chave}><Badge variant="secondary" className="font-normal">{d.rotulo}</Badge></li>
                  ))}
                </ul>
              )}
              {extra.length > 0 && (
                <CamposDinamicos
                  campos={extra}
                  valores={valores}
                  onChange={setValores}
                  erros={erros}
                  idPrefix={`previa_${ficha}`}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
