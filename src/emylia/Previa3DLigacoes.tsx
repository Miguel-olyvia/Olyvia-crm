// 25/11: o painel «Ligações» do 3D do produto: que atributo pinta que zona (frente, corpo, tampo…) e se «aplica» ou não. Sem ligações, cada zona é pintada pelo NOME do atributo
// («Cor da frente», «Cor do corpo», «Cor»); uma ligação explícita manda sobre o nome. «Aplicar: não» tira o atributo dessa zona. Controlado: o rascunho vive em quem o usa (o 3D mostra-o
// logo) e a gravação (por produto; a subcategoria e a categoria vêm depois) é de quem o usa (`gravar`, `herdar`: devolvem o erro em texto, ou null se correu bem). Sem three: só o ecrã.
import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { erroDasLigacoes, rotuloDaOrigemConfig, type Ligacao, type OrigemConfig, type ZonaLigacao } from "./config3dDados";
import type { LeituraPorOmissao } from "./planta3d/acabamentoCor3d";
import type { Eixos } from "./planta3d/eixosMedida";
import { ZONAS, rotuloDaZona, type ZonaGlb } from "./planta3d/zonasGlb";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const SELECT = "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const DESLIGADO = "cursor-not-allowed opacity-50 hover:bg-card";
const DESCONHECIDO = "Atributo desconhecido";

export interface AtributoLigavel { id: string; nome: string }
export interface PropsLigacoes {
  /** As ligações em vigor no ecrã (o rascunho, ou as guardadas ou herdadas). */
  valor: readonly Ligacao[];
  /** O rascunho difere do que está guardado: só então se pode guardar. */
  alterado: boolean;
  /** De onde vêm as ligações guardadas, e se este produto tem as suas (só então se pode «voltar a herdar»). */
  origem: OrigemConfig; proprio: boolean;
  /** Os atributos de lista do produto que se podem ligar (a Medida não pinta nada). */
  atributos: readonly AtributoLigavel[];
  /** 25/11: TODOS os atributos com hex, foto ou aspeto e o que o 3D faz com cada um por omissão (sem configuração): aplicado pelo nome, ou desligado. Ausente: a lista não se mostra. */
  omissoes?: readonly LeituraPorOmissao[];
  /** As zonas que o modelo tem. */
  zonas: readonly ZonaGlb[];
  /** Ligações da base a atributos que já não existem, e ligações inválidas que o leitor largou. */
  orfas: number; ignoradas: number;
  podeEditar: boolean;
  aoMudar: (l: Ligacao[]) => void;
  gravar: () => Promise<string | null>;
  herdar: () => Promise<string | null>;
}

/**
 * A configuração 3D que a pré-visualização recebe (só existe quando a base a devolveu: sem ela o painel «Medidas» é só para ver, como era). Os eixos: os guardados (ou herdados), de onde
 * vêm, se são deste produto, e como se gravam (null herda). As ligações: o que o painel «Ligações» precisa (sem `zonas` nem `podeEditar`, que a pré-visualização acrescenta).
 */
export interface Config3dPrevia {
  podeEditar: boolean;
  eixos: { guardados: Eixos | null; origem: OrigemConfig; proprio: boolean; gravar: (e: Eixos | null) => Promise<string | null> };
  ligacoes: Omit<PropsLigacoes, "zonas" | "podeEditar">;
}

const rotuloDaZonaLigacao =(z: ZonaLigacao): string => (z === "tudo" ? "Tudo" : rotuloDaZona(z));
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

