// Os diálogos e a folha lateral do Inventário (shadcn Dialog e Sheet): nunca confirm() nativo, o foco entra no título, Esc fecha,
// o botão primário é um só (o último), e o motivo escrito (≥3 caracteres) exige-se quando a regra o pede.
import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SEM_ATALHOS } from "../useAtalhos";
import { AvisoCaixa } from "./AvisoCaixa";
import { useCtxInv } from "./ctxInv";
import { motivoValido } from "./base";
import type { Resultado } from "./loja";
import { Notas, Nota, Pri, Sec } from "./pecasInv";

interface DlgProps { aberto: boolean; aoFechar: () => void; titulo: string; descricao?: string; largo?: boolean; children: ReactNode; rodape: ReactNode;
  /** Uma classe do mockup para o diálogo (por exemplo `portalsim`, que traz a sua borda e cabeçalho) e o que se desenha por cima/por baixo do título. */
  classe?: string; acima?: ReactNode; abaixo?: ReactNode }

/** Um diálogo: título, corpo que rola e rodapé com os botões (Cancelar à esquerda, o primário no fim). */
export function Dlg({ aberto, aoFechar, titulo, descricao, largo, children, rodape, classe, acima, abaixo }: DlgProps) {
  useCtxInv(); // o perfil muda → redesenha
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent hideClose {...{ [SEM_ATALHOS]: "" }} className={cn("inv-root dlg !flex !max-w-none !flex-col !gap-0 !p-0", !classe && "!border-0", largo && "wide", classe)}>
        <div className="dh"><div>{acima}<DialogTitle>{titulo}</DialogTitle>{descricao ? <DialogDescription className="muted" style={{ marginTop: 4 }}>{descricao}</DialogDescription> : <DialogDescription className="sr">{titulo}</DialogDescription>}{abaixo}</div><button type="button" className="btn btn-ghost btn-icon" onClick={aoFechar} aria-label="Fechar"><X className="ic" aria-hidden="true" /></button></div>
        <div className="db"><AvisoCaixa />{children}</div>
        <div className="df">{rodape}</div>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmarProps {
  aberto: boolean; aoFechar: () => void; titulo: string; texto?: ReactNode; ok: string; perigo?: boolean;
  /** Pede um motivo escrito; o botão só fica ativo com pelo menos 3 caracteres. */
  motivo?: string;
  /** Faz a ação com o motivo; se a regra recusar, o erro fica no diálogo e este não fecha. */
  aoConfirmar: (motivo: string) => Resultado<unknown>;
}
export function Confirmar({ aberto, aoFechar, titulo, texto, ok, perigo, motivo, aoConfirmar }: ConfirmarProps) {
  const [m, setM] = useState("");
  const [erro, setErro] = useState("");
  const faltaMotivo = motivo !== undefined && !motivoValido(m);
  const fechar = (): void => { setM(""); setErro(""); aoFechar(); };
  const confirmar = (): void => {
    const r = aoConfirmar(m);
    if (r.ok) fechar(); else setErro(r.erro);
  };
  return (
    <Dlg aberto={aberto} aoFechar={fechar} titulo={titulo}
      rodape={<><Sec onClick={fechar}>Cancelar</Sec><Pri disabled={faltaMotivo} title={faltaMotivo ? "Escreva o motivo (mínimo 3 caracteres)" : undefined} variant={perigo ? "destructive" : "default"} onClick={confirmar}>{ok}</Pri></>}>
      {texto}
      {motivo !== undefined && <Notas rotulo={motivo || "Motivo"} valor={m} aoMudar={(v) => { setM(v); setErro(""); }} linhas={2} obrigatorio ajuda="Mínimo 3 caracteres." />}
      {erro && <Nota tom="bad" alerta>{erro}</Nota>}
    </Dlg>
  );
}

interface FolhaProps {
  aberta: boolean; aoFechar: () => void; titulo: string; subtitulo?: string; selos?: ReactNode; chave: string; children: ReactNode; rodape?: ReactNode;
  /** As abas da folha, por baixo do cabeçalho. */
  abas?: ReactNode;
  /** Botões à esquerda do "Fechar" no topo (por exemplo o menu "Mais ações"). */
  acoesTopo?: ReactNode;
  /** Uma classe para o título (por exemplo `mono` nos números de documento). */
  tituloClasse?: string;
}
/** A folha lateral de um detalhe (largura min(720px, 100vw)): cabeçalho fixo, corpo que rola, rodapé fixo. Ao fechar, o foco volta à linha de onde se abriu. */
export function Folha({ aberta, aoFechar, titulo, subtitulo, selos, chave, children, rodape, abas, acoesTopo, tituloClasse }: FolhaProps) {
  useCtxInv(); // o perfil muda → redesenha
  const conteudo = useRef<HTMLDivElement>(null);
  const voltar = (e: Event): void => {
    e.preventDefault();
    [...document.querySelectorAll<HTMLElement>("[data-linha-func]")].find((el) => el.dataset.chave === chave)?.focus();
  };
  return (
    <Sheet open={aberta} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <SheetContent ref={conteudo} side="right" onCloseAutoFocus={voltar}
        onOpenAutoFocus={(e) => { e.preventDefault(); conteudo.current?.querySelector<HTMLElement>("h2[tabindex='-1']")?.focus(); }}
        className={cn("inv-root sheet flex flex-col gap-0 border-0 p-0 sm:!max-w-none [&>button.absolute]:hidden")}>
        <div className="sh-head">
          <div className="sh-top">
            <div style={{ minWidth: 0 }}>
              {subtitulo && <SheetDescription className="crumbs">{subtitulo}</SheetDescription>}
              <SheetTitle tabIndex={-1} className={tituloClasse} style={{ outline: "none" }}>{titulo}</SheetTitle>
              {selos && <div className="chips" style={{ marginTop: 8 }}>{selos}</div>}
            </div>
            <div className="row">{acoesTopo}<button type="button" className="btn btn-ghost btn-icon" onClick={aoFechar} aria-label="Fechar"><X className="ic" aria-hidden="true" /></button></div>
          </div>
          {abas}
        </div>
        <div className="sh-body"><div className="stack"><AvisoCaixa />{children}</div></div>
        {rodape && <div className="sh-foot">{rodape}</div>}
      </SheetContent>
    </Sheet>
  );
}

/** As abas de uma folha (`.tabs` e `.tab` do mockup): botões com role=tab e as setas a mudar de aba. */
export function AbasFolha<T extends string>({ rotulo, abas, atual, escolher }: { rotulo: string; abas: readonly (readonly [T, string, number?])[]; atual: T; escolher: (a: T) => void }) {
  const ids = abas.map((a) => a[0]);
  return (
    <div role="tablist" aria-label={rotulo} className="tabs">
      {abas.map(([id, nome, n], i) => (
        <button key={id} id={`fa-${id}`} type="button" role="tab" aria-selected={atual === id} tabIndex={atual === id ? 0 : -1} onClick={() => escolher(id)}
          onKeyDown={(e) => {
            const j = e.key === "ArrowRight" ? (i + 1) % ids.length : e.key === "ArrowLeft" ? (i - 1 + ids.length) % ids.length : e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : -1;
            if (j < 0) return;
            e.preventDefault(); escolher(ids[j]); document.getElementById(`fa-${ids[j]}`)?.focus();
          }}
          className={cn("tab", atual === id && "on")}>
          {nome}{n ? <span className="pill">{n}</span> : null}
        </button>
      ))}
    </div>
  );
}
