import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CATALOGO_SISTEMA,
  CHAVE_VALIDA,
  CHAVES_RESERVADAS,
  ROTULO_TIPO,
  SECCOES_PADRAO,
  TIPOS_CAMPO,
  VALOR_OPCAO_VALIDO,
  chaveDeRotulo,
  valorDeRotulo,
  type DefCampo,
  type Ficha,
  type Opcao,
  type TipoCampo,
} from "@/lib/campos/catalogo";
import { rotuloSeccao } from "@/lib/campos/definicoes";

const NOVA_SECCAO = "__nova";

interface DialogoCampoConfigProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  ficha: Ficha;
  /** null = campo novo da empresa. */
  campo: DefCampo | null;
  /** Todos os campos do rascunho (para chaves repetidas, secções e condições). */
  todos: readonly DefCampo[];
  onGuardar: (campo: DefCampo) => void;
}

interface Rascunho {
  rotulo: string;
  chave: string;
  chaveManual: boolean;
  ajuda: string;
  tipo: TipoCampo;
  opcoes: Opcao[];
  minimo: string;
  maximo: string;
  casas: string;
  unidade: string;
  seccao: string;
  seccaoNova: string;
  obrigatorio: boolean;
  condCampo: string;
  condValores: string[];
}

const deCampo = (c: DefCampo | null, ficha: Ficha): Rascunho => ({
  rotulo: c?.rotulo ?? "",
  chave: c?.chave ?? "",
  chaveManual: false,
  ajuda: c?.ajuda ?? "",
  tipo: c?.tipo ?? "escolha",
  opcoes: c?.opcoes.map((o) => ({ ...o })) ?? [],
  minimo: c?.minimo != null ? String(c.minimo) : "",
  maximo: c?.maximo != null ? String(c.maximo) : "",
  casas: String(c?.casas_decimais ?? 0),
  unidade: c?.unidade ?? "",
  seccao: c?.seccao ?? SECCOES_PADRAO[ficha][SECCOES_PADRAO[ficha].length - 1].chave,
  seccaoNova: "",
  obrigatorio: c?.obrigatorio ?? false,
  condCampo: c?.condicao?.campo ?? "",
  condValores: c?.condicao?.valores ?? [],
});

const numero = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Valores possíveis de um campo usado numa condição. */
const valoresDeCondicao = (d: DefCampo | undefined): Opcao[] =>
  !d ? [] : d.tipo === "sim_nao" ? [{ valor: "true", rotulo: "Sim" }, { valor: "false", rotulo: "Não" }] : d.opcoes;

/**
 * Editar um campo no ecrã "Fichas e campos". Nos campos de sistema só se
 * mudam rótulos, ajuda e "obrigatório" — tipo, valores e limites são do
 * planeamento e das sugestões. Nos da empresa muda-se tudo.
 */
