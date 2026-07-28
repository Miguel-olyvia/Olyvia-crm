import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SchedulingStep } from "@/components/forms/SchedulingStep";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarClock,
  MapPin,
  User,
  Loader2,
  CheckCircle2,
  XCircle,
  CalendarX2,
  Clock,
  ArrowLeft,
  Check,
  Home,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PRIMARY = "#85D3BE";

interface Booking {
  status: string;
  start_datetime: string;
  end_datetime: string;
  formatted_when: string;
  technician_name: string;
  location: string;
  board_id: string | null;
  form_id: string | null;
  step_number: number | null;
  organization_id: string;
  lead_name: string;
  address?: {
    morada: string;
    codigo_postal: string;
    localidade: string;
  };
}

type View =
  | "loading"
  | "view"
  | "reschedule"
  | "address"
  | "cancelled"
  | "rescheduled"
  | "invalid"
  | "expired"
  | "used";

type Lang = "pt" | "en";

const STRINGS = {
  pt: {
    brand: "O seu agendamento",
    loading: "A carregar o seu agendamento...",
    greetingWithName: (name: string) => `Olá ${name},`,
    greeting: "Olá,",
    viewTitle: "A sua visita está confirmada",
    dateLabel: "Data e hora",
    technicianLabel: "Técnico",
    locationLabel: "Local",
    changeDate: "Alterar data/hora",
    updateAddress: "Atualizar morada",
    cancelBooking: "Cancelar agendamento",
    back: "Voltar",
    addressTitle: "Atualizar morada",
    addressHint: "Corrija a morada da sua visita, se necessário.",
    fieldMorada: "Morada",
    fieldPostal: "Código postal",
    fieldLocalidade: "Localidade",
    placeholderMorada: "Rua, número, andar",
    placeholderPostal: "0000-000",
    placeholderLocalidade: "Cidade",
    saveAddress: "Guardar morada",
    savingAddress: "A guardar...",
    addressSaved: "Morada atualizada com sucesso.",
    addressError: "Não foi possível guardar a morada. Tente novamente.",
    addressEmpty: "Preencha pelo menos a morada.",
    rescheduleTitle: "Escolha um novo horário",
    currentDate: "Data atual:",
    noAutoReschedule:
      "Não é possível reagendar automaticamente. Contacte-nos para alterar a sua visita.",
    confirmNewSlot: "Confirmar novo horário",
    confirming: "A confirmar...",
    stepPick: "Escolher data",
    stepConfirm: "Confirmar",
    pickHint: "Selecione um dia e um horário disponível abaixo.",
    slotSelectedHint: "Horário selecionado. Confirme para concluir.",
    rescheduledTitle: "Agendamento alterado",
    rescheduledDesc: (when: string) => (
      <>
        A sua visita foi reagendada para{" "}
        <span className="font-medium capitalize text-gray-800">{when}</span>. Enviámos a confirmação
        por email.
      </>
    ),
    viewBooking: "Ver agendamento",
    cancelledTitle: "Agendamento cancelado",
    cancelledDesc:
      "A sua visita foi cancelada. Se mudar de ideias, contacte-nos e teremos todo o gosto em voltar a agendar.",
    expiredTitle: "Este link expirou",
    expiredDesc:
      "O período para gerir este agendamento já terminou. Se precisar de ajuda, contacte-nos diretamente.",
    usedTitle: "Link já utilizado",
    usedDesc: "Este link já foi utilizado. Se tiver alguma questão sobre o seu agendamento, contacte-nos.",
    invalidTitle: "Link inválido",
    invalidDesc:
      "Não foi possível encontrar este agendamento. Verifique o link ou contacte-nos para o ajudarmos.",
    footer: "Precisa de ajuda? Responda ao email de confirmação e a nossa equipa entrará em contacto.",
    confirmCancelTitle: "Cancelar agendamento?",
    confirmCancelDesc:
      "Tem a certeza de que pretende cancelar a sua visita? Esta ação não pode ser revertida, mas poderá voltar a agendar mais tarde.",
    keepBooking: "Manter agendamento",
    yesCancel: "Sim, cancelar",
    cancelling: "A cancelar...",
    cancelError: "Não foi possível cancelar. Tente novamente.",
    genericError: "Ocorreu um erro. Tente novamente.",
    slotTakenError: "Este horário já não está disponível. Escolha outro.",
    rescheduleError: "Não foi possível reagendar. Tente novamente.",
  },
  en: {
    brand: "Your booking",
    loading: "Loading your booking...",
    greetingWithName: (name: string) => `Hi ${name},`,
    greeting: "Hi,",
    viewTitle: "Your visit is confirmed",
    dateLabel: "Date and time",
    technicianLabel: "Technician",
    locationLabel: "Location",
    changeDate: "Change date/time",
    updateAddress: "Update address",
    cancelBooking: "Cancel booking",
    back: "Back",
    addressTitle: "Update address",
    addressHint: "Correct the address for your visit if needed.",
    fieldMorada: "Address",
    fieldPostal: "Postal code",
    fieldLocalidade: "City",
    placeholderMorada: "Street, number, floor",
    placeholderPostal: "0000-000",
    placeholderLocalidade: "City",
    saveAddress: "Save address",
    savingAddress: "Saving...",
    addressSaved: "Address updated successfully.",
    addressError: "We couldn't save the address. Please try again.",
    addressEmpty: "Please fill in at least the address.",
    rescheduleTitle: "Choose a new time",
    currentDate: "Current date:",
    noAutoReschedule:
      "Automatic rescheduling isn't available. Please contact us to change your visit.",
    confirmNewSlot: "Confirm new time",
    confirming: "Confirming...",
    stepPick: "Pick date",
    stepConfirm: "Confirm",
    pickHint: "Select a day and an available time below.",
    slotSelectedHint: "Time selected. Confirm to finish.",
    rescheduledTitle: "Booking updated",
    rescheduledDesc: (when: string) => (
      <>
        Your visit has been rescheduled to{" "}
        <span className="font-medium capitalize text-gray-800">{when}</span>. We've sent you a
        confirmation by email.
      </>
    ),
    viewBooking: "View booking",
    cancelledTitle: "Booking cancelled",
    cancelledDesc:
      "Your visit has been cancelled. If you change your mind, contact us and we'll be happy to book again.",
    expiredTitle: "This link has expired",
    expiredDesc:
      "The window to manage this booking has ended. If you need help, please contact us directly.",
    usedTitle: "Link already used",
    usedDesc: "This link has already been used. If you have any questions about your booking, contact us.",
    invalidTitle: "Invalid link",
    invalidDesc:
      "We couldn't find this booking. Please check the link or contact us so we can help.",
    footer: "Need help? Reply to your confirmation email and our team will get in touch.",
    confirmCancelTitle: "Cancel booking?",
    confirmCancelDesc:
      "Are you sure you want to cancel your visit? This action can't be undone, but you can book again later.",
    keepBooking: "Keep booking",
    yesCancel: "Yes, cancel",
    cancelling: "Cancelling...",
    cancelError: "We couldn't cancel it. Please try again.",
    genericError: "Something went wrong. Please try again.",
    slotTakenError: "This time is no longer available. Please choose another.",
    rescheduleError: "We couldn't reschedule. Please try again.",
  },
} as const;

