// Shared SMS transport via SMSAPI (https://www.smsapi.com), reusing the same
// account/token already configured and paid for by sms-otp (contract-signing
// OTP) -- see supabase/functions/sms-otp/index.ts for the original call this
// mirrors. Fail-soft by design: the caller decides what "failed" means for
// its own flow (book-slot logs and moves on, same as its email sending).
export async function sendSmsNow(params: {
  toPhone: string; // "+351912345678" (indicativo incluido, ver PhoneInput/PublicLeadForm)
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const smsApiToken = Deno.env.get("SMSAPI_TOKEN");
  if (!smsApiToken) {
    return { ok: false, error: "SMSAPI_TOKEN not configured" };
  }

  const cleanPhone = params.toPhone.replace(/[^0-9]/g, "");
  if (!cleanPhone) {
    return { ok: false, error: "empty phone number" };
  }

  try {
    // SMSAPI_SENDER_NAME: nome de remetente ja verificado no painel da
    // SMSAPI (partilhado por toda a Olyvia, mesma conta do sms-otp). Sem
    // isto, a chamada nao dizia qual remetente usar e caia sozinha no
    // generico "Test". Testado ao vivo 22/09: usar este remetente verificado
    // NAO desbloqueia SMS com link (erro 94 continua igual) -- e mesmo assim
    // vale a pena, o SMS chega identificado com o nome da empresa em vez de
    // "Test" nos SMS sem link, que ja passavam. Omitido quando o segredo nao
    // existe, para nao partir contas que ainda nao tenham remetente nenhum.
    const senderName = Deno.env.get("SMSAPI_SENDER_NAME");
    const res = await fetch("https://api.smsapi.com/sms.do", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${smsApiToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        to: cleanPhone,
        message: params.message,
        format: "json",
        encoding: "utf-8",
        ...(senderName ? { from: senderName } : {}),
      }),
    });

    const result = await res.json();
    if (result.error) {
      return { ok: false, error: `SMSAPI ${result.error}: ${result.message ?? ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
