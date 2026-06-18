import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Palette, Type, Layout, CheckCircle, Image, Code, Sliders, ImageIcon, ExternalLink } from "lucide-react";
import { ColorPickerInput, SliderInput, ElementPreview, PaddingInput } from "./ElementStyleInput";
import { GalleryPickerDialog } from "@/components/GalleryPickerDialog";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface CampaignBrandingConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
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
  icon_color: string;
  icon_selected_color: string;
  font_family: string;
  heading_font_family: string;
  form_title: string;
  form_subtitle: string;
  submit_button_text: string;
  next_button_text: string;
  previous_button_text: string;
  continue_button_text: string;
  back_button_text: string;
  success_title: string;
  success_message: string;
  success_redirect_url: string;
  success_redirect_delay_seconds: number;
  show_step_indicator: boolean;
  show_step_titles: boolean;
  show_progress_bar: boolean;
  progress_indicator_style: string;
  progress_animation: boolean;
  step_counter_style: string;
  card_style: string;
  border_radius: string;
  custom_css: string;
  footer_text: string;
  privacy_policy_url: string;
  terms_url: string;
  location_rejection_message: string;
  // Customizable texts
  loading_text: string;
  error_title: string;
  error_message: string;
  redirecting_text: string;
  seconds_text: string;
  privacy_policy_label: string;
  terms_label: string;
  step_text: string;
  of_text: string;
  required_field_label: string;
  select_placeholder: string;
  multi_select_placeholder: string;
  date_placeholder: string;
  form_error_title: string;
  form_error_message: string;
  validation_error_text: string;
  location_not_available_title: string;
  thank_you_text: string;
  contact_soon_text: string;
  step_loading_text: string;
  submitting_text: string;
  // Back button
  back_button_bg_color: string;
  back_button_text_color: string;
  back_button_border_color: string;
  back_button_hover_bg_color: string;
  // Radio button
  radio_button_color: string;
  // Granular element styling
  input_border_radius: string;
  input_border_width: string;
  input_border_color: string;
  input_focus_border_color: string;
  input_background_color: string;
  input_padding: string;
  input_font_size: string;
  card_border_radius: string;
  card_border_width: string;
  card_border_color: string;
  card_icon_size: string;
  card_icon_border_radius: string;
  card_padding: string;
  card_min_height: string;
  radio_border_radius: string;
  radio_border_width: string;
  radio_circle_size: string;
  radio_inner_size: string;
  radio_padding: string;
  checkbox_border_radius: string;
  checkbox_border_width: string;
  checkbox_size: string;
  checkbox_padding: string;
  button_option_border_radius: string;
  button_option_border_width: string;
  button_option_padding: string;
  nav_button_border_radius: string;
  nav_button_padding: string;
  nav_button_font_size: string;
  step_border_radius: string;
  step_padding: string;
  step_border_width: string;
  step_border_color: string;
  step_shadow: string;
  info_block_border_radius: string;
  info_block_padding: string;
  info_block_background_opacity: string;
  progress_bar_height: string;
  progress_bar_border_radius: string;
  select_border_radius: string;
  select_border_width: string;
  success_icon_size: string;
  success_border_radius: string;
  // Message display configuration
  error_display_style: string;
  success_display_style: string;
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
  icon_color: "#000000",
  icon_selected_color: "#000000",
  font_family: "Inter, system-ui, sans-serif",
  heading_font_family: "",
  form_title: "",
  form_subtitle: "",
  submit_button_text: "Submeter",
  next_button_text: "Próximo",
  previous_button_text: "Anterior",
  continue_button_text: "Continuar",
  back_button_text: "Voltar",
  success_title: "Obrigado!",
  success_message: "O seu pedido foi submetido com sucesso. Entraremos em contacto consigo brevemente.",
  success_redirect_url: "",
  success_redirect_delay_seconds: 0,
  show_step_indicator: true,
  show_step_titles: true,
  show_progress_bar: false,
  progress_indicator_style: "bar",
  progress_animation: true,
  step_counter_style: "text",
  card_style: "elevated",
  border_radius: "rounded-lg",
  custom_css: "",
  footer_text: "",
  privacy_policy_url: "",
  terms_url: "",
  location_rejection_message: "De momento ainda não fornecemos serviços na sua zona. Deixe os seus dados e entraremos em contacto quando estivermos disponíveis na sua área.",
  loading_text: "A carregar formulário...",
  error_title: "Formulário Indisponível",
  error_message: "Não foi possível carregar o formulário. Por favor tente mais tarde.",
  redirecting_text: "A redirecionar em",
  seconds_text: "segundos...",
  privacy_policy_label: "Política de Privacidade",
  terms_label: "Termos de Uso",
  step_text: "Passo",
  of_text: "de",
  required_field_label: "Campo obrigatório",
  select_placeholder: "Selecione uma opção",
  multi_select_placeholder: "Selecione uma ou mais opções",
  date_placeholder: "Selecione uma data",
  form_error_title: "Erro",
  form_error_message: "Ocorreu um erro ao submeter. Por favor tente novamente.",
  validation_error_text: "Por favor preencha todos os campos obrigatórios",
  location_not_available_title: "Localização Não Disponível",
  thank_you_text: "Obrigado pelo seu interesse!",
  contact_soon_text: "Entraremos em contacto consigo brevemente.",
  step_loading_text: "A processar...",
  submitting_text: "A submeter...",
  back_button_bg_color: "",
  back_button_text_color: "",
  back_button_border_color: "",
  back_button_hover_bg_color: "",
  radio_button_color: "#85D3BE",
  // Granular element styling defaults
  input_border_radius: "10px",
  input_border_width: "1px",
  input_border_color: "#e5e7eb",
  input_focus_border_color: "",
  input_background_color: "",
  input_padding: "12px 14px",
  input_font_size: "15px",
  card_border_radius: "16px",
  card_border_width: "2px",
  card_border_color: "#e5e7eb",
  card_icon_size: "56px",
  card_icon_border_radius: "14px",
  card_padding: "24px 16px",
  card_min_height: "140px",
  radio_border_radius: "12px",
  radio_border_width: "2px",
  radio_circle_size: "20px",
  radio_inner_size: "10px",
  radio_padding: "14px 16px",
  checkbox_border_radius: "10px",
  checkbox_border_width: "1px",
  checkbox_size: "20px",
  checkbox_padding: "14px 16px",
  button_option_border_radius: "12px",
  button_option_border_width: "2px",
  button_option_padding: "14px",
  nav_button_border_radius: "10px",
  nav_button_padding: "14px 24px",
  nav_button_font_size: "15px",
  step_border_radius: "16px",
  step_padding: "32px",
  step_border_width: "1px",
  step_border_color: "#e5e7eb",
  step_shadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
  info_block_border_radius: "12px",
  info_block_padding: "16px 20px",
  info_block_background_opacity: "15",
  progress_bar_height: "6px",
  progress_bar_border_radius: "3px",
  select_border_radius: "10px",
  select_border_width: "1px",
  success_icon_size: "80px",
  success_border_radius: "16px",
  error_display_style: "toast",
  success_display_style: "page",
};

