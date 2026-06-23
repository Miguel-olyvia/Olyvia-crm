import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { extractTrackingFromSearchParams } from "@/utils/leadTracking";
import { resolveLayout } from "@/lib/forms/layoutConfig";
import { SchedulingStep } from "@/components/forms/SchedulingStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, Loader2, AlertCircle, Zap, Clock, Home, Utensils, Bath, Wrench, HelpCircle, Info, AlertTriangle, CheckCircle, User, Mail, Phone } from "lucide-react";
import { FormLoadingSkeleton } from "@/components/FormLoadingSkeleton";
import { FormLocaleSwitcher } from "@/components/forms/FormLocaleSwitcher";

import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import * as LucideIcons from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Animation variants for step transitions
const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }
  },
  exit: { 
    opacity: 0, 
    x: -20,
    transition: { duration: 0.2 }
  }
};

const successVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const }
  }
};

// GTM/DataLayer event helper - sends events for analytics tracking
declare global {
  interface Window {
    dataLayer?: Array<Record<string, any>>;
    fbq?: (...args: any[]) => void;
    ttq?: {
      load: (pixelId: string) => void;
      page: () => void;
      track: (event: string, data?: Record<string, any>) => void;
    };
    _fbq?: any;
  }
}

interface TrackingPixel {
  type: string;
  id: string;
  config?: Record<string, any>;
}

// Validate tracking IDs per provider to prevent script injection.
const TRACKING_ID_PATTERNS: Record<string, RegExp> = {
  gtm: /^GTM-[A-Z0-9]{4,}$/i,
  meta: /^\d{5,30}$/,
  tiktok: /^[A-Z0-9]{10,30}$/i,
  google_ads: /^AW-\d{6,20}$/i,
  linkedin: /^\d{3,20}$/,
};

const isValidTrackingId = (id: string, type: string): boolean => {
  const pattern = TRACKING_ID_PATTERNS[type];
  if (!id || !pattern || !pattern.test(id.trim())) {
    console.warn(`[Tracking] Invalid ${type} tracking ID blocked`);
    return false;
  }
  return true;
};

// Inject all tracking pixels dynamically
const injectTrackingPixels = (pixels: TrackingPixel[]) => {
  pixels.forEach(pixel => {
    switch (pixel.type) {
      case 'gtm':
        injectGTMScript(pixel.id);
        break;
      case 'meta':
        injectMetaPixel(pixel.id);
        break;
      case 'tiktok':
        injectTikTokPixel(pixel.id);
        break;
      case 'google_ads':
        injectGoogleAdsTag(pixel.id);
        break;
      case 'linkedin':
        injectLinkedInTag(pixel.id);
        break;
    }
  });
};

// Inject GTM script dynamically
const injectGTMScript = (gtmId: string) => {
  if (!gtmId || !isValidTrackingId(gtmId, "gtm") || document.getElementById(`gtm-script-${gtmId}`)) return;
  
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  
  const script = document.createElement('script');
  script.id = `gtm-script-${gtmId}`;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
  document.head.appendChild(script);
  
  const noscript = document.createElement('noscript');
  noscript.id = `gtm-noscript-${gtmId}`;
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  noscript.appendChild(iframe);
  document.body.insertBefore(noscript, document.body.firstChild);
  
  console.log('[Tracking] GTM injected:', gtmId);
};

// Inject Meta Pixel (Facebook/Instagram)
const injectMetaPixel = (pixelId: string) => {
  if (!pixelId || !isValidTrackingId(pixelId, "meta") || document.getElementById(`meta-pixel-${pixelId}`)) return;
  
  // Initialize fbq
  if (!window.fbq) {
    const n: any = window.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
  }
  
  const script = document.createElement('script');
  script.id = `meta-pixel-${pixelId}`;
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  // PageView só após o SDK carregar (a queue do stub garante que init é processado primeiro).
  script.onload = () => {
    try {
      window.fbq?.('track', 'PageView');
    } catch (err) {
      console.warn('[Tracking] Meta Pixel PageView failed', err);
    }
  };
  script.onerror = () => {
    console.warn('[Tracking] Meta Pixel script failed to load (ad-blocker?)', pixelId);
  };
  document.head.appendChild(script);

  // init vai para a queue do stub e é processado quando o SDK carrega.
  window.fbq('init', pixelId);

  console.log('[Tracking] Meta Pixel injected:', pixelId);
};

// Inject TikTok Pixel
const injectTikTokPixel = (pixelId: string) => {
  if (!pixelId || !isValidTrackingId(pixelId, "tiktok") || document.getElementById(`tiktok-pixel-${pixelId}`)) return;

  const script = document.createElement('script');
  script.id = `tiktok-pixel-${pixelId}`;
  script.async = true;
  // Load the stub from a static file so no inline script is needed (CSP: script-src 'self').
  // After the stub initialises the ttq queue, call load() and page() with the runtime pixel ID.
  script.src = '/tiktok-pixel-stub.js';
  script.onload = () => {
    try {
      window.ttq?.load(pixelId);
      window.ttq?.page();
    } catch (err) {
      console.warn('[Tracking] TikTok Pixel init failed', err);
    }
  };
  script.onerror = () => {
    console.warn('[Tracking] TikTok Pixel stub failed to load', pixelId);
  };
  document.head.appendChild(script);

  console.log('[Tracking] TikTok Pixel injected:', pixelId);
};

