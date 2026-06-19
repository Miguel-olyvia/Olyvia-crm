import { differenceInDays, format } from "date-fns";
import { pt } from "date-fns/locale";
import { Check, Star, HelpCircle } from "lucide-react";

interface JourneyStep {
  key: string;
  label: string;
  date: string | null;
  completed: boolean;
  current: boolean;
}

interface ContactJourneyTabProps {
  sourceLead: { id: string; campaign?: string; source_type?: string; created_at?: string } | null;
  contact: any;
  convertedAt: string | null;
  isClient: boolean;
  clientSince: string | null;
}

export function ContactJourneyTab({ sourceLead, contact, convertedAt, isClient, clientSince }: ContactJourneyTabProps) {
  const steps: JourneyStep[] = [
    {
      key: "lead",
      label: "Lead",
      date: sourceLead?.created_at || null,
      completed: !!sourceLead,
      current: false,
    },
    {
      key: "contacted",
      label: "Contactado",
      date: convertedAt || contact.created_at,
      completed: !!convertedAt || !!contact.last_interaction_at,
      current: false,
    },
    {
      key: "contact",
      label: "Contacto",
      date: contact.created_at,
      completed: true,
      current: !isClient,
    },
    {
      key: "client",
      label: "Cliente",
      date: clientSince,
      completed: isClient,
      current: isClient,
    },
  ];

  const leadToContactDays = sourceLead?.created_at && contact.created_at
    ? differenceInDays(new Date(contact.created_at), new Date(sourceLead.created_at))
    : null;

  return (
    <div className="space-y-6 mt-4">
      {/* Journey visualization */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          🗺 Percurso
        </h3>
        <div className="flex items-center justify-between px-4">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${
                  step.current ? "bg-purple-500 border-purple-500 text-white" :
                  step.completed ? "bg-green-500 border-green-500 text-white" :
                  "bg-muted border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {step.current ? <Star className="h-5 w-5" /> :
                   step.completed ? <Check className="h-5 w-5" /> :
                   <HelpCircle className="h-5 w-5" />}
                </div>
                <p className={`text-xs mt-1.5 font-medium ${step.current ? "text-purple-600 dark:text-purple-400" : step.completed ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {step.date ? format(new Date(step.date), "dd/MM", { locale: pt }) : "—"}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${steps[i + 1].completed || steps[i + 1].current ? "bg-green-500" : "bg-muted-foreground/20"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3 border rounded-lg p-4">
        {sourceLead && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">🚀 Origem:</span>
            <span className="font-medium">{sourceLead.source_type || "Website"}</span>
          </div>
        )}
        {sourceLead?.campaign && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">📣 Campanha:</span>
            <span className="font-medium">{sourceLead.campaign}</span>
          </div>
        )}
        {leadToContactDays !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">⏱ Lead → Contacto:</span>
            <span className="font-medium">{leadToContactDays} dias</span>
          </div>
        )}
      </div>
    </div>
  );
}