const fontOptions = [
  { value: "Inter, system-ui, sans-serif", label: "Inter (Padrão)" },
  { value: "system-ui, sans-serif", label: "System UI" },
  { value: "'Poppins', sans-serif", label: "Poppins" },
  { value: "'Roboto', sans-serif", label: "Roboto" },
  { value: "'Open Sans', sans-serif", label: "Open Sans" },
  { value: "'Lato', sans-serif", label: "Lato" },
  { value: "'Montserrat', sans-serif", label: "Montserrat" },
  { value: "'Playfair Display', serif", label: "Playfair Display" },
  { value: "'Merriweather', serif", label: "Merriweather" },
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
  { value: "rounded-2xl", label: "2XL" },
  { value: "rounded-3xl", label: "3XL" },
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

export function CampaignBrandingConfig({ open, onOpenChange, campaignId, campaignName }: CampaignBrandingConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branding, setBranding] = useState<BrandingData>(defaultBranding);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (open && campaignId) {
      loadBranding();
    }
  }, [open, campaignId]);

  const loadBranding = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("campaign_branding")
        .select("*")
        .eq("campaign_id", campaignId)
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
          icon_color: data.icon_color || "#000000",
          icon_selected_color: data.icon_selected_color || "#000000",
          font_family: data.font_family || "Inter, system-ui, sans-serif",
          heading_font_family: data.heading_font_family || "",
          form_title: data.form_title || "",
          form_subtitle: data.form_subtitle || "",
          submit_button_text: data.submit_button_text || defaultBranding.submit_button_text,
          next_button_text: data.next_button_text || defaultBranding.next_button_text,
          previous_button_text: data.previous_button_text || defaultBranding.previous_button_text,
          continue_button_text: data.continue_button_text || defaultBranding.continue_button_text,
          back_button_text: data.back_button_text || defaultBranding.back_button_text,
          success_title: data.success_title || defaultBranding.success_title,
          success_message: data.success_message || defaultBranding.success_message,
          success_redirect_url: data.success_redirect_url || "",
          success_redirect_delay_seconds: data.success_redirect_delay_seconds || 0,
          show_step_indicator: data.show_step_indicator ?? true,
          show_step_titles: data.show_step_titles ?? true,
          show_progress_bar: data.show_progress_bar ?? false,
          progress_indicator_style: data.progress_indicator_style || "bar",
          progress_animation: (data as any).progress_animation ?? true,
          step_counter_style: data.step_counter_style || "text",
          card_style: data.card_style || "elevated",
          border_radius: data.border_radius || "rounded-lg",
          custom_css: data.custom_css || "",
          footer_text: data.footer_text || "",
          privacy_policy_url: data.privacy_policy_url || "",
          terms_url: data.terms_url || "",
          location_rejection_message: data.location_rejection_message || defaultBranding.location_rejection_message,
          // New customizable texts
          loading_text: data.loading_text || defaultBranding.loading_text,
          error_title: data.error_title || defaultBranding.error_title,
          error_message: data.error_message || defaultBranding.error_message,
          redirecting_text: data.redirecting_text || defaultBranding.redirecting_text,
          seconds_text: data.seconds_text || defaultBranding.seconds_text,
          privacy_policy_label: data.privacy_policy_label || defaultBranding.privacy_policy_label,
          terms_label: data.terms_label || defaultBranding.terms_label,
          step_text: data.step_text || defaultBranding.step_text,
          of_text: data.of_text || defaultBranding.of_text,
          required_field_label: data.required_field_label || defaultBranding.required_field_label,
          select_placeholder: data.select_placeholder || defaultBranding.select_placeholder,
          multi_select_placeholder: data.multi_select_placeholder || defaultBranding.multi_select_placeholder,
          date_placeholder: data.date_placeholder || defaultBranding.date_placeholder,
          form_error_title: data.form_error_title || defaultBranding.form_error_title,
          form_error_message: data.form_error_message || defaultBranding.form_error_message,
          validation_error_text: data.validation_error_text || defaultBranding.validation_error_text,
          location_not_available_title: data.location_not_available_title || defaultBranding.location_not_available_title,
          thank_you_text: data.thank_you_text || defaultBranding.thank_you_text,
          contact_soon_text: data.contact_soon_text || defaultBranding.contact_soon_text,
          step_loading_text: data.step_loading_text || defaultBranding.step_loading_text,
          submitting_text: data.submitting_text || defaultBranding.submitting_text,
          back_button_bg_color: data.back_button_bg_color || "",
          back_button_text_color: data.back_button_text_color || "",
          back_button_border_color: data.back_button_border_color || "",
          back_button_hover_bg_color: data.back_button_hover_bg_color || "",
          radio_button_color: data.radio_button_color || defaultBranding.radio_button_color,
          // Granular element styling
          input_border_radius: data.input_border_radius || defaultBranding.input_border_radius,
          input_border_width: data.input_border_width || defaultBranding.input_border_width,
          input_border_color: data.input_border_color || defaultBranding.input_border_color,
          input_focus_border_color: data.input_focus_border_color || "",
          input_background_color: data.input_background_color || "",
          input_padding: data.input_padding || defaultBranding.input_padding,
          input_font_size: data.input_font_size || defaultBranding.input_font_size,
          card_border_radius: data.card_border_radius || defaultBranding.card_border_radius,
          card_border_width: data.card_border_width || defaultBranding.card_border_width,
          card_border_color: data.card_border_color || defaultBranding.card_border_color,
          card_icon_size: data.card_icon_size || defaultBranding.card_icon_size,
          card_icon_border_radius: data.card_icon_border_radius || defaultBranding.card_icon_border_radius,
          card_padding: data.card_padding || defaultBranding.card_padding,
          card_min_height: data.card_min_height || defaultBranding.card_min_height,
          radio_border_radius: data.radio_border_radius || defaultBranding.radio_border_radius,
          radio_border_width: data.radio_border_width || defaultBranding.radio_border_width,
          radio_circle_size: data.radio_circle_size || defaultBranding.radio_circle_size,
          radio_inner_size: data.radio_inner_size || defaultBranding.radio_inner_size,
          radio_padding: data.radio_padding || defaultBranding.radio_padding,
          checkbox_border_radius: data.checkbox_border_radius || defaultBranding.checkbox_border_radius,
          checkbox_border_width: data.checkbox_border_width || defaultBranding.checkbox_border_width,
          checkbox_size: data.checkbox_size || defaultBranding.checkbox_size,
          checkbox_padding: data.checkbox_padding || defaultBranding.checkbox_padding,
          button_option_border_radius: data.button_option_border_radius || defaultBranding.button_option_border_radius,
          button_option_border_width: data.button_option_border_width || defaultBranding.button_option_border_width,
          button_option_padding: data.button_option_padding || defaultBranding.button_option_padding,
          nav_button_border_radius: data.nav_button_border_radius || defaultBranding.nav_button_border_radius,
          nav_button_padding: data.nav_button_padding || defaultBranding.nav_button_padding,
          nav_button_font_size: data.nav_button_font_size || defaultBranding.nav_button_font_size,
          step_border_radius: data.step_border_radius || defaultBranding.step_border_radius,
          step_padding: data.step_padding || defaultBranding.step_padding,
          step_border_width: data.step_border_width || defaultBranding.step_border_width,
          step_border_color: data.step_border_color || defaultBranding.step_border_color,
          step_shadow: data.step_shadow || defaultBranding.step_shadow,
          info_block_border_radius: data.info_block_border_radius || defaultBranding.info_block_border_radius,
          info_block_padding: data.info_block_padding || defaultBranding.info_block_padding,
          info_block_background_opacity: data.info_block_background_opacity || defaultBranding.info_block_background_opacity,
          progress_bar_height: data.progress_bar_height || defaultBranding.progress_bar_height,
          progress_bar_border_radius: data.progress_bar_border_radius || defaultBranding.progress_bar_border_radius,
          select_border_radius: data.select_border_radius || defaultBranding.select_border_radius,
          select_border_width: data.select_border_width || defaultBranding.select_border_width,
          success_icon_size: data.success_icon_size || defaultBranding.success_icon_size,
          success_border_radius: data.success_border_radius || defaultBranding.success_border_radius,
          error_display_style: data.error_display_style || defaultBranding.error_display_style,
          success_display_style: data.success_display_style || defaultBranding.success_display_style,
        });
      } else {
        setExistingId(null);
        setBranding(defaultBranding);
      }
    } catch (error: any) {
      toast.error("Erro ao carregar configurações: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const brandingData = {
        campaign_id: campaignId,
        logo_url: branding.logo_url || null,
        favicon_url: branding.favicon_url || null,
        background_image_url: branding.background_image_url || null,
        primary_color: branding.primary_color,
        secondary_color: branding.secondary_color,
        background_color: branding.background_color,
        text_color: branding.text_color,
        button_text_color: branding.button_text_color,
        accent_color: branding.accent_color,
        icon_color: branding.icon_color,
        icon_selected_color: branding.icon_selected_color,
        font_family: branding.font_family,
        heading_font_family: branding.heading_font_family || null,
        form_title: branding.form_title || null,
        form_subtitle: branding.form_subtitle || null,
        submit_button_text: branding.submit_button_text,
        next_button_text: branding.next_button_text,
        previous_button_text: branding.previous_button_text,
        continue_button_text: branding.continue_button_text,
        back_button_text: branding.back_button_text,
        success_title: branding.success_title,
        success_message: branding.success_message,
        success_redirect_url: branding.success_redirect_url || null,
        success_redirect_delay_seconds: branding.success_redirect_delay_seconds,
        show_step_indicator: branding.show_step_indicator,
        show_step_titles: branding.show_step_titles,
        show_progress_bar: branding.show_progress_bar,
        progress_indicator_style: branding.progress_indicator_style,
        progress_animation: branding.progress_animation,
        step_counter_style: branding.step_counter_style,
        card_style: branding.card_style,
        border_radius: branding.border_radius,
        custom_css: branding.custom_css || null,
        footer_text: branding.footer_text || null,
        privacy_policy_url: branding.privacy_policy_url || null,
        terms_url: branding.terms_url || null,
        location_rejection_message: branding.location_rejection_message || null,
        // New customizable texts
        loading_text: branding.loading_text || null,
        error_title: branding.error_title || null,
        error_message: branding.error_message || null,
        redirecting_text: branding.redirecting_text || null,
        seconds_text: branding.seconds_text || null,
        privacy_policy_label: branding.privacy_policy_label || null,
        terms_label: branding.terms_label || null,
        step_text: branding.step_text || null,
        of_text: branding.of_text || null,
        required_field_label: branding.required_field_label || null,
        select_placeholder: branding.select_placeholder || null,
        multi_select_placeholder: branding.multi_select_placeholder || null,
        date_placeholder: branding.date_placeholder || null,
        form_error_title: branding.form_error_title || null,
        form_error_message: branding.form_error_message || null,
        validation_error_text: branding.validation_error_text || null,
        location_not_available_title: branding.location_not_available_title || null,
        thank_you_text: branding.thank_you_text || null,
        contact_soon_text: branding.contact_soon_text || null,
        step_loading_text: branding.step_loading_text || null,
        submitting_text: branding.submitting_text || null,
        back_button_bg_color: branding.back_button_bg_color || null,
        back_button_text_color: branding.back_button_text_color || null,
        back_button_border_color: branding.back_button_border_color || null,
        back_button_hover_bg_color: branding.back_button_hover_bg_color || null,
        radio_button_color: branding.radio_button_color || null,
        // Granular element styling
        input_border_radius: branding.input_border_radius || null,
        input_border_width: branding.input_border_width || null,
        input_border_color: branding.input_border_color || null,
        input_focus_border_color: branding.input_focus_border_color || null,
        input_background_color: branding.input_background_color || null,
        input_padding: branding.input_padding || null,
        input_font_size: branding.input_font_size || null,
        card_border_radius: branding.card_border_radius || null,
        card_border_width: branding.card_border_width || null,
        card_border_color: branding.card_border_color || null,
        card_icon_size: branding.card_icon_size || null,
        card_icon_border_radius: branding.card_icon_border_radius || null,
        card_padding: branding.card_padding || null,
        card_min_height: branding.card_min_height || null,
        radio_border_radius: branding.radio_border_radius || null,
        radio_border_width: branding.radio_border_width || null,
        radio_circle_size: branding.radio_circle_size || null,
        radio_inner_size: branding.radio_inner_size || null,
        radio_padding: branding.radio_padding || null,
        checkbox_border_radius: branding.checkbox_border_radius || null,
        checkbox_border_width: branding.checkbox_border_width || null,
        checkbox_size: branding.checkbox_size || null,
        checkbox_padding: branding.checkbox_padding || null,
        button_option_border_radius: branding.button_option_border_radius || null,
        button_option_border_width: branding.button_option_border_width || null,
        button_option_padding: branding.button_option_padding || null,
        nav_button_border_radius: branding.nav_button_border_radius || null,
        nav_button_padding: branding.nav_button_padding || null,
        nav_button_font_size: branding.nav_button_font_size || null,
        step_border_radius: branding.step_border_radius || null,
        step_padding: branding.step_padding || null,
        step_border_width: branding.step_border_width || null,
        step_border_color: branding.step_border_color || null,
        step_shadow: branding.step_shadow || null,
        info_block_border_radius: branding.info_block_border_radius || null,
        info_block_padding: branding.info_block_padding || null,
        info_block_background_opacity: branding.info_block_background_opacity || null,
        progress_bar_height: branding.progress_bar_height || null,
        progress_bar_border_radius: branding.progress_bar_border_radius || null,
        select_border_radius: branding.select_border_radius || null,
        select_border_width: branding.select_border_width || null,
        success_icon_size: branding.success_icon_size || null,
        success_border_radius: branding.success_border_radius || null,
        error_display_style: branding.error_display_style || null,
        success_display_style: branding.success_display_style || null,
        created_by: await resolveCurrentBusinessUserId(),
      };

      if (!brandingData.created_by) throw new Error("Business user not resolved");

      console.log("Saving branding data:", brandingData);

      if (existingId) {
        const { data, error } = await supabase
          .from("campaign_branding")
          .update(brandingData)
          .eq("id", existingId)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("Update error:", error);
          throw error;
        }

        // If RLS blocked the update, Postgrest returns 0 rows and no error.
        if (!data) {
          throw new Error("Sem permissões para guardar alterações nesta campanha.");
        }
      } else {
        const { data, error } = await supabase
          .from("campaign_branding")
          .insert(brandingData)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("Insert error:", error);
          throw error;
        }

        if (!data) {
          throw new Error("Não foi possível confirmar o registo guardado.");
        }

        // Set the existingId for future updates
        setExistingId(data.id);
      }

      toast.success("Configurações guardadas com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Erro ao guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BrandingData, value: any) => {
    setBranding(prev => ({ ...prev, [field]: value }));
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Personalização: {campaignName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="colors" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="colors" className="flex items-center gap-1">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Cores</span>
              </TabsTrigger>
              <TabsTrigger value="elements" className="flex items-center gap-1">
                <Sliders className="h-4 w-4" />
                <span className="hidden sm:inline">Elementos</span>
              </TabsTrigger>
              <TabsTrigger value="typography" className="flex items-center gap-1">
                <Type className="h-4 w-4" />
                <span className="hidden sm:inline">Textos</span>
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex items-center gap-1">
                <Layout className="h-4 w-4" />
                <span className="hidden sm:inline">Layout</span>
              </TabsTrigger>
              <TabsTrigger value="success" className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Sucesso</span>
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex items-center gap-1">
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline">Avançado</span>
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(90vh-220px)] mt-4">
              <div className="pr-4">
                <TabsContent value="colors" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Imagens
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <ImageUrlField
                        label="URL do Logo"
                        value={branding.logo_url}
                        onChange={(value) => updateField("logo_url", value)}
                      />
                      <ImageUrlField
                        label="URL do Favicon"
                        value={branding.favicon_url}
                        onChange={(value) => updateField("favicon_url", value)}
                      />
                      <ImageUrlField
                        label="URL da Imagem de Fundo"
                        value={branding.background_image_url}
                        onChange={(value) => updateField("background_image_url", value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Cores Principais</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <ColorPickerInput label="Cor Primária" value={branding.primary_color} onChange={(v) => updateField("primary_color", v)} />
                      <ColorPickerInput label="Cor Secundária" value={branding.secondary_color} onChange={(v) => updateField("secondary_color", v)} />
                      <ColorPickerInput label="Cor de Destaque" value={branding.accent_color} onChange={(v) => updateField("accent_color", v)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Cores de Fundo e Texto</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <ColorPickerInput label="Cor de Fundo" value={branding.background_color} onChange={(v) => updateField("background_color", v)} />
                      <ColorPickerInput label="Cor do Texto" value={branding.text_color} onChange={(v) => updateField("text_color", v)} />
                      <ColorPickerInput label="Cor do Texto dos Botões" value={branding.button_text_color} onChange={(v) => updateField("button_text_color", v)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Cores dos Ícones</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <ColorPickerInput label="Cor dos Ícones" value={branding.icon_color} onChange={(v) => updateField("icon_color", v)} />
                      <ColorPickerInput label="Cor dos Ícones (Selecionado)" value={branding.icon_selected_color} onChange={(v) => updateField("icon_selected_color", v)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Cor dos Radio Buttons</h3>
                    <p className="text-sm text-muted-foreground">Configure a cor do círculo dos radio buttons (outline e preenchimento).</p>
                    <div className="grid grid-cols-1 gap-4">
                      <ColorPickerInput label="Cor do Radio Button" value={branding.radio_button_color} onChange={(v) => updateField("radio_button_color", v)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Cores do Botão Anterior</h3>
                    <p className="text-sm text-muted-foreground">Configure as cores do botão de voltar ao passo anterior.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <ColorPickerInput label="Fundo" value={branding.back_button_bg_color} onChange={(v) => updateField("back_button_bg_color", v)} />
                      <ColorPickerInput label="Texto" value={branding.back_button_text_color} onChange={(v) => updateField("back_button_text_color", v)} />
                      <ColorPickerInput label="Borda" value={branding.back_button_border_color} onChange={(v) => updateField("back_button_border_color", v)} />
                      <ColorPickerInput label="Fundo (Hover)" value={branding.back_button_hover_bg_color} onChange={(v) => updateField("back_button_hover_bg_color", v)} />
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="space-y-2">
                    <h3 className="font-medium">Pré-visualização</h3>
                    <div 
                      className="p-6 rounded-lg border"
                      style={{ backgroundColor: branding.background_color, color: branding.text_color }}
                    >
                      <h4 className="text-lg font-semibold mb-2">Título do Formulário</h4>
                      <p className="text-sm mb-4 opacity-80">Subtítulo ou descrição</p>
                      <div className="space-y-3">
                        <button
                          className="w-full px-4 py-3 rounded-xl font-medium"
                          style={{ 
                            backgroundColor: branding.primary_color, 
                            color: branding.button_text_color 
                          }}
                        >
                          {branding.next_button_text || "Continuar"}
                        </button>
                        <button
                          className="w-full px-4 py-3 rounded-xl font-medium border-2 transition-all"
                          style={{ 
                            backgroundColor: branding.back_button_bg_color || 'transparent',
                            color: branding.back_button_text_color || branding.primary_color, 
                            borderColor: branding.back_button_border_color || branding.primary_color
                          }}
                        >
                          ← {branding.previous_button_text || "Anterior"}
                        </button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="elements" className="space-y-6 mt-0">
                  {/* Inputs Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Campos de Entrada (Inputs)</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.input_border_radius}
                            onChange={(v) => updateField("input_border_radius", v)}
                            min={0}
                            max={30}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.input_border_width}
                            onChange={(v) => updateField("input_border_width", v)}
                            min={0}
                            max={5}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <ColorPickerInput
                            label="Cor da Borda"
                            value={branding.input_border_color}
                            onChange={(v) => updateField("input_border_color", v)}
                          />
                          <SliderInput
                            label="Tamanho da Fonte"
                            value={branding.input_font_size}
                            onChange={(v) => updateField("input_font_size", v)}
                            min={12}
                            max={24}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Padding</Label>
                          <Input
                            value={branding.input_padding}
                            onChange={(e) => updateField("input_padding", e.target.value)}
                            placeholder="12px 14px"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <ElementPreview
                        type="input"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Cards Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Cards de Opções</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.card_border_radius}
                            onChange={(v) => updateField("card_border_radius", v)}
                            min={0}
                            max={40}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.card_border_width}
                            onChange={(v) => updateField("card_border_width", v)}
                            min={0}
                            max={5}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <ColorPickerInput
                            label="Cor da Borda"
                            value={branding.card_border_color}
                            onChange={(v) => updateField("card_border_color", v)}
                          />
                          <SliderInput
                            label="Altura Mínima"
                            value={branding.card_min_height}
                            onChange={(v) => updateField("card_min_height", v)}
                            min={60}
                            max={200}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Tamanho do Ícone"
                            value={branding.card_icon_size}
                            onChange={(v) => updateField("card_icon_size", v)}
                            min={24}
                            max={80}
                          />
                          <SliderInput
                            label="Radius do Ícone"
                            value={branding.card_icon_border_radius}
                            onChange={(v) => updateField("card_icon_border_radius", v)}
                            min={0}
                            max={30}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Padding</Label>
                          <Input
                            value={branding.card_padding}
                            onChange={(e) => updateField("card_padding", e.target.value)}
                            placeholder="24px 16px"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <ElementPreview
                        type="card"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Radio Buttons Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Radio Buttons</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.radio_border_radius}
                            onChange={(v) => updateField("radio_border_radius", v)}
                            min={0}
                            max={30}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.radio_border_width}
                            onChange={(v) => updateField("radio_border_width", v)}
                            min={0}
                            max={5}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Tamanho do Círculo"
                            value={branding.radio_circle_size}
                            onChange={(v) => updateField("radio_circle_size", v)}
                            min={14}
                            max={32}
                          />
                          <SliderInput
                            label="Tamanho Interior"
                            value={branding.radio_inner_size}
                            onChange={(v) => updateField("radio_inner_size", v)}
                            min={6}
                            max={18}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Padding</Label>
                          <Input
                            value={branding.radio_padding}
                            onChange={(e) => updateField("radio_padding", e.target.value)}
                            placeholder="14px 16px"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <ElementPreview
                        type="radio"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Checkboxes Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Checkboxes</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius do Item"
                            value={branding.checkbox_border_radius}
                            onChange={(v) => updateField("checkbox_border_radius", v)}
                            min={0}
                            max={24}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.checkbox_border_width}
                            onChange={(v) => updateField("checkbox_border_width", v)}
                            min={0}
                            max={4}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Tamanho do Checkbox"
                            value={branding.checkbox_size}
                            onChange={(v) => updateField("checkbox_size", v)}
                            min={14}
                            max={32}
                          />
                          <PaddingInput
                            label="Padding"
                            value={branding.checkbox_padding}
                            onChange={(v) => updateField("checkbox_padding", v)}
                          />
                        </div>
                      </div>
                      <ElementPreview
                        type="checkbox"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Button Options Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Botões de Opção</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.button_option_border_radius}
                            onChange={(v) => updateField("button_option_border_radius", v)}
                            min={0}
                            max={24}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.button_option_border_width}
                            onChange={(v) => updateField("button_option_border_width", v)}
                            min={0}
                            max={4}
                          />
                        </div>
                        <PaddingInput
                          label="Padding"
                          value={branding.button_option_padding}
                          onChange={(v) => updateField("button_option_padding", v)}
                        />
                      </div>
                      <ElementPreview
                        type="button"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Navigation Buttons Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Botões de Navegação</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.nav_button_border_radius}
                            onChange={(v) => updateField("nav_button_border_radius", v)}
                            min={0}
                            max={24}
                          />
                          <SliderInput
                            label="Tamanho da Fonte"
                            value={branding.nav_button_font_size}
                            onChange={(v) => updateField("nav_button_font_size", v)}
                            min={12}
                            max={20}
                          />
                        </div>
                        <PaddingInput
                          label="Padding"
                          value={branding.nav_button_padding}
                          onChange={(v) => updateField("nav_button_padding", v)}
                        />
                      </div>
                      <ElementPreview
                        type="nav-button"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Step Container Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Container do Passo</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.step_border_radius}
                            onChange={(v) => updateField("step_border_radius", v)}
                            min={0}
                            max={32}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.step_border_width}
                            onChange={(v) => updateField("step_border_width", v)}
                            min={0}
                            max={4}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <PaddingInput
                            label="Padding"
                            value={branding.step_padding}
                            onChange={(v) => updateField("step_padding", v)}
                          />
                          <ColorPickerInput
                            label="Cor da Borda"
                            value={branding.step_border_color}
                            onChange={(v) => updateField("step_border_color", v)}
                          />
                        </div>
                      </div>
                      <ElementPreview
                        type="step-container"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Info Block Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Blocos de Informação</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.info_block_border_radius}
                            onChange={(v) => updateField("info_block_border_radius", v)}
                            min={0}
                            max={24}
                          />
                          <SliderInput
                            label="Opacidade do Fundo (%)"
                            value={branding.info_block_background_opacity}
                            onChange={(v) => updateField("info_block_background_opacity", v.replace('%', ''))}
                            min={5}
                            max={50}
                            unit="%"
                          />
                        </div>
                        <PaddingInput
                          label="Padding"
                          value={branding.info_block_padding}
                          onChange={(v) => updateField("info_block_padding", v)}
                        />
                      </div>
                      <ElementPreview
                        type="info-block"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Progress Bar Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Barra de Progresso</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Altura"
                            value={branding.progress_bar_height}
                            onChange={(v) => updateField("progress_bar_height", v)}
                            min={2}
                            max={16}
                          />
                          <SliderInput
                            label="Border Radius"
                            value={branding.progress_bar_border_radius}
                            onChange={(v) => updateField("progress_bar_border_radius", v)}
                            min={0}
                            max={12}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="progress_animation"
                            checked={branding.progress_animation}
                            onCheckedChange={(checked) => updateField("progress_animation", !!checked)}
                          />
                          <Label htmlFor="progress_animation" className="text-sm cursor-pointer">
                            Animação de entrada (melhora conversão)
                          </Label>
                        </div>
                      </div>
                      <ElementPreview
                        type="progress-bar"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>

                  {/* Dropdowns/Selects Section */}
                  <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h3 className="font-medium text-sm">Dropdowns/Selects</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <SliderInput
                            label="Border Radius"
                            value={branding.select_border_radius}
                            onChange={(v) => updateField("select_border_radius", v)}
                            min={0}
                            max={20}
                          />
                          <SliderInput
                            label="Espessura da Borda"
                            value={branding.select_border_width}
                            onChange={(v) => updateField("select_border_width", v)}
                            min={0}
                            max={4}
                          />
                        </div>
                      </div>
                      <ElementPreview
                        type="select"
                        styles={branding as unknown as Record<string, unknown>}
                        primaryColor={branding.primary_color}
                        textColor={branding.text_color}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="typography" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <h3 className="font-medium">Tipografia</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fonte Principal</Label>
                        <Select value={branding.font_family} onValueChange={(v) => updateField("font_family", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fontOptions.map(font => (
                              <SelectItem key={font.value} value={font.value}>
                                <span style={{ fontFamily: font.value }}>{font.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Fonte dos Títulos (opcional)</Label>
                        <Select 
                          value={branding.heading_font_family || "inherit"} 
                          onValueChange={(v) => updateField("heading_font_family", v === "inherit" ? "" : v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Mesma da principal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">Mesma da principal</SelectItem>
                            {fontOptions.map(font => (
                              <SelectItem key={font.value} value={font.value}>
                                <span style={{ fontFamily: font.value }}>{font.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Textos do Formulário</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label>Título do Formulário (substitui o nome da campanha)</Label>
                        <Input
                          value={branding.form_title}
                          onChange={(e) => updateField("form_title", e.target.value)}
                          placeholder="Deixe vazio para usar o nome da campanha"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Subtítulo do Formulário</Label>
                        <Input
                          value={branding.form_subtitle}
                          onChange={(e) => updateField("form_subtitle", e.target.value)}
                          placeholder="Deixe vazio para usar a descrição da campanha"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Textos dos Botões</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Botão Anterior</Label>
                        <Input
                          value={branding.previous_button_text}
                          onChange={(e) => updateField("previous_button_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Botão Próximo</Label>
                        <Input
                          value={branding.next_button_text}
                          onChange={(e) => updateField("next_button_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Botão Submeter</Label>
                        <Input
                          value={branding.submit_button_text}
                          onChange={(e) => updateField("submit_button_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Botão Continuar</Label>
                        <Input
                          value={branding.continue_button_text}
                          onChange={(e) => updateField("continue_button_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Botão Voltar</Label>
                        <Input
                          value={branding.back_button_text}
                          onChange={(e) => updateField("back_button_text", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Textos de Navegação</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Texto "Passo"</Label>
                        <Input
                          value={branding.step_text}
                          onChange={(e) => updateField("step_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Texto "de"</Label>
                        <Input
                          value={branding.of_text}
                          onChange={(e) => updateField("of_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Texto "A redirecionar em"</Label>
                        <Input
                          value={branding.redirecting_text}
                          onChange={(e) => updateField("redirecting_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Texto "segundos..."</Label>
                        <Input
                          value={branding.seconds_text}
                          onChange={(e) => updateField("seconds_text", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Textos de Estado</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Texto de Carregamento</Label>
                        <Input
                          value={branding.loading_text}
                          onChange={(e) => updateField("loading_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Título de Erro</Label>
                        <Input
                          value={branding.error_title}
                          onChange={(e) => updateField("error_title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Mensagem de Erro</Label>
                        <Input
                          value={branding.error_message}
                          onChange={(e) => updateField("error_message", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Textos de Formulário</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Placeholder de Seleção</Label>
                        <Input
                          value={branding.select_placeholder}
                          onChange={(e) => updateField("select_placeholder", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Placeholder Multi-Seleção</Label>
                        <Input
                          value={branding.multi_select_placeholder}
                          onChange={(e) => updateField("multi_select_placeholder", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Placeholder de Data</Label>
                        <Input
                          value={branding.date_placeholder}
                          onChange={(e) => updateField("date_placeholder", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Texto "Campo obrigatório"</Label>
                        <Input
                          value={branding.required_field_label}
                          onChange={(e) => updateField("required_field_label", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Texto de Validação</Label>
                        <Input
                          value={branding.validation_error_text}
                          onChange={(e) => updateField("validation_error_text", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Links do Rodapé
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Configure os textos e URLs para os links de política de privacidade e termos de uso que aparecerão no rodapé do formulário.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                        <h4 className="font-medium text-sm">Política de Privacidade</h4>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Texto do Link</Label>
                          <Input
                            value={branding.privacy_policy_label}
                            onChange={(e) => updateField("privacy_policy_label", e.target.value)}
                            placeholder="Política de Privacidade"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">URL</Label>
                          <Input
                            value={branding.privacy_policy_url}
                            onChange={(e) => updateField("privacy_policy_url", e.target.value)}
                            placeholder="https://exemplo.com/privacidade"
                            type="url"
                          />
                        </div>
                      </div>
                      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                        <h4 className="font-medium text-sm">Termos de Uso</h4>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Texto do Link</Label>
                          <Input
                            value={branding.terms_label}
                            onChange={(e) => updateField("terms_label", e.target.value)}
                            placeholder="Termos de Uso"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">URL</Label>
                          <Input
                            value={branding.terms_url}
                            onChange={(e) => updateField("terms_url", e.target.value)}
                            placeholder="https://exemplo.com/termos"
                            type="url"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Preview */}
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <Label className="text-xs text-muted-foreground mb-2 block">Preview do Rodapé</Label>
                      <div className="flex items-center justify-center gap-4 py-3">
                        {branding.privacy_policy_url ? (
                          <a 
                            href={branding.privacy_policy_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm underline hover:no-underline"
                            style={{ color: branding.primary_color }}
                          >
                            {branding.privacy_policy_label || "Política de Privacidade"}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">{branding.privacy_policy_label || "Política de Privacidade"}</span>
                        )}
                        <span className="text-muted-foreground">•</span>
                        {branding.terms_url ? (
                          <a 
                            href={branding.terms_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm underline hover:no-underline"
                            style={{ color: branding.primary_color }}
                          >
                            {branding.terms_label || "Termos de Uso"}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">{branding.terms_label || "Termos de Uso"}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="layout" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <h3 className="font-medium">Indicador de Progresso</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Estilo do Indicador</Label>
                        <Select 
                          value={branding.progress_indicator_style} 
                          onValueChange={(v) => updateField("progress_indicator_style", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bar">Barra de Progresso</SelectItem>
                            <SelectItem value="steps">Indicador de Passos (Números)</SelectItem>
                            <SelectItem value="both">Ambos (Barra + Números)</SelectItem>
                            <SelectItem value="none">Nenhum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Contador de Passos</Label>
                        <Select 
                          value={branding.step_counter_style} 
                          onValueChange={(v) => updateField("step_counter_style", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto (Passo 1 de 3)</SelectItem>
                            <SelectItem value="numbers">Números (1/3)</SelectItem>
                            <SelectItem value="none">Não mostrar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Mostrar Títulos dos Passos</Label>
                          <p className="text-sm text-muted-foreground">Título e descrição de cada passo</p>
                        </div>
                        <Switch
                          checked={branding.show_step_titles}
                          onCheckedChange={(v) => updateField("show_step_titles", v)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Estilo do Card</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Estilo</Label>
                        <Select value={branding.card_style} onValueChange={(v) => updateField("card_style", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {cardStyleOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Arredondamento das Bordas</Label>
                        <Select value={branding.border_radius} onValueChange={(v) => updateField("border_radius", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {borderRadiusOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="success" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <h3 className="font-medium">Página de Sucesso</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label>Título de Sucesso</Label>
                        <Input
                          value={branding.success_title}
                          onChange={(e) => updateField("success_title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mensagem de Sucesso</Label>
                        <Textarea
                          value={branding.success_message}
                          onChange={(e) => updateField("success_message", e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Texto "Obrigado pelo seu interesse!"</Label>
                          <Input
                            value={branding.thank_you_text}
                            onChange={(e) => updateField("thank_you_text", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Texto "Entraremos em contacto..."</Label>
                          <Input
                            value={branding.contact_soon_text}
                            onChange={(e) => updateField("contact_soon_text", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Redirecionamento (opcional)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>URL de Redirecionamento</Label>
                        <Input
                          value={branding.success_redirect_url}
                          onChange={(e) => updateField("success_redirect_url", e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Atraso (segundos)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={branding.success_redirect_delay_seconds}
                          onChange={(e) => updateField("success_redirect_delay_seconds", parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Exibição de Mensagens</h3>
                    <p className="text-sm text-muted-foreground">Defina como as mensagens de erro e sucesso são apresentadas ao utilizador.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Erros de Validação</Label>
                        <Select value={branding.error_display_style} onValueChange={(v) => updateField("error_display_style", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toast">Notificação Toast (topo da página)</SelectItem>
                            <SelectItem value="inline">Mensagem Inline (junto ao campo)</SelectItem>
                            <SelectItem value="both">Ambos (Toast + Inline)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sucesso Final</Label>
                        <Select value={branding.success_display_style} onValueChange={(v) => updateField("success_display_style", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="page">Página de Sucesso (substituir formulário)</SelectItem>
                            <SelectItem value="toast">Apenas Notificação Toast</SelectItem>
                            <SelectItem value="redirect">Redirecionar Imediatamente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Mensagens de Erro</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Título Erro de Formulário</Label>
                        <Input
                          value={branding.form_error_title}
                          onChange={(e) => updateField("form_error_title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mensagem Erro de Formulário</Label>
                        <Input
                          value={branding.form_error_message}
                          onChange={(e) => updateField("form_error_message", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Mensagem de Localização Não Disponível</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label>Título</Label>
                        <Input
                          value={branding.location_not_available_title}
                          onChange={(e) => updateField("location_not_available_title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mensagem quando a localização não é suportada</Label>
                        <Textarea
                          value={branding.location_rejection_message}
                          onChange={(e) => updateField("location_rejection_message", e.target.value)}
                          rows={3}
                          placeholder="De momento ainda não fornecemos serviços na sua zona..."
                        />
                        <p className="text-xs text-muted-foreground">
                          Esta mensagem aparece quando a campanha tem localização obrigatória e o utilizador seleciona uma zona fora das permitidas.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <h3 className="font-medium">Rodapé</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label>Texto do Rodapé</Label>
                        <Input
                          value={branding.footer_text}
                          onChange={(e) => updateField("footer_text", e.target.value)}
                          placeholder="© 2026 Empresa. Todos os direitos reservados."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>URL da Política de Privacidade</Label>
                          <Input
                            value={branding.privacy_policy_url}
                            onChange={(e) => updateField("privacy_policy_url", e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>URL dos Termos de Uso</Label>
                          <Input
                            value={branding.terms_url}
                            onChange={(e) => updateField("terms_url", e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">CSS Personalizado</h3>
                    <div className="space-y-2">
                      <Label>CSS Adicional</Label>
                      <Textarea
                        value={branding.custom_css}
                        onChange={(e) => updateField("custom_css", e.target.value)}
                        placeholder=".form-card { box-shadow: none; }"
                        rows={6}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        CSS avançado para personalizações adicionais. Use com cuidado.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
