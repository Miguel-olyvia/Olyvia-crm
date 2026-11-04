// CRM (4/11): no editor de formulários, liga um campo do formulário a uma pergunta de fase do Negócio (Lead e Contacto). A resposta
// do visitante passa a ser SUGERIDA ao abrir o negócio (neg_sugestoes_formulario); quem decide é sempre a pessoa que o abre.
// A ligação é {grupo (título estável), chave, valores?: rótulo do formulário -> rótulo da pergunta | null}. Vive numa tabela fechada (nunca em
// form_fields, que o visitante anónimo lê): lê-se com neg_ler_ligacao_fase(p_org, p_form_id) e grava-se com neg_guardar_ligacao_fase
// (p_mapping nulo remove). Só aparece se essas funções e neg_ler_campos_config existem; quem não tem pessoas.config recebe 42501 e vê-a desactivada.
import { useEffect, useId, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTACTO, LEAD, efetivo, nomeGrupo, type CfgCampos, type Def } from "@/emylia/campos";
import { lerCamposConfig } from "@/emylia/real/camposConfig";
import { normalizarTexto } from "@/emylia/sugestoesForm";

/** O que se grava em form_fields.phase_field_mapping. */
export interface PhaseFieldMapping {
  grupo: string;
  chave: string;
  valores?: Record<string, string | null>;
}

interface Props {
  /** O campo do formulário aberto no editor. */
  campo: { id: string };
  formId: string;
  /** As opções do campo no formulário (vazio se não é um campo de opções). */
  opcoesCampo: string[];
  organizationId: string;
  aoAvisar: (mensagem: string) => void;
}

/** Uma só chamada às funções da ligação: devolve o código do erro (null se correu bem) e os dados. */
async function chamar(nome: string, args: Record<string, unknown>): Promise<{ data: unknown; codigo: string | null }> {
  try {
    // `as never`: as funções estão fora dos tipos gerados nas bases que ainda não as têm
    const { data, error } = await supabase.rpc(nome as never, args as never);
    return { data, codigo: error ? ((error as { code?: string }).code ?? "erro") : null };
  } catch {
    return { data: null, codigo: "erro" };
  }
}

type Leitura =
  | { estado: "a-carregar" }
  | { estado: "ausente" }
  | { estado: "sem-permissao" }
  | { estado: "erro" }
  | { estado: "pronto"; cfg: CfgCampos };

const NENHUMA = "__nenhuma__";
const SEM_CORRESPONDENCIA = "__sem__";
const SEP = "::";
const NAO_EXISTE = "A pergunta já não existe. A ligação não faz nada.";
const SEL = "h-8 text-sm";

const ausente = (c?: string) => c === "PGRST202" || c === "42883";

/** Uma pergunta ligável: grupo de Lead ou Contacto, sem «Chamada», sem campos com papel, sem contadores e sem escondidas. */
interface Grupo { titulo: string; nome: string; perguntas: Def[] }
export function gruposLigaveis(cfg: CfgCampos): Grupo[] {
  return [...LEAD, ...CONTACTO]
    .filter((g) => g.titulo !== "Chamada")
    .map((g) => efetivo(cfg, g))
    .filter((g) => !g.oculto)
    .map((g) => ({ titulo: g.titulo, nome: nomeGrupo(g), perguntas: g.campos.filter((c) => !c.papel && c.t !== "contador") }))
    .filter((g) => g.perguntas.length > 0);
}

/** O que o campo tem gravado, limpo (null se não serve). */
export function lerMapeamento(x: unknown): PhaseFieldMapping | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.grupo !== "string" || typeof o.chave !== "string") return null;
  const m: PhaseFieldMapping = { grupo: o.grupo, chave: o.chave };
  if (o.valores && typeof o.valores === "object" && !Array.isArray(o.valores)) {
    m.valores = Object.fromEntries(Object.entries(o.valores as Record<string, unknown>).filter(([, v]) => v === null || typeof v === "string")) as Record<string, string | null>;
  }
  return m;
}

const comTabela = (def: Def | undefined, opcoesCampo: string[]) =>
  !!def && (def.t === "escolha" || def.t === "varios") && (def.op?.length ?? 0) > 0 && opcoesCampo.length > 0;

