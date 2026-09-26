// Athena's free help guide: common "how do I…" questions answered from
// this list, with NO AI call and NO credit used. Anything that doesn't
// match with confidence goes to the AI as before.
//
// Pure (no imports) so `npm test` can load it (help-faq.test.ts).
//
// Matching, no AI:
//   - the question must look like a question about the app (how / where /
//     can I / what / help …), so "Draft a payment reminder" still goes to
//     the AI;
//   - each entry has 1-3 word groups; EVERY group must match (a word, a
//     phrase, a word with a small typo, or a plural);
//   - the entry that matches the most groups wins; ties go to the first.

export type FaqEntry = {
  id: string;
  q: string;
  a: string;
  keys: string[][];
};

export const FAQ: FaqEntry[] = [
  {
    id: "add-customer",
    q: "How do I add a customer?",
    a: "Go to **People → Customers** and press **New customer**. Type their name (email and phone are optional) and save. Their page opens right away.",
    keys: [["add", "create", "new", "save", "enter", "put"], ["customer", "client"]],
  },
  {
    id: "add-lead",
    q: "How do I add a lead?",
    a: "Go to **People → Leads** and fill in **Log outreach** at the top: their name, how you reached them and a follow-up date. People who fill in your public page show up here too.",
    keys: [["add", "create", "new", "log", "save"], ["lead", "prospect", "outreach"]],
  },
  {
    id: "convert-lead",
    q: "How do I turn a lead into a customer?",
    a: "Open the lead (**People → Leads**, tap their name) and press **Add to customers**. Their emails and notes move over with them.",
    keys: [["convert", "turn", "move", "change", "make", "upgrade"], ["lead"], ["customer", "client"]],
  },
  {
    id: "create-invoice",
    q: "How do I make an invoice?",
    a: "Go to **Money → Invoices** and press **New invoice** (or **Add invoice** on a customer's page). Add the lines and prices, then **Create**. You can print it or save it as a PDF.",
    keys: [["create", "make", "new", "add", "write", "build"], ["invoice", "bill"]],
  },
  {
    id: "send-invoice",
    q: "How do I send an invoice?",
    a: "Open the invoice (**Money → Invoices**) and press **Send by email**, or use **Send invoice** on the customer's page. The message is written for you with a view link. If your plan can't send from Jephelen, press **Open in my email**, then **Mark as sent**.",
    keys: [["send", "email", "share", "mail"], ["invoice", "bill"]],
  },
  {
    id: "quote",
    q: "How do I make a quote?",
    a: "Go to **Money → Invoices → New invoice** and switch the type to **Quote**. It gets its own number (QUO-0001) and counts with your invoices.",
    keys: [["quote", "estimate", "quotation", "proposal"]],
  },
  {
    id: "invoice-paid",
    q: "How do I mark an invoice as paid?",
    a: "Open **Money → Invoices**, open the invoice and change its status to **Paid**. The money shows up in **In & Out** by itself.",
    keys: [["paid", "payment", "pay"], ["invoice", "bill", "mark"]],
  },
  {
    id: "book-meeting",
    q: "How do I book a meeting?",
    a: "On a contact's page press **Book meeting**, or go to **Work → Calendar** and use **Add meeting** at the bottom. It shows on the calendar and on their timeline.",
    keys: [["book", "schedule", "set", "add", "make", "plan", "create"], ["meeting", "appointment", "call", "event"]],
  },
  {
    id: "calendar",
    q: "Where is my calendar?",
    a: "**Work → Calendar**. Switch between **Month** and **Week**, and tap anything on it to open it.",
    keys: [["calendar", "agenda", "schedule"]],
  },
  {
    id: "add-task",
    q: "How do I add a task?",
    a: "Go to **Work → Tasks** and type it in the box at the top. Add a due date and a customer if you like. Move it along as you work: To Do → In Progress → Done.",
    keys: [["add", "create", "new", "make"], ["task", "todo", "reminder"]],
  },
  {
    id: "theme",
    q: "How do I change the theme?",
    a: "Go to **Settings → Theme** and tap a look: Clean, Dark, Woshi Neon or Retro. Neon and Retro come with **Hustle** and **Boss**. The moon button in the top bar flips light and dark.",
    keys: [["theme", "themes", "dark mode", "light mode", "neon", "retro", "color", "colour", "colors", "appearance", "dark"]],
  },
  {
    id: "upgrade",
    q: "How do I upgrade my plan?",
    a: "Go to **Settings → Plan** and press **Upgrade** on **Hustle** ($5 every 4 weeks) or **Boss** ($15 every 4 weeks). You pay with a card on a secure page.",
    keys: [["upgrade", "hustle", "boss plan", "pricing", "my plan", "subscribe", "premium", "how much does", "paid plan", "more customers"]],
  },
  {
    id: "cancel",
    q: "How do I cancel or change my plan?",
    a: "Go to **Settings → Plan** and press **Manage billing**. There you can switch plans, update your card or cancel. You keep your data.",
    keys: [["cancel", "downgrade", "stop", "change", "switch"], ["plan", "subscription", "billing", "paying", "card"]],
  },
  {
    id: "limits",
    q: "What are the plan limits?",
    a: "**Starter** (free): 10 customers + leads, 5 invoices every 4 weeks, 50 MB of files. **Hustle** ($5): 150, 50 invoices, 1 GB, 50 emails a day. **Boss** ($15): no limits on contacts or invoices, 10 GB, 200 emails a day. See **Settings → Plan** for your usage.",
    keys: [["limit", "limits", "usage", "allowed", "maximum", "max", "how many"]],
  },
  {
    id: "export",
    q: "How do I export my data?",
    a: "Go to **Money → In & Out** and press **Export CSV** for your income and expenses. Invoices can be printed or saved as PDF from each invoice.",
    keys: [["export", "download", "csv", "backup", "excel", "spreadsheet"]],
  },
  {
    id: "upload",
    q: "How do I upload a file for a customer?",
    a: "Open the customer's page and press **Upload file** (or scroll to **Documents**). PDF, pictures, Word and Excel files up to 10 MB. Only you can see them.",
    keys: [["upload", "attach", "file", "document", "pdf", "photo", "picture"]],
  },
  {
    id: "receipt",
    q: "How do I add a receipt?",
    a: "Go to **Money → In & Out**, add the expense and attach the receipt (a photo or PDF) in the same form.",
    keys: [["receipt"]],
  },
  {
    id: "expense",
    q: "How do I log income or an expense?",
    a: "Go to **Money → In & Out**, pick **Income** or **Expense**, type the amount and a category, and save. Tick **Repeats monthly** for things like rent or software.",
    keys: [["log", "add", "record", "track", "enter"], ["expense", "income", "spending", "spent", "money", "cost", "sale"]],
  },
  {
    id: "send-email",
    q: "How do I send an email to a customer?",
    a: "Open their page and press **Send email**. If there's no Send button on your plan, use **Open in my email**: it opens your own email app with everything filled in.",
    keys: [["send", "write", "email", "mail", "message"], ["email", "mail", "customer", "client", "lead"]],
  },
  {
    id: "ai-message",
    q: "How do I write a message with AI?",
    a: "Go to **AI → Messages** (or press **Write message (AI)** on a contact). Pick the type and tone, press **Generate**, then **Copy**, **Send** or **Open in my email**. Each one uses 1 AI credit.",
    keys: [["ai", "generate", "draft", "write"], ["message", "email", "text", "follow"]],
  },
  {
    id: "login-email",
    q: "How do I change my login email?",
    a: "Go to **Settings → Login email**, type the new address and confirm the links we send to both inboxes.",
    keys: [["change", "update", "new", "edit"], ["login", "log in", "sign in", "my email", "account email", "my account"]],
  },
  {
    id: "password",
    q: "How do I reset my password?",
    a: "Sign out, then on the login page press **Forgot password?** and follow the email we send you.",
    keys: [["password", "forgot", "reset"]],
  },
  {
    id: "public-page",
    q: "How do I get a public page for my business?",
    a: "Go to **Settings → Public page**, turn it on and pick your link. Visitors can send you a request there and it lands in **People → Leads**.",
    keys: [["public page", "public", "booking page", "lead form", "my page", "business page"]],
  },
  {
    id: "payment-methods",
    q: "How do customers pay me?",
    a: "Add how you get paid (Zelle, PayPal, bank, …) in **Settings → Payments**. They print on your invoices so customers know how to pay.",
    keys: [["zelle", "paypal", "payment method", "payments", "get paid", "pay me", "venmo", "cash app"]],
  },
  {
    id: "business-lines",
    q: "What are business lines?",
    a: "If you run more than one business, give each contact, task and invoice a **Business**. Then filter every list by it. Starter has 1 line, Hustle 3, Boss unlimited.",
    keys: [["business line", "business lines", "second business", "another business", "two businesses", "more than one business"]],
  },
  {
    id: "credits",
    q: "What are AI credits?",
    a: "Each AI answer or draft uses 1 credit. You get 10 a day on Starter, 100 on Hustle and 500 on Boss, reset at midnight UTC. Answers from this help guide are free.",
    keys: [["credit", "credits", "ai limit", "tokens"]],
  },
  {
    id: "tour",
    q: "Can you show me around again?",
    a: "Press the **?** button in the top bar and the welcome tour starts again.",
    keys: [["tour", "show me around", "walkthrough", "guide", "tutorial", "get started", "getting started"]],
  },
  {
    id: "delete",
    q: "How do I delete a customer or lead?",
    a: "Open their page, scroll to **Edit details** at the bottom and press **Delete**. This can't be undone.",
    keys: [["delete", "remove", "erase"], ["customer", "client", "lead", "contact"]],
  },
  {
    id: "time",
    q: "How do I track my hours?",
    a: "Go to **Money → Time & Billing**, log the hours for a customer, then bill them on an invoice.",
    keys: [["hours", "time", "timer", "timesheet"], ["track", "log", "bill", "record", "add"]],
  },
  {
    id: "tax",
    q: "How much tax should I set aside?",
    a: "**Money → Tax Center** gives an estimate of what to put aside and shows expenses with no receipt. It's a guide, not tax advice.",
    keys: [["tax", "taxes", "irs"]],
  },
  {
    id: "assistant",
    q: "How do I connect an assistant or bot?",
    a: "On **Hustle** or **Boss**: go to **Settings → Assistant access**, name a key, tick what it may do and press **Create key**. Copy it once; it isn't shown again.",
    keys: [["api", "api key", "assistant access", "bot", "discord", "integration", "zapier"]],
  },
];

