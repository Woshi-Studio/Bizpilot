// Quick templates: free, no AI. Chips that fill a subject + message with
// the contact's name, the business, amounts and dates. Users can change
// them or add their own (Settings → Templates, message_templates, 0017).
// Pure (no imports) so `npm test` can load it (templates.test.ts).

export type TemplateLang = "en" | "fr";

export type Template = {
  key: string; // built-in key, or "custom-<id>"
  name: string;
  subject: string;
  body: string;
  lang: TemplateLang;
  builtIn: boolean;
  id?: string; // saved row id
};

export type TemplateVars = {
  first_name?: string;
  name?: string;
  business?: string;
  my_name?: string;
  amount?: string;
  invoice_number?: string;
  due_date?: string;
  date?: string;
  time?: string;
  link?: string;
};

type Def = { key: string; name: string; subject: string; body: string };

const EN: Def[] = [
  {
    key: "follow_up",
    name: "Follow-up",
    subject: "Following up",
    body: "Hi {first_name},\n\nJust following up on our last conversation. Do you have any questions, or would you like to go ahead?\n\nThanks,\n{my_name}",
  },
  {
    key: "thanks_call",
    name: "Thanks for the call",
    subject: "Thanks for the call",
    body: "Hi {first_name},\n\nThanks for taking the time to talk today. As promised, here is a quick summary and the next steps:\n\n- \n\nTalk soon,\n{my_name}",
  },
  {
    key: "reminder_friendly",
    name: "Payment reminder (friendly)",
    subject: "Friendly reminder: invoice {invoice_number}",
    body: "Hi {first_name},\n\nA friendly reminder that invoice {invoice_number} for {amount} was due on {due_date}. If it's already on its way, thank you and please ignore this!\n\n{link}\n\nThanks,\n{my_name}",
  },
  {
    key: "reminder_firm",
    name: "Payment reminder (firm)",
    subject: "Overdue: invoice {invoice_number}",
    body: "Hi {first_name},\n\nInvoice {invoice_number} for {amount} is now past due (it was due {due_date}). Please send payment this week, or let me know today if something is holding it up.\n\n{link}\n\nThank you,\n{my_name}",
  },
  {
    key: "quote_attached",
    name: "Quote attached",
    subject: "Your quote from {business}",
    body: "Hi {first_name},\n\nHere is your quote for {amount}. You can view it here: {link}\n\nHappy to adjust anything. Just reply to this email.\n\nThanks,\n{my_name}",
  },
  {
    key: "invoice_attached",
    name: "Invoice attached",
    subject: "Invoice {invoice_number} from {business}",
    body: "Hi {first_name},\n\nHere is invoice {invoice_number} for {amount}, due {due_date}. You can view it here: {link}\n\nThank you for your business!\n{my_name}",
  },
  {
    key: "meeting_confirm",
    name: "Meeting confirmation",
    subject: "Confirmed: our meeting on {date}",
    body: "Hi {first_name},\n\nThis confirms our meeting on {date} at {time}. If anything changes, just reply here.\n\nSee you then,\n{my_name}",
  },
  {
    key: "reschedule",
    name: "Reschedule",
    subject: "Can we move our meeting?",
    body: "Hi {first_name},\n\nSomething came up and I need to move our meeting on {date}. Would one of these work for you instead?\n\n- \n- \n\nSorry for the change,\n{my_name}",
  },
  {
    key: "welcome",
    name: "Welcome new client",
    subject: "Welcome to {business}!",
    body: "Hi {first_name},\n\nWelcome aboard! I'm glad to be working with you. Here is what happens next:\n\n1. \n2. \n\nIf you have any questions, just reply to this email.\n\n{my_name}",
  },
  {
    key: "job_finished",
    name: "Job finished",
    subject: "All done!",
    body: "Hi {first_name},\n\nGood news: the work is finished. Please take a look and let me know if you'd like any changes.\n\nThank you for choosing {business}!\n{my_name}",
  },
  {
    key: "review_request",
    name: "Review request",
    subject: "A quick favour?",
    body: "Hi {first_name},\n\nIt was a pleasure working with you. If you were happy with the work, would you leave a short review? It really helps a small business like mine.\n\n{link}\n\nThank you!\n{my_name}",
  },
];

