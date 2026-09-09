/**
 * O selector de pais, um so, sobre a tabela `countries`.
 *
 * PORQUE ESTA FONTE E NAO OUTRA
 * -----------------------------
 * `public.countries` e a unica lista de paises administravel sem deploy: tem
 * ecra proprio (`/countries`), `is_active` e `sort_order`. E o que a morada
 * comercial ja usa (`anew_addresses.country` guarda o codigo ISO-2, com
 * omissao 'PT'), e e exactamente o formato que os CHECK do RH exigem
 * (`^[A-Z]{2}$` em `pessoas_dados_pessoais.nacionalidade` e
 * `pessoas_moradas.pais`).
 *
 * NAO se usa `src/constants/countryCodes.ts` -- sao 32 paises e existe para os
 * indicativos telefonicos -- nem a lista de cinco embutida no formulario de
 * utilizadores, que tem 'UK' onde devia ter 'GB'.
 *
 * O QUE SE GRAVA E O CODIGO, NUNCA O NOME
 * ---------------------------------------
 * O rotulo e so apresentacao e pode mudar de lingua; o valor e o ISO-2.
 *
 * DUAS GUARDAS, E A RAZAO DE EXISTIREM
 * ------------------------------------
 * (1) `countries.code` e `varchar(3)`: a tabela aceita codigos de tres letras,
 *     mas os CHECK do RH exigem duas. Uma linha de tres letras produziria um
 *     valor que a base recusa, com erro de constraint na cara de quem grava --
 *     por isso o selector nao oferece essas linhas.
 * (2) Enquanto a lista carrega, o campo fica DESACTIVADO e nao vazio: um campo
 *     vazio e clicavel convida a gravar '' por cima do 'PT' que ja lá estava.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCountries } from "@/hooks/useCountries";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface CountrySelectProps {
  /** Vai no GATILHO: e ele o controlo que a etiqueta identifica. */
  id: string;
  /** Codigo ISO 3166-1 alpha-2. String vazia = sem escolha. */
  value: string;
  onChange: (codigo: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  onBlur?: () => void;
}

export function CountrySelect({
  id,
  value,
  onChange,
  disabled,
  className,
  onBlur,
  ...aria
}: CountrySelectProps) {
  const { t } = useTranslation();
  const { countries, loading } = useCountries();
  const [aberto, setAberto] = useState(false);

  /**
   * O nome em portugues. As linhas de `countries` podem estar em ingles (o
   * ecra de administracao esta todo em ingles e nao ha seed no repositorio),
   * e para esse caso ja existem as chaves `countries.<NomeIngles>` nas cinco
   * linguas -- as mesmas que o PhoneInput usa. Quando a chave nao existe,
   * `t` devolve a propria chave: e assim que se sabe que nao ha traducao e se
   * cai para o nome tal como esta na tabela.
   */
  const traduzir = (nome: string): string => {
    const chave = `countries.${nome}`;
    const traduzido = t(chave);
    return traduzido === chave ? nome : traduzido;
  };

  const opcoes = useMemo(
    () =>
      countries
        // Guarda (1): so codigos de duas letras chegam ao ecra.
        .filter((pais) => pais.code.trim().length === 2)
        .map((pais) => ({ codigo: pais.code.toUpperCase(), nome: traduzir(pais.name) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    // `traduzir` depende de `t`, que depende da lingua activa.
    [countries, t],
  );

  const escolhido = opcoes.find((opcao) => opcao.codigo === value.toUpperCase()) ?? null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          aria-invalid={aria["aria-invalid"]}
          aria-describedby={aria["aria-describedby"]}
          disabled={disabled || loading}
          onBlur={onBlur}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn(!escolhido && "text-muted-foreground")}>
            {loading
              ? t("common.loading")
              : escolhido
                ? `${escolhido.nome} (${escolhido.codigo})`
                : t("hr.campos.escolherPais")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("hr.campos.procurarPais")} />
          <CommandList>
            <CommandEmpty>{t("hr.campos.semPaises")}</CommandEmpty>
            <CommandGroup>
              {opcoes.map((opcao) => (
                <CommandItem
                  key={opcao.codigo}
                  // O `value` do cmdk e o que a pesquisa compara: o nome
                  // traduzido MAIS o codigo, para "PT" e "Portugal" acharem
                  // ambos a mesma linha.
                  value={`${opcao.nome} ${opcao.codigo}`}
                  onSelect={() => {
                    onChange(opcao.codigo);
                    setAberto(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      opcao.codigo === value.toUpperCase() ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opcao.nome} <span className="ml-1 text-muted-foreground">({opcao.codigo})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
