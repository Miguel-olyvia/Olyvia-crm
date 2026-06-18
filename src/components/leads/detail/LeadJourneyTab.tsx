import { differenceInDays, format } from "date-fns";
import { pt } from "date-fns/locale";
import { Check, Star, HelpCircle } from "lucide-react";

interface LeadJourneyTabProps {
  lead: any;
  hasContact: boolean;
  hasClient: boolean;
  contactCreatedAt: string | null;
  clientCreatedAt: string | null;
  interactionCount: number;
  dealCount: number;
  dealValue: number;
}

export function LeadJourneyTab({
  lead, hasContact, hasClient, contactCreatedAt, clientCreatedAt,
  interactionCount, dealCount, dealValue,
}: LeadJourneyTabProps) {
  const steps = [
    {
      key: "lead",
      label: "Lead",
      date: lead.created_at,
      completed: true,
      current: !hasContact && !hasClient,
    },
    {
      key: "contacted",
      label: "Contactado",
      date: lead.last_contact_at || null,
      completed: !!lead.last_contact_at || lead.status !== "new",
      current: false,
    },
    {
      key: "qualified",
      label: "Qualificado",
      date: lead.status === "qualified" || lead.status === "converted" ? lead.updated_at : null,
      completed: lead.status === "qualified" || lead.status === "converted" || hasContact,
      current: lead.status === "qualified" && !hasContact,
    },
    {
      key: "contact",
      label: "Contacto",
      date: contactCreatedAt,
      completed: hasContact,
      current: hasContact && !hasClient,
    },
    {
      key: "client",
      label: "Cliente",
      date: clientCreatedAt,
      completed: hasClient,
      current: hasClient,
    },
  ];

  const leadToContactDays = hasContact && contactCreatedAt
    ? differenceInDays(new Date(contactCreatedAt), new Date(lead.created_at))
    : null;

  return (
    <div className="space-y-6 mt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        🗺 Percurso
      </h3>

      {/* Journey visualization */}
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
              <p className={`text-xs mt-1.5 font-medium ${
                step.current ? "text-purple-600 dark:text-purple-400" :
                step.completed ? "text-foreground" : "text-muted-foreground"
              }`}>
                {step.label}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {step.date ? format(new Date(step.date), "dd/MM/yyyy", { locale: pt }) : "—"}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${
                steps[i + 1].completed || steps[i + 1].current ? "bg-green-500" : "bg-muted-foreground/20"
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {(leadToContactDays !== null || interactionCount > 0 || dealCount > 0) && (
        <div className="rounded-lg bg-gradient-to-r from-primary/5 to-purple-500/5 border p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {leadToContactDays !== null && (
              <><strong className="text-foreground">{leadToContactDays} dias</strong> de Lead a Contacto · </>
            )}
            <strong className="text-foreground">{interactionCount} interacções</strong> registadas
            {dealCount > 0 && (
              <> · <strong className="text-foreground">{dealCount} deals</strong> no valor de <strong className="text-foreground">€{dealValue.toLocaleString("pt-PT")}</strong></>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