// Inject Google Ads Tag
const injectGoogleAdsTag = (tagId: string) => {
  if (!tagId || !isValidTrackingId(tagId, "google_ads") || document.getElementById(`gads-${tagId}`)) return;
  
  const script = document.createElement('script');
  script.id = `gads-${tagId}`;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${tagId}`;
  document.head.appendChild(script);
  
  window.dataLayer = window.dataLayer || [];
  function gtag(...args: any[]) { window.dataLayer!.push(args); }
  gtag('js', new Date());
  gtag('config', tagId);
  
  console.log('[Tracking] Google Ads injected:', tagId);
};

// Inject LinkedIn Insight Tag
const injectLinkedInTag = (partnerId: string) => {
  if (!partnerId || !isValidTrackingId(partnerId, "linkedin") || document.getElementById(`linkedin-${partnerId}`)) return;

  // Step 1: load the lintrk stub from a static file (CSP: script-src 'self').
  const stub = document.createElement('script');
  stub.id = `linkedin-${partnerId}`;
  stub.async = true;
  stub.src = '/linkedin-insight-stub.js';
  stub.onload = () => {
    try {
      // Step 2: set partner ID globals that the LinkedIn SDK reads on load.
      (window as any)._linkedin_partner_id = partnerId;
      (window as any)._linkedin_data_partner_ids = (window as any)._linkedin_data_partner_ids || [];
      (window as any)._linkedin_data_partner_ids.push(partnerId);

      // Step 3: load the LinkedIn analytics SDK from their CDN.
      const sdk = document.createElement('script');
      sdk.type = 'text/javascript';
      sdk.async = true;
      sdk.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
      const first = document.getElementsByTagName('script')[0];
      first.parentNode?.insertBefore(sdk, first);
    } catch (err) {
      console.warn('[Tracking] LinkedIn Insight Tag init failed', err);
    }
  };
  stub.onerror = () => {
    console.warn('[Tracking] LinkedIn Insight stub failed to load', partnerId);
  };
  document.head.appendChild(stub);

  console.log('[Tracking] LinkedIn Insight Tag injected:', partnerId);
};

// Push event to all tracking platforms
const pushTrackingEvent = (eventName: string, eventData: Record<string, any> = {}, pixels: TrackingPixel[] = []) => {
  const timestamp = new Date().toISOString();
  const eventPayload = {
    event: eventName,
    ...eventData,
    timestamp,
  };
  
  // GTM / Google Tag Manager (local dataLayer)
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(eventPayload);
    console.log('[GTM Event]', eventName, eventData);
  } catch (e) {
    // Silently fail
  }
  
  // CROSS-FRAME: Send event to parent window via postMessage
  // This allows the parent page's GTM to receive events from the iframe
  if (window.parent !== window) {
    try {
      window.parent.postMessage({
        type: 'GTM_EVENT',
        event: eventName,
        data: eventData,
        timestamp,
      }, window.location.origin);
      console.log('[postMessage to parent]', eventName, eventData);
    } catch (e) {
      // Cross-origin or blocked - silently fail
    }
  }
  
  // Meta Pixel
  if (window.fbq) {
    try {
      const metaEventMap: Record<string, string> = {
        'form_loaded': 'PageView',
        'lead_created': 'Lead',
        'form_completed': 'CompleteRegistration',
        'step_completed': 'ViewContent',
      };
      const metaEvent = metaEventMap[eventName];
      if (metaEvent) {
        window.fbq('track', metaEvent, eventData);
        console.log('[Meta Event]', metaEvent, eventData);
      }
    } catch (e) {
      // Silently fail
    }
  }
  
  // TikTok Pixel
  if (window.ttq) {
    try {
      const ttEventMap: Record<string, string> = {
        'form_loaded': 'PageView',
        'lead_created': 'SubmitForm',
        'form_completed': 'CompleteRegistration',
        'step_completed': 'ViewContent',
      };
      const ttEvent = ttEventMap[eventName];
      if (ttEvent) {
        window.ttq.track(ttEvent, eventData);
        console.log('[TikTok Event]', ttEvent, eventData);
      }
    } catch (e) {
      // Silently fail
    }
  }
};

// Legacy function for backwards compatibility
const pushGTMEvent = (eventName: string, eventData: Record<string, any> = {}) => {
  pushTrackingEvent(eventName, eventData);
};

// Aliases for icon names that have been renamed/removed in newer lucide-react versions.
const LUCIDE_ALIASES: Record<string, string> = {
  Layers2: "Layers",
  Layers3: "Layers",
  Edit2: "Pencil",
  Edit3: "PenLine",
  Trash: "Trash2",
};

const normalizeLucideIconName = (name?: string | null) => {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return "";
  return LUCIDE_ALIASES[raw] || raw;
};

// Helper to render Lucide icons dynamically
const DynamicIcon = ({ name, className = "h-4 w-4", style }: { name: string; className?: string; style?: React.CSSProperties }) => {
  const normalized = normalizeLucideIconName(name);
  if (!normalized || normalized.startsWith("http") || normalized.startsWith("/") || normalized.startsWith("data:") || normalized.includes(".")) {
    return null;
  }

  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[normalized];
  if (!Icon) return null;
  return <Icon className={className} style={style} />;
};

// Get icon for field type
const getFieldTypeIcon = (fieldType: string, fieldKey: string, fieldLabel?: string) => {
  const haystack = `${fieldKey || ""} ${fieldLabel || ""}`.toLowerCase();
  if (fieldType === "email" || haystack.includes("email")) return <Mail className="h-4 w-4 text-muted-foreground" />;
  if (
    fieldType === "phone" ||
    haystack.includes("phone") ||
    haystack.includes("telefone") ||
    haystack.includes("telemovel")
  )
    return <Phone className="h-4 w-4 text-muted-foreground" />;
  if (haystack.includes("nome") || haystack.includes("name")) return <User className="h-4 w-4 text-muted-foreground" />;
  return null;
};

interface FormField {
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_multi_select?: boolean;
  options?: { options?: string[]; entity_ids?: string[] };
  default_value?: string;
  system_entity_type?: string;
  entity_options?: { id: string; name: string; label: string }[];
  display_style?: 'dropdown' | 'radio' | 'buttons' | 'checkbox' | 'cards' | 'icon_cards';
  option_icons?: Record<string, string>;
  option_icon_names?: Record<string, string>;
  section_id?: string;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  pattern_message?: string | null;
  placeholder?: string | null;
  help_text?: string | null;
  field_icon?: string | null;
}

interface InfoBlock {
  id: string;
  title: string;
  content: string;
  icon_type: string;
  sort_order: number;
}

interface FormSection {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface FormStep {
  step_number: number;
  step_title: string;
  step_description: string | null;
  step_subtitle?: string | null;
  next_button_text?: string | null;
  previous_button_text?: string | null;
  submit_button_text?: string | null;
  step_type?: string;
  scheduling_duration_minutes?: number;
  scheduling_board_id?: string | null;
  scheduling_postal_code_field_key?: string | null;
  fields: FormField[];
  info_blocks?: InfoBlock[];
  sections?: FormSection[];
}

interface Branding {
  logo_url?: string;
  favicon_url?: string;
  background_image_url?: string;
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  text_color?: string;
  button_text_color?: string;
  accent_color?: string;
  font_family?: string;
  heading_font_family?: string;
  form_title?: string;
  form_subtitle?: string;
  show_form_title?: boolean;
  submit_button_text?: string;
  next_button_text?: string;
  previous_button_text?: string;
  continue_button_text?: string;
  back_button_text?: string;
  success_title?: string;
  success_message?: string;
  success_redirect_url?: string;
  success_redirect_delay_seconds?: number;
  show_step_indicator?: boolean;
  show_step_titles?: boolean;
  show_progress_bar?: boolean;
  progress_indicator_style?: string;
  progress_animation?: boolean;
  step_counter_style?: string;
  card_style?: string;
  border_radius?: string;
  iframe_flush_embed?: boolean;
  custom_css?: string;
  footer_text?: string;
  privacy_policy_url?: string;
  terms_url?: string;
  location_rejection_message?: string;
  // Additional customizable texts
  loading_text?: string;
  error_title?: string;
  error_message?: string;
  redirecting_text?: string;
  seconds_text?: string;
  privacy_policy_label?: string;
  terms_label?: string;
  step_text?: string;
  of_text?: string;
  required_field_label?: string;
  select_placeholder?: string;
  multi_select_placeholder?: string;
  date_placeholder?: string;
  form_error_title?: string;
  form_error_message?: string;
  validation_error_text?: string;
  location_not_available_title?: string;
  thank_you_text?: string;
  contact_soon_text?: string;
  // Icon colors
  icon_color?: string;
  icon_selected_color?: string;
  // Step loading
  step_loading_text?: string;
  submitting_text?: string;
  // Back button styling
  back_button_bg_color?: string;
  back_button_text_color?: string;
  back_button_border_color?: string;
  back_button_hover_bg_color?: string;
  // Radio button color
  radio_button_color?: string;
  // Granular element styling
  input_border_radius?: string;
  input_border_width?: string;
  input_border_color?: string;
  input_focus_border_color?: string;
  input_background_color?: string;
  input_padding?: string;
  input_font_size?: string;
  card_border_radius?: string;
  card_border_width?: string;
  card_border_color?: string;
  card_icon_size?: string;
  card_icon_border_radius?: string;
  card_padding?: string;
  card_min_height?: string;
  radio_border_radius?: string;
  radio_border_width?: string;
  radio_circle_size?: string;
  radio_inner_size?: string;
  radio_padding?: string;
  checkbox_border_radius?: string;
  checkbox_border_width?: string;
  checkbox_size?: string;
  checkbox_padding?: string;
  button_option_border_radius?: string;
  button_option_border_width?: string;
  button_option_padding?: string;
  nav_button_border_radius?: string;
  nav_button_padding?: string;
  nav_button_font_size?: string;
  step_border_radius?: string;
  step_padding?: string;
  step_border_width?: string;
  step_border_color?: string;
  step_shadow?: string;
  info_block_border_radius?: string;
  info_block_padding?: string;
  info_block_background_opacity?: string;
  progress_bar_height?: string;
  progress_bar_border_radius?: string;
  select_border_radius?: string;
  select_border_width?: string;
  success_icon_size?: string;
  success_border_radius?: string;
  // Message display configuration
  error_display_style?: string;
  success_display_style?: string;
}

interface AllowedDistrict {
  id: string;
  name: string;
  code: string;
}

interface FormData {
  form_id: string;
  form_name: string;
  form_slug: string;
  organization_id: string;
  form_type: string;
  total_steps: number;
  steps: FormStep[];
  branding?: Branding | null;
  location_required?: boolean;
  allowed_districts?: AllowedDistrict[];
  campaign_id?: string;
  campaign_name?: string;
  gtm_id?: string | null;
  tracking_pixels?: TrackingPixel[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function PublicLeadForm() {
  const { formId: routeFormId, campaignId: routeCampaignId } = useParams<{ formId?: string; campaignId?: string }>();
  const [searchParams] = useSearchParams();
  
  // Support both URL params and query params (query params take precedence for campaign_id)
  const queryCampaignId = searchParams.get("campaign_id");
  const queryFormId = searchParams.get("form_id");
  // Accept both source_id (preferred) and source (legacy alias) — preserves
  // links/snippets published before the alias rename.
  const querySourceId = searchParams.get("source_id") || searchParams.get("source");
  const queryLang = (searchParams.get("lang") || "").trim().toLowerCase() || null;
  // Extract whitelisted UTMs / click ids from the URL. Memoized; null when none present.
  const tracking = useMemo(() => extractTrackingFromSearchParams(searchParams), [searchParams]);
  // Marca de origem do embed (ex: "utm" do snippet recomendado). Usada server-side
  // para autorizar o match utm_source -> lead_sources.name.
  const embedKind = (searchParams.get("embed") || "").trim().toLowerCase() || null;
  const isPreview = searchParams.get("preview") === "1";
  
  // Priority: query param > route param
  const campaignId = queryCampaignId || routeCampaignId;
  const formId = queryFormId || routeFormId;
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState<FormData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  // Defensive setter: any non-finite or <1 step would leave the form rendering a blank body
  // (because `formConfig.steps.find(s => s.step_number === currentStep)` returns undefined).
  const safeSetCurrentStep = (n: unknown, totalSteps?: number) => {
    const num = Number(n);
    if (!Number.isFinite(num) || num < 1) {
      console.error('[PublicLeadForm] invalid step rejected:', n);
      pushGTMEvent('form_error', {
        error_type: 'invalid_step',
        error_message: `invalid step value: ${String(n)}`,
        form_id: formConfig?.form_id || formId,
        campaign_id: formConfig?.campaign_id || campaignId,
      });
      return;
    }
    if (typeof totalSteps === 'number' && totalSteps > 0 && num > totalSteps) {
      console.warn('[PublicLeadForm] step exceeds totalSteps; clamping', num, totalSteps);
      setCurrentStep(totalSteps);
      return;
    }
    setCurrentStep(num);
  };
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [leadId, setLeadId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [locationRejected, setLocationRejected] = useState(false);
  const [resolvedSourceId, setResolvedSourceId] = useState<string | null>(querySourceId);
  const [schedulingSlot, setSchedulingSlot] = useState<{ start: string; end: string } | null>(null);
  const [currentLocale, setCurrentLocale] = useState<string | null>(null);
  const [previewBranding, setPreviewBranding] = useState<any | null>(null);
  
  const formContainerRef = useRef<HTMLDivElement>(null);
  
  // Detect if running in iframe
  const isInIframe = typeof window !== 'undefined' && window.parent !== window;
  
  // Auto-resize iframe: communicate height to parent
  useEffect(() => {
    if (!isInIframe) return;
    
    const sendHeight = () => {
      const height = document.documentElement.scrollHeight;
      try {
        window.parent.postMessage({
          type: 'IFRAME_RESIZE',
          height: height,
        }, window.location.origin);
      } catch {
        // Cross-origin error - silently fail
      }
    };
    
    // Send height initially and on resize/mutation
    sendHeight();
    
    // Observe DOM changes to detect content height changes
    const resizeObserver = new ResizeObserver(() => {
      sendHeight();
    });
    resizeObserver.observe(document.body);
    
    // Also listen for window resize
    window.addEventListener('resize', sendHeight);
    
    // Send height periodically for first few seconds to catch async content
    const intervals = [100, 300, 500, 1000, 2000];
    const timers = intervals.map(ms => setTimeout(sendHeight, ms));
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', sendHeight);
      timers.forEach(clearTimeout);
    };
  }, [isInIframe, loading, stepLoading, currentStep, isComplete]);

  // Scroll to top when step changes
  const scrollToTop = () => {
    const doScroll = () => {
      // 1) Try to reset the document scroller (some embeds scroll the document element)
      const scroller = document.scrollingElement || document.documentElement;
      try {
        // TS may not know 'instant' but browsers accept it; fallback below covers it.
        (scroller as any).scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
      } catch {
        scroller.scrollTop = 0;
      }

      // 2) Reset window scroll (normal pages)
      try {
        (window as any).scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
      } catch {
        window.scrollTo(0, 0);
      }

      // 3) Ensure the form itself is aligned to the top
      formContainerRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });

      // 4) Notify parent if in iframe (support both message types)
      try {
        window.parent?.postMessage({ type: 'lovable_scroll_top' }, window.location.origin);
        window.parent?.postMessage({ type: 'scroll_top' }, window.location.origin);
      } catch {
        // Ignore cross-origin errors
      }
    };

    // With AnimatePresence `mode="wait"`, the new step may render after the state change.
    // We scroll immediately, then again shortly after, and once more after the transition.
    requestAnimationFrame(() => {
      doScroll();
      setTimeout(doScroll, 120);
      setTimeout(doScroll, 320);
    });
  };

  // Track previous step to detect changes
  const prevStepRef = useRef(currentStep);
  
  // Effect for step changes - scroll to top
  useEffect(() => {
    if (currentStep !== prevStepRef.current && !loading && !stepLoading) {
      scrollToTop();
      prevStepRef.current = currentStep;
    }
  }, [currentStep, loading, stepLoading]);

  // Effect for completion - scroll to top
  useEffect(() => {
    if (isComplete) {
      scrollToTop();
    }
  }, [isComplete]);
  
  // Combined loading state for button disabling
  const isButtonDisabled = submitting || stepLoading;

  const branding = previewBranding
    ? { ...(formConfig?.branding ?? {}), ...previewBranding }
    : formConfig?.branding;

  // Live preview: receive branding overrides from parent editor.
  useEffect(() => {
    if (!isPreview || !isInIframe) return;
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data && typeof data === "object" && data.type === "BRANDING_PREVIEW") {
        if (data.branding) setPreviewBranding(data.branding);
      }
      if (data && typeof data === "object" && data.type === "PREVIEW_GO_TO_STEP") {
        const total = formConfig?.steps?.length;
        safeSetCurrentStep(data.step, total);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isPreview, isInIframe]);

  // Notify parent that the preview is ready — only after form has loaded.
  useEffect(() => {
    if (!isPreview || !isInIframe || loading) return;
    try {
      window.parent.postMessage({
        type: "PREVIEW_READY",
        totalSteps: formConfig?.steps?.length || 0,
        steps: (formConfig?.steps || []).map((s: any) => ({
          step_number: s.step_number,
          step_title: s.step_title || `Passo ${s.step_number}`,
        })),
      }, window.location.origin);
    } catch {
      // ignore
    }
  }, [isPreview, isInIframe, loading, formConfig]);

  useEffect(() => {
    if (formId || campaignId) {
      loadFormData();
    }
  }, [formId, campaignId, queryLang]);

  // Handle success redirect
  useEffect(() => {
    if (isComplete && branding?.success_redirect_url) {
      const delay = (branding.success_redirect_delay_seconds || 0) * 1000;
      const timer = setTimeout(() => {
        window.location.href = branding.success_redirect_url!;
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isComplete, branding]);

  // Self-heal: if currentStep doesn't map to any step (corrupt server response, stale state,
  // or out-of-range value), snap to a valid one instead of rendering a blank card body.
  // MUST be declared with other hooks, before any conditional early return below.
  useEffect(() => {
    if (isComplete) return;
    if (!formConfig || !Array.isArray(formConfig.steps) || formConfig.steps.length === 0) return;
    const match = formConfig.steps.find(s => s.step_number === currentStep);
    if (match) return;
    const sorted = formConfig.steps.map(s => s.step_number).sort((a, b) => a - b);
    const fallback = Number.isFinite(currentStep) && currentStep > sorted[sorted.length - 1]
      ? sorted[sorted.length - 1]
      : sorted[0];
    console.warn('[PublicLeadForm] currentStep', currentStep, 'has no matching step; snapping to', fallback);
    pushGTMEvent('form_error', {
      error_type: 'invalid_step',
      error_message: `currentStep ${String(currentStep)} not in steps`,
      form_id: formConfig?.form_id || formId,
      campaign_id: formConfig?.campaign_id || campaignId,
    });
    setCurrentStep(fallback);
  }, [currentStep, formConfig, isComplete, formId, campaignId]);

  const loadFormData = async (langOverride?: string | null) => {
    // When called with a langOverride we are switching language mid-flow:
    // keep formValues / currentStep / leadId intact so the visitor doesn't lose progress.
    const isLocaleSwitch = typeof langOverride !== "undefined";
    if (!isLocaleSwitch) setLoading(true);
    setError(null);
    try {
      // Priority: campaign_id query param > form_id path param > campaign_id path param
      // If campaignId is from query param, use it (user explicitly wants this campaign)
      let queryParam: string;
      if (queryCampaignId) {
        queryParam = `campaign_id=${queryCampaignId}`;
      } else if (formId) {
        queryParam = `form_id=${formId}`;
      } else if (campaignId) {
        queryParam = `campaign_id=${campaignId}`;
      } else {
        throw new Error("Formulário não especificado");
      }
      
      // Append only an explicit locale so the server can resolve translations
      // from forms.settings.i18n. Without ?lang=, let the backend use the
      // form's own default_locale instead of browser/localStorage detection.
      let lang: string | null = null;
      if (isLocaleSwitch) {
        lang = langOverride ?? null;
      } else if (queryLang) {
        lang = queryLang;
      }
      const langSuffix = lang ? `&lang=${encodeURIComponent(lang)}` : "";
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-form-data?${queryParam}${langSuffix}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar o formulário");
      }

      if (!Array.isArray(data.steps) || data.steps.length === 0) {
        throw new Error("Este formulário ainda não tem passos configurados.");
      }
      
      setFormConfig(data);
      // Track the resolved locale for the switcher UI.
      setCurrentLocale(data.resolved_locale || data.default_locale || lang || null);
      
      // Inject all tracking pixels (GTM, Meta, TikTok, etc.) - only from form_tracking_pixels table
      if (!isLocaleSwitch && data.tracking_pixels && data.tracking_pixels.length > 0) {
        injectTrackingPixels(data.tracking_pixels);
      }
      // Note: gtm_id field in forms table is deprecated - use form_tracking_pixels instead
      
      // Set default source_id from campaign if not provided in query params
      if (!isLocaleSwitch && !querySourceId && data.default_source_id) {
        setResolvedSourceId(data.default_source_id);
      }
      
      // Initialize form data with default values — only on the initial load,
      // never when switching language (would erase the visitor's answers).
      if (!isLocaleSwitch) {
        const initialData: Record<string, any> = {};
        data.steps.forEach((step: FormStep) => {
          step.fields.forEach((field: FormField) => {
            if (field.default_value) {
              initialData[field.field_key] = field.default_value;
            }
          });
        });
        setFormValues(initialData);

        // Track: Form loaded event (sent to all platforms)
        pushTrackingEvent('form_loaded', {
          form_id: data.form_id || formId,
          form_name: data.form_name || data.campaign_name,
          campaign_id: data.campaign_id || campaignId,
          total_steps: data.steps?.length || 1,
        }, data.tracking_pixels || []);
      }
    } catch (err: any) {
      setError(err.message);
      // GTM: Form load error event
      pushGTMEvent('form_error', {
        error_type: 'load_error',
        error_message: err.message,
        form_id: formId,
        campaign_id: campaignId,
      });
    } finally {
      if (!isLocaleSwitch) setLoading(false);
    }
  };

  const handleLocaleChange = (locale: string) => {
    setCurrentLocale(locale);
    loadFormData(locale);
  };

  const handleInputChange = (fieldKey: string, value: any) => {
    setFormValues(prev => ({ ...prev, [fieldKey]: value }));
    
    // GTM: Field interaction event
    pushGTMEvent('form_field_interaction', {
      field_key: fieldKey,
      form_id: formConfig?.form_id || formId,
      campaign_id: formConfig?.campaign_id || campaignId,
      current_step: currentStep,
    });
    
    // Check for location rejection when location field changes
    const lowerKey = fieldKey.toLowerCase();
    if (formConfig?.location_required && (lowerKey.includes('district') || lowerKey.includes('distrito'))) {
      checkLocationValidity(value);
    }
  };

  const isDistrictField = (field: FormField): boolean => {
    const lowerKey = field.field_key.toLowerCase();
    return field.field_type === 'ref_district' ||
           lowerKey.includes('district') || 
           lowerKey.includes('distrito');
  };

  const checkLocationValidity = (selectedDistrictId: string) => {
    if (!formConfig?.location_required || !formConfig?.allowed_districts?.length) {
      setLocationRejected(false);
      return;
    }
    
    const isAllowed = formConfig.allowed_districts.some(d => d.id === selectedDistrictId);
    setLocationRejected(!isAllowed);
  };

  const handleMultiSelectChange = (fieldKey: string, optionValue: string, checked: boolean) => {
    setFormValues(prev => {
      const currentValues = Array.isArray(prev[fieldKey]) ? prev[fieldKey] : [];
      if (checked) {
        // Dedup defensively — guards against double-fire events (label click +
        // checkbox click, autofill, re-render) that previously caused duplicate
        // options like ["Casa de Banho","Casa de Banho"].
        return { ...prev, [fieldKey]: Array.from(new Set([...currentValues, optionValue])) };
      } else {
        return { ...prev, [fieldKey]: currentValues.filter((v: string) => v !== optionValue) };
      }
    });
  };

  // Scroll and focus on a specific field - works in both standalone and iframe contexts
  const scrollToAndFocusField = (fieldKey: string) => {
    // Use multiple strategies to find the field element
    const fieldElement = 
      document.getElementById(fieldKey) || 
      document.querySelector(`[name="${fieldKey}"]`) ||
      document.querySelector(`[data-field-key="${fieldKey}"]`);
    
    if (fieldElement) {
      // First scroll to the element
      fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Try to focus - if it's not directly focusable, find the input inside
      setTimeout(() => {
        // For radio buttons, cards, checkboxes - try to find and click/focus the first option
        const radioOption = fieldElement.querySelector('.radio-option, .option-card, .checkbox-option, .btn-option');
        const inputElement = fieldElement.tagName === 'INPUT' || fieldElement.tagName === 'TEXTAREA' || fieldElement.tagName === 'SELECT'
          ? fieldElement
          : fieldElement.querySelector('input, textarea, select, button, [tabindex="0"]');
        
        if (radioOption && 'focus' in radioOption) {
          // For radio/card options, focus the first option element
          (radioOption as HTMLElement).focus();
          (radioOption as HTMLElement).setAttribute('tabindex', '0');
        } else if (inputElement && 'focus' in inputElement && typeof (inputElement as HTMLElement).focus === 'function') {
          (inputElement as HTMLElement).focus();
        }
        
        // Visual highlight effect for non-input fields (radio, cards)
        if (radioOption || fieldElement.querySelector('.radio-option, .option-card')) {
          fieldElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            fieldElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 2000);
        }
      }, 300); // Wait for scroll to complete
      
      // For iframes: also notify parent window for potential additional handling
      if (window.parent !== window) {
        try {
          window.parent.postMessage({
            type: 'FORM_VALIDATION_ERROR',
            fieldKey,
          }, window.location.origin);
        } catch (e) {
          // Cross-origin - silently fail
        }
      }
    }
  };

  const validateCurrentStep = () => {
    if (!formConfig) return false;
    const step = formConfig.steps.find(s => s.step_number === currentStep);
    if (!step) return true;

    // Scheduling step: require a slot to be selected
    if (step.step_type === 'scheduling') {
      if (!schedulingSlot) {
        toast.error("Por favor selecione uma data e hora para a visita.");
        return false;
      }
      return true;
    }
    // Check if form has a scheduling step - skip ref_service validation
    const hasSchedulingStep = formConfig?.steps?.some(s => s.step_type === 'scheduling');

    for (const field of step.fields) {
      // Skip ref_service fields when form has scheduling
      if (hasSchedulingStep && field.field_type === 'ref_service') continue;
      const locationFieldRequired = formConfig.location_required && isDistrictField(field);
      
      if (field.is_required || locationFieldRequired) {
        const value = formValues[field.field_key];
        if (!value || (Array.isArray(value) && value.length === 0)) {
          toast.error(`O campo "${field.field_label}" é obrigatório`);
          
          setTimeout(() => scrollToAndFocusField(field.field_key), 100);
          
          return false;
        }
      }
    }
    
    if (locationRejected) {
      toast.error("A localização selecionada não está disponível.");
      return false;
    }
    
    return true;
  };

  const completeScheduledBooking = async (resolvedLeadId: string) => {
    if (!formConfig || !schedulingSlot) return resolvedLeadId;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/book-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_id: formConfig.form_id,
        step_number: formConfig.steps.find(s => s.step_type === 'scheduling')?.step_number || currentStep,
        lead_id: resolvedLeadId,
        slot_start: schedulingSlot.start,
        slot_end: schedulingSlot.end,
        postal_code: (() => {
          const pcKey = formConfig.steps.find(s => s.step_type === 'scheduling')?.scheduling_postal_code_field_key;
          return pcKey ? formValues[pcKey] : undefined;
        })(),
        field_values: formValues,
        campaign_id: formConfig.campaign_id || campaignId || undefined,
        source_id: resolvedSourceId || null,
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao confirmar o agendamento");
    }

    return data.lead_id || resolvedLeadId;
  };

  const submitStep = async () => {
    if (isPreview) {
      toast.info("Modo pré-visualização — submissão desativada");
      return;
    }
    if (!validateCurrentStep() || !formConfig) return;
    
    setSubmitting(true);
    try {
      const step = formConfig.steps.find(s => s.step_number === currentStep);
      const stepFieldKeys = step?.fields.map(f => f.field_key) || [];
      const stepFieldValues: Record<string, any> = {};
      stepFieldKeys.forEach(key => {
        if (formValues[key] !== undefined) {
          stepFieldValues[key] = formValues[key];
        }
      });

      const hasSchedulingStep = formConfig.steps.some(s => s.step_type === 'scheduling');

      // Use form_id for new workflow, fallback to campaign_id
      const requestBody: any = {
        step_number: currentStep,
        field_values: stepFieldValues,
        source: "public_form",
        source_id: resolvedSourceId || null,
      };
      
      if (formConfig.form_id) {
        requestBody.form_id = formConfig.form_id;
      }
      if (formConfig.campaign_id) {
        requestBody.campaign_id = formConfig.campaign_id;
      } else if (campaignId) {
        requestBody.campaign_id = campaignId;
      }

      // Optional, additive: only attach `tracking` when at least one whitelisted
      // UTM/click-id is present. Keeps legacy bodies byte-identical otherwise.
      if (tracking) {
        requestBody.tracking = tracking;
      }
      if (embedKind) {
        requestBody.embed = embedKind;
      }

      if (!leadId) {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Erro ao enviar dados");
        }


        let resolvedLeadId = data.lead_id;

        if (data.is_complete && hasSchedulingStep && schedulingSlot) {
          resolvedLeadId = await completeScheduledBooking(data.lead_id);
        }
        
        setLeadId(resolvedLeadId);
        
        // GTM: Lead created event (first step completed)
        pushGTMEvent('lead_created', {
          lead_id: resolvedLeadId,
          form_id: formConfig?.form_id || formId,
          campaign_id: formConfig?.campaign_id || campaignId,
          step_completed: currentStep,
        });
        
        if (data.is_complete) {
          setIsComplete(true);
          // GTM: Form completed event
          pushGTMEvent('form_completed', {
            lead_id: resolvedLeadId,
            form_id: formConfig?.form_id || formId,
            campaign_id: formConfig?.campaign_id || campaignId,
            total_steps: formConfig?.steps?.length || 1,
          });
        } else {
          // GTM: Step completed event
          pushGTMEvent('step_completed', {
            lead_id: resolvedLeadId,
            form_id: formConfig?.form_id || formId,
            campaign_id: formConfig?.campaign_id || campaignId,
            step_completed: currentStep,
            next_step: data.next_step,
          });
          setStepLoading(true);
          await new Promise(resolve => setTimeout(resolve, 600));
          setStepLoading(false);
          safeSetCurrentStep(data.next_step, formConfig?.steps?.length);
        }
      } else {
        const updateBody: any = {
          lead_id: leadId,
          campaign_id: formConfig?.campaign_id || campaignId,
          step_number: currentStep,
          field_values: stepFieldValues,
          form_id: formConfig.form_id || undefined,
        };
        if (tracking) updateBody.tracking = tracking;
        const response = await fetch(`${SUPABASE_URL}/functions/v1/update-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Erro ao enviar dados");
        }

        let resolvedLeadId = leadId;

        if (data.is_complete && hasSchedulingStep && schedulingSlot && leadId) {
          resolvedLeadId = await completeScheduledBooking(leadId);
        }
        
        if (data.is_complete) {
          setIsComplete(true);
          // GTM: Form completed event
          pushGTMEvent('form_completed', {
            lead_id: resolvedLeadId,
            form_id: formConfig?.form_id || formId,
            campaign_id: formConfig?.campaign_id || campaignId,
            total_steps: formConfig?.steps?.length || 1,
          });
        } else {
          // GTM: Step completed event
          pushGTMEvent('step_completed', {
            lead_id: resolvedLeadId,
            form_id: formConfig?.form_id || formId,
            campaign_id: formConfig?.campaign_id || campaignId,
            step_completed: currentStep,
            next_step: data.next_step,
          });
          setStepLoading(true);
          await new Promise(resolve => setTimeout(resolve, 600));
          setStepLoading(false);
          safeSetCurrentStep(data.next_step, formConfig?.steps?.length);
        }
      }
    } catch (err: any) {
      toast.error(branding?.form_error_message || err.message);
      // GTM: Form submission error event
      pushGTMEvent('form_error', {
        error_type: 'submission_error',
        error_message: err.message,
        form_id: formConfig?.form_id || formId,
        campaign_id: formConfig?.campaign_id || campaignId,
        current_step: currentStep,
        lead_id: leadId,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      // Make back navigation feel consistent: scroll up immediately as well.
      scrollToTop();

      // GTM: Step navigation event
      pushGTMEvent('step_navigation', {
        direction: 'back',
        from_step: currentStep,
        to_step: currentStep - 1,
        form_id: formConfig?.form_id || formId,
        campaign_id: formConfig?.campaign_id || campaignId,
        lead_id: leadId,
      });
      safeSetCurrentStep(currentStep - 1, formConfig?.steps?.length);
    }
  };

  const renderField = (field: FormField) => {
    const value = formValues[field.field_key];
    
    const getSelectOptions = (): { value: string; label: string }[] => {
      if (field.entity_options && field.entity_options.length > 0) {
        const entityIds = field.options?.entity_ids;
        const filteredOptions = entityIds && entityIds.length > 0
          ? field.entity_options.filter(opt => entityIds.includes(opt.id))
          : field.entity_options;
        return filteredOptions.map(opt => ({ value: opt.id, label: opt.label || opt.name }));
      }
      if (field.options?.options && Array.isArray(field.options.options)) {
        return field.options.options.map(opt => ({ value: opt, label: opt }));
      }
      return [];
    };

    const inputStyle = {
      borderColor: branding?.accent_color || undefined,
    };

    switch (field.field_type) {
      case "textarea":
        return (
          <div className="space-y-1" data-field-key={field.field_key}>
            <Textarea
              id={field.field_key}
              name={field.field_key}
              value={value || ""}
              onChange={(e) => handleInputChange(field.field_key, e.target.value)}
              placeholder={field.placeholder || field.field_label}
              className="min-h-[100px]"
              style={inputStyle}
              maxLength={field.max_length || undefined}
            />
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      case "select":
      case "ref_service":
      case "ref_product":
      case "ref_business_unit":
      case "ref_department":
      case "ref_district":
        const selectOptions = getSelectOptions();
        const displayStyle = field.display_style || 'dropdown';
        
        // Get dynamic icon for option - all icons black by default
        const iconColor = branding?.icon_color || '#000000';
        const iconSelectedColor = branding?.icon_selected_color || '#000000';
        
        const getOptionIcon = (optLabel: string, optValue: string, isSelected: boolean = false) => {
          const currentColor = isSelected ? iconSelectedColor : iconColor;
          const iconStyle = { color: currentColor };

          // First use the exact configured icon name saved for this option.
          // Only fall back to heuristics if that configured name is missing/invalid.
          const iconMap = (field.option_icon_names && typeof field.option_icon_names === "object")
            ? field.option_icon_names as Record<string, string>
            : null;
          if (iconMap) {
            const tryKeys = [optLabel, optValue, String(optLabel || "").trim(), String(optValue || "").trim()];
            let configured: string | undefined;
            for (const k of tryKeys) {
              if (k && iconMap[k]) { configured = iconMap[k]; break; }
            }
            if (!configured) {
              const norm = (s: string) => String(s || "").trim().toLowerCase();
              const targets = [norm(optLabel), norm(optValue)].filter(Boolean);
              const hit = Object.keys(iconMap).find(k => targets.includes(norm(k)));
              if (hit) configured = iconMap[hit];
            }
            const normalizedConfigured = normalizeLucideIconName(configured);
            if (normalizedConfigured && (LucideIcons as Record<string, unknown>)[normalizedConfigured]) {
              return <DynamicIcon name={normalizedConfigured} className="h-5 w-5" style={iconStyle} />;
            }
          }
          // Fallback to heuristic icons - all in configured color (black by default)
          const lowerLabel = optLabel.toLowerCase();
          const renderLucide = (name: string) => <DynamicIcon name={name} className="h-5 w-5" style={iconStyle} />;
          // Time / urgency
          if (lowerLabel.includes('urgente') || lowerLabel.includes('urgent')) return renderLucide('Zap');
          if (lowerLabel.includes('normal') || lowerLabel.includes('prazo')) return renderLucide('Clock');
          // Rooms / spaces
          if (lowerLabel.includes('cozinha') || lowerLabel.includes('kitchen')) return renderLucide('Utensils');
          if (lowerLabel.includes('banho') || lowerLabel.includes('bath') || lowerLabel.includes('wc')) return renderLucide('Bath');
          if (lowerLabel.includes('quarto') || lowerLabel.includes('bedroom')) return renderLucide('BedDouble');
          if (lowerLabel.includes('sala')) return renderLucide('Sofa');
          if (lowerLabel.includes('escritório') || lowerLabel.includes('office')) return renderLucide('Briefcase');
          // Buildings
          if (lowerLabel.includes('edifí') || lowerLabel.includes('edific') || lowerLabel.includes('building')) return renderLucide('Building2');
          if (lowerLabel.includes('casa') || lowerLabel.includes('home') || lowerLabel.includes('moradia')) return renderLucide('Home');
          if (lowerLabel.includes('apartamento') || lowerLabel.includes('apartment')) return renderLucide('Building');
          if (lowerLabel.includes('loja') || lowerLabel.includes('store') || lowerLabel.includes('comercial')) return renderLucide('Store');
          if (lowerLabel.includes('armazém') || lowerLabel.includes('warehouse')) return renderLucide('Warehouse');
          if (lowerLabel.includes('hotel')) return renderLucide('Hotel');
          if (lowerLabel.includes('escola') || lowerLabel.includes('school')) return renderLucide('School');
          // Floors / surfaces
          if (lowerLabel.includes('pavimento') || lowerLabel.includes('chão') || lowerLabel.includes('chao') || lowerLabel.includes('soalho') || lowerLabel.includes('floor') || lowerLabel.includes('spc') || lowerLabel.includes('pvc') || lowerLabel.includes('vinílico') || lowerLabel.includes('vinilico')) return renderLucide('Layers');
          if (lowerLabel.includes('parede') || lowerLabel.includes('wall')) return renderLucide('SquareStack');
          if (lowerLabel.includes('teto') || lowerLabel.includes('tecto') || lowerLabel.includes('ceiling')) return renderLucide('LampCeiling');
          if (lowerLabel.includes('porta') || lowerLabel.includes('door')) return renderLucide('DoorOpen');
          if (lowerLabel.includes('janela') || lowerLabel.includes('window')) return renderLucide('Grid2x2');
          // Services
          if (lowerLabel.includes('limpeza') || lowerLabel.includes('cleaning')) return renderLucide('Sparkles');
          if (lowerLabel.includes('manutenção') || lowerLabel.includes('manutencao') || lowerLabel.includes('maintenance')) return renderLucide('Settings');
          if (lowerLabel.includes('reparação') || lowerLabel.includes('reparacao') || lowerLabel.includes('repair') || lowerLabel.includes('conserto')) return renderLucide('Wrench');
          if (lowerLabel.includes('pintura') || lowerLabel.includes('paint')) return renderLucide('Paintbrush');
          if (lowerLabel.includes('canaliz') || lowerLabel.includes('plumbing') || lowerLabel.includes('águas') || lowerLabel.includes('aguas')) return renderLucide('Pipette');
          if (lowerLabel.includes('elétric') || lowerLabel.includes('electric') || lowerLabel.includes('eletric')) return renderLucide('Plug');
          if (lowerLabel.includes('jardin') || lowerLabel.includes('garden') || lowerLabel.includes('jardim')) return renderLucide('Trees');
          if (lowerLabel.includes('porteiro') || lowerLabel.includes('portaria') || lowerLabel.includes('segurança') || lowerLabel.includes('seguranca') || lowerLabel.includes('security')) return renderLucide('Shield');
          if (lowerLabel.includes('facility') || lowerLabel.includes('facilit')) return renderLucide('Building2');
          if (lowerLabel.includes('gestão') || lowerLabel.includes('gestao') || lowerLabel.includes('management')) return renderLucide('ClipboardList');
          if (lowerLabel.includes('remodel') || lowerLabel.includes('renov')) return renderLucide('Hammer');
          if (lowerLabel.includes('construç') || lowerLabel.includes('construc') || lowerLabel.includes('obra')) return renderLucide('HardHat');
          if (lowerLabel.includes('mudança') || lowerLabel.includes('mudanca') || lowerLabel.includes('moving')) return renderLucide('Truck');
          // Generic positives
          if (lowerLabel.includes('sim') || lowerLabel.includes('yes')) return renderLucide('Check');
          if (lowerLabel.includes('não') || lowerLabel.includes('nao') || lowerLabel === 'no') return renderLucide('X');
          if (lowerLabel.includes('outro') || lowerLabel.includes('other')) return renderLucide('HelpCircle');
          return null;
        };

        // Cards style - visual cards with large icons (like mockup)
        if (displayStyle === 'cards' || displayStyle === 'icon_cards') {
          const columnsClass = selectOptions.length === 2 
            ? "grid-cols-2" 
            : selectOptions.length === 3 
              ? "grid-cols-2 sm:grid-cols-3" 
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
          
          return (
            <div id={field.field_key} data-field-key={field.field_key} className={`grid ${columnsClass} gap-2 sm:gap-4`}>
              {selectOptions.map(opt => {
                const isSelected = field.is_multi_select 
                  ? (value || []).includes(opt.value)
                  : value === opt.value;
                const icon = getOptionIcon(opt.label, opt.value, isSelected);
                return (
                  <div
                    key={opt.value}
                    tabIndex={0}
                    onClick={() => {
                      if (field.is_multi_select) {
                        handleMultiSelectChange(field.field_key, opt.value, !isSelected);
                      } else {
                        handleInputChange(field.field_key, opt.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (field.is_multi_select) {
                          handleMultiSelectChange(field.field_key, opt.value, !isSelected);
                        } else {
                          handleInputChange(field.field_key, opt.value);
                        }
                      }
                    }}
                    className="option-card relative flex flex-col items-center justify-center gap-2 sm:gap-3 border cursor-pointer transition-all hover:shadow-lg p-3 sm:p-4 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    style={{
                      borderColor: isSelected ? primaryColor : 'hsl(var(--muted))',
                      backgroundColor: isSelected ? `${primaryColor}10` : undefined,
                      boxShadow: isSelected ? `0 0 0 2px ${primaryColor}33` : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = `${primaryColor}60`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'hsl(var(--muted))';
                      }
                    }}
                  >
                    {/* Selection indicator */}
                    {isSelected && (
                      <div 
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: branding?.primary_color || 'hsl(var(--primary))' }}
                      >
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                    )}
                    
                    {/* Icon container */}
                    <div 
                      className={`option-card-icon flex items-center justify-center transition-all w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl ${
                        isSelected 
                          ? 'bg-primary text-primary-foreground shadow-lg' 
                          : 'bg-muted text-muted-foreground'
                      }`}
                      style={isSelected ? { 
                        backgroundColor: branding?.primary_color, 
                        color: branding?.button_text_color || '#fff' 
                      } : undefined}
                    >
                      {icon ? (
                        <div className="h-5 w-5 sm:h-8 sm:w-8 [&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-8 sm:[&>svg]:w-8">{icon}</div>
                      ) : (
                        <HelpCircle className="h-5 w-5 sm:h-8 sm:w-8" />
                      )}
                    </div>
                    
                    {/* Label */}
                    <span className={`text-xs sm:text-base font-semibold text-center leading-tight ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        }
        
        // Checkbox style for multi-select
        if (field.is_multi_select || displayStyle === 'checkbox') {
          return (
            <div id={field.field_key} data-field-key={field.field_key} className="space-y-2">
              {selectOptions.map(opt => {
                const isChecked = (value || []).includes(opt.value);
                const icon = getOptionIcon(opt.label, opt.value, isChecked);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="checkbox-option w-full flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    style={{
                      borderColor: isChecked ? primaryColor : 'hsl(var(--muted))',
                      backgroundColor: isChecked ? `${primaryColor}10` : undefined,
                      boxShadow: isChecked ? `0 0 0 1px ${primaryColor}` : undefined,
                    }}
                    onClick={() => handleMultiSelectChange(field.field_key, opt.value, !isChecked)}
                    aria-pressed={isChecked}
                  >
                    <Checkbox
                      id={`${field.field_key}-${opt.value}`}
                      checked={isChecked}
                      onCheckedChange={(checked) => handleMultiSelectChange(field.field_key, opt.value, !!checked)}
                      style={{
                        borderColor: radioButtonColor,
                        backgroundColor: isChecked ? radioButtonColor : 'transparent',
                        color: '#ffffff',
                      }}
                      tabIndex={-1}
                    />
                    {icon && <span className="flex-shrink-0">{icon}</span>}
                    <span className="flex-1 font-normal text-sm sm:text-base">{opt.label}</span>
                  </button>
                );
              })}
              {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
            </div>
          );
        }

        // Radio button style - elegant like mockup
        if (displayStyle === 'radio') {
          const columnsClass = selectOptions.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";
          return (
            <div id={field.field_key} data-field-key={field.field_key} className={`grid ${columnsClass} gap-2 sm:gap-3`}>
              {selectOptions.map(opt => {
                const isSelected = value === opt.value;
                const icon = getOptionIcon(opt.label, opt.value, isSelected);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="radio-option w-full flex items-center gap-3 sm:gap-4 border cursor-pointer transition-all p-3 sm:p-4 text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    style={{
                      borderColor: isSelected ? primaryColor : 'hsl(var(--muted))',
                      backgroundColor: isSelected ? `${primaryColor}10` : undefined,
                    }}
                    onClick={() => handleInputChange(field.field_key, opt.value)}
                    aria-pressed={isSelected}
                  >
                    {/* Custom radio circle */}
                    <div 
                      className="radio-circle rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all w-5 h-5 sm:w-6 sm:h-6"
                      style={{ borderColor: radioButtonColor }}
                    >
                      {isSelected && (
                        <div 
                          className="radio-inner rounded-full w-2.5 h-2.5 sm:w-3 sm:h-3"
                          style={{ backgroundColor: radioButtonColor }}
                        />
                      )}
                    </div>
                    
                    {icon && <span className="flex-shrink-0">{icon}</span>}
                    <span className="font-medium text-foreground text-sm sm:text-base">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          );
        }

        // Button style - full width options
        if (displayStyle === 'buttons') {
          const columnsClass = selectOptions.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2";
          return (
            <div id={field.field_key} data-field-key={field.field_key} className={`grid ${columnsClass} gap-2 sm:gap-3`}>
              {selectOptions.map(opt => {
                const isSelected = value === opt.value;
                const icon = getOptionIcon(opt.label, opt.value, isSelected);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleInputChange(field.field_key, opt.value)}
                    className="btn-option flex items-center justify-center gap-2 sm:gap-3 border transition-all text-sm sm:text-base font-medium p-3 sm:p-4"
                    style={isSelected ? { 
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
                      color: branding?.button_text_color || '#fff'
                    } : {
                      borderColor: 'hsl(var(--muted))',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = `${primaryColor}80`;
                        e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'hsl(var(--muted))';
                        e.currentTarget.style.backgroundColor = '';
                      }
                    }}
                  >
                    {icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          );
        }
        
        // Default dropdown style
        return (
          <Select value={value || ""} onValueChange={(v) => handleInputChange(field.field_key, v)}>
            <SelectTrigger>
              <SelectValue placeholder={`Selecione ${field.field_label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.field_key}
              checked={!!value}
              onCheckedChange={(checked) => handleInputChange(field.field_key, checked)}
            />
            <Label htmlFor={field.field_key}>{field.field_label}</Label>
          </div>
        );

      case "number":
        return (
          <Input
            id={field.field_key}
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value || ""}
            onChange={(e) => handleInputChange(field.field_key, e.target.value)}
            placeholder={field.placeholder || field.field_label}
            className="h-11 sm:h-12 text-sm sm:text-base rounded-xl"
          />
        );

      case "date":
        return (
          <Input
            id={field.field_key}
            type="date"
            value={value || ""}
            onChange={(e) => handleInputChange(field.field_key, e.target.value)}
          />
        );

      case "email":
        return (
          <div className="space-y-1" data-field-key={field.field_key}>
            <div className="relative">
              <Mail className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                id={field.field_key}
                name={field.field_key}
                type="email"
                value={value || ""}
                onChange={(e) => handleInputChange(field.field_key, e.target.value)}
                placeholder={field.placeholder || field.field_label}
                className="pl-10 sm:pl-12 h-11 sm:h-12 text-sm sm:text-base rounded-xl"
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      case "phone":
        return (
          <div className="space-y-1" data-field-key={field.field_key}>
            <div className="relative">
              <Phone className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                id={field.field_key}
                name={field.field_key}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={value || ""}
                onChange={(e) => {
                  // Only allow numbers for phone
                  const numericValue = e.target.value.replace(/[^0-9]/g, '');
                  handleInputChange(field.field_key, numericValue);
                }}
                placeholder={field.placeholder || field.field_label}
                maxLength={field.max_length || undefined}
                className="pl-10 sm:pl-12 h-11 sm:h-12 text-sm sm:text-base rounded-xl"
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      default: {
        // Get fallback icon based on field type/key/label
        const fieldIcon = getFieldTypeIcon(field.field_type, field.field_key, field.field_label);
        // Check if there's a valid custom icon
        const hasValidCustomIcon = field.field_icon && 
          typeof field.field_icon === 'string' && 
          !field.field_icon.startsWith('http') && 
          !field.field_icon.startsWith('/') && 
          !field.field_icon.startsWith('data:') && 
          !field.field_icon.includes('.');
        const customIcon = hasValidCustomIcon ? <DynamicIcon name={field.field_icon!} className="h-5 w-5 text-muted-foreground" /> : null;
        const icon = customIcon || fieldIcon;
        
        return (
          <div className="space-y-1" data-field-key={field.field_key}>
            <div className="relative">
              {icon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  {icon}
                </div>
              )}
              <Input
                id={field.field_key}
                name={field.field_key}
                type="text"
                value={value || ""}
                onChange={(e) => handleInputChange(field.field_key, e.target.value)}
                placeholder={field.placeholder || field.field_label}
                maxLength={field.max_length || undefined}
                className={`h-11 sm:h-12 text-sm sm:text-base rounded-xl ${icon ? 'pl-12' : ''}`}
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );
      }
    }
  };

  // Generate dynamic styles - unified background color
  // In iframe context, force white background for consistency
  const bgColor = isInIframe ? "#ffffff" : (branding?.background_color || "#ffffff");
  const stepBorderWidth = branding?.step_border_width || '1px';
  const stepBorderColor = branding?.step_border_color || '#e5e7eb';
  const stepShadow = branding?.step_shadow || '0 1px 3px 0 rgb(0 0 0 / 0.1)';
  const hasMainContainerBorder = stepBorderWidth !== '0px' && stepBorderColor !== 'transparent';
  const mainContainerShadow = hasMainContainerBorder ? stepShadow : 'none';
  const layout = resolveLayout(branding, { isInIframe });
  const useFlushEmbed = layout.useFlushEmbed;

  // Unified outer padding: a single value applies to both iframe and standalone.
  // Falls back to legacy iframe.outerPadding for old configs, then to legacy
  // container_padding_x/y columns.
  const cfgOuterPad = ((layout.container.outerPadding || layout.iframe.outerPadding || '') as string).trim();
  const customPadX = ((branding as any)?.container_padding_x ?? '').toString().trim();
  const customPadY = ((branding as any)?.container_padding_y ?? '').toString().trim();
  const resolvedOuterPadX = useFlushEmbed ? '' : (cfgOuterPad || customPadX);
  const resolvedOuterPadY = useFlushEmbed ? '' : (cfgOuterPad || customPadY);
  const hasCustomPadding = resolvedOuterPadX !== '' || resolvedOuterPadY !== '';

  const containerStyle: React.CSSProperties = {
    backgroundColor: bgColor,
    backgroundImage: (!isInIframe && branding?.background_image_url) ? `url(${branding.background_image_url})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    fontFamily: branding?.font_family || undefined,
    ...(hasCustomPadding ? {
      paddingTop: resolvedOuterPadY || (useFlushEmbed ? '0' : undefined),
      paddingBottom: resolvedOuterPadY || (useFlushEmbed ? '0' : undefined),
      paddingLeft: resolvedOuterPadX || (useFlushEmbed ? '0' : undefined),
      paddingRight: resolvedOuterPadX || (useFlushEmbed ? '0' : undefined),
    } : {}),
    color: branding?.text_color || undefined,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: bgColor,
    color: branding?.text_color || undefined,
    border: useFlushEmbed || !hasMainContainerBorder ? 'none' : undefined,
    boxShadow: useFlushEmbed || !hasMainContainerBorder ? 'none' : undefined,
    outline: useFlushEmbed || !hasMainContainerBorder ? 'none' : undefined,
    borderRadius: useFlushEmbed ? 0 : undefined,
  };

  const getCardClassName = () => {
    const style = branding?.card_style;
    
    let styleClass = "";
    if (!style || style === "default") {
      styleClass = "shadow-lg"; 
    } else if (style === "elevated") {
      styleClass = "shadow-lg";
    } else if (style === "outlined") {
      styleClass = "!shadow-none border-2";
    } else if (style === "flat" || style === "borderless") {
      styleClass = "!shadow-none !border-0";
    }

    const radiusClass = branding?.border_radius ? `!${branding.border_radius}` : "";
    
    const mainContainerClass = useFlushEmbed 
      ? "!rounded-none !border-0 !shadow-none !outline-none" 
      : (hasMainContainerBorder ? "" : "!border-0 !shadow-none !outline-none");
      
    return cn(styleClass, radiusClass, mainContainerClass);
  };

  const primaryColor = branding?.primary_color || "#85D3BE";
  const radioButtonColor = branding?.radio_button_color || primaryColor;
  
  const buttonStyle: React.CSSProperties = {
    backgroundColor: primaryColor,
    color: branding?.button_text_color || "#ffffff",
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: branding?.heading_font_family || branding?.font_family || undefined,
  };

  // Loading text (customizable)
  const loadingText = branding?.loading_text || "A carregar formulário...";
  
  if (loading) {
    return (
      <FormLoadingSkeleton 
        primaryColor={primaryColor}
        backgroundColor={containerStyle?.backgroundColor?.toString()}
        cardStyle={cardStyle}
        loadingText={loadingText}
      />
    );
  }

  // Error text (customizable)
  const errorTitle = branding?.error_title || "Formulário Indisponível";
  
  if (error) {
    return (
      <div className={`${isInIframe ? 'min-h-fit' : 'min-h-screen'} flex items-center justify-center p-4`} style={containerStyle}>
        <Card className={`max-w-md w-full ${getCardClassName()}`} style={cardStyle}>
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle style={headingStyle}>{errorTitle}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Success messages
  const redirectingText = branding?.redirecting_text || "A redirecionar em";
  const secondsText = branding?.seconds_text || "segundos...";
  
  if (isComplete) {
    return (
      <div className={`${isInIframe ? 'min-h-fit' : 'min-h-screen'} flex items-center justify-center p-4`} style={containerStyle}>
        <Card className={`success-card max-w-md w-full ${getCardClassName()}`} style={cardStyle}>
          <CardHeader className="text-center">
            {branding?.logo_url && (
              <img src={branding.logo_url} alt="Logo" className="h-12 mx-auto mb-4 object-contain" />
            )}
            <div 
              className="success-icon mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <Check className="h-8 w-8" style={{ color: primaryColor }} />
            </div>
            <CardTitle style={headingStyle}>{branding?.success_title || "Obrigado!"}</CardTitle>
            <CardDescription style={{ color: branding?.text_color }}>
              {branding?.success_message || "O seu pedido foi submetido com sucesso. Entraremos em contacto consigo brevemente."}
            </CardDescription>
            {branding?.success_redirect_url && (
              <p className="text-sm text-muted-foreground mt-4">
                {redirectingText} {branding.success_redirect_delay_seconds || 0} {secondsText}
              </p>
            )}
          </CardHeader>
        </Card>

        {branding?.footer_text && (
          <div className="text-center mt-8 text-sm opacity-70">
            {branding.footer_text}
          </div>
        )}
      </div>
    );
  }

  if (!formConfig) return null;

  if (!Array.isArray(formConfig.steps) || formConfig.steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Formulário não configurado</CardTitle>
            <CardDescription>Este formulário ainda não tem passos configurados.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentStepData = formConfig.steps.find(s => s.step_number === currentStep);
  const totalSteps = formConfig.total_steps;
  const progressPercent = (Number.isFinite(currentStep) && currentStep > 0 ? currentStep : 1) / Math.max(totalSteps, 1) * 100;


  const formTitle = branding?.form_title || formConfig.form_name;
  const formSubtitle = branding?.form_subtitle || "";

  // Group fields by section
  const getFieldsGroupedBySections = (stepData: FormStep) => {
    const sections = stepData.sections || [];
    const fieldsWithoutSection = stepData.fields.filter(f => !f.section_id);
    const fieldsBySection = sections.map(section => ({
      section,
      fields: stepData.fields.filter(f => f.section_id === section.id)
    })).filter(group => group.fields.length > 0);
    
    return { fieldsWithoutSection, fieldsBySection };
  };

  // Granular styling variables
  const inputBorderRadius = branding?.input_border_radius || '12px';
  const inputBorderWidth = branding?.input_border_width || '1px';
  const inputBorderColor = branding?.input_border_color || '#e5e7eb';
  const inputFocusBorderColor = branding?.input_focus_border_color || primaryColor;
  const inputBgColor = branding?.input_background_color || branding?.background_color || '#ffffff';
  const inputPadding = layout.inputs.padding;
  const inputFontSize = branding?.input_font_size || '15px';
  
  const cardBorderRadius = branding?.card_border_radius || '16px';
  const cardBorderWidth = branding?.card_border_width || '2px';
  const cardBorderColor = branding?.card_border_color || '#e5e7eb';
  const cardIconSize = branding?.card_icon_size || '56px';
  const cardIconBorderRadius = branding?.card_icon_border_radius || '14px';
  const cardPadding = layout.options.cardPadding;
  const cardMinHeight = branding?.card_min_height || '140px';
  
  const radioBorderRadius = branding?.radio_border_radius || '12px';
  const radioBorderWidth = branding?.radio_border_width || '2px';
  const radioCircleSize = branding?.radio_circle_size || '20px';
  const radioInnerSize = branding?.radio_inner_size || '10px';
  const radioPadding = layout.options.radioPadding;
  
  const checkboxBorderRadius = branding?.checkbox_border_radius || '12px';
  const checkboxBorderWidth = branding?.checkbox_border_width || '2px';
  const checkboxSize = branding?.checkbox_size || '20px';
  const checkboxPadding = layout.options.checkboxPadding;
  
  const buttonOptionBorderRadius = branding?.button_option_border_radius || '12px';
  const buttonOptionBorderWidth = branding?.button_option_border_width || '2px';
  const buttonOptionPadding = layout.options.buttonPadding;
  
  const navButtonBorderRadius = branding?.nav_button_border_radius || '12px';
  const navButtonPadding = layout.buttons.navPadding;
  const navButtonFontSize = branding?.nav_button_font_size || '15px';
  
  const stepBorderRadius = branding?.step_border_radius || '16px';
  const stepPadding = layout.step.padding;
  
  const infoBlockBorderRadius = branding?.info_block_border_radius || '12px';
  const infoBlockPadding = branding?.info_block_padding || '16px 20px';
  const infoBlockBgOpacity = branding?.info_block_background_opacity || '15';
  
  const progressBarHeight = branding?.progress_bar_height || '4px';
  const progressBarBorderRadius = branding?.progress_bar_border_radius || '2px';
  
  const selectBorderRadius = branding?.select_border_radius || '10px';
  const selectBorderWidth = branding?.select_border_width || '1px';
  
  const successIconSize = branding?.success_icon_size || '80px';
  const successBorderRadius = branding?.success_border_radius || '16px';

  return (
    <div ref={formContainerRef} className={`${isInIframe ? 'min-h-fit' : 'min-h-screen'} ${hasCustomPadding ? '' : (useFlushEmbed ? 'p-0' : 'py-4 sm:py-8 px-3 sm:px-4')}`} style={containerStyle}>
      {/* Dynamic CSS for primary color on all interactive elements */}
      <style dangerouslySetInnerHTML={{ __html: `
        .form-card {
          border-radius: ${useFlushEmbed ? '0 !important' : `${stepBorderRadius} !important`};
          padding: clamp(16px, 4vw, ${stepPadding});
          border: ${useFlushEmbed ? '0 !important' : (hasMainContainerBorder ? `${stepBorderWidth} solid ${stepBorderColor}` : '0 !important')};
          box-shadow: ${useFlushEmbed ? 'none !important' : (mainContainerShadow === 'none' ? 'none !important' : mainContainerShadow)};
          outline: ${useFlushEmbed ? '0 !important' : (hasMainContainerBorder ? 'initial' : '0 !important')};
          background-color: ${bgColor} !important;
        }
        @media (max-width: 480px) {
          .form-card {
            border-radius: ${useFlushEmbed ? '0 !important' : '12px !important'};
            padding: 16px !important;
          }
        }
        .form-card input[type="text"],
        .form-card input[type="email"],
        .form-card input[type="tel"],
        .form-card input[type="number"],
        .form-card input[type="date"],
        .form-card textarea {
          border-radius: ${inputBorderRadius} !important;
          border-width: ${inputBorderWidth} !important;
          border-color: ${inputBorderColor} !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
          padding-right: 14px !important;
          font-size: ${inputFontSize} !important;
          background-color: ${inputBgColor} !important;
        }
        .form-card input[type="text"]:not(.pl-12),
        .form-card input[type="number"],
        .form-card input[type="date"],
        .form-card textarea {
          padding-left: 14px !important;
        }
        .form-card input.pl-12 {
          padding-left: 48px !important;
        }
        .form-card input:focus,
        .form-card textarea:focus,
        .form-card [data-radix-select-trigger]:focus,
        .form-card button[role="combobox"]:focus {
          border-color: ${inputFocusBorderColor} !important;
          box-shadow: 0 0 0 3px ${inputFocusBorderColor}15 !important;
          outline: none !important;
        }
        .form-card input:hover,
        .form-card textarea:hover {
          border-color: ${primaryColor}80 !important;
        }
        .form-card [data-radix-select-trigger] {
          border-radius: ${selectBorderRadius} !important;
          border-width: ${selectBorderWidth} !important;
        }
        /* Select dropdown styling - applied globally since SelectContent uses Portal */
        [data-radix-select-content] [data-highlighted] {
          background-color: ${primaryColor} !important;
          color: ${branding?.button_text_color || '#fff'} !important;
        }
        [data-radix-select-content] [data-state="checked"] {
          background-color: ${primaryColor} !important;
          color: ${branding?.button_text_color || '#fff'} !important;
        }
        [data-radix-select-content] [role="option"]:focus {
          background-color: ${primaryColor} !important;
          color: ${branding?.button_text_color || '#fff'} !important;
        }
        .form-card .option-card {
          border-radius: ${cardBorderRadius} !important;
          border-width: ${cardBorderWidth} !important;
          padding: ${cardPadding} !important;
          min-height: ${cardMinHeight} !important;
        }
        .form-card .option-card-icon {
          width: ${cardIconSize} !important;
          height: ${cardIconSize} !important;
          border-radius: ${cardIconBorderRadius} !important;
        }
        .form-card .radio-option {
          border-radius: ${radioBorderRadius} !important;
          border-width: ${radioBorderWidth} !important;
          padding: ${radioPadding} !important;
        }
        .form-card .radio-option:hover {
          border-color: ${primaryColor}80 !important;
        }
        .form-card .radio-circle {
          width: ${radioCircleSize} !important;
          height: ${radioCircleSize} !important;
        }
        .form-card .radio-inner {
          width: ${radioInnerSize} !important;
          height: ${radioInnerSize} !important;
        }
        .form-card .checkbox-option {
          border-radius: ${checkboxBorderRadius} !important;
          border-width: ${checkboxBorderWidth} !important;
          padding: ${checkboxPadding} !important;
        }
        .form-card .checkbox-option:hover {
          border-color: ${primaryColor}80 !important;
        }
        .form-card .checkbox-option input[type="checkbox"] {
          width: ${checkboxSize} !important;
          height: ${checkboxSize} !important;
        }
        .form-card .btn-option {
          border-radius: ${buttonOptionBorderRadius} !important;
          border-width: ${buttonOptionBorderWidth} !important;
          padding: ${buttonOptionPadding} !important;
        }
        .form-card .info-block {
          border-radius: ${infoBlockBorderRadius} !important;
          padding: ${infoBlockPadding} !important;
        }
        .form-card .progress-segment {
          height: ${progressBarHeight} !important;
          border-radius: ${progressBarBorderRadius} !important;
        }
        .form-card .nav-button {
          border-radius: ${navButtonBorderRadius} !important;
          padding: ${navButtonPadding} !important;
          font-size: ${navButtonFontSize} !important;
        }
        .success-card {
          border-radius: ${successBorderRadius} !important;
        }
        .success-icon {
          width: ${successIconSize} !important;
          height: ${successIconSize} !important;
        }
        ${branding?.custom_css || ''}
        ${useFlushEmbed ? `
          .form-card.form-card {
            border-radius: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            outline: 0 !important;
            --tw-ring-shadow: 0 0 #0000 !important;
            --tw-shadow: 0 0 #0000 !important;
            --tw-shadow-colored: 0 0 #0000 !important;
          }
          @media (max-width: 480px) {
            .form-card.form-card {
              border-radius: 0 !important;
            }
          }
        ` : ''}
      ` }} />

      <div className="w-full max-w-2xl mx-auto">
        {/* Language switcher — only renders when no explicit URL language is locked */}
        {!queryLang && (
          <FormLocaleSwitcher
            defaultLocale={(formConfig as any)?.default_locale}
            enabledLocales={(formConfig as any)?.enabled_locales}
            currentLocale={currentLocale}
            onChange={handleLocaleChange}
            className="mb-2 flex justify-end"
          />
        )}
        <Card className={`form-card ${getCardClassName()} overflow-hidden`} style={cardStyle}>
          {/* Header Section */}
          <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
            {/* Step Counter - at the very top like mockup */}
            {totalSteps > 1 && branding?.show_step_indicator !== false && branding?.step_counter_style !== 'none' && (
              <div className="text-xs sm:text-sm text-muted-foreground uppercase tracking-widest font-medium mb-2">
                {branding?.step_text || "Passo"} {currentStep} {branding?.of_text || "de"} {totalSteps}
              </div>
            )}
            
            {/* Logo */}
            {branding?.logo_url && (
              <img src={branding.logo_url} alt="Logo" className="h-8 sm:h-12 mb-3 sm:mb-4 object-contain" />
            )}
            
            {/* Title - Large and elegant */}
            {branding?.show_form_title !== false && (
              <CardTitle className="text-xl sm:text-3xl md:text-4xl font-light tracking-tight leading-tight" style={headingStyle}>
                {formTitle}
              </CardTitle>
            )}
            
            {/* Subtitle */}
            {formSubtitle && (
              <CardDescription className="text-sm sm:text-base mt-1 sm:mt-2" style={{ color: branding?.text_color ? `${branding.text_color}99` : undefined }}>
                {formSubtitle}
              </CardDescription>
            )}
            
            {/* Progress bar - Segmented style with optional animation */}
            {totalSteps > 1 && branding?.show_progress_bar !== false && branding?.progress_indicator_style !== 'none' && (
              <div className="flex gap-1 sm:gap-2 mt-4 sm:mt-6">
                {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
                  const isActive = step <= currentStep;
                  const shouldAnimate = branding?.progress_animation !== false;
                  
                  return (
                    <motion.div
                      key={step}
                      className="progress-segment flex-1 overflow-hidden"
                      initial={shouldAnimate ? { scaleX: 0 } : undefined}
                      animate={{ 
                        scaleX: 1,
                        backgroundColor: isActive ? primaryColor : 'hsl(var(--muted))'
                      }}
                      transition={shouldAnimate ? {
                        scaleX: { duration: 0.4, delay: step * 0.1, ease: [0.4, 0, 0.2, 1] },
                        backgroundColor: { duration: 0.3 }
                      } : undefined}
                      style={{ 
                        originX: 0,
                        backgroundColor: isActive ? primaryColor : 'hsl(var(--muted))'
                      }}
                    />
                  );
                })}
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-0 px-4 sm:px-6 overflow-hidden">
            <AnimatePresence mode="wait">
              {/* Step Loading Animation - Enhanced */}
              {stepLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center justify-center py-16 sm:py-20 gap-4 sm:gap-5"
                >
                  {/* Animated loading spinner with pulsing ring */}
                  <div className="relative">
                    <motion.div 
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: `${primaryColor}20` }}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center" 
                         style={{ backgroundColor: `${primaryColor}15` }}>
                      <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 animate-spin" style={{ color: primaryColor }} />
                    </div>
                  </div>
                  
                  {/* Loading text with subtle animation */}
                  <motion.p 
                    className="text-muted-foreground text-sm sm:text-base font-medium"
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {branding?.step_loading_text || "A processar..."}
                  </motion.p>
                  
                  {/* Loading progress dots */}
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: primaryColor }}
                        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 1, 0.4] }}
                        transition={{ 
                          duration: 0.8, 
                          repeat: Infinity, 
                          delay: i * 0.2,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : currentStepData ? (
                <motion.div
                  key={`step-${currentStep}`}
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-5 sm:space-y-8"
                >
                {/* Step Title - if multi-step */}
                {(branding?.show_step_titles !== false) && currentStepData.step_title && totalSteps > 1 && (
                  <div className="pb-1 sm:pb-2">
                    <h3 className="font-semibold text-base sm:text-lg" style={headingStyle}>{currentStepData.step_title}</h3>
                    {(currentStepData.step_subtitle || currentStepData.step_description) && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">{currentStepData.step_subtitle || currentStepData.step_description}</p>
                    )}
                  </div>
                )}

                {/* Scheduling Step */}
                {currentStepData.step_type === 'scheduling' ? (
                  <SchedulingStep
                    formId={formConfig.form_id}
                    stepNumber={currentStepData.step_number}
                    boardId={currentStepData.scheduling_board_id || null}
                    durationMinutes={currentStepData.scheduling_duration_minutes || 60}
                    postalCode={(() => {
                      const pcKey = currentStepData.scheduling_postal_code_field_key;
                      return pcKey ? formValues[pcKey] : undefined;
                    })()}
                    primaryColor={primaryColor}
                    textColor={branding?.text_color}
                    buttonTextColor={branding?.button_text_color}
                    fontFamily={branding?.font_family}
                    borderRadius={branding?.border_radius}
                    onSlotSelected={setSchedulingSlot}
                  selectedSlot={schedulingSlot}
                  />
                ) : (
                <>
                {/* Render fields - grouped by sections or not */}

                {(() => {
                  // Check if any step in the form is a scheduling step
                  const hasSchedulingStep = formConfig?.steps?.some(s => s.step_type === 'scheduling');

                  const { fieldsWithoutSection, fieldsBySection } = getFieldsGroupedBySections(currentStepData);
                  
                  // Filter out ref_service fields when form has a scheduling step
                  const filterFields = (fields: FormField[]) => 
                    hasSchedulingStep ? fields.filter(f => f.field_type !== 'ref_service') : fields;

                  const filteredFieldsWithoutSection = filterFields(fieldsWithoutSection);
                  const filteredFieldsBySection = fieldsBySection.map(section => ({
                    ...section,
                    fields: filterFields(section.fields),
                  })).filter(section => section.fields.length > 0);

                  const renderFieldItem = (field: FormField) => {
                    const locationField = isDistrictField(field);
                    const isRequiredByLocation = formConfig?.location_required && locationField;
                    
                    // For cards/icon_cards, don't show label above (it's in the card)
                    const hideLabel = field.display_style === 'cards' || field.display_style === 'icon_cards';
                    
                    return (
                      <div key={field.field_key} className="space-y-3">
                        {field.field_type !== "checkbox" && !hideLabel && (
                          <Label htmlFor={field.field_key} className="text-base font-semibold">
                            {field.field_label}
                            {(field.is_required || isRequiredByLocation) && <span className="text-destructive ml-1">*</span>}
                          </Label>
                        )}
                        {hideLabel && (
                          <Label htmlFor={field.field_key} className="text-base font-semibold">
                            {field.field_label}
                            {(field.is_required || isRequiredByLocation) && <span className="text-orange-500 ml-1">*</span>}
                          </Label>
                        )}
                        {renderField(field)}
                        
                        {/* Show location rejection message */}
                        {locationField && locationRejected && (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <p>
                              {branding?.location_rejection_message || 
                                "De momento ainda não fornecemos serviços na sua zona. Deixe os seus dados e entraremos em contacto quando estivermos disponíveis na sua área."}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* Fields without section first */}
                      {filteredFieldsWithoutSection.length > 0 && (
                        <div className="space-y-4 sm:space-y-6">
                          {filteredFieldsWithoutSection.map(renderFieldItem)}
                        </div>
                      )}
                      
                      {/* Info Blocks */}
                      {currentStepData.info_blocks && currentStepData.info_blocks.length > 0 && (
                        <div className="space-y-3">
                          {currentStepData.info_blocks.map((block) => {
                            const getBlockStyles = (iconType: string) => {
                              switch (iconType) {
                                case 'warning': return { bg: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', text: 'text-amber-800' };
                                case 'success': return { bg: 'bg-green-50 border-green-200', icon: 'text-green-600', text: 'text-green-800' };
                                case 'alert': return { bg: 'bg-red-50 border-red-200', icon: 'text-red-600', text: 'text-red-800' };
                                default: return { bg: 'bg-blue-50 border-blue-200', icon: 'text-blue-600', text: 'text-blue-800' };
                              }
                            };
                            const styles = getBlockStyles(block.icon_type);
                            const IconComponent = block.icon_type === 'warning' ? AlertTriangle 
                              : block.icon_type === 'success' ? CheckCircle 
                              : block.icon_type === 'alert' ? AlertCircle 
                              : Info;
                            
                            return (
                              <div key={block.id} className={`info-block flex items-start gap-3 border ${styles.bg}`}>
                                <IconComponent className={`h-5 w-5 mt-0.5 flex-shrink-0 ${styles.icon}`} />
                                <div>
                                  <h4 className={`font-semibold text-sm ${styles.text}`}>{block.title}</h4>
                                  <p className={`text-sm mt-1 whitespace-pre-line ${styles.text}`}>{block.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Sectioned Fields */}
                      {filteredFieldsBySection.map(({ section, fields }) => (
                        <div key={section.id} className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-base">{section.title}</h4>
                            {section.description && (
                              <p className="text-sm text-muted-foreground">{section.description}</p>
                            )}
                          </div>
                          <div className="space-y-4">
                            {fields.map(renderFieldItem)}
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
                </>
                )}

                {/* Submit Button - Full width with enhanced loading state */}
                <div className="pt-4 sm:pt-6 space-y-3 sm:space-y-4">
                  <Button 
                    onClick={submitStep} 
                    disabled={isButtonDisabled} 
                    className="nav-button w-full font-semibold text-sm sm:text-base h-12 sm:h-14 relative overflow-hidden transition-all duration-200"
                    style={buttonStyle}
                  >
                    {/* Loading state with smooth transition */}
                    <AnimatePresence mode="wait">
                      {isButtonDisabled ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-center gap-2"
                        >
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>{branding?.submitting_text || "A enviar..."}</span>
                        </motion.div>
                      ) : (
                        <motion.span
                          key="text"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.15 }}
                        >
                          {currentStep === totalSteps 
                            ? (
                              currentStepData?.submit_button_text ||
                              currentStepData?.next_button_text ||
                              branding?.submit_button_text ||
                              branding?.next_button_text ||
                              branding?.continue_button_text ||
                              "Enviar"
                            )
                            : (
                              currentStepData?.next_button_text ||
                              branding?.next_button_text ||
                              branding?.continue_button_text ||
                              "Continuar"
                            )}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                  
                  {/* Back button - styled with branding colors */}
                  {currentStep > 1 && (
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      disabled={isButtonDisabled}
                      className="nav-button w-full font-semibold border-2 transition-all text-sm sm:text-base h-11 sm:h-12"
                      style={{
                        backgroundColor: branding?.back_button_bg_color || 'transparent',
                        color: branding?.back_button_text_color || branding?.secondary_color || primaryColor,
                        borderColor: branding?.back_button_border_color || branding?.secondary_color || primaryColor,
                      }}
                      onMouseEnter={(e) => {
                        const baseColor = branding?.secondary_color || primaryColor;
                        const hoverBg = branding?.back_button_hover_bg_color || `${baseColor}15`;
                        e.currentTarget.style.backgroundColor = hoverBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = branding?.back_button_bg_color || 'transparent';
                      }}
                    >
                      <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                      {currentStepData?.previous_button_text || branding?.previous_button_text || "Anterior"}
                    </Button>
                  )}
                </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Footer */}
        {(branding?.footer_text || branding?.privacy_policy_url || branding?.terms_url) && (
          <div className="text-center mt-6 text-sm opacity-70 space-y-2 max-w-lg mx-auto">
            {branding.footer_text && <p className="text-xs leading-relaxed">{branding.footer_text}</p>}
            {(branding.privacy_policy_url || branding.terms_url) && (
              <div className="flex justify-center gap-4 text-xs">
                {branding.privacy_policy_url && (
                  <a href={branding.privacy_policy_url} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-100">
                    {branding.privacy_policy_label || "Política de Privacidade"}
                  </a>
                )}
                {branding.terms_url && (
                  <a href={branding.terms_url} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-100">
                    {branding.terms_label || "Termos de Uso"}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
