import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

import { AlignLeft, AlignCenter, AlignRight, Upload, Image as ImageIcon, Loader2, X, LayoutTemplate } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import type { DocumentSettings } from "@/hooks/useDocumentSettings";
import { useOrgHeaderData } from "./useOrgHeaderData";

interface Props {
  settings: DocumentSettings;
  onChange: (s: Partial<DocumentSettings>) => void;
  orgName?: string;
}

const LOGO_SIZES = [
  { value: "small", label: "Pequeno" },
  { value: "medium", label: "Médio" },
  { value: "large", label: "Grande" },
] as const;

export function DocumentHeaderSettings({ settings, onChange, orgName }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const { activeCompany } = useCompany();
  const { data: orgData } = useOrgHeaderData();

  const headerStyle = settings.header_style || "simple";
  const logoSize = settings.logo_size || "medium";
  const showContractBlock = headerStyle === "split";

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um ficheiro de imagem (PNG, JPG)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem demasiado grande (máx. 5MB)");
      return;
    }
    uploadingRef.current = true;
    try {
      const orgId = activeCompany?.id || settings.organization_id;
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${orgId}/doc-logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("company-logos").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(filePath);
      onChange({ logo_url: urlData.publicUrl });
      toast.success("Logotipo carregado com sucesso");
    } catch (err: any) {
      console.error("Logo upload error:", err);
      toast.error("Erro ao carregar logotipo: " + (err.message || "erro desconhecido"));
    } finally {
      uploadingRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <ImageIcon className="h-4 w-4" /> Cabeçalho do Documento
      </h4>

      {/* Estilo do cabeçalho */}
      <div className="space-y-2">
        <Label className="text-xs flex items-center gap-1.5"><LayoutTemplate className="h-3.5 w-3.5" /> Estilo do cabeçalho</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={headerStyle === "simple" ? "default" : "outline"}
            size="sm"
            className="h-auto py-2 flex-col items-start text-left"
            onClick={() => onChange({ header_style: "simple" })}
          >
            <span className="text-xs font-semibold">Simples</span>
            <span className="text-[10px] opacity-70">Logo + dados alinhados</span>
          </Button>
          <Button
            type="button"
            variant={headerStyle === "split" ? "default" : "outline"}
            size="sm"
            className="h-auto py-2 flex-col items-start text-left"
            onClick={() => onChange({ header_style: "split" })}
          >
            <span className="text-xs font-semibold">Contrato + Marca</span>
            <span className="text-[10px] opacity-70">Bloco contrato / Logo + dados</span>
          </Button>
        </div>
      </div>

      {/* Logo upload */}
      <div className="space-y-2">
        <Label className="text-xs">Logotipo</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleLogoUpload}
        />
        {settings.logo_url ? (
          <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/20">
            <img src={settings.logo_url} alt="Logo" className="h-12 object-contain rounded border p-1 bg-background" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">Logo carregado</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
              Alterar
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onChange({ logo_url: null })}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            <p className="font-medium">Clique para carregar o logotipo</p>
            <p className="text-[10px] mt-0.5">PNG, JPG até 5MB</p>
          </button>
        )}
      </div>

      {/* Alinhamento (só estilo simples) */}
      {headerStyle === "simple" && (
        <div className="space-y-2">
          <Label className="text-xs">Alinhamento</Label>
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((pos) => (
              <Button
                key={pos}
                type="button"
                variant={settings.header_layout === pos ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onChange({ header_layout: pos })}
              >
                {pos === "left" && <AlignLeft className="h-3.5 w-3.5" />}
                {pos === "center" && <AlignCenter className="h-3.5 w-3.5" />}
                {pos === "right" && <AlignRight className="h-3.5 w-3.5" />}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Tamanho do logo (ligado às settings) */}
      <div className="space-y-2">
        <Label className="text-xs">Tamanho do Logo</Label>
        <div className="flex gap-1">
          {LOGO_SIZES.map((s) => (
            <Button
              key={s.value}
              type="button"
              variant={logoSize === s.value ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => onChange({ logo_size: s.value })}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Nome da empresa */}
      <div className="space-y-2">
        <Label className="text-xs">Nome da Empresa</Label>
        <Input
          value={settings.company_name_override ?? ""}
          onChange={(e) => onChange({ company_name_override: e.target.value || null })}
          placeholder={orgData?.empresa_nome || orgName || "Nome da empresa"}
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Em branco usa o nome da organização ({orgData?.empresa_nome || orgName || "—"}).
        </p>
      </div>

      {/* Dados a mostrar */}
      <div className="space-y-2">
        <Label className="text-xs">Dados a mostrar no cabeçalho</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "show_nif" as const, label: "NIF" },
            { key: "show_address" as const, label: "Morada" },
            { key: "show_phone" as const, label: "Telefone" },
            { key: "show_email" as const, label: "Email" },
            { key: "show_website" as const, label: "Website" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch
                checked={settings[key]}
                onCheckedChange={(v) => onChange({ [key]: v })}
                className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Overrides de dados da empresa (cabeçalho) */}
      {settings.show_address && (
        <div className="space-y-1">
          <Label className="text-xs">Morada</Label>
          <Input
            value={settings.company_address_override ?? ""}
            onChange={(e) => onChange({ company_address_override: e.target.value || null })}
            placeholder={orgData?.empresa_morada || "Morada da organização"}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Em branco usa a morada da organização ({orgData?.empresa_morada || "sem morada definida"}).
          </p>
        </div>
      )}

      {settings.show_nif && (
        <div className="space-y-1">
          <Label className="text-xs">NIF</Label>
          <Input
            value={settings.company_nif_override ?? ""}
            onChange={(e) => onChange({ company_nif_override: e.target.value || null })}
            placeholder={orgData?.empresa_nif || "NIF da organização"}
            className="h-8 text-sm"
          />
        </div>
      )}

      {settings.show_phone && (
        <div className="space-y-1">
          <Label className="text-xs">Telefone</Label>
          <Input
            value={settings.company_phone_override ?? ""}
            onChange={(e) => onChange({ company_phone_override: e.target.value || null })}
            placeholder={orgData?.empresa_telefone || "Telefone da organização"}
            className="h-8 text-sm"
          />
        </div>
      )}

      {settings.show_email && (
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input
            value={settings.company_email_override ?? ""}
            onChange={(e) => onChange({ company_email_override: e.target.value || null })}
            placeholder={orgData?.empresa_email || "Email da organização"}
            className="h-8 text-sm"
          />
        </div>
      )}

      {settings.show_website && (
        <div className="space-y-1">
          <Label className="text-xs">Website</Label>
          <Input
            value={settings.company_website || ""}
            onChange={(e) => onChange({ company_website: e.target.value || null })}
            placeholder={orgData?.empresa_website || "www.empresa.pt"}
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Cor principal */}
      <div className="space-y-2">
        <Label className="text-xs">Cor principal do cabeçalho</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={settings.primary_color}
            onChange={(e) => onChange({ primary_color: e.target.value })}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <Input
            value={settings.primary_color}
            onChange={(e) => onChange({ primary_color: e.target.value })}
            className="h-8 text-sm w-24 font-mono"
          />
        </div>
      </div>

      {/* Cor cabeçalho tabela produtos */}
      <div className="space-y-2">
        <Label className="text-xs">Cor do cabeçalho da tabela de produtos</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={settings.table_header_color || settings.primary_color}
            onChange={(e) => onChange({ table_header_color: e.target.value })}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <Input
            value={settings.table_header_color || ""}
            placeholder={settings.primary_color}
            onChange={(e) => onChange({ table_header_color: e.target.value || null })}
            className="h-8 text-sm w-28 font-mono"
          />
          {settings.table_header_color && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ table_header_color: null })}>
              Repor
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">Se vazio, usa a cor principal do cabeçalho.</p>
      </div>

      {/* Separador */}
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <Switch
          checked={settings.header_show_separator}
          onCheckedChange={(v) => onChange({ header_show_separator: v })}
          className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
        />
        Linha separadora sob o cabeçalho
      </label>

      {/* Bloco contrato — só no estilo split */}
      {showContractBlock && (
        <div className="space-y-3 pt-3 mt-3 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Bloco do Contrato</Label>
            <Switch
              checked={settings.contract_block_show !== false}
              onCheckedChange={(v) => onChange({ contract_block_show: v })}
              className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
            />
          </div>

          {settings.contract_block_show !== false && (
            <div className="space-y-2 pl-2 border-l-2 border-muted">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Título</Label>
                <Input
                  value={settings.contract_block_title ?? "CONTRATO"}
                  onChange={(e) => onChange({ contract_block_title: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtítulo</Label>
                <Input
                  value={settings.contract_block_subtitle ?? ""}
                  onChange={(e) => onChange({ contract_block_subtitle: e.target.value || null })}
                  placeholder="www.empresa.pt"
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Label nº</Label>
                  <Input
                    value={settings.contract_block_number_label ?? "CONTRATO Nº"}
                    onChange={(e) => onChange({ contract_block_number_label: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Variável</Label>
                  <Input
                    value={settings.contract_block_number_value ?? "{{contrato_numero}}"}
                    onChange={(e) => onChange({ contract_block_number_value: e.target.value })}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Mostrar data</Label>
                <Switch
                  checked={settings.contract_block_show_date !== false}
                  onCheckedChange={(v) => onChange({ contract_block_show_date: v })}
                  className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
                />
              </div>
              {settings.contract_block_show_date !== false && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={settings.contract_block_date_label ?? "Data:"}
                    onChange={(e) => onChange({ contract_block_date_label: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <Input
                    value={settings.contract_block_date_value ?? "{{data}}"}
                    onChange={(e) => onChange({ contract_block_date_value: e.target.value })}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Mostrar comercial</Label>
                <Switch
                  checked={settings.contract_block_show_commercial !== false}
                  onCheckedChange={(v) => onChange({ contract_block_show_commercial: v })}
                  className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
                />
              </div>
              {settings.contract_block_show_commercial !== false && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={settings.contract_block_commercial_label ?? "Comercial:"}
                    onChange={(e) => onChange({ contract_block_commercial_label: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <Input
                    value={settings.contract_block_commercial_value ?? "{{comercial_nome}}"}
                    onChange={(e) => onChange({ contract_block_commercial_value: e.target.value })}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
