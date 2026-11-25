// A foto de uma opção de atributo, no ecrã de gestão dos atributos (só nos atributos com «Tem foto» e só com products.edit).
// Adicionar/Trocar: escolhe-se o ficheiro (JPG, PNG ou WebP), converte-se no navegador (fotoOpcao.ts), vê-se a pré-visualização de 96 px e só ao confirmar se carrega.
// Remover e «Copiar foto de outra opção» (reutiliza o caminho de uma opção do mesmo atributo) ligam direto. Quem grava (e relê o ecrã, e anuncia) é o pai, por `correr`.
// Os botões ficam `disabled` durante a operação, o que faz o navegador largar o foco: por isso o foco é devolvido (ao botão de origem se falhar, ao «Guardar foto» quando
// a pré-visualização aparece) por `foco`, que espera que o elemento volte a estar ativo.
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO } from "./pecasForm";
import { MSG_FOTO, prepararFotoOpcao, type DadosFoto } from "./fotoOpcao";
import { guardarFotoOpcao, ligarFotoOpcao } from "./fotoOpcaoDados";
import type { OpcaoGestao, ResG } from "./atributosGestao";

const BOTAO = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-input px-3.5 text-[15px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
const MSG_GUARDAR = "Não foi possível guardar a foto.";
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
const criarUrl = (b: Blob): string | null => (typeof URL.createObjectURL === "function" ? URL.createObjectURL(b) : null);

export interface FotoDaOpcaoProps {
  o: OpcaoGestao;
  /** todas as opções do MESMO atributo (as que têm foto são as candidatas a «Copiar foto de outra opção») */
  outras: readonly OpcaoGestao[];
  org: string;
  /** há outra gravação em curso */
  bloqueado: boolean;
  /** o erro da base para esta opção (tal como vem) */
  erro: string | null;
  correr: (op: () => Promise<ResG<unknown>>, aviso: string, onde: string) => Promise<boolean>;
  /** depois de acabar ou cancelar: o pai devolve o foco ao botão `fa-<opção>` */
  aoAcabar: () => void;
}

export function FotoDaOpcao({ o, outras, org, bloqueado, erro, correr, aoAcabar }: FotoDaOpcaoProps) {
  const onde = `foto:${o.id}`;
  const entrada = useRef<HTMLInputElement>(null);
  const montado = useRef(true), emCurso = useRef(false);
  const [previa, setPrevia] = useState<{ dados: DadosFoto; url: string | null } | null>(null);
  const [lendo, setLendo] = useState(false), [guardando, setGuardando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const ocupado = bloqueado || lendo || guardando;
  const idCopiar = useId();
  const candidatas = outras.filter((x) => x.id !== o.id && x.foto && x.foto !== o.foto);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  // o endereço temporário da pré-visualização liberta-se quando sai de cena
  useEffect(() => {
    const url = previa?.url;
    return () => { if (url) URL.revokeObjectURL?.(url); };
  }, [previa?.url]);
  // devolve o foco assim que o elemento existe e está ativo (um botão desligado não o aceita)
  useEffect(() => {
    if (!foco) return;
    const el = document.getElementById(foco) as (HTMLElement & { disabled?: boolean }) | null;
    if (el && !el.disabled) { el.focus(); setFoco(null); }
  }, [foco, ocupado, previa]);

  /** Corre uma gravação sem a deixar a meio: uma só de cada vez (duplo clique), e uma exceção vira mensagem em vez de deixar o ecrã preso a «A guardar…». */
  const executar = async (op: () => Promise<boolean>, mensagem: string, focoSeFalhar: string): Promise<boolean> => {
    if (emCurso.current) return false;
    emCurso.current = true;
    try {
      const ok = await op();
      if (!ok) setFoco(focoSeFalhar);
      return ok;
    } catch {
      setRecusa(mensagem); setFoco(focoSeFalhar);
      return false;
    } finally {
      emCurso.current = false;
    }
  };

  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const ficheiro = e.target.files?.[0];
    e.target.value = ""; // escolher o mesmo ficheiro outra vez volta a disparar
    if (!ficheiro) return;
    setRecusa(null); setPrevia(null); setLendo(true);
    const r = await prepararFotoOpcao(ficheiro);
    // o ecrã pode ter desaparecido durante a leitura: nada a mostrar, e não se cria o endereço temporário
    if (!montado.current) return;
    setLendo(false);
    if (r.ok === false) { setRecusa(r.erro); setFoco(`fa-${o.id}`); return; }
    setPrevia({ dados: r.v, url: criarUrl(r.v.blob) });
    setFoco(`fg-${o.id}`);
  };
  const guardar = async () => {
    if (!previa || emCurso.current) return;
    setGuardando(true);
    const ok = await executar(() => correr(() => guardarFotoOpcao(org, o.id, previa.dados.blob), `Foto de «${o.nome}» guardada.`, onde), MSG_FOTO.carregar, `fg-${o.id}`);
    setGuardando(false);
    if (ok) { setPrevia(null); aoAcabar(); }
  };
  const cancelar = () => { setPrevia(null); aoAcabar(); };
  const remover = () => {
    setRecusa(null);
    void executar(() => correr(() => ligarFotoOpcao(org, o.id, null), `Foto de «${o.nome}» removida.`, onde), MSG_GUARDAR, `fr-${o.id}`).then((ok) => { if (ok) aoAcabar(); });
  };
  const copiar = (id: string) => {
    const de = candidatas.find((x) => x.id === id);
    if (!de?.foto) return;
    setRecusa(null);
    void executar(() => correr(() => ligarFotoOpcao(org, o.id, de.foto), `Foto de «${o.nome}» copiada de «${de.nome}».`, onde), MSG_GUARDAR, idCopiar).then((ok) => { if (ok) aoAcabar(); });
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* fora da ordem do Tab: o botão é que o abre (um campo a mais no Tab, para a mesma ação, só atrapalha) */}
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label={`Ficheiro da foto da opção «${o.nome}»`} disabled={ocupado} onChange={(e) => void aoEscolher(e)}
          className="sr-only" />
        {/* os rótulos começam pelo texto visível (WCAG 2.5.3) */}
        <button id={`fa-${o.id}`} type="button" disabled={ocupado} onClick={() => entrada.current?.click()} className={BOTAO}
          aria-label={o.foto ? `Trocar foto da opção «${o.nome}»` : `Adicionar foto à opção «${o.nome}»`}>
          {lendo && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{o.foto ? "Trocar foto" : "Adicionar foto"}
        </button>
        {o.foto && (
          <button id={`fr-${o.id}`} type="button" disabled={ocupado} onClick={remover} className={BOTAO} aria-label={`Remover foto da opção «${o.nome}»`}>Remover foto</button>
        )}
        {candidatas.length > 0 && (
          <select id={idCopiar} value="" disabled={ocupado} onChange={(e) => copiar(e.target.value)} aria-label={`Copiar foto de outra opção para «${o.nome}»`} className={cn(CAMPO, "min-h-11 w-auto max-w-64")}>
            <option value="">Copiar foto de outra opção…</option>
            {candidatas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        )}
      </div>
      {/* sempre montada: o progresso (a preparar, a guardar) ouve-se */}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{lendo ? "A preparar a foto…" : guardando ? "A guardar a foto…" : ""}</p>
      {(recusa || erro) && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{recusa ?? erro}</p>}
      {previa && (
        <div role="group" aria-label={`Pré-visualização da foto da opção «${o.nome}»`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 motion-safe:animate-in motion-safe:fade-in-0">
          {previa.url && <img src={previa.url} alt="" style={{ width: 96, height: 96 }} className="shrink-0 rounded-lg border border-foreground/20 bg-muted object-cover" />}
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{previa.dados.largura}×{previa.dados.altura} px, {kb(previa.dados.bytes)}, WebP</p>
            <div className="flex flex-wrap gap-2">
              <Button id={`fg-${o.id}`} className="min-h-11 text-[15px]" disabled={bloqueado || guardando} onClick={() => void guardar()}>
                {guardando && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Guardar foto
              </Button>
              <Button variant="outline" className="min-h-11 text-[15px]" disabled={bloqueado || guardando} onClick={cancelar}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
