import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Palette, Type, Layout, CheckCircle, Image, Code, Sliders, ImageIcon } from "lucide-react";
import { GalleryPickerDialog } from "@/components/GalleryPickerDialog";
import { BrandingLivePreview } from "@/components/forms/BrandingLivePreview";
import { LANGUAGES } from "@/constants/languages";
import {
  readI18nConfig,
  persistI18nConfig,
  setOverlayValue,
  getOverlayValue,
  computeBrandingCoverage,
  DEFAULT_FORM_LOCALE,
  type FormI18nConfig,
} from "@/lib/formI18n";
import {
  normalizeLayoutConfig,
  DEFAULT_LAYOUT_CONFIG,
  type LayoutConfig,
  type LayoutDensity,
} from "@/lib/forms/layoutConfig";

const TRANSLATABLE_BRANDING_KEYS = [
  "form_title",
  "form_subtitle",
  "submit_button_text",
  "next_button_text",
  "previous_button_text",
  "success_title",
  "success_message",
  "footer_text",
  "location_rejection_message",
] as const;
type TranslatableBrandingKey = typeof TRANSLATABLE_BRANDING_KEYS[number];

interface FormBrandingConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
}

interface BrandingData {
  logo_url: string;
  favicon_url: string;
  background_image_url: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  button_text_color: string;
  accent_color: string;
  font_family: string;
  form_title: string;
  form_subtitle: string;
  submit_button_text: string;
  next_button_text: string;
  previous_button_text: string;
  success_title: string;
  success_message: string;
  success_redirect_url: string;
  show_step_indicator: boolean;
  show_step_titles: boolean;
  show_progress_bar: boolean;
  card_style: string;
  border_radius: string;
  step_border_width: string;
  step_border_color: string;
  step_shadow: string;
  custom_css: string;
  footer_text: string;
  privacy_policy_url: string;
  terms_url: string;
  location_rejection_message: string;
  show_form_title: boolean;
  iframe_flush_embed: boolean;
  container_padding_x: string;
  container_padding_y: string;
  layout_config: LayoutConfig;
}

const defaultBranding: BrandingData = {
  logo_url: "",
  favicon_url: "",
  background_image_url: "",
  primary_color: "#85D3BE",
  secondary_color: "#A8D8CB",
  background_color: "#FFFFFF",
  text_color: "#1F2937",
  button_text_color: "#FFFFFF",
  accent_color: "#85D3BE",
  font_family: "Inter, system-ui, sans-serif",
  form_title: "",
  form_subtitle: "",
  submit_button_text: "Submeter",
  next_button_text: "Próximo",
  previous_button_text: "Anterior",
  success_title: "Obrigado!",
  success_message: "O seu pedido foi submetido com sucesso.",
  success_redirect_url: "",
  show_step_indicator: true,
  show_step_titles: true,
  show_progress_bar: false,
  card_style: "elevated",
  border_radius: "rounded-lg",
  step_border_width: "1px",
  step_border_color: "#e5e7eb",
  step_shadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
  custom_css: "",
  footer_text: "",
  privacy_policy_url: "",
  terms_url: "",
  location_rejection_message: "De momento ainda não fornecemos serviços na sua zona.",
  show_form_title: true,
  iframe_flush_embed: false,
  container_padding_x: "",
  container_padding_y: "",
  layout_config: { ...DEFAULT_LAYOUT_CONFIG },
};

const fontOptions = [
  { value: "Inter, system-ui, sans-serif", label: "Inter (Padrão)" },
  { value: "system-ui, sans-serif", label: "System UI" },
  { value: "'Poppins', sans-serif", label: "Poppins" },
  { value: "'Roboto', sans-serif", label: "Roboto" },
  { value: "'Open Sans', sans-serif", label: "Open Sans" },
  { value: "'Montserrat', sans-serif", label: "Montserrat" },
];

const cardStyleOptions = [
  { value: "elevated", label: "Elevado (com sombra)" },
  { value: "outlined", label: "Com borda" },
  { value: "flat", label: "Plano" },
];

