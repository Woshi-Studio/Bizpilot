// Business Health Score — a rule-based 0-100 rating built from the data
// the app already has. No AI needed, so it's instant and free.

export type HealthInput = {
  monthIncome: number;
  monthExpenses: number;
  lastMonthIncome: number;
  customerCount: number;
  activeCustomerCount: number;
  overdueUnpaidCount: number;
  overdueFollowUps: number;
  newLeads: number;
  loggedThisMonth: boolean;
};

export type HealthFactor = {
  label: string;
  points: number;
  max: number;
  note: string;
  good: boolean;
};

export type HealthResult = {
  score: number;
  grade: string;
  gradeClass: string;
  headline: string;
  factors: HealthFactor[];
};

export function scoreHealth(input: HealthInput): HealthResult {
  const factors: HealthFactor[] = [];

  // 1. Profitability (25) — are you making money this month?
  {
    const profit = input.monthIncome - input.monthExpenses;
    let pts = 0;
    let note = "No income logged this month yet.";
    let good = false;
    if (input.monthIncome > 0 && profit > 0) {
      const margin = profit / input.monthIncome;
      pts = margin >= 0.4 ? 25 : margin >= 0.2 ? 20 : 14;
      note = `You're profitable this month (${Math.round(margin * 100)}% margin).`;
      good = true;
    } else if (input.monthIncome > 0) {
      pts = 6;
      note = "Spending more than you earned this month — watch expenses.";
    }
    factors.push({ label: "Profitability", points: pts, max: 25, note, good });
  }

  // 2. Momentum (20) — is income growing vs last month?
  {
    let pts = 10;
    let note = "Not enough history to judge momentum yet.";
    let good = false;
    if (input.lastMonthIncome > 0) {
      const change =
        (input.monthIncome - input.lastMonthIncome) / input.lastMonthIncome;
      if (change >= 0.05) {
        pts = 20;
        note = `Income is up ${Math.round(change * 100)}% vs last month. 📈`;
        good = true;
      } else if (change >= -0.05) {
        pts = 15;
        note = "Income is holding steady vs last month.";
        good = true;
      } else {
        pts = 7;
        note = `Income dropped ${Math.round(Math.abs(change) * 100)}% vs last month.`;
      }
    } else if (input.monthIncome > 0) {
      pts = 15;
      note = "First month with income — nice start.";
      good = true;
    }
    factors.push({ label: "Momentum", points: pts, max: 20, note, good });
  }

  // 3. Getting paid (20) — overdue unpaid invoices hurt
  {
    let pts = 20;
    let note = "No overdue invoices — you're getting paid on time. 👍";
    let good = true;
    if (input.overdueUnpaidCount > 0) {
      pts = input.overdueUnpaidCount >= 3 ? 4 : 10;
      note = `${input.overdueUnpaidCount} invoice${input.overdueUnpaidCount === 1 ? "" : "s"} overdue and unpaid — chase them.`;
      good = false;
    }
    factors.push({ label: "Getting paid", points: pts, max: 20, note, good });
  }

  // 4. Customer care (20) — following up + pipeline
  {
    let pts = 20;
    const problems: string[] = [];
    if (input.overdueFollowUps > 0) {
      pts -= Math.min(12, input.overdueFollowUps * 4);
      problems.push(
        `${input.overdueFollowUps} follow-up${input.overdueFollowUps === 1 ? "" : "s"} overdue`
      );
    }
    if (input.customerCount === 0) {
      pts = 4;
      problems.push("no customers yet");
    }
    const good = problems.length === 0;
    factors.push({
      label: "Customer care",
      points: Math.max(0, pts),
      max: 20,
      note: good
        ? "You're on top of your customers and follow-ups."
        : `Needs attention: ${problems.join(", ")}.`,
      good,
    });
  }

  // 5. Pipeline & habit (15) — new leads + are you actually using it
  {
    let pts = 0;
    const bits: string[] = [];
    if (input.newLeads > 0) {
      pts += 8;
      bits.push(`${input.newLeads} new lead${input.newLeads === 1 ? "" : "s"}`);
    }
    if (input.loggedThisMonth) {
      pts += 7;
      bits.push("money tracked this month");
    }
    const good = pts >= 10;
    factors.push({
      label: "Growth habit",
      points: pts,
      max: 15,
      note:
        bits.length > 0
          ? `Keeping active: ${bits.join(", ")}.`
          : "Add leads and log your money to build momentum.",
      good,
    });
  }

  const score = Math.round(
    factors.reduce((s, f) => s + f.points, 0)
  );

  let grade = "Needs work";
  let gradeClass = "text-red-600";
  let headline = "A few things need your attention — see below.";
  if (score >= 80) {
    grade = "Thriving";
    gradeClass = "text-green-600";
    headline = "Your business is in great shape. Keep doing what works.";
  } else if (score >= 60) {
    grade = "Healthy";
    gradeClass = "text-green-600";
    headline = "Solid overall — a couple of easy wins below.";
  } else if (score >= 40) {
    grade = "Okay";
    gradeClass = "text-amber-600";
    headline = "Not bad, but there's room to tighten things up.";
  }

  return { score, grade, gradeClass, headline, factors };
}