const FR: Def[] = [
  { key: "follow_up", name: "Relance", subject: "Petit suivi", body: "Bonjour {first_name},\n\nJe fais suite à notre dernier échange. Avez-vous des questions, ou souhaitez-vous aller de l'avant ?\n\nMerci,\n{my_name}" },
  { key: "thanks_call", name: "Merci pour l'appel", subject: "Merci pour l'appel", body: "Bonjour {first_name},\n\nMerci d'avoir pris le temps de parler aujourd'hui. Comme promis, voici un résumé et les prochaines étapes :\n\n- \n\nÀ bientôt,\n{my_name}" },
  { key: "reminder_friendly", name: "Rappel de paiement (amical)", subject: "Petit rappel : facture {invoice_number}", body: "Bonjour {first_name},\n\nPetit rappel : la facture {invoice_number} de {amount} était due le {due_date}. Si le paiement est déjà en route, merci et ignorez ce message !\n\n{link}\n\nMerci,\n{my_name}" },
  { key: "reminder_firm", name: "Rappel de paiement (ferme)", subject: "En retard : facture {invoice_number}", body: "Bonjour {first_name},\n\nLa facture {invoice_number} de {amount} est en retard (échéance : {due_date}). Merci d'envoyer le paiement cette semaine, ou dites-moi aujourd'hui si quelque chose bloque.\n\n{link}\n\nMerci,\n{my_name}" },
  { key: "quote_attached", name: "Devis", subject: "Votre devis de {business}", body: "Bonjour {first_name},\n\nVoici votre devis de {amount}. Vous pouvez le consulter ici : {link}\n\nJe peux l'ajuster au besoin, il suffit de répondre à ce courriel.\n\nMerci,\n{my_name}" },
  { key: "invoice_attached", name: "Facture", subject: "Facture {invoice_number} de {business}", body: "Bonjour {first_name},\n\nVoici la facture {invoice_number} de {amount}, due le {due_date}. Vous pouvez la consulter ici : {link}\n\nMerci de votre confiance !\n{my_name}" },
  { key: "meeting_confirm", name: "Confirmation de rendez-vous", subject: "Confirmé : notre rendez-vous du {date}", body: "Bonjour {first_name},\n\nJe confirme notre rendez-vous le {date} à {time}. Si quelque chose change, répondez simplement à ce courriel.\n\nÀ bientôt,\n{my_name}" },
  { key: "reschedule", name: "Reporter", subject: "Pouvons-nous déplacer notre rendez-vous ?", body: "Bonjour {first_name},\n\nUn imprévu m'oblige à déplacer notre rendez-vous du {date}. L'une de ces options vous conviendrait-elle ?\n\n- \n- \n\nDésolé(e) pour le changement,\n{my_name}" },
  { key: "welcome", name: "Bienvenue", subject: "Bienvenue chez {business} !", body: "Bonjour {first_name},\n\nBienvenue ! Je suis ravi(e) de travailler avec vous. Voici la suite :\n\n1. \n2. \n\nPour toute question, répondez simplement à ce courriel.\n\n{my_name}" },
  { key: "job_finished", name: "Travail terminé", subject: "C'est terminé !", body: "Bonjour {first_name},\n\nBonne nouvelle : le travail est terminé. Jetez un œil et dites-moi si vous souhaitez des changements.\n\nMerci d'avoir choisi {business} !\n{my_name}" },
  { key: "review_request", name: "Demande d'avis", subject: "Un petit service ?", body: "Bonjour {first_name},\n\nCe fut un plaisir de travailler avec vous. Si vous êtes satisfait(e), pourriez-vous laisser un court avis ? Cela aide beaucoup une petite entreprise comme la mienne.\n\n{link}\n\nMerci !\n{my_name}" },
];

export const BUILT_IN: Record<TemplateLang, Def[]> = { en: EN, fr: FR };

export type SavedTemplate = {
  id: string;
  key: string;
  lang: string;
  name: string;
  subject: string;
  body: string;
};

// Built-ins (with any saved changes) then the user's own, for one language.
export function mergeTemplates(saved: SavedTemplate[], lang: TemplateLang = "en"): Template[] {
  const mine = saved.filter((s) => (s.lang === "fr" ? "fr" : "en") === lang);
  const builtIns = BUILT_IN[lang].map((d) => {
    const o = mine.find((s) => s.key === d.key);
    return o
      ? { key: d.key, name: o.name || d.name, subject: o.subject, body: o.body, lang, builtIn: true, id: o.id }
      : { ...d, lang, builtIn: true };
  });
  const custom = mine
    .filter((s) => !BUILT_IN[lang].some((d) => d.key === s.key))
    .map((s) => ({ key: s.key, name: s.name, subject: s.subject, body: s.body, lang, builtIn: false, id: s.id }));
  return [...builtIns, ...custom];
}

// Fills {placeholders}. A missing value leaves a short blank so the user
// sees what to type; a missing {link} line is dropped.
export function fillTemplate(text: string, vars: TemplateVars): string {
  let out = text;
  if (!vars.link) out = out.replace(/\n?[^\n]*\{link\}[^\n]*\n?/g, "\n");
  return out
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = (vars as Record<string, string | undefined>)[k];
      if (v) return v;
      if (k === "first_name") return "there";
      return "___";
    })
    .replace(/\n{3,}/g, "\n\n");
}

// ------------------------------------------------------------------
// Quick activity types (the timeline "Add activity" form)
// ------------------------------------------------------------------
export const QUICK_ACTIVITIES: {
  label: string;
  kind: "call" | "email_sent" | "meeting" | "note";
  subject: string;
  followUpDays?: number;
}[] = [
  { label: "Called: left voicemail", kind: "call", subject: "Called: left a voicemail", followUpDays: 2 },
  { label: "Called: spoke, follow up in 3 days", kind: "call", subject: "Called: we spoke", followUpDays: 3 },
  { label: "Emailed", kind: "email_sent", subject: "Emailed" },
  { label: "Meeting booked", kind: "meeting", subject: "Meeting booked" },
];

// ------------------------------------------------------------------
// Quick date / time chips
// ------------------------------------------------------------------
export type QuickDate = { label: string; date: string; time?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Uses the browser's own calendar (local time).
export function quickDates(now: Date = new Date()): QuickDate[] {
  const at = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  return [
    { label: "Today 4pm", date: at(0), time: "16:00" },
    { label: "Tomorrow 10am", date: at(1), time: "10:00" },
    { label: "Next Monday 9am", date: at(daysToMonday), time: "09:00" },
    { label: "In 3 days", date: at(3) },
    { label: "In 1 week", date: at(7) },
    { label: "In 2 weeks", date: at(14) },
  ];
}