// Words that say "this is a question about using the app".
const QUESTION_RE =
  /\b(how|where|what|why|when|can i|can you|could i|do i|does|is there|help|where's|how's|i want to|i need to|i can't|cant|won't)\b|\?\s*$/i;

// "Draft / write me / compose …" without a question: that's work for the AI.
const TASK_RE = /^\s*(please\s+)?(draft|write|compose|generate|make me|create me|rewrite|summari[sz]e|translate)\b/i;

function normalize(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function stem(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es") && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  return w;
}

// One edit apart (a typo), for words of 5+ letters.
function nearlySame(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function groupMatches(text: string, words: string[], group: string[]) {
  return group.some((key) => {
    const k = normalize(key).trim();
    if (k.includes(" ")) return text.includes(` ${k} `);
    const sk = stem(k);
    return words.some((w) => w === k || stem(w) === sk || nearlySame(stem(w), sk));
  });
}

export type FaqMatch = { entry: FaqEntry; score: number };

// Best confident match for a question, or null (then ask the AI).
export function matchFaq(question: string): FaqMatch | null {
  const raw = String(question ?? "").slice(0, 400);
  if (!raw.trim()) return null;
  const wordCount = raw.trim().split(/\s+/).length;
  if (wordCount > 25) return null; // a long, specific question: AI
  if (TASK_RE.test(raw) && !/\b(how|where)\b/i.test(raw)) return null;
  if (!QUESTION_RE.test(raw)) return null;

  const text = normalize(raw);
  const words = text.trim().split(" ");
  let best: FaqMatch | null = null;
  for (const entry of FAQ) {
    if (!entry.keys.every((g) => groupMatches(text, words, g))) continue;
    const score = entry.keys.length;
    if (!best || score > best.score) best = { entry, score };
  }
  return best;
}

export const FAQ_BADGE = "📘 From the help guide";
