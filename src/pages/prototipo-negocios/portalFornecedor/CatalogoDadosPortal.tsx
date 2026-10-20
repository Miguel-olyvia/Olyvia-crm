// O Catálogo e Os meus dados no Portal do Fornecedor simulado (20/10, demo), editáveis: novo artigo, editar, ativar/desativar, pesquisar e mostrar
// inativos; os dados da empresa num formulário. Tudo grava no Inventário do protótipo (regrasPortal.ts) e aparece logo no CRM (ficha do fornecedor).
import { useState } from "react";
import { Pencil, Plus, Power, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { executar, useInventario } from "../inventario/loja";
import type { Fornecedor, ItemCatalogo } from "../inventario/tipos";
import { dinheiro } from "./dadosPortal";
import {
  artigoParaDados, artigoVazio, ativarArtigoPortal, dadosDoFornecedor, guardarArtigoPortal, guardarDadosPortal, type DadosArtigoPortal, type DadosFornPortal,
} from "./regrasPortal";

function Erro({ texto }: { texto: string }) {
  return texto ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[15px] text-destructive">{texto}</p> : null;
}

function CampoTexto({ id, rotulo, valor, mudar, tipo = "text", ajuda, ...resto }: { id: string; rotulo: string; valor: string; mudar: (v: string) => void; tipo?: string; ajuda?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} type={tipo} className="h-11 text-[15px]" value={valor} onChange={(e) => mudar(e.target.value)} {...resto} />
      {ajuda && <p className="text-sm text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

const ROTULOS_ARTIGO: [keyof DadosArtigoPortal, string, React.InputHTMLAttributes<HTMLInputElement>][] = [
  ["ref", "Referência", { autoComplete: "off" }], ["name", "Descrição", {}], ["ean", "EAN (opcional)", { inputMode: "numeric" }], ["price", "Preço por embalagem (€)", { inputMode: "decimal" }],
  ["unitLabel", "Embalagem", {}], ["packN", "Unidades por embalagem", { type: "number", min: 1, step: 1 }], ["moq", "Encomenda mínima (embalagens)", { type: "number", min: 1, step: 1 }],
  ["lead", "Prazo de entrega (dias)", { type: "number", min: 0, step: 1 }],
];

function ArtigoDialogo({ s, c, aoFechar, avisar }: { s: Fornecedor; c: ItemCatalogo | null; aoFechar: () => void; avisar: (t: string) => void }) {
  const [d, setD] = useState<DadosArtigoPortal>(() => (c ? artigoParaDados(c) : artigoVazio(s.sla)));
  const [erro, setErro] = useState("");
  const gravar = (): void => {
    const r = executar((db) => guardarArtigoPortal(db, s.id, d, c?.id ?? null));
    if (!r.ok) { setErro(r.erro); return; }
    avisar(c ? `Artigo ${r.valor.item.ref} atualizado.${r.valor.precoEnviado ? " O preço novo foi enviado à empresa para aprovar." : ""}` : `Artigo ${r.valor.item.ref} acrescentado ao catálogo.`);
    aoFechar();
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c ? `Editar artigo ${c.ref}` : "Novo artigo"}</DialogTitle>
          <DialogDescription className="text-[15px]">{c ? "Se mudar o preço de um artigo que a empresa já compra, ela recebe a alteração para aprovar." : "O artigo fica disponível para a empresa ligar a um produto dela."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROTULOS_ARTIGO.map(([k, rot, { type, ...attrs }]) => (
            <div key={k} className={k === "name" ? "sm:col-span-2" : undefined}>
              <CampoTexto id={`pf-art-${k}`} rotulo={rot} valor={d[k]} mudar={(v) => { setErro(""); setD((x) => ({ ...x, [k]: v })); }} tipo={type ?? "text"} {...attrs} />
            </div>
          ))}
        </div>
        <Erro texto={erro} />
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={aoFechar}>Cancelar</Button>
          <Button className="h-11 gap-2" onClick={gravar}><Save className="h-4 w-4" aria-hidden="true" />{c ? "Gravar artigo" : "Acrescentar artigo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogoPortal({ s, avisar }: { s: Fornecedor; avisar: (t: string) => void }) {
  const db = useInventario();
  const L = db.catalog.filter((c) => c.sup === s.id);
  const [q, setQ] = useState("");
  const [inativos, setInativos] = useState(false);
  const [dlg, setDlg] = useState<{ c: ItemCatalogo | null } | null>(null);
  const nInativos = L.filter((c) => c.inactive).length;
  const vis = L.filter((c) => (inativos || !c.inactive) && (!q.trim() || `${c.ref} ${c.name} ${c.ean ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const ativar = (c: ItemCatalogo, ativo: boolean): void => {
    const r = executar((d) => ativarArtigoPortal(d, s.id, c.id, ativo));
    if (r.ok) avisar(`Artigo ${c.ref} ${ativo ? "ativado" : "desativado"}.`);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Catálogo</h1>
          <p className="text-[15px] text-muted-foreground">Os artigos que disponibiliza às empresas. {L.length - nInativos} ativos{nInativos ? ` · ${nInativos} inativos` : ""}.</p>
        </div>
        <Button className="h-11 gap-2 self-start sm:self-auto" onClick={() => setDlg({ c: null })}><Plus className="h-4 w-4" aria-hidden="true" />Novo artigo</Button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="block w-full max-w-sm">
          <span className="sr-only">Pesquisar no catálogo</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por referência, nome ou EAN"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <Switch checked={inativos} onCheckedChange={setInativos} aria-label="Mostrar inativos" />Mostrar inativos
        </label>
      </div>
      {vis.length === 0 ? <p className="py-8 text-center text-[15px] text-muted-foreground" role="status">{L.length ? "Nenhum artigo com estes filtros." : "Ainda não tem artigos no catálogo: use “Novo artigo”."}</p> : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader><TableRow><TableHead>Referência</TableHead><TableHead>Descrição</TableHead><TableHead>Embalagem</TableHead><TableHead className="text-right">Preço</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {vis.map((c) => (
                <TableRow key={c.id} className={c.inactive ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-mono font-semibold">{c.ref}</TableCell>
                  <TableCell>{c.name}{c.ean ? <span className="block text-xs text-muted-foreground">EAN {c.ean}</span> : null}</TableCell>
                  <TableCell>{c.unitLabel}{c.packN > 1 ? ` (${c.packN} un)` : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinheiro(c.price)}</TableCell>
                  <TableCell>{c.inactive ? "Inativo" : "Ativo"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" className="h-11 gap-1.5" aria-label={`Editar ${c.ref}`} onClick={() => setDlg({ c })}><Pencil className="h-4 w-4" aria-hidden="true" />Editar</Button>
                    <Button variant="ghost" className="h-11 gap-1.5" aria-label={`${c.inactive ? "Ativar" : "Desativar"} ${c.ref}`} onClick={() => ativar(c, !!c.inactive)}><Power className="h-4 w-4" aria-hidden="true" />{c.inactive ? "Ativar" : "Desativar"}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {dlg && <ArtigoDialogo s={s} c={dlg.c} aoFechar={() => setDlg(null)} avisar={avisar} />}
    </div>
  );
}

const CAMPOS_DADOS: [keyof DadosFornPortal, string, string?][] = [
  ["name", "Nome da empresa"], ["contact", "Pessoa de contacto"], ["email", "Email", "email"], ["phone", "Telefone", "tel"], ["addr", "Morada"], ["cp", "Código postal"],
  ["city", "Cidade"], ["country", "País"], ["web", "Website"], ["sla", "Prazo de entrega habitual (dias)", "number"],
];

/** O formulário dos dados da empresa (Os meus dados e o primeiro acesso). */
export function FormDados({ d, setD, prefixo }: { d: DadosFornPortal; setD: (f: (x: DadosFornPortal) => DadosFornPortal) => void; prefixo: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CAMPOS_DADOS.map(([k, rot, tipo]) => (
        <CampoTexto key={k} id={`${prefixo}-${k}`} rotulo={rot} tipo={tipo} valor={d[k]} mudar={(v) => setD((x) => ({ ...x, [k]: v }))} placeholder={k === "cp" ? "0000-000" : undefined} min={tipo === "number" ? 0 : undefined} />
      ))}
    </div>
  );
}

export function DadosPortal({ s, avisar }: { s: Fornecedor; avisar: (t: string) => void }) {
  const db = useInventario();
  const [d, setD] = useState<DadosFornPortal>(() => dadosDoFornecedor(db, s.id));
  const [erro, setErro] = useState("");
  const gravar = (): void => {
    const r = executar((x) => guardarDadosPortal(x, s.id, d));
    if (!r.ok) { setErro(r.erro); return; }
    setErro("");
    avisar("Dados gravados. A empresa já vê a ficha atualizada.");
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Os meus dados</h1>
        <p className="text-[15px] text-muted-foreground">Os dados que as empresas veem na sua ficha de fornecedor. O NIF ({s.nif}) só muda com a empresa.</p>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <FormDados d={d} setD={(f) => { setErro(""); setD(f); }} prefixo="pf-dados" />
          <Erro texto={erro} />
          <div className="flex justify-end"><Button className="h-11 gap-2" onClick={gravar}><Save className="h-4 w-4" aria-hidden="true" />Gravar dados</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