/** Um interruptor «Aplicar» (sim/não), com o estado também em texto. */
function Aplicar({ ligado, aoMudar }: { ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => aoMudar(!ligado)} className={cn(BOTAO, "justify-start gap-2 px-3")}>
      <span aria-hidden="true" className={cn("relative inline-block h-5 w-9 shrink-0 rounded-full border border-input transition-colors", ligado ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-all", ligado ? "left-[18px]" : "left-0.5")} />
      </span>
      Aplicar
      <span aria-hidden="true" className="text-muted-foreground">{ligado ? "sim" : "não"}</span>
    </button>
  );
}

/** O estado de um atributo no painel: o das ligações guardadas ou do rascunho, se as há; senão o que vale por omissão. */
function estadoDoAtributo(o: LeituraPorOmissao, valor: readonly Ligacao[]): string {
  const ls = valor.filter((l) => l.atributo === o.id);
  if (ls.length) return `ligado: ${ls.map((l) => `${rotuloDaZonaLigacao(l.zona)} ${l.aplicar ? "sim" : "não"}`).join(", ")}`;
  return o.aplicado ? `aplicado por omissão (${o.onde})` : "desligado por omissão";
}

export function Previa3DLigacoes({ valor, alterado, origem, proprio, atributos, omissoes, zonas, orfas, ignoradas, podeEditar, aoMudar, gravar, herdar }: PropsLigacoes) {
  const id = useId();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const nomeDe = (a: string) => atributos.find((x) => x.id === a)?.nome ?? DESCONHECIDO;
  // as zonas oferecidas: «Tudo», as do modelo e, para não as perder, as já usadas que o modelo não tem
  const usadas = new Set(valor.map((l) => l.zona));
  const zonasOfertadas: ZonaLigacao[] = ["tudo", ...ZONAS.filter((z) => zonas.includes(z) || usadas.has(z))];
  const rotuloOrigem = rotuloDaOrigemConfig(origem);
  const invalida = erroDasLigacoes(valor);
  const livre = (): Ligacao | null => {
    for (const a of atributos) for (const z of zonasOfertadas) if (!valor.some((l) => l.atributo === a.id && l.zona === z)) return { atributo: a.id, zona: z, aplicar: true };
    return null;
  };
  const mudar = (i: number, parte: Partial<Ligacao>) => { setMsg(null); aoMudar(valor.map((l, j) => (j === i ? { ...l, ...parte } : l))); };
  const correr = async (fazer: () => Promise<string | null>, ok: string) => {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try { const erro = await fazer(); setMsg(erro ? { erro: true, texto: erro } : { erro: false, texto: ok }); } finally { setOcupado(false); }
  };
  const podeGuardar = alterado && !invalida && !ocupado;
  // porque é que «Guardar ligações» está desactivado: o aviso da ligação inválida, ou uma nota curta (sem alterações, a guardar)
  const idInvalida = `${id}-invalida`, idRazao = `${id}-razao`;
  const razaoGuardar = invalida ? null : ocupado ? "A guardar…" : !alterado ? "Sem alterações para guardar." : null;
  const descreveGuardar = podeGuardar ? undefined : invalida ? idInvalida : idRazao;

  return (
    <section aria-labelledby={`${id}-t`} className="grid gap-3 rounded-xl border border-border bg-card p-3">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold">Ligações</h3>
      <p className={NOTA}>
        {rotuloOrigem ? `Ligações ${rotuloOrigem}. ` : "Sem ligações guardadas: cada zona é pintada pelo nome do atributo («Cor da frente» pinta a frente, «Cor do corpo» o corpo, «Cor» o resto). "}
        Uma ligação manda sobre o nome; «Aplicar: não» tira o atributo dessa zona.
      </p>

      {omissoes && omissoes.length > 0 && (
        <div className="grid gap-1">
          <h4 className="text-[15px] font-medium">Atributos que o 3D lê</h4>
          <ul className="grid gap-2 text-[15px]">
            {omissoes.map((o) => {
              const ligado = valor.some((l) => l.atributo === o.id);
              const zonaInicial = zonasOfertadas.find((z) => z !== "tudo") ?? "tudo";
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <span><strong className="font-medium">{o.nome}</strong>: {estadoDoAtributo(o, valor)}</span>
                  {podeEditar && !ligado && !o.aplicado && (
                    <button type="button" aria-label={`Ligar ${o.nome}`} onClick={() => { setMsg(null); aoMudar([...valor, { atributo: o.id, zona: zonaInicial, aplicar: true }]); }} className={BOTAO}>Ligar</button>
                  )}
                  {podeEditar && !ligado && o.aplicado && (
                    <button type="button" aria-label={`Desligar ${o.nome}`} onClick={() => { setMsg(null); aoMudar([...valor, { atributo: o.id, zona: "tudo", aplicar: false }]); }} className={BOTAO}>Desligar</button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!podeEditar ? (
        <>
          {valor.length > 0 && (
            <ul className="grid gap-1 text-[15px]">
              {valor.map((l, i) => <li key={i}>{nomeDe(l.atributo)} → {rotuloDaZonaLigacao(l.zona)}: {l.aplicar ? "aplica" : "não aplica"}</li>)}
            </ul>
          )}
          <p className={NOTA}>Para mudar as ligações precisa da permissão de editar produtos.</p>
        </>
      ) : (
        <>
          {atributos.length === 0 && <p className={NOTA}>Este produto não tem atributos de lista: não há atributos para ligar.</p>}
          <div className="grid gap-3">
            {valor.map((l, i) => {
              const conhecido = atributos.some((a) => a.id === l.atributo);
              return (
                <div key={i} role="group" aria-label={`Ligação ${i + 1}`} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                  <div className="grid gap-1">
                    <label htmlFor={`${id}-a${i}`} className="text-[15px] font-medium">Atributo</label>
                    <select id={`${id}-a${i}`} value={l.atributo} onChange={(e) => mudar(i, { atributo: e.target.value })} className={SELECT}>
                      {!conhecido && <option value={l.atributo}>{DESCONHECIDO}</option>}
                      {atributos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor={`${id}-z${i}`} className="text-[15px] font-medium">Zona</label>
                    <select id={`${id}-z${i}`} value={l.zona} onChange={(e) => mudar(i, { zona: e.target.value as ZonaLigacao })} className={SELECT}>
                      {zonasOfertadas.map((z) => <option key={z} value={z}>{rotuloDaZonaLigacao(z)}</option>)}
                    </select>
                  </div>
                  <Aplicar ligado={l.aplicar} aoMudar={(v) => mudar(i, { aplicar: v })} />
                  <button type="button" aria-label={`Remover a ligação ${i + 1}`} title="Remover" onClick={() => { setMsg(null); aoMudar(valor.filter((_, j) => j !== i)); }} className={cn(BOTAO, "min-w-11 px-0")}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {atributos.length > 0 && (
              <button type="button" aria-disabled={!livre()} onClick={() => { const nova = livre(); if (nova) { setMsg(null); aoMudar([...valor, nova]); } }} className={cn(BOTAO, !livre() && DESLIGADO)}>
                <Plus className="h-4 w-4" aria-hidden="true" />Acrescentar ligação
              </button>
            )}
            {/* aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado; assim o foco fica e o clique é só ignorado */}
            <button type="button" aria-disabled={!podeGuardar} aria-describedby={descreveGuardar} onClick={() => { if (podeGuardar) void correr(gravar, "Ligações guardadas."); }} className={cn(BOTAO, !podeGuardar && DESLIGADO)}>Guardar ligações</button>
            <button type="button" aria-disabled={!proprio || ocupado} onClick={() => { if (proprio && !ocupado) void correr(herdar, "As ligações voltaram a ser herdadas."); }} className={cn(BOTAO, (!proprio || ocupado) && DESLIGADO)}>Voltar a herdar as ligações</button>
          </div>
          {invalida && <p id={idInvalida} role="alert" className="text-[15px] text-red-700 dark:text-red-400">{invalida}</p>}
          {razaoGuardar && <p id={idRazao} className={NOTA}>{razaoGuardar}</p>}
        </>
      )}

      {orfas > 0 && <p role="status" className={NOTA}>{plural(orfas, "ligação a um atributo que já não existe foi ignorada", "ligações a atributos que já não existem foram ignoradas")}.</p>}
      {ignoradas > 0 && <p role="status" className={NOTA}>{plural(ignoradas, "ligação inválida foi ignorada", "ligações inválidas foram ignoradas")}.</p>}
      {/* região viva: o resultado de guardar ou de voltar a herdar; o erro como alerta */}
      <p aria-live="polite" className={NOTA}>{msg && !msg.erro ? msg.texto : ""}</p>
      {msg?.erro && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{msg.texto}</p>}
    </section>
  );
}