const borderRadiusOptions = [
  { value: "rounded-none", label: "Sem arredondamento" },
  { value: "rounded-sm", label: "Pequeno" },
  { value: "rounded-md", label: "Médio" },
  { value: "rounded-lg", label: "Grande" },
  { value: "rounded-xl", label: "Extra grande" },
];

// Helper component for image URL fields with gallery picker
function ImageUrlField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setGalleryOpen(true)}
          title="Selecionar da galeria"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </div>
      <GalleryPickerDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        mode="image"
        title={`Selecionar ${label}`}
        currentValue={value}
        onSelect={(url) => onChange(url)}
      />
    </div>
  );
}

function ColorInput({ label, description, value, onChange }: { label: string; description?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-9 p-1 cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono text-xs"
          placeholder="#000000"
        />
      </div>
      {description && <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>}
    </div>
  );
}

export function FormBrandingConfig({ open, onOpenChange, formId, formName }: FormBrandingConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branding, setBranding] = useState<BrandingData>(defaultBranding);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [i18nConfig, setI18nConfig] = useState<FormI18nConfig>({
    default_locale: DEFAULT_FORM_LOCALE,
    enabled_locales: [],
    content: {},
  });
  const [activeLocale, setActiveLocale] = useState<string>(DEFAULT_FORM_LOCALE);

  useEffect(() => {
    if (open && formId) {
      loadBranding();
      loadI18nConfig();
    }
  }, [open, formId]);

  const loadI18nConfig = async () => {
    const { data } = await supabase.from("forms").select("settings").eq("id", formId).maybeSingle();
    const cfg = readI18nConfig(data?.settings);
    setI18nConfig(cfg);
    setActiveLocale(cfg.default_locale || DEFAULT_FORM_LOCALE);
  };

  const availableLocales = useMemo(() => {
    const def = i18nConfig.default_locale || DEFAULT_FORM_LOCALE;
    return [def, ...(i18nConfig.enabled_locales || []).filter((l) => l !== def)];
  }, [i18nConfig]);

  const isDefaultLocale = activeLocale === (i18nConfig.default_locale || DEFAULT_FORM_LOCALE);

  /** Locale-aware text setter for translatable branding fields. */
  const setBrandingText = (key: TranslatableBrandingKey, value: string) => {
    if (isDefaultLocale) {
      setBranding({ ...branding, [key]: value });
      return;
    }
    const next = setOverlayValue(i18nConfig, "branding", "branding", activeLocale, key, value);
    setI18nConfig(next);
    persistI18nConfig(formId, next).catch((e) => {
      console.error("Failed to persist branding i18n", e);
      toast.error("Erro ao guardar tradução");
    });
  };

  /** Read displayed value for a translatable branding field in the active locale. */
  const getBrandingText = (key: TranslatableBrandingKey): string => {
    if (isDefaultLocale) return (branding as any)[key] || "";
    return getOverlayValue(i18nConfig, "branding", "branding", activeLocale, key) || "";
  };

  const getBrandingPlaceholder = (key: TranslatableBrandingKey): string => {
    return (branding as any)[key] || "";
  };

  const loadBranding = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("form_branding")
        .select("*")
        .eq("form_id", formId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingId(data.id);
        setBranding({
          logo_url: data.logo_url || "",
          favicon_url: data.favicon_url || "",
          background_image_url: data.background_image_url || "",
          primary_color: data.primary_color || "#85D3BE",
          secondary_color: data.secondary_color || "#A8D8CB",
          background_color: data.background_color || "#FFFFFF",
          text_color: data.text_color || "#1F2937",
          button_text_color: data.button_text_color || "#FFFFFF",
          accent_color: data.accent_color || "#85D3BE",
          font_family: data.font_family || "Inter, system-ui, sans-serif",
          form_title: data.form_title || "",
          form_subtitle: data.form_subtitle || "",
          submit_button_text: data.submit_button_text || "Submeter",
          next_button_text: data.next_button_text || "Próximo",
          previous_button_text: data.previous_button_text || "Anterior",
          success_title: data.success_title || "Obrigado!",
          success_message: data.success_message || "",
          success_redirect_url: data.success_redirect_url || "",
          show_step_indicator: data.show_step_indicator ?? true,
          show_step_titles: data.show_step_titles ?? true,
          show_progress_bar: data.show_progress_bar ?? false,
          card_style: data.card_style || "elevated",
          border_radius: data.border_radius || "rounded-lg",
          step_border_width: data.step_border_width || "1px",
          step_border_color: data.step_border_color || "#e5e7eb",
          step_shadow: data.step_shadow || "0 1px 3px 0 rgb(0 0 0 / 0.1)",
          custom_css: data.custom_css || "",
          footer_text: data.footer_text || "",
          privacy_policy_url: data.privacy_policy_url || "",
          terms_url: data.terms_url || "",
          location_rejection_message: data.location_rejection_message || "",
          show_form_title: data.show_form_title ?? true,
          iframe_flush_embed: (data as any).iframe_flush_embed ?? false,
          container_padding_x: (data as any).container_padding_x ?? "",
          container_padding_y: (data as any).container_padding_y ?? "",
          layout_config: normalizeLayoutConfig((data as any).layout_config),
        });
      } else {
        setExistingId(null);
        setBranding(defaultBranding);
      }
    } catch (error) {
      console.error("Error loading branding:", error);
      toast.error("Erro ao carregar branding");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatePayload: any = { ...branding };

      if (existingId) {
        const { error } = await supabase
          .from("form_branding")
          .update(updatePayload)
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { resolveCurrentBusinessUserId } = await import("@/lib/identity/resolveBusinessUserId");
        const anewUserId = await resolveCurrentBusinessUserId();
        const { error } = await (supabase as any)
          .from("form_branding")
          .insert({ form_id: formId, ...updatePayload, created_by: anewUserId });
        if (error) throw error;
      }

      toast.success("Branding guardado com sucesso");
      await loadBranding();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving branding:", error);
      toast.error(`Erro ao guardar branding: ${error.message ?? "desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col">
        <div className="px-6 pt-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Personalização - {formName}
            </DialogTitle>
            {availableLocales.length > 1 && (
              <div className="flex items-center gap-2">
                {!isDefaultLocale && (() => {
                  const cov = computeBrandingCoverage(
                    i18nConfig,
                    activeLocale,
                    branding as unknown as Record<string, unknown>,
                  );
                  if (cov.total === 0) return null;
                  const complete = cov.translated >= cov.total;
                  return (
                    <span
                      title={`${cov.translated}/${cov.total} traduzidos`}
                      className={`inline-flex items-center gap-0.5 rounded-sm border px-1 py-0 text-[10px] leading-4 font-medium select-none ${
                        complete
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      🌐 {activeLocale.toUpperCase()}{complete ? " ✓" : ""}
                    </span>
                  );
                })()}
                <Select value={activeLocale} onValueChange={setActiveLocale}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLocales.map((loc) => {
                      const lang = LANGUAGES.find((l) => l.code === loc);
                      const isDef = loc === (i18nConfig.default_locale || DEFAULT_FORM_LOCALE);
                      return (
                        <SelectItem key={loc} value={loc}>
                          {lang?.name || loc.toUpperCase()} {isDef ? "(principal)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] flex-1 min-h-0 overflow-hidden">
            <div className="border-r overflow-hidden flex flex-col min-h-0">
              <Tabs defaultValue="colors" className="flex-1 flex flex-col min-h-0 px-6 pb-2">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="colors" className="text-xs">
                <Palette className="h-4 w-4 mr-1" />
                Cores
              </TabsTrigger>
              <TabsTrigger value="typography" className="text-xs">
                <Type className="h-4 w-4 mr-1" />
                Tipografia
              </TabsTrigger>
              <TabsTrigger value="layout" className="text-xs">
                <Layout className="h-4 w-4 mr-1" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="content" className="text-xs">
                <CheckCircle className="h-4 w-4 mr-1" />
                Conteúdo
              </TabsTrigger>
              <TabsTrigger value="images" className="text-xs">
                <Image className="h-4 w-4 mr-1" />
                Imagens
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 min-h-0 mt-4 pr-4">
              <TabsContent value="colors" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <ColorInput
                    label="Cor Primária"
                    description="Cor principal (botões de ação, realces)."
                    value={branding.primary_color}
                    onChange={(v) => setBranding({ ...branding, primary_color: v })}
                  />
                  <ColorInput
                    label="Cor Secundária"
                    description="Cor de apoio (botões de navegação, como 'Anterior')."
                    value={branding.secondary_color}
                    onChange={(v) => setBranding({ ...branding, secondary_color: v })}
                  />
                  <ColorInput
                    label="Cor de Fundo"
                    description="Fundo de algumas áreas ou elementos do formulário."
                    value={branding.background_color}
                    onChange={(v) => setBranding({ ...branding, background_color: v })}
                  />
                  <ColorInput
                    label="Cor do Texto"
                    description="Cor principal do texto e parágrafos."
                    value={branding.text_color}
                    onChange={(v) => setBranding({ ...branding, text_color: v })}
                  />
                  <ColorInput
                    label="Cor do Texto dos Botões"
                    description="Cor da fonte dentro do botão primário."
                    value={branding.button_text_color}
                    onChange={(v) => setBranding({ ...branding, button_text_color: v })}
                  />
                  <ColorInput
                    label="Cor de Destaque"
                    description="Pequenos detalhes ou realces específicos."
                    value={branding.accent_color}
                    onChange={(v) => setBranding({ ...branding, accent_color: v })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="typography" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label>Fonte</Label>
                  <Select
                    value={branding.font_family}
                    onValueChange={(v) => setBranding({ ...branding, font_family: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fontOptions.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="layout" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Estilo dos Cards</Label>
                    <Select
                      value={branding.card_style}
                      onValueChange={(v) => setBranding({ ...branding, card_style: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cardStyleOptions.map((style) => (
                          <SelectItem key={style.value} value={style.value}>
                            {style.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Arredondamento</Label>
                    <Select
                      value={branding.border_radius}
                      onValueChange={(v) => setBranding({ ...branding, border_radius: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {borderRadiusOptions.map((radius) => (
                          <SelectItem key={radius.value} value={radius.value}>
                            {radius.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>



                  <div className="flex items-center justify-between rounded-lg border p-3 col-span-2">
                    <div>
                      <Label>Modo sem moldura (flush)</Label>
                      <p className="text-xs text-muted-foreground">Remove padding externo, borda, cantos arredondados e sombra do container principal. Aplica-se em qualquer integração (link público ou iframe).</p>
                    </div>
                    <Switch
                      checked={branding.iframe_flush_embed}
                      onCheckedChange={(v) => setBranding({ ...branding, iframe_flush_embed: v })}
                    />
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border p-3">
                    <div className="col-span-2">
                      <Label>Espaçamento externo do container</Label>
                      <p className="text-xs text-muted-foreground">Padding aplicado em volta do formulário. Deixe vazio para usar o padrão (ou 0 quando o modo sem moldura está ativo). Aceita qualquer unidade CSS (ex: 16px, 1rem, 2vh).</p>
                    </div>
                    <div>
                      <Label className="text-xs">Horizontal (X)</Label>
                      <Input
                        placeholder="ex: 16px"
                        value={branding.container_padding_x}
                        onChange={(e) => setBranding({ ...branding, container_padding_x: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Vertical (Y)</Label>
                      <Input
                        placeholder="ex: 32px"
                        value={branding.container_padding_y}
                        onChange={(e) => setBranding({ ...branding, container_padding_y: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Layout e espaçamentos (novo, JSON layout_config) */}
                <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border p-3">
                  <div className="col-span-2">
                    <Label className="text-base">Layout e espaçamentos</Label>
                    <p className="text-xs text-muted-foreground">Controla densidade global, modo embebido em iframe e (opcionalmente) paddings/gaps personalizados. Não afeta formulários antigos quando deixado por preencher.</p>
                  </div>

                  <div className="col-span-2">
                    <Label className="text-xs">Densidade</Label>
                    <Select
                      value={branding.layout_config.density}
                      onValueChange={(v) =>
                        setBranding({
                          ...branding,
                          layout_config: { ...branding.layout_config, density: v as LayoutDensity },
                        })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">Compacto</SelectItem>
                        <SelectItem value="comfortable">Confortável (padrão)</SelectItem>
                        <SelectItem value="spacious">Espaçoso</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {branding.layout_config.density === "custom" && (
                    <div className="col-span-2 grid grid-cols-2 gap-3">
                      <div className="col-span-2 text-xs text-muted-foreground">
                        Deixe vazio para usar o valor por defeito. Escolha o número e a unidade.
                      </div>
                      {([
                        ["container", "outerPadding", "Padding externo"],
                        ["step", "padding", "Padding do card principal"],
                        ["fields", "groupGap", "Espaço entre grupos de campos"],
                        ["fields", "itemGap", "Espaço entre campos"],
                        ["inputs", "padding", "Padding dos inputs"],
                        ["options", "groupGap", "Espaço entre opções"],
                        ["options", "cardPadding", "Padding dos option-cards"],
                        ["options", "radioPadding", "Padding dos radios"],
                        ["options", "checkboxPadding", "Padding dos checkboxes"],
                        ["options", "buttonPadding", "Padding dos botões-opção"],
                        ["buttons", "navPadding", "Padding dos botões de navegação"],
                      ] as const).map(([group, field, label]) => {
                        const raw = ((branding.layout_config as any)[group]?.[field] ?? "") as string;
                        const match = raw.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em|%)?$/);
                        const num = match ? match[1] : "";
                        const unit = (match && match[2]) || "px";
                        const update = (newNum: string, newUnit: string) => {
                          const next = newNum.trim() === "" ? "" : `${newNum}${newUnit}`;
                          setBranding({
                            ...branding,
                            layout_config: {
                              ...branding.layout_config,
                              [group]: {
                                ...((branding.layout_config as any)[group] ?? {}),
                                [field]: next,
                              },
                            } as LayoutConfig,
                          });
                        };
                        return (
                          <div key={`${group}.${field}`}>
                            <Label className="text-xs">{label}</Label>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                step="any"
                                placeholder=""
                                value={num}
                                onChange={(e) => update(e.target.value, unit)}
                                className="flex-1"
                              />
                              <Select value={unit} onValueChange={(v) => update(num, v)}>
                                <SelectTrigger className="w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="px">px</SelectItem>
                                  <SelectItem value="rem">rem</SelectItem>
                                  <SelectItem value="em">em</SelectItem>
                                  <SelectItem value="%">%</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Mostrar indicador de passos</Label>
                    <Switch
                      checked={branding.show_step_indicator}
                      onCheckedChange={(v) => setBranding({ ...branding, show_step_indicator: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Mostrar títulos dos passos</Label>
                    <Switch
                      checked={branding.show_step_titles}
                      onCheckedChange={(v) => setBranding({ ...branding, show_step_titles: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Mostrar barra de progresso</Label>
                    <Switch
                      checked={branding.show_progress_bar}
                      onCheckedChange={(v) => setBranding({ ...branding, show_progress_bar: v })}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="content" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Título do Formulário</Label>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Mostrar</Label>
                      <Switch
                        checked={branding.show_form_title}
                        onCheckedChange={(v) => setBranding({ ...branding, show_form_title: v })}
                      />
                    </div>
                  </div>
                  <Input
                    value={getBrandingText("form_title")}
                    onChange={(e) => setBrandingText("form_title", e.target.value)}
                    placeholder={isDefaultLocale ? "Título opcional..." : (getBrandingPlaceholder("form_title") || "Título opcional...")}
                    disabled={!branding.show_form_title}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Subtítulo {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                  <Input
                    value={getBrandingText("form_subtitle")}
                    onChange={(e) => setBrandingText("form_subtitle", e.target.value)}
                    placeholder={isDefaultLocale ? "Subtítulo opcional..." : (getBrandingPlaceholder("form_subtitle") || "Subtítulo opcional...")}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Texto Submeter {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                    <Input
                      value={getBrandingText("submit_button_text")}
                      onChange={(e) => setBrandingText("submit_button_text", e.target.value)}
                      placeholder={isDefaultLocale ? "" : getBrandingPlaceholder("submit_button_text")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto Próximo {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                    <Input
                      value={getBrandingText("next_button_text")}
                      onChange={(e) => setBrandingText("next_button_text", e.target.value)}
                      placeholder={isDefaultLocale ? "" : getBrandingPlaceholder("next_button_text")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto Anterior {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                    <Input
                      value={getBrandingText("previous_button_text")}
                      onChange={(e) => setBrandingText("previous_button_text", e.target.value)}
                      placeholder={isDefaultLocale ? "" : getBrandingPlaceholder("previous_button_text")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Título de Sucesso {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                  <Input
                    value={getBrandingText("success_title")}
                    onChange={(e) => setBrandingText("success_title", e.target.value)}
                    placeholder={isDefaultLocale ? "" : getBrandingPlaceholder("success_title")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mensagem de Sucesso {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                  <Textarea
                    value={getBrandingText("success_message")}
                    onChange={(e) => setBrandingText("success_message", e.target.value)}
                    placeholder={isDefaultLocale ? "" : getBrandingPlaceholder("success_message")}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>URL de Redirecionamento após Sucesso</Label>
                  <Input
                    value={branding.success_redirect_url}
                    onChange={(e) => setBranding({ ...branding, success_redirect_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mensagem de Localização Não Disponível {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                  <Textarea
                    value={getBrandingText("location_rejection_message")}
                    onChange={(e) => setBrandingText("location_rejection_message", e.target.value)}
                    placeholder={isDefaultLocale ? "" : getBrandingPlaceholder("location_rejection_message")}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>URL Política de Privacidade</Label>
                    <Input
                      value={branding.privacy_policy_url}
                      onChange={(e) => setBranding({ ...branding, privacy_policy_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL Termos de Uso</Label>
                    <Input
                      value={branding.terms_url}
                      onChange={(e) => setBranding({ ...branding, terms_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Texto de Rodapé {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                  <Input
                    value={getBrandingText("footer_text")}
                    onChange={(e) => setBrandingText("footer_text", e.target.value)}
                    placeholder={isDefaultLocale ? "© 2024 Empresa..." : (getBrandingPlaceholder("footer_text") || "© 2024 Empresa...")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>CSS Personalizado</Label>
                  <Textarea
                    value={branding.custom_css}
                    onChange={(e) => setBranding({ ...branding, custom_css: e.target.value })}
                    placeholder=".custom-class { ... }"
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
              </TabsContent>

              <TabsContent value="images" className="space-y-4 mt-0">
                <ImageUrlField
                  label="URL do Logo"
                  value={branding.logo_url}
                  onChange={(value) => setBranding({ ...branding, logo_url: value })}
                />

                <ImageUrlField
                  label="URL do Favicon"
                  value={branding.favicon_url}
                  onChange={(value) => setBranding({ ...branding, favicon_url: value })}
                />

                <ImageUrlField
                  label="URL da Imagem de Fundo"
                  value={branding.background_image_url}
                  onChange={(value) => setBranding({ ...branding, background_image_url: value })}
                />
              </TabsContent>
            </ScrollArea>
              </Tabs>
            </div>
            <BrandingLivePreview
              formId={formId}
              branding={branding}
              i18nConfig={i18nConfig}
              className="hidden lg:flex"
            />
          </div>
        )}

        {!loading && (
          <div className="flex justify-end gap-2 px-6 py-3 border-t bg-background">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
