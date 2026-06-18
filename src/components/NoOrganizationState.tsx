import { useNavigate } from "react-router-dom";
import { Building, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface NoOrganizationStateProps {
  /** Optional page context label (e.g. "users", "roles") */
  context?: string;
  /** If true, renders as a compact inline banner instead of a centered card */
  inline?: boolean;
}

export function NoOrganizationState({ context, inline }: NoOrganizationStateProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (inline) {
    return (
      <div className="w-full rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Building className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium">{t("noOrg.title")}</h3>
          <p className="text-muted-foreground text-sm">
            {t("noOrg.description")}
          </p>
        </div>
        <Button onClick={() => navigate("/organizations")} size="sm" variant="outline">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {t("noOrg.goCreate")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Card className="max-w-lg w-full text-center p-8 border-dashed border-2">
        <CardContent className="pt-6 space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Building className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{t("noOrg.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("noOrg.description")}
            </p>
          </div>
          <Button onClick={() => navigate("/organizations")} size="lg">
            <Plus className="w-4 h-4 mr-2" />
            {t("noOrg.goCreate")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
