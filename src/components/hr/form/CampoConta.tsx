/**
 * O selector de conta de CRM que preenche (e, com permissao, liga) a ficha.
 *
 * Modelado em `src/components/users/UserCombobox.tsx` (Popover + Command),
 * mas CORRIGINDO A LACUNA que esse tem: o gatilho leva `id`, uma
 * `<Label htmlFor>` propria, `aria-describedby` para a ajuda/rodape, e chama
 * `tocar(id)` no `onBlur` -- exactamente como `CampoSelect` faz no
 * `SelectTrigger` (Campos.tsx). Nao se reutiliza `UserCombobox` tal como
 * esta: nao tem etiqueta associada, e a regra do projecto exige-a em todo o
 * campo com etiqueta.
 *
 * O RODAPE MUDA CONSOANTE A PERMISSAO, O CAMPO NUNCA DESAPARECE
 * -----------------------------------------------------------------
 * Quem nao tem `hr.pessoas.conta.link` continua a poder escolher uma conta
 * para PREENCHER os campos; so nao liga. `podeLigar` decide so o TEXTO do
 * rodape -- a decisao real (chamar ou nao `rpc_hr_ligar_conta`) e tomada por
 * quem usa este componente, ao montar o payload de criacao.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/hooks/useTranslation";
import { useTocarCampo } from "@/components/hr/form/Campos";
import type { ContaLigavel } from "@/hooks/useContasLigaveis";

interface CampoContaProps {
  id: string;
  label: string;
  contas: ContaLigavel[];
  valor: string;
  onChange: (contaId: string) => void;
  loading?: boolean;
  /** Muda so o TEXTO do rodape; o campo continua activo dos dois lados. */
  podeLigar: boolean;
  className?: string;
}

export function CampoConta({
  id,
  label,
  contas,
  valor,
  onChange,
  loading,
  podeLigar,
  className,
}: CampoContaProps) {
  const { t } = useTranslation();
  const tocar = useTocarCampo();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtradas = useMemo(() => {
    if (!search) return contas;
    const query = search.toLowerCase();
    return contas.filter(
      (conta) => conta.name.toLowerCase().includes(query) || conta.email.toLowerCase().includes(query),
    );
  }, [contas, search]);

  const seleccionada = contas.find((c) => c.id === valor);
  const ajudaId = `${id}-ajuda`;

  return (
    <div className={cn("space-y-1.5 rounded-md border bg-muted/30 p-3", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover
        open={open}
        onOpenChange={(proximo) => {
          setOpen(proximo);
          if (!proximo) tocar(id);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-describedby={ajudaId}
            disabled={loading}
            className="w-full justify-between h-auto min-h-10 py-2"
          >
            {seleccionada ? (
              <div className="flex items-center gap-2 text-left">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="truncate text-sm">{seleccionada.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{seleccionada.email}</span>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">
                {loading ? t("common.loading") : t("hr.conta.selecionar")}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0 z-[9999]" align="start">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                placeholder={t("common.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandList className="max-h-[300px]">
              <CommandEmpty>{t("common.noResults")}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__sem_conta__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                    setSearch("");
                    tocar(id);
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-3 w-full">
                    <span className="flex-1 text-sm text-muted-foreground">
                      {t("hr.conta.semConta")}
                    </span>
                    <Check className={cn("h-4 w-4 shrink-0", valor === "" ? "opacity-100" : "opacity-0")} />
                  </div>
                </CommandItem>
                {filtradas.map((conta) => (
                  <CommandItem
                    key={conta.id}
                    value={conta.id}
                    onSelect={() => {
                      onChange(conta.id);
                      setOpen(false);
                      setSearch("");
                      tocar(id);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{conta.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{conta.email}</p>
                      </div>
                      <Check
                        className={cn("h-4 w-4 shrink-0", valor === conta.id ? "opacity-100" : "opacity-0")}
                      />
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p id={ajudaId} className="text-xs text-muted-foreground">
        {podeLigar ? t("hr.conta.rodapeComPermissao") : t("hr.conta.rodapeSemPermissao")}
      </p>
    </div>
  );
}
