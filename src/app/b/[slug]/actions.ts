"use server";

import { createClient } from "@/lib/supabase/server";

export type LeadFormState = {
  error?: string;
  success?: string;
};

export async function submitLead(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const businessId = String(formData.get("business_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  // Honeypot field — bots fill it, humans never see it
  const website = String(formData.get("website") ?? "");

  if (website) {
    // Silently accept bot submissions without storing them
    return { success: "Thanks! Your message has been sent." };
  }

  if (!businessId || !name) {
    return { error: "Please tell us your name." };
  }
  if (!email && !phone) {
    return { error: "Leave an email or a phone number so they can reach you." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("leads").insert({
    business_id: businessId,
    name: name.slice(0, 200),
    email: email.slice(0, 320) || null,
    phone: phone.slice(0, 50) || null,
    message: message.slice(0, 2000) || null,
  });

  if (error) {
    return { error: "Something went wrong — please try again." };
  }

  return { success: "Thanks! Your message has been sent." };
}