// Uses the standard supabase-js client (attaches the anon key automatically)
// instead of a raw fetch — cancel-booking/reschedule-booking/get-booking/
// update-booking-address all require a valid JWT (anon key qualifies); a
// bare fetch() with no Authorization header gets rejected at the gateway.
const callFn = async (fn: string, body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.json();
        return parsed;
      }
    } catch {
      // ignore parse errors, fall through
    }
    return { error: error.message };
  }
  return data;
};

const errorViewFromCode = (code?: string): View => {
  switch (code) {
    case "EXPIRED":
      return "expired";
    case "USED":
      return "used";
    case "CANCELLED":
      return "cancelled";
    default:
      return "invalid";
  }
};

export default function BookingManage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const lang: Lang = (searchParams.get("lang") || "").toLowerCase().startsWith("en") ? "en" : "pt";
  const t = STRINGS[lang];

  const [view, setView] = useState<View>("loading");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState({ morada: "", codigo_postal: "", localidade: "" });
  const [addressSaved, setAddressSaved] = useState(false);

  const durationMinutes = booking
    ? Math.max(
        15,
        Math.round(
          (new Date(booking.end_datetime).getTime() - new Date(booking.start_datetime).getTime()) / 60000,
        ),
      )
    : 60;

  const load = useCallback(async () => {
    if (!token) {
      setView("invalid");
      return;
    }
    setView("loading");
    try {
      const data = await callFn("get-booking", { token });
      if (data?.error) {
        if (data.code === "CANCELLED") {
          setBooking(null);
          setView("cancelled");
        } else {
          setView(errorViewFromCode(data.code));
        }
        return;
      }
      setBooking(data as Booking);
      setAddressForm({
        morada: data.address?.morada || "",
        codigo_postal: data.address?.codigo_postal || "",
        localidade: data.address?.localidade || "",
      });
      if (data.status === "cancelled") {
        setView("cancelled");
      } else {
        setView("view");
      }
    } catch {
      setView("invalid");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      const data = await callFn("cancel-booking", { token, lang });
      if (data?.success) {
        setConfirmCancelOpen(false);
        setView("cancelled");
      } else {
        setActionError(data?.error || t.cancelError);
      }
    } catch {
      setActionError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const data = await callFn("reschedule-booking", {
        token,
        slot_start: selectedSlot.start,
        slot_end: selectedSlot.end,
        lang,
      });
      if (data?.success) {
        setBooking((prev) =>
          prev
            ? {
                ...prev,
                start_datetime: data.new_start,
                end_datetime: data.new_end,
                formatted_when: data.formatted_when,
              }
            : prev,
        );
        setSelectedSlot(null);
        setView("rescheduled");
      } else if (data?.code === "SLOT_TAKEN") {
        setActionError(t.slotTakenError);
        setSelectedSlot(null);
      } else {
        setActionError(data?.error || t.rescheduleError);
      }
    } catch {
      setActionError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAddress = async () => {
    if (!addressForm.morada.trim()) {
      setActionError(t.addressEmpty);
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const data = await callFn("update-booking-address", {
        token,
        morada: addressForm.morada,
        codigo_postal: addressForm.codigo_postal,
        localidade: addressForm.localidade,
      });
      if (data?.success) {
        const composed = [
          addressForm.morada,
          addressForm.codigo_postal,
          addressForm.localidade,
        ]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(", ");
        setBooking((prev) =>
          prev
            ? {
                ...prev,
                location: composed,
                address: {
                  morada: addressForm.morada.trim(),
                  codigo_postal: addressForm.codigo_postal.trim(),
                  localidade: addressForm.localidade.trim(),
                },
              }
            : prev,
        );
        setAddressSaved(true);
      } else {
        setActionError(data?.error || t.addressError);
      }
    } catch {
      setActionError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3FBF8] to-white flex flex-col items-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-lg">
        {/* Brand header */}
        <div className="flex items-center gap-2.5 mb-6 justify-center sm:justify-start">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: PRIMARY }}
          >
            <CalendarClock className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-lg text-gray-800">{t.brand}</span>
        </div>

        <AnimatePresence mode="wait">
          {view === "loading" && (
            <motion.div
              key="loading"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden"
            >
              {/* Skeleton mirroring the confirmed-booking layout */}
              <div className="p-6 sm:p-7 space-y-5">
                <div className="space-y-2">
                  <div className="h-3.5 w-24 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-6 w-3/4 rounded-lg bg-gray-100 animate-pulse" />
                </div>
                <div className="space-y-3 rounded-xl bg-[#F3FBF8] p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 shrink-0 rounded-md bg-gray-200/70 animate-pulse" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-16 rounded-full bg-gray-200/70 animate-pulse" />
                        <div className="h-4 w-2/3 rounded-full bg-gray-200/70 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2 pt-1 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: PRIMARY }} />
                  <span className="text-sm">{t.loading}</span>
                </div>
              </div>
            </motion.div>
          )}

          {view === "view" && booking && (
            <motion.div
              key="view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6 sm:p-7 space-y-5">
                <div>
                  <p className="text-sm text-gray-500">
                    {booking.lead_name ? t.greetingWithName(booking.lead_name) : t.greeting}
                  </p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-1 leading-snug">
                    {t.viewTitle}
                  </h1>
                </div>

                <div className="space-y-3 rounded-xl bg-[#F3FBF8] p-4">
                  <DetailRow
                    icon={<CalendarClock className="h-5 w-5" style={{ color: PRIMARY }} />}
                    label={t.dateLabel}
                    value={<span className="capitalize">{booking.formatted_when}</span>}
                  />
                  {booking.technician_name && (
                    <DetailRow
                      icon={<User className="h-5 w-5" style={{ color: PRIMARY }} />}
                      label={t.technicianLabel}
                      value={booking.technician_name}
                    />
                  )}
                  {booking.location && (
                    <DetailRow
                      icon={<MapPin className="h-5 w-5" style={{ color: PRIMARY }} />}
                      label={t.locationLabel}
                      value={booking.location}
                    />
                  )}
                </div>

                {actionError && <ErrorNote message={actionError} />}

                <div className="flex flex-col gap-2.5 pt-1">
                  <Button
                    className="w-full min-h-[44px] h-11 text-white hover:brightness-95 shadow-sm"
                    style={{ backgroundColor: PRIMARY }}
                    onClick={() => {
                      setActionError(null);
                      setSelectedSlot(null);
                      setView("reschedule");
                    }}
                  >
                    <Clock className="h-4 w-4" />
                    {t.changeDate}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full min-h-[44px] h-11 border-gray-200 text-gray-700 hover:bg-[#F3FBF8] hover:text-gray-900 hover:border-[#85D3BE]"
                    onClick={() => {
                      setActionError(null);
                      setAddressSaved(false);
                      setAddressForm({
                        morada: booking.address?.morada || "",
                        codigo_postal: booking.address?.codigo_postal || "",
                        localidade: booking.address?.localidade || "",
                      });
                      setView("address");
                    }}
                  >
                    <Home className="h-4 w-4" />
                    {t.updateAddress}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full min-h-[44px] h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                    onClick={() => {
                      setActionError(null);
                      setConfirmCancelOpen(true);
                    }}
                  >
                    <CalendarX2 className="h-4 w-4" />
                    {t.cancelBooking}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {view === "reschedule" && booking && (
            <motion.div
              key="reschedule"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6 sm:p-7 space-y-5">
                <button
                  type="button"
                  aria-label={t.back}
                  onClick={() => {
                    setSelectedSlot(null);
                    setActionError(null);
                    setView("view");
                  }}
                  className="inline-flex items-center gap-1.5 -ml-1 px-1 min-h-[44px] text-sm text-gray-500 hover:text-gray-800 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#85D3BE]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t.back}
                </button>

                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug">
                    {t.rescheduleTitle}
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {t.currentDate} <span className="capitalize">{booking.formatted_when}</span>
                  </p>
                </div>

                {/* Progress indicator for the reschedule flow */}
                <RescheduleProgress
                  step={selectedSlot ? 2 : 1}
                  submitting={submitting}
                  labels={{ pick: t.stepPick, confirm: t.stepConfirm }}
                />

                {booking.board_id ? (
                  <>
                    <p className="text-sm text-gray-500" aria-live="polite">
                      {selectedSlot ? t.slotSelectedHint : t.pickHint}
                    </p>
                    <SchedulingStep
                      formId={booking.form_id || ""}
                      stepNumber={booking.step_number ?? 1}
                      boardId={booking.board_id}
                      durationMinutes={durationMinutes}
                      primaryColor={PRIMARY}
                      textColor="#1F2937"
                      buttonTextColor="#ffffff"
                      borderRadius="12px"
                      selectedSlot={selectedSlot}
                      onSlotSelected={setSelectedSlot}
                    />
                  </>
                ) : (
                  <p className="text-sm text-gray-500">{t.noAutoReschedule}</p>
                )}

                {actionError && <ErrorNote message={actionError} />}

                <Button
                  className="w-full min-h-[44px] h-11 text-white hover:brightness-95 disabled:opacity-50 shadow-sm"
                  style={{ backgroundColor: PRIMARY }}
                  disabled={!selectedSlot || submitting}
                  onClick={handleReschedule}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t.confirming}
                    </>
                  ) : (
                    t.confirmNewSlot
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {view === "address" && booking && (
            <motion.div
              key="address"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6 sm:p-7 space-y-5">
                <button
                  type="button"
                  aria-label={t.back}
                  onClick={() => {
                    setActionError(null);
                    setAddressSaved(false);
                    setView("view");
                  }}
                  className="inline-flex items-center gap-1.5 -ml-1 px-1 min-h-[44px] text-sm text-gray-500 hover:text-gray-800 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#85D3BE]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t.back}
                </button>

                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug">
                    {t.addressTitle}
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">{t.addressHint}</p>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!submitting) handleUpdateAddress();
                  }}
                >
                  <AddressField
                    id="addr-morada"
                    label={t.fieldMorada}
                    placeholder={t.placeholderMorada}
                    value={addressForm.morada}
                    autoComplete="street-address"
                    onChange={(v) => {
                      setAddressSaved(false);
                      setActionError(null);
                      setAddressForm((p) => ({ ...p, morada: v }));
                    }}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <AddressField
                      id="addr-postal"
                      label={t.fieldPostal}
                      placeholder={t.placeholderPostal}
                      value={addressForm.codigo_postal}
                      autoComplete="postal-code"
                      onChange={(v) => {
                        setAddressSaved(false);
                        setActionError(null);
                        setAddressForm((p) => ({ ...p, codigo_postal: v }));
                      }}
                    />
                    <AddressField
                      id="addr-localidade"
                      label={t.fieldLocalidade}
                      placeholder={t.placeholderLocalidade}
                      value={addressForm.localidade}
                      autoComplete="address-level2"
                      onChange={(v) => {
                        setAddressSaved(false);
                        setActionError(null);
                        setAddressForm((p) => ({ ...p, localidade: v }));
                      }}
                    />
                  </div>

                  {actionError && <ErrorNote message={actionError} />}
                  {addressSaved && !actionError && (
                    <p
                      role="status"
                      aria-live="polite"
                      className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: PRIMARY }} />
                      {t.addressSaved}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full min-h-[44px] h-11 text-white hover:brightness-95 disabled:opacity-50 shadow-sm"
                    style={{ backgroundColor: PRIMARY }}
                    disabled={submitting || !addressForm.morada.trim()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t.savingAddress}
                      </>
                    ) : (
                      t.saveAddress
                    )}
                  </Button>
                </form>
              </div>
            </motion.div>
          )}

          {view === "rescheduled" && booking && (
            <StatusCard
              key="rescheduled"
              tone="success"
              icon={<CheckCircle2 className="h-8 w-8" style={{ color: PRIMARY }} />}
              title={t.rescheduledTitle}
              description={t.rescheduledDesc(booking.formatted_when)}
              footer={
                <Button
                  variant="outline"
                  className="w-full min-h-[44px] h-11"
                  onClick={() => {
                    setActionError(null);
                    setView("view");
                  }}
                >
                  {t.viewBooking}
                </Button>
              }
            />
          )}

          {view === "cancelled" && (
            <StatusCard
              key="cancelled"
              tone="neutral"
              icon={<XCircle className="h-8 w-8 text-gray-400" />}
              title={t.cancelledTitle}
              description={t.cancelledDesc}
            />
          )}

          {view === "expired" && (
            <StatusCard
              key="expired"
              tone="neutral"
              icon={<Clock className="h-8 w-8 text-gray-400" />}
              title={t.expiredTitle}
              description={t.expiredDesc}
            />
          )}

          {view === "used" && (
            <StatusCard
              key="used"
              tone="neutral"
              icon={<CheckCircle2 className="h-8 w-8 text-gray-400" />}
              title={t.usedTitle}
              description={t.usedDesc}
            />
          )}

          {view === "invalid" && (
            <StatusCard
              key="invalid"
              tone="neutral"
              icon={<XCircle className="h-8 w-8 text-gray-400" />}
              title={t.invalidTitle}
              description={t.invalidDesc}
            />
          )}
        </AnimatePresence>

        <p className="text-center text-xs text-gray-400 mt-6 px-2 leading-relaxed">{t.footer}</p>
      </div>

      {/* Cancel confirmation */}
      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmCancelTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmCancelDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <ErrorNote message={actionError} />}
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={submitting} className="min-h-[44px] mt-0">
              {t.keepBooking}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={submitting}
              className="min-h-[44px] bg-red-600 hover:bg-red-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.cancelling}
                </>
              ) : (
                t.yesCancel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RescheduleProgress({
  step,
  submitting,
  labels,
}: {
  step: 1 | 2;
  submitting: boolean;
  labels: { pick: string; confirm: string };
}) {
  const pickDone = step >= 2;
  const confirmActive = step >= 2;
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={2}
      aria-valuenow={step}
      aria-label={`${labels.pick} / ${labels.confirm}`}
      className="rounded-xl bg-[#F3FBF8] px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <ProgressNode index={1} label={labels.pick} state={pickDone ? "done" : "active"} />
        <div className="relative h-1 flex-1 rounded-full bg-gray-200 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: PRIMARY }}
            initial={false}
            animate={{ width: pickDone ? "100%" : "0%" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        </div>
        <ProgressNode
          index={2}
          label={labels.confirm}
          state={confirmActive ? (submitting ? "active" : "active") : "idle"}
        />
      </div>
    </div>
  );
}

function ProgressNode({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: "idle" | "active" | "done";
}) {
  const done = state === "done";
  const active = state === "active";
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors"
        style={{
          backgroundColor: done || active ? PRIMARY : "#E5E7EB",
          color: done || active ? "#ffffff" : "#6B7280",
        }}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : index}
      </div>
      <span
        className={`text-xs font-medium transition-colors ${
          done || active ? "text-gray-800" : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
    >
      {message}
    </p>
  );
}

function AddressField({
  id,
  label,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-gray-500">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 transition-colors focus:outline-none focus:border-[#85D3BE] focus:ring-2 focus:ring-[#85D3BE]/40"
      />
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-800 break-words">{value}</p>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
  footer,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  footer?: React.ReactNode;
  tone: "success" | "neutral";
}) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-7 sm:p-8 text-center space-y-4">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: tone === "success" ? "#85D3BE20" : "#F3F4F6" }}
        >
          {icon}
        </motion.div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </div>
        {footer && <div className="pt-2">{footer}</div>}
      </div>
    </motion.div>
  );
}