/** O destino de cada opção do formulário: o gravado; senão o texto igual; senão «Outro» (se a pergunta o tem); senão nada. */
export function destinoDe(opcao: string, def: Def, valores: Record<string, string | null> | undefined): string | null {
  const op = def.op ?? [];
  if (valores && Object.prototype.hasOwnProperty.call(valores, opcao)) return valores[opcao];
  const igual = op.find((o) => normalizarTexto(o) === normalizarTexto(opcao));
  if (igual) return igual;
  return op.find((o) => normalizarTexto(o) === "outro") ?? null;
}

export function PerguntaFaseMapping({ campo, formId, opcoesCampo, organizationId, aoAvisar }: Props) {
  const id = useId();
  const [leitura, setLeitura] = useState<Leitura>({ estado: "a-carregar" });
  // as ligações de TODOS os campos deste formulário (field_id -> ligação): uma pergunta só recebe de um campo
  const [ligacoes, setLigacoes] = useState<Record<string, PhaseFieldMapping>>({});
  const [aGravar, setAGravar] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [cfg, lig] = await Promise.all([
        chamar("neg_ler_campos_config", { p_org: organizationId }),
        chamar("neg_ler_ligacao_fase", { p_org: organizationId, p_form_id: formId }),
      ]);
      if (!vivo) return;
      const falta = [cfg.codigo, lig.codigo].find((c) => c !== null);
      if (ausente(cfg.codigo ?? undefined) || ausente(lig.codigo ?? undefined)) { setLeitura({ estado: "ausente" }); return; }
      if (falta === "42501") { setLeitura({ estado: "sem-permissao" }); return; }
      if (falta) { setLeitura({ estado: "erro" }); return; }
      const lidas: Record<string, PhaseFieldMapping> = {};
      for (const l of Array.isArray(lig.data) ? (lig.data as Record<string, unknown>[]) : []) {
        const m = lerMapeamento(l?.mapping);
        if (m && typeof l.field_id === "string") lidas[l.field_id] = m;
      }
      setLigacoes(lidas);
      setLeitura({ estado: "pronto", cfg: lerCamposConfig(cfg.data).campos });
    })();
    return () => { vivo = false; };
  }, [organizationId, formId]);

  const grupos = useMemo(() => (leitura.estado === "pronto" ? gruposLigaveis(leitura.cfg) : []), [leitura]);
  const mapa = ligacoes[campo.id] ?? null;
  const outrasLigacoes = Object.entries(ligacoes).filter(([fid]) => fid !== campo.id).map(([, m]) => m);
  const def = mapa ? grupos.find((g) => g.titulo === mapa.grupo)?.perguntas.find((p) => p.k === mapa.chave) : undefined;
  const orfa = !!mapa && !def;
  const tabela = comTabela(def, opcoesCampo);

  if (leitura.estado === "ausente") return null;
  if (leitura.estado === "a-carregar") return null;

  const gravar = async (m: PhaseFieldMapping | null) => {
    setAGravar(true); setFalhou(false); setGuardado(false);
    const { codigo } = await chamar("neg_guardar_ligacao_fase", { p_org: organizationId, p_field_id: campo.id, p_mapping: m });
    setAGravar(false);
    if (!codigo) {
      setLigacoes((antes) => {
        const { [campo.id]: _tirada, ...resto } = antes;
        return m ? { ...resto, [campo.id]: m } : resto;
      });
      setGuardado(true);
      return;
    }
    if (codigo === "42501") setLeitura({ estado: "sem-permissao" });
    else if (codigo === "23505") aoAvisar("Esta pergunta já está ligada a outro campo deste formulário");
    else setFalhou(true);
  };

  const valoresIniciais = (d: Def): Record<string, string | null> =>
    Object.fromEntries(opcoesCampo.map((o) => [o, destinoDe(o, d, undefined)]));

  const escolherPergunta = (v: string) => {
    if (v === NENHUMA) { void gravar(null); return; }
    const i = v.indexOf(SEP);
    const grupo = v.slice(0, i), chave = v.slice(i + SEP.length);
    if (outrasLigacoes.some((l) => l.grupo === grupo && l.chave === chave)) {
      aoAvisar("Esta pergunta já está ligada a outro campo deste formulário");
      return;
    }
    const d = grupos.find((g) => g.titulo === grupo)?.perguntas.find((p) => p.k === chave);
    const novo: PhaseFieldMapping = { grupo, chave };
    // as correspondências por texto igual gravam-se explícitas, para não mudarem se alguém renomear uma opção
    if (d && comTabela(d, opcoesCampo)) novo.valores = valoresIniciais(d);
    void gravar(novo);
  };

  const escolherOpcao = (opcao: string, v: string) => {
    if (!mapa || !def) return;
    const atual = Object.fromEntries(opcoesCampo.map((o) => [o, destinoDe(o, def, mapa.valores)]));
    void gravar({ grupo: mapa.grupo, chave: mapa.chave, valores: { ...atual, [opcao]: v === SEM_CORRESPONDENCIA ? null : v } });
  };

  const bloqueado = leitura.estado === "sem-permissao" || leitura.estado === "erro";
  const valorPergunta = mapa ? `${mapa.grupo}${SEP}${mapa.chave}` : NENHUMA;
  const antigas = tabela && def
    ? opcoesCampo.map((o) => destinoDe(o, def, mapa?.valores)).filter((v): v is string => typeof v === "string" && !def.op?.includes(v))
    : [];
  const dica = def?.t === "varios" ? "Junta as opções, pela ordem da pergunta." : opcoesCampo.length > 0 && def ? "Só preenche se escolher uma única opção que corresponda." : null;
  const estado = aGravar ? "A gravar…" : falhou ? "Não foi possível guardar a ligação." : guardado ? "Ligação guardada." : "";

  return (
    <div className="space-y-2" aria-busy={aGravar || undefined}>
      <Label htmlFor={`${id}-pergunta`} className="text-xs flex items-center gap-1">
        <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
        Pergunta da fase
      </Label>
      <Select value={valorPergunta} onValueChange={escolherPergunta} disabled={aGravar || bloqueado}>
        <SelectTrigger id={`${id}-pergunta`} className={SEL} aria-describedby={`${id}-ajuda`}>
          <SelectValue placeholder="Sem ligação" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUMA}>Sem ligação</SelectItem>
          {orfa && mapa && <SelectItem value={valorPergunta} disabled>{`${mapa.chave} (já não existe)`}</SelectItem>}
          {grupos.map((g) => (
            <SelectGroup key={g.titulo}>
              <SelectLabel>{g.nome}</SelectLabel>
              {g.perguntas.map((p) => (
                <SelectItem key={`${g.titulo}${SEP}${p.k}`} value={`${g.titulo}${SEP}${p.k}`}>{p.l}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        A resposta pré-preenche esta pergunta no negócio, como sugestão.
        {dica ? ` ${dica}` : ""}
      </p>

      {leitura.estado === "sem-permissao" && (
        <p role="note" className="text-xs text-muted-foreground">Só quem configura a Qualificação pode ligar campos.</p>
      )}
      {leitura.estado === "erro" && (
        <p role="note" className="text-xs text-muted-foreground">Não foi possível ler as perguntas das fases. Feche e volte a abrir o campo para tentar de novo.</p>
      )}
      {orfa && <p role="note" className="text-xs text-amber-700 dark:text-amber-500">{NAO_EXISTE}</p>}

      {tabela && def && mapa && (
        <table className="w-full border-collapse text-xs">
          <caption className="pb-1 text-left text-xs font-medium">Correspondência das opções</caption>
          <thead>
            <tr>
              <th scope="col" className="w-1/2 pb-1 pr-2 text-left font-medium text-muted-foreground">No formulário</th>
              <th scope="col" className="w-1/2 pb-1 text-left font-medium text-muted-foreground">Na pergunta</th>
            </tr>
          </thead>
          <tbody>
            {opcoesCampo.map((o) => {
              const destino = destinoDe(o, def, mapa.valores);
              const antiga = typeof destino === "string" && !def.op?.includes(destino);
              return (
                <tr key={o} className="border-t border-dashed">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">{o}</th>
                  <td className="py-1">
                    <Select value={destino ?? SEM_CORRESPONDENCIA} onValueChange={(v) => escolherOpcao(o, v)} disabled={aGravar || bloqueado}>
                      <SelectTrigger className={SEL} aria-label={`Opção do formulário “${o}”: opção da pergunta`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_CORRESPONDENCIA}>Sem correspondência (fica por responder)</SelectItem>
                        {antiga && <SelectItem value={destino as string} disabled>{`${destino} (já não existe)`}</SelectItem>}
                        {(def.op ?? []).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {antigas.map((a) => (
        <p key={a} role="note" className="text-xs text-amber-700 dark:text-amber-500">{`A opção “${a}” já não existe na pergunta.`}</p>
      ))}

      <p role="status" aria-live="polite" className={falhou ? "min-h-4 text-xs text-destructive" : "min-h-4 text-xs text-muted-foreground"}>{estado}</p>
    </div>
  );
}
