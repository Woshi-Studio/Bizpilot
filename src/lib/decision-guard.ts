// Decision Guard — rule-based risk engine.
// Each answer option carries risk points; advice strings attach to risky
// answers and become the recommendation list.

export type DecisionType =
  | "discount"
  | "deal"
  | "expense"
  | "refund"
  | "pricing";

export const DECISION_TYPES: {
  value: DecisionType;
  label: string;
  emoji: string;
  blurb: string;
}[] = [
  {
    value: "discount",
    label: "Give a discount",
    emoji: "🏷️",
    blurb: "A client wants a lower price",
  },
  {
    value: "deal",
    label: "Take on a deal",
    emoji: "🤝",
    blurb: "A new project or client offer",
  },
  {
    value: "expense",
    label: "Big purchase",
    emoji: "💸",
    blurb: "Equipment, software, courses...",
  },
  {
    value: "refund",
    label: "Give a refund",
    emoji: "↩️",
    blurb: "A client wants money back",
  },
  {
    value: "pricing",
    label: "Set a price",
    emoji: "💰",
    blurb: "Pricing a new service or quote",
  },
];

export type QuestionOption = {
  value: string;
  label: string;
  points: number;
  advice?: string;
};

export type Question = {
  id: string;
  text: string;
  options: QuestionOption[];
};

const YN = (
  yesPoints: number,
  noPoints: number,
  extras?: { yesAdvice?: string; noAdvice?: string; unsurePoints?: number; unsureAdvice?: string }
): QuestionOption[] => [
  { value: "yes", label: "Yes", points: yesPoints, advice: extras?.yesAdvice },
  { value: "no", label: "No", points: noPoints, advice: extras?.noAdvice },
  {
    value: "unsure",
    label: "Not sure",
    points: extras?.unsurePoints ?? Math.max(yesPoints, noPoints) - 1,
    advice: extras?.unsureAdvice,
  },
];

const PRESSURE: Question = {
  id: "pressure",
  text: "Are you making this decision under time pressure?",
  options: YN(2, 0, {
    yesAdvice:
      "Pressure is where bad deals live. Tell them you'll confirm tomorrow — anyone who can't wait 24 hours is a red flag.",
    unsureAdvice:
      "If you can't tell whether you're being rushed, you probably are. Sleep on it.",
  }),
};

