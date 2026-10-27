// 23/10/2026 (2.0, segurança): os dois diálogos da sincronização por organização.
// · ConfirmarRepor: "Repor a demonstração" numa organização de demonstração (com conta) apaga o que lá está para todos: só depois de
//   escrever o nome da organização. Numa organização real o botão nem aparece.
// · ConflitosSync: o que se mudou sem rede e outra pessoa também mudou entretanto: a pessoa escolhe com qual fica (nunca se perde em
//   silêncio).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConflitoSync } from "./sincronizacao";

/** O nome escrito confere com o da organização (sem contar maiúsculas nem espaços nas pontas). */
export const nomeConfere = (escrito: string, nome: string): boolean =>
  !!nome.trim() && escrito.trim().toLocaleLowerCase("pt") === nome.trim().toLocaleLowerCase("pt");

export function ConfirmarRepor({ nome, confirmar, fechar }: { nome: string; confirmar: () => void; fechar: () => void }) {
  const [escrito, setEscrito] = useState("");
  const ok = nomeConfere(escrito, nome);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Repor a demonstração</DialogTitle>
          <DialogDescription>
            Todos os negócios, clientes e definições de <strong>{nome}</strong> voltam aos dados de exemplo, para todas as pessoas desta
            organização. Não se pode desfazer.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm">
          Para confirmar, escreva o nome da organização
          <input value={escrito} onChange={(e) => setEscrito(e.target.value)} autoComplete="off" aria-label="Nome da organização"
            className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button variant="destructive" disabled={!ok} onClick={() => { if (ok) { confirmar(); fechar(); } }}>Repor a demonstração</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConflitosSync({ conflitos, escolher }: { conflitos: readonly ConflitoSync[]; escolher: (e: "minhas" | "remotas") => void }) {
  if (!conflitos.length) return null;
  return (
    <Dialog open onOpenChange={() => { /* só se fecha a escolher */ }}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Alterações feitas sem ligação</DialogTitle>
          <DialogDescription>
            Enquanto esteve sem ligação, outra pessoa mudou também {conflitos.length === 1 ? "esta parte" : "estas partes"}. Escolha com que
            versão fica.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 text-[15px]" aria-label="Partes em conflito">
          {conflitos.map((c) => <li key={c.chave} className="rounded-lg bg-muted px-3 py-2">{c.nome}</li>)}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => escolher("remotas")}>Ficar com as da outra pessoa</Button>
          <Button onClick={() => escolher("minhas")}>Manter as minhas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
