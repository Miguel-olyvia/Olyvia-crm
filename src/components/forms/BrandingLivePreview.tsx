import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Monitor, Tablet, Smartphone, ExternalLink } from "lucide-react";
import type { FormI18nConfig } from "@/lib/formI18n";

type Device = "desktop" | "tablet" | "mobile";

interface BrandingLivePreviewProps {
  formId: string;
  branding: any;
  i18nConfig?: FormI18nConfig;
  className?: string;
}

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

export function BrandingLivePreview({
  formId,
  branding,
  i18nConfig,
  className,
}: BrandingLivePreviewProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const [steps, setSteps] = useState<Array<{ step_number: number; step_title: string }>>([]);
  const [selectedStep, setSelectedStep] = useState<number>(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestRef = useRef({ branding, i18nConfig });

  // Keep latest values in a ref so async handlers always read fresh state.
  useEffect(() => {
    latestRef.current = { branding, i18nConfig };
  }, [branding, i18nConfig]);

  const previewUrl = `/form/${formId}?preview=1`;

  // Send latest branding/i18n to the iframe (reads from ref to avoid stale closure)
  const sendToIframe = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        {
          type: "BRANDING_PREVIEW",
          branding: latestRef.current.branding,
          i18nConfig: latestRef.current.i18nConfig,
        },
        window.location.origin,
      );
    } catch {
      // ignore
    }
  };

  const goToStep = (n: number) => {
    setSelectedStep(n);
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type: "PREVIEW_GO_TO_STEP", step: n }, window.location.origin);
    } catch {
      // ignore
    }
  };

  // Listen for PREVIEW_READY from the iframe — reply with the latest state.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data && typeof data === "object" && data.type === "PREVIEW_READY") {
        sendToIframe();
        if (Array.isArray(data.steps)) {
          setSteps(data.steps);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
     
  }, []);

  // Debounced push of branding/i18n changes — always send (iframe ignores if no listener yet).
  useEffect(() => {
    const t = setTimeout(sendToIframe, 150);
    return () => clearTimeout(t);
     
  }, [branding, i18nConfig]);

  return (
    <div className={`flex flex-col min-h-0 bg-muted/40 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="flex border rounded-lg overflow-hidden">
          <Button
            variant={device === "desktop" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setDevice("desktop")}
            className="rounded-none"
            type="button"
          >
            <Monitor className="h-4 w-4" />
          </Button>
          <Button
            variant={device === "tablet" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setDevice("tablet")}
            className="rounded-none"
            type="button"
          >
            <Tablet className="h-4 w-4" />
          </Button>
          <Button
            variant={device === "mobile" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setDevice("mobile")}
            className="rounded-none"
            type="button"
          >
            <Smartphone className="h-4 w-4" />
          </Button>
        </div>
        {steps.length > 1 && (
          <div className="flex items-center gap-1 ml-2 flex-wrap">
            {steps.map((s) => (
              <Button
                key={s.step_number}
                variant={selectedStep === s.step_number ? "secondary" : "ghost"}
                size="sm"
                type="button"
                onClick={() => goToStep(s.step_number)}
                className="h-8 text-xs"
                title={s.step_title}
              >
                {s.step_number}
              </Button>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => window.open(`/form/${formId}`, "_blank")}
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          Abrir
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto flex justify-center items-start p-4">
        <div
          className="bg-background shadow-sm border rounded-md overflow-hidden h-full transition-all"
          style={{
            width: DEVICE_WIDTH[device],
            maxWidth: "100%",
          }}
        >
          <iframe
            ref={iframeRef}
            key={formId}
            src={previewUrl}
            title="Pré-visualização do formulário"
            className="w-full h-full border-0"
            style={{ minHeight: "100%" }}
            onLoad={() => sendToIframe()}
          />
        </div>
      </div>
    </div>
  );
}

export default BrandingLivePreview;
