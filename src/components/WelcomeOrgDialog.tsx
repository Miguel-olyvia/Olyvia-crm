import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Briefcase, Users, Layers, ArrowRight } from "lucide-react";
import olyviaIcon from "@/assets/olyvia-icon.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import {
  signupProfileSchema,
  SIGNUP_INDUSTRY_OPTIONS,
  SIGNUP_EMPLOYEE_COUNT_OPTIONS,
  type SignupProfileFormData,
} from "@/lib/validations";

interface WelcomeOrgDialogProps {
  open: boolean;
  onClose: () => void;
}

const emptyFormData: SignupProfileFormData = {
  companyName: "",
  industry: "",
  employeeCountRange: "",
  jobTitle: "",
};

export function WelcomeOrgDialog({ open, onClose }: WelcomeOrgDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<SignupProfileFormData>(emptyFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const companyNameRef = useRef<HTMLInputElement>(null);
  const jobTitleRef = useRef<HTMLInputElement>(null);

  // The parent keeps this component mounted and only toggles `open`, so
  // state must be reset explicitly on every re-open (otherwise a second
  // display in the same session would show stale data/errors left over
  // from a prior skip/submit).
  useEffect(() => {
    if (open) {
      setFormData(emptyFormData);
      setFormErrors({});
      setSaving(false);
    }
  }, [open]);

  const updateField = (field: keyof SignupProfileFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const dismissForUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        localStorage.setItem(`welcomeOrgDismissed_${session.user.id}`, "true");
      }
    } catch {
      // Best-effort dismissal flag; never block closing the dialog on it.
    }
  };

  const handleSkip = async () => {
    if (saving) return;
    await dismissForUser();
    onClose();
  };

  const saveSignupProfile = async (): Promise<boolean> => {
    const validation = signupProfileSchema.safeParse(formData);
    if (!validation.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFormErrors(nextErrors);
      (nextErrors.companyName ? companyNameRef : jobTitleRef).current?.focus();
      return false;
    }
    setFormErrors({});
    const data = validation.data;

    try {
      const { error } = await (supabase as any).rpc("rpc_upsert_signup_profile", {
        p_company_name: data.companyName || null,
        p_industry: data.industry || null,
        p_employee_count_range: data.employeeCountRange || null,
        p_job_title: data.jobTitle || null,
        p_signup_source: "direct",
      });

      if (error) throw error;

      toast({
        title: t("signupProfile.toastSuccessTitle"),
        description: t("signupProfile.toastSuccessDescription"),
      });
      return true;
    } catch {
      toast({
        title: t("signupProfile.toastErrorTitle"),
        description: t("signupProfile.toastErrorDescription"),
        variant: "destructive",
      });
      return false;
    }
  };

  const handleCreateNow = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await saveSignupProfile();
      if (!saved) return;

      await dismissForUser();
      onClose();
      navigate("/organizations");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) handleSkip(); }}>
      <DialogContent className="sm:max-w-lg overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader className="items-center text-center space-y-3">
            <img src={olyviaIcon} alt="Olyvia" className="h-14 w-14" />
            <DialogTitle className="text-xl">{t("signupProfile.title")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("signupProfile.description")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName" className="flex items-center gap-1.5 text-sm">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              {t("signupProfile.companyName")}
            </Label>
            <Input
              id="companyName"
              ref={companyNameRef}
              value={formData.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              placeholder={t("signupProfile.companyNamePlaceholder")}
              disabled={saving}
              aria-invalid={!!formErrors.companyName}
              aria-describedby={formErrors.companyName ? "companyName-error" : undefined}
            />
            {formErrors.companyName && (
              <p id="companyName-error" className="text-xs text-destructive">{formErrors.companyName}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry" className="flex items-center gap-1.5 text-sm">
                <Layers className="h-3.5 w-3.5 text-primary" />
                {t("signupProfile.industry")}
              </Label>
              <Select
                value={formData.industry || "__none__"}
                onValueChange={(value) => updateField("industry", value === "__none__" ? "" : value)}
                disabled={saving}
              >
                <SelectTrigger id="industry">
                  <SelectValue placeholder={t("signupProfile.industryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("signupProfile.industryPlaceholder")}</SelectItem>
                  {SIGNUP_INDUSTRY_OPTIONS.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                      {t(`signupProfile.industry.${industry}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employeeCountRange" className="flex items-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5 text-primary" />
                {t("signupProfile.employeeCountRange")}
              </Label>
              <Select
                value={formData.employeeCountRange || "__none__"}
                onValueChange={(value) => updateField("employeeCountRange", value === "__none__" ? "" : value)}
                disabled={saving}
              >
                <SelectTrigger id="employeeCountRange">
                  <SelectValue placeholder={t("signupProfile.employeeCountRangePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("signupProfile.employeeCountRangePlaceholder")}</SelectItem>
                  {SIGNUP_EMPLOYEE_COUNT_OPTIONS.map((range) => (
                    <SelectItem key={range} value={range}>
                      {t(`signupProfile.employeeCountRange.${range}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobTitle" className="flex items-center gap-1.5 text-sm">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              {t("signupProfile.jobTitle")}
            </Label>
            <Input
              id="jobTitle"
              ref={jobTitleRef}
              value={formData.jobTitle}
              onChange={(e) => updateField("jobTitle", e.target.value)}
              placeholder={t("signupProfile.jobTitlePlaceholder")}
              disabled={saving}
              aria-invalid={!!formErrors.jobTitle}
              aria-describedby={formErrors.jobTitle ? "jobTitle-error" : undefined}
            />
            {formErrors.jobTitle && (
              <p id="jobTitle-error" className="text-xs text-destructive">{formErrors.jobTitle}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleCreateNow} disabled={saving} className="w-full gap-2">
              {saving ? t("signupProfile.submitting") : (
                <>
                  {t("signupProfile.submit")}
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={saving}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              {t("signupProfile.skip")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