export const DialogoCampoConfig = ({ aberto, onOpenChange, ficha, campo, todos, onGuardar }: DialogoCampoConfigProps) => {
  const sistema = !!campo?.sistema;
  const novo = campo === null;
  const [r, setR] = useState<Rascunho>(() => deCampo(campo, ficha));
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (aberto) {
      setR(deCampo(campo, ficha));
      setErros({});
    }
  }, [aberto, campo, ficha]);

  const base = sistema ? CATALOGO_SISTEMA[ficha].find((d) => d.chave === campo!.chave) : undefined;

  const seccoes = useMemo(() => {
    const chaves = Array.from(new Set([...SECCOES_PADRAO[ficha].map((s) => s.chave), ...todos.map((d) => d.seccao)]));
    return chaves.map((chave) => ({
      value: chave,
      label: SECCOES_PADRAO[ficha].find((s) => s.chave === chave)?.rotulo ?? rotuloSeccao(chave),
    }));
  }, [ficha, todos]);

  const candidatosCondicao = todos.filter(
    (d) => d.chave !== (campo?.chave ?? r.chave) && (d.tipo === "sim_nao" || d.tipo === "escolha"),
  );
  const campoCondicao = todos.find((d) => d.chave === r.condCampo);

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((p) => ({ ...p, [k]: v }));

  const mudarRotulo = (v: string) =>
    setR((p) => ({ ...p, rotulo: v, chave: novo && !p.chaveManual ? chaveDeRotulo(v) : p.chave }));

  const mudarOpcao = (i: number, rotulo: string) =>
    setR((p) => {
      const opcoes = p.opcoes.map((o, j) => {
        if (j !== i) return o;
        // Valor gerado do rótulo enquanto a opção é nova (não está gravada).
        const gravada = campo?.opcoes.some((x) => x.valor === o.valor);
        return { valor: sistema || gravada ? o.valor : valorDeRotulo(rotulo), rotulo };
      });
      return { ...p, opcoes };
    });

  const moverOpcao = (i: number, d: -1 | 1) =>
    setR((p) => {
      const j = i + d;
      if (j < 0 || j >= p.opcoes.length) return p;
      const opcoes = [...p.opcoes];
      [opcoes[i], opcoes[j]] = [opcoes[j], opcoes[i]];
      return { ...p, opcoes };
    });

  const guardar = () => {
    const e: Record<string, string> = {};
    const rotulo = r.rotulo.trim();

    if (sistema) {
      if (rotulo.length > 80) e.rotulo = "No máximo 80 caracteres";
      if (r.ajuda.trim().length > 200) e.ajuda = "No máximo 200 caracteres";
      if (r.opcoes.some((o) => !o.rotulo.trim() || o.rotulo.trim().length > 60)) e.opcoes = "Cada opção precisa de um rótulo (até 60 caracteres)";
      setErros(e);
      if (Object.keys(e).length) return;
      onGuardar({
        ...campo!,
        rotulo: rotulo || base!.rotulo,
        ajuda: r.ajuda.trim() || base!.ajuda,
        opcoes: r.opcoes.map((o) => ({ ...o, rotulo: o.rotulo.trim() })),
        obrigatorio: r.obrigatorio,
      });
      return;
    }

    if (!rotulo) e.rotulo = "Indique o rótulo";
    else if (rotulo.length > 80) e.rotulo = "No máximo 80 caracteres";
    if (r.ajuda.trim().length > 200) e.ajuda = "No máximo 200 caracteres";

    const chave = r.chave.trim();
    if (!CHAVE_VALIDA.test(chave)) e.chave = "Minúsculas, números e _; começa por letra (até 40)";
    else if (CHAVES_RESERVADAS[ficha].includes(chave)) e.chave = "Esta chave já é usada pelo sistema; escolha outra";
    else if (todos.some((d) => d.chave === chave && d !== campo)) e.chave = "Já existe um campo com esta chave";

    let opcoes: Opcao[] = [];
    if (r.tipo === "escolha") {
      opcoes = r.opcoes.map((o) => ({ valor: o.valor.trim(), rotulo: o.rotulo.trim() }));
      const valores = opcoes.map((o) => o.valor);
      if (opcoes.length < 1 || opcoes.length > 30) e.opcoes = "Entre 1 e 30 opções";
      else if (opcoes.some((o) => !o.rotulo || o.rotulo.length > 60)) e.opcoes = "Cada opção precisa de um rótulo (até 60 caracteres)";
      else if (opcoes.some((o) => !VALOR_OPCAO_VALIDO.test(o.valor))) e.opcoes = "Há uma opção com um rótulo sem letras nem números";
      else if (new Set(valores).size !== valores.length) e.opcoes = "Há opções repetidas";
    }

    const minimo = r.tipo === "numero" ? numero(r.minimo) : null;
    const maximo = r.tipo === "numero" ? numero(r.maximo) : null;
    const casas = Number(r.casas);
    if (r.tipo === "numero") {
      if (Number.isNaN(minimo)) e.minimo = "Número inválido";
      if (Number.isNaN(maximo)) e.maximo = "Número inválido";
      if (minimo !== null && maximo !== null && !Number.isNaN(minimo) && !Number.isNaN(maximo) && minimo > maximo)
        e.maximo = "O máximo tem de ser maior ou igual ao mínimo";
      if (!Number.isInteger(casas) || casas < 0 || casas > 4) e.casas = "Entre 0 e 4";
      if (r.unidade.trim().length > 12) e.unidade = "No máximo 12 caracteres";
    }

    let seccao = r.seccao;
    if (seccao === NOVA_SECCAO) {
      seccao = chaveDeRotulo(r.seccaoNova);
      if (!r.seccaoNova.trim()) e.seccao = "Indique o nome da secção";
    }

    if (r.condCampo && r.condValores.length === 0) e.condicao = "Escolha pelo menos um valor";

    setErros(e);
    if (Object.keys(e).length) return;

    onGuardar({
      chave,
      sistema: false,
      seccao,
      rotulo,
      ajuda: r.ajuda.trim() || null,
      tipo: r.tipo,
      opcoes,
      minimo: r.tipo === "numero" ? minimo : null,
      maximo: r.tipo === "numero" ? maximo : null,
      casas_decimais: r.tipo === "numero" ? casas : 0,
      unidade: r.tipo === "numero" ? r.unidade.trim() || null : null,
      obrigatorio: r.obrigatorio,
      ativo: campo?.ativo ?? true,
      ordem: campo?.ordem ?? Number.MAX_SAFE_INTEGER,
      condicao: r.condCampo ? { campo: r.condCampo, valores: r.condValores } : null,
      papeis: [],
    });
  };

  const erro = (k: string) => (erros[k] ? <p className="text-xs text-destructive">{erros[k]}</p> : null);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{novo ? "Novo campo" : sistema ? `Campo de sistema — ${base?.rotulo}` : "Editar campo"}</DialogTitle>
          <DialogDescription>
            {sistema
              ? "O planeamento e as sugestões dependem deste campo: pode mudar os textos e se é obrigatório, mas não o tipo, os valores nem os limites."
              : "Prefira campos fechados (sim/não, escolha, número): são mais rápidos de preencher e dão para filtrar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="campo_rotulo">Rótulo</Label>
            <Input
              id="campo_rotulo"
              value={r.rotulo}
              placeholder={base?.rotulo}
              onChange={(e) => mudarRotulo(e.target.value)}
              aria-invalid={!!erros.rotulo}
            />
            {erro("rotulo")}
          </div>

          {!sistema && (
            <div className="space-y-1">
              <Label htmlFor="campo_chave">Chave</Label>
              <Input
                id="campo_chave"
                value={r.chave}
                disabled={!novo}
                className="font-mono text-xs"
                onChange={(e) => setR((p) => ({ ...p, chave: e.target.value, chaveManual: true }))}
                aria-invalid={!!erros.chave}
              />
              <p className="text-xs text-muted-foreground">
                {novo ? "Gera-se do rótulo. Não se muda depois de criado: é onde os valores ficam guardados." : "Não se muda: é onde os valores ficam guardados."}
              </p>
              {erro("chave")}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="campo_ajuda">Ajuda (opcional)</Label>
            <Textarea id="campo_ajuda" rows={2} value={r.ajuda} placeholder={base?.ajuda ?? undefined}
              onChange={(e) => set("ajuda", e.target.value)} />
            {erro("ajuda")}
          </div>

          {!sistema && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="campo_tipo">Tipo</Label>
                <NativeSelect
                  id="campo_tipo"
                  value={r.tipo}
                  onValueChange={(v) => set("tipo", v as TipoCampo)}
                  options={TIPOS_CAMPO.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campo_seccao">Secção</Label>
                <NativeSelect
                  id="campo_seccao"
                  value={r.seccao}
                  onValueChange={(v) => set("seccao", v)}
                  options={[...seccoes, { value: NOVA_SECCAO, label: "Nova secção…" }]}
                />
                {r.seccao === NOVA_SECCAO && (
                  <Input aria-label="Nome da nova secção" placeholder="Ex.: Acessos" value={r.seccaoNova}
                    onChange={(e) => set("seccaoNova", e.target.value)} />
                )}
                {erro("seccao")}
              </div>
            </div>
          )}

          {(r.tipo === "escolha" && !sistema) || (sistema && r.opcoes.length > 0) ? (
            <div className="space-y-2">
              <Label>Opções</Label>
              {r.opcoes.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Opção ${i + 1}`}
                    value={o.rotulo}
                    placeholder={base?.opcoes.find((x) => x.valor === o.valor)?.rotulo}
                    onChange={(e) => mudarOpcao(i, e.target.value)}
                  />
                  <span className="hidden sm:block w-24 truncate font-mono text-xs text-muted-foreground" title={o.valor}>{o.valor}</span>
                  {!sistema && (
                    <>
                      <Button type="button" variant="ghost" size="icon" aria-label="Subir opção" onClick={() => moverOpcao(i, -1)} disabled={i === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Descer opção" onClick={() => moverOpcao(i, 1)} disabled={i === r.opcoes.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Apagar opção"
                        onClick={() => set("opcoes", r.opcoes.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {!sistema && (
                <Button type="button" variant="outline" size="sm"
                  onClick={() => set("opcoes", [...r.opcoes, { valor: `opcao_${r.opcoes.length + 1}`, rotulo: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Opção
                </Button>
              )}
              {erro("opcoes")}
            </div>
          ) : null}

          {!sistema && r.tipo === "numero" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="campo_min">Mínimo</Label>
                <Input id="campo_min" inputMode="decimal" value={r.minimo} onChange={(e) => set("minimo", e.target.value)} />
                {erro("minimo")}
              </div>
              <div className="space-y-1">
                <Label htmlFor="campo_max">Máximo</Label>
                <Input id="campo_max" inputMode="decimal" value={r.maximo} onChange={(e) => set("maximo", e.target.value)} />
                {erro("maximo")}
              </div>
              <div className="space-y-1">
                <Label htmlFor="campo_casas">Decimais</Label>
                <Input id="campo_casas" inputMode="numeric" value={r.casas} onChange={(e) => set("casas", e.target.value)} />
                {erro("casas")}
              </div>
              <div className="space-y-1">
                <Label htmlFor="campo_unidade">Unidade</Label>
                <Input id="campo_unidade" placeholder="m², €, kg" value={r.unidade} onChange={(e) => set("unidade", e.target.value)} />
                {erro("unidade")}
              </div>
            </div>
          )}

          {!sistema && (
            <div className="space-y-2">
              <Label htmlFor="campo_cond">Só aparece se…</Label>
              <NativeSelect
                id="campo_cond"
                value={r.condCampo}
                onValueChange={(v) => setR((p) => ({ ...p, condCampo: v, condValores: [] }))}
                options={[{ value: "", label: "Aparece sempre" }, ...candidatosCondicao.map((d) => ({ value: d.chave, label: d.rotulo }))]}
              />
              {campoCondicao && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
                  <span className="text-sm text-muted-foreground">for</span>
                  {valoresDeCondicao(campoCondicao).map((o) => (
                    <label key={o.valor} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={r.condValores.includes(o.valor)}
                        onCheckedChange={(c) =>
                          set("condValores", c ? [...r.condValores, o.valor] : r.condValores.filter((x) => x !== o.valor))}
                      />
                      {o.rotulo}
                    </label>
                  ))}
                </div>
              )}
              {erro("condicao")}
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="campo_obrig">Obrigatório</Label>
              <p className="text-xs text-muted-foreground">Por agora só avisa quando falta; não impede gravar.</p>
            </div>
            <Switch id="campo_obrig" checked={r.obrigatorio} onCheckedChange={(v) => set("obrigatorio", v)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={guardar}>{novo ? "Adicionar" : "Aplicar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