export const QUESTIONS: Record<DecisionType, Question[]> = {
  discount: [
    {
      id: "margin",
      text: "After this discount, do you still make a decent profit?",
      options: YN(0, 3, {
        noAdvice:
          "Never discount below your margin — losing money to keep a client is not keeping a client, it's paying for one.",
        unsurePoints: 2,
        unsureAdvice:
          "Calculate your real cost (including your hours) before saying yes. If you don't know your margin, you can't protect it.",
      }),
    },
    {
      id: "asked",
      text: "Did they actually ask for a discount, or are you offering one preemptively?",
      options: [
        { value: "asked", label: "They asked", points: 0 },
        {
          value: "offering",
          label: "I'm offering",
          points: 2,
          advice:
            "You're negotiating against yourself. Quote full price first — most clients pay it.",
        },
      ],
    },
    {
      id: "returning",
      text: "Is this a returning customer?",
      options: YN(0, 1, {
        noAdvice:
          "Discounting for a brand-new customer sets their price expectation forever. Consider adding value (a small extra) instead of cutting price.",
      }),
    },
    {
      id: "size",
      text: "Is the discount more than 20%?",
      options: YN(2, 0, {
        yesAdvice:
          "Over 20% signals your original price wasn't real. Counter with a smaller discount tied to something — faster payment, a testimonial, more work.",
      }),
    },
    PRESSURE,
  ],
  deal: [
    {
      id: "scope",
      text: "Is the scope of work written down and agreed?",
      options: YN(0, 3, {
        noAdvice:
          "No written scope = unlimited free revisions. Send a one-paragraph summary of what's included before you say yes.",
        unsurePoints: 2,
        unsureAdvice: "Vague scope grows. Pin it down in writing first.",
      }),
    },
    {
      id: "deposit",
      text: "Are you getting a deposit before starting?",
      options: YN(0, 2, {
        noAdvice:
          "A deposit (even 25%) filters out clients who were never going to pay. Make it standard.",
      }),
    },
    {
      id: "capacity",
      text: "Can you fit this in without hurting your current clients?",
      options: YN(0, 2, {
        noAdvice:
          "Overbooking burns your best clients to serve your newest one. Consider a later start date or a rush fee.",
        unsureAdvice:
          "Map your next two weeks before committing. 'Probably' is how deadlines die.",
      }),
    },
    {
      id: "redflags",
      text: "Any red flags so far? (haggling hard, vague answers, 'this should be quick')",
      options: YN(3, 0, {
        yesAdvice:
          "Red flags before you're paid become nightmares after. Raise the price to make it worth it — or walk.",
      }),
    },
    PRESSURE,
  ],
  expense: [
    {
      id: "afford",
      text: "Can you pay for this without touching emergency savings?",
      options: YN(0, 3, {
        noAdvice:
          "If it takes your safety net, it's not an investment — it's a gamble. Wait until you can afford it twice.",
      }),
    },
    {
      id: "roi",
      text: "Will it realistically pay for itself within 6 months?",
      options: YN(0, 2, {
        noAdvice:
          "If it doesn't earn its cost back, it's a luxury. Fine — but call it that and budget it as one.",
        unsureAdvice:
          "Write down exactly how it makes or saves you money. If you can't, that's your answer.",
      }),
    },
    {
      id: "compared",
      text: "Have you compared at least one alternative (or the used/cheaper version)?",
      options: YN(0, 2, {
        noAdvice:
          "Spend 15 minutes comparing before you spend real money. The second option is often 80% as good for half the price.",
      }),
    },
    {
      id: "urgent",
      text: "Do you truly need it this month?",
      options: YN(0, 1, {
        noAdvice:
          "Put it on a 30-day wish list. If you still want it in a month, buy it guilt-free — most of the time you won't.",
      }),
    },
    PRESSURE,
  ],
  refund: [
    {
      id: "fault",
      text: "Was the problem genuinely on your side?",
      options: YN(0, 1, {
        noAdvice:
          "If you delivered what was agreed, a full refund isn't owed. Stay polite, point to the agreement, and offer a fix instead.",
        unsurePoints: 1,
      }),
    },
    {
      id: "partial",
      text: "Have you considered a partial refund or a redo instead of a full refund?",
      options: YN(0, 2, {
        noAdvice:
          "A redo or partial refund often satisfies the client at half the cost. Offer that first.",
      }),
    },
    {
      id: "keep",
      text: "Is this a customer you want to keep long-term?",
      options: [
        {
          value: "yes",
          label: "Yes",
          points: 0,
          advice:
            "For a customer worth keeping, generosity now can pay back tenfold. Make it fast and gracious.",
        },
        {
          value: "no",
          label: "No",
          points: 1,
          advice:
            "If they're not worth keeping, resolve it cleanly per your policy — don't over-give to someone who's leaving anyway.",
        },
      ],
    },
    {
      id: "precedent",
      text: "Would you be comfortable giving this refund to every customer in the same situation?",
      options: YN(0, 2, {
        noAdvice:
          "Refunds set precedents. If you wouldn't do it for everyone, tighten what you offer this time.",
      }),
    },
    PRESSURE,
  ],
  pricing: [
    {
      id: "costs",
      text: "Have you calculated your real costs, including your hours?",
      options: YN(0, 3, {
        noAdvice:
          "Price built on guesses is a slow leak. Add up tools, time (at a wage you'd accept), and overhead — then add margin.",
      }),
    },
    {
      id: "market",
      text: "Do you know what others charge for this?",
      options: YN(0, 2, {
        noAdvice:
          "Check 3 competitors before quoting. You're probably underpricing — most freelancers do.",
      }),
    },
    {
      id: "undercut",
      text: "Are you pricing low mainly to win the job?",
      options: YN(2, 0, {
        yesAdvice:
          "Cheap prices attract the worst clients and make raising rates painful later. Compete on clarity and speed, not price.",
      }),
    },
    {
      id: "raise",
      text: "Could you comfortably do this work at this price 20 more times?",
      options: YN(0, 2, {
        noAdvice:
          "If repeating it would burn you out or break even, the price is too low. Quote what makes 20 repeats attractive.",
      }),
    },
    PRESSURE,
  ],
};

export type RiskLevel = "low" | "medium" | "high";

export type DecisionResult = {
  score: number;
  maxScore: number;
  level: RiskLevel;
  verdict: string;
  recommendations: string[];
};

export const RISK_META: Record<
  RiskLevel,
  { label: string; badgeClass: string; barClass: string }
> = {
  low: {
    label: "Low risk",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
    barClass: "bg-green-500",
  },
  medium: {
    label: "Medium risk",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    barClass: "bg-amber-500",
  },
  high: {
    label: "High risk",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    barClass: "bg-red-500",
  },
};

const VERDICTS: Record<RiskLevel, string> = {
  low: "This looks like a sound decision. Go ahead — you've covered the important angles.",
  medium:
    "Proceed, but fix the weak spots below first. A small adjustment now saves a headache later.",
  high: "Hold on. As it stands, this decision is likely to cost you. Work through the recommendations before committing.",
};

export function scoreDecision(
  type: DecisionType,
  answers: Record<string, string>
): DecisionResult {
  const questions = QUESTIONS[type];
  let score = 0;
  let maxScore = 0;
  const recommendations: string[] = [];

  for (const q of questions) {
    maxScore += Math.max(...q.options.map((o) => o.points));
    const selected = q.options.find((o) => o.value === answers[q.id]);
    if (!selected) continue;
    score += selected.points;
    if (selected.advice) {
      recommendations.push(selected.advice);
    }
  }

  const ratio = maxScore > 0 ? score / maxScore : 0;
  const level: RiskLevel =
    ratio < 0.25 ? "low" : ratio < 0.55 ? "medium" : "high";

  return {
    score,
    maxScore,
    level,
    verdict: VERDICTS[level],
    recommendations,
  };
}
