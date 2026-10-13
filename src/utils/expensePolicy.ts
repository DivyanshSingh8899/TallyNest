import type { ExpensePolicy, Transaction } from '../types';

export interface ExpenseAllocation {
  member: string;
  amount: number;
  rawAmount: number;
  roundingAdjustment: number;
  steps: string[];
}

export interface AllocationResult {
  allocations: ExpenseAllocation[];
  warnings: string[];
  errors: string[];
}

export interface PolicyConflict {
  firstPolicy: ExpensePolicy;
  secondPolicy: ExpensePolicy;
  overlappingCategories: string[];
}

export type ScenarioPolicyType = 'equal' | 'consumption' | 'roomSize' | 'weighted';

export interface ScenarioPolicy {
  type: ScenarioPolicyType;
  weights: Record<string, number>;
}

export interface ScenarioResult {
  balances: Record<string, number>;
  totalExpense: number;
  fairnessScore: number;
  allocations: number;
  warnings: string[];
}

const CENT = 100;
const ROUNDING_TOLERANCE = 0.000001;

const toCents = (amount: number): number => Math.round(amount * CENT);
const hasValue = (values: Record<string, number>, member: string): boolean =>
  Object.prototype.hasOwnProperty.call(values, member);

const roundAllocations = (
  rawShares: Map<string, number>,
  totalCents: number,
): Map<string, number> => {
  const rounded = new Map<string, number>();
  const remainders: { member: string; remainder: number }[] = [];
  let allocatedCents = 0;

  for (const [member, amount] of rawShares) {
    const exactCents = amount * CENT;
    const floorCents = Math.floor(exactCents + ROUNDING_TOLERANCE);
    rounded.set(member, floorCents);
    allocatedCents += floorCents;
    remainders.push({ member, remainder: exactCents - floorCents });
  }

  const adjustmentCount = totalCents - allocatedCents;
  remainders.sort((a, b) => b.remainder - a.remainder || a.member.localeCompare(b.member));
  for (let index = 0; index < adjustmentCount; index += 1) {
    const entry = remainders[index];
    if (entry) rounded.set(entry.member, (rounded.get(entry.member) ?? 0) + 1);
  }

  return new Map(Array.from(rounded, ([member, cents]) => [member, cents / CENT]));
};

export const validateExpensePolicy = (
  policy: ExpensePolicy,
  members: string[],
  cost?: number,
): string[] => {
  const errors: string[] = [];
  const eligibleMembers = members.filter((member) => !policy.excludedMembers.includes(member));

  if (!policy.name.trim()) errors.push('Give this policy a name.');
  if (!policy.category.trim()) errors.push('Choose a category or All categories.');
  if (!Number.isInteger(policy.priority) || policy.priority < 1) {
    errors.push('Priority must be a positive whole number.');
  }
  if (cost !== undefined && (!Number.isFinite(cost) || cost <= 0)) {
    errors.push('Expense amount must be greater than zero.');
  }
  if (eligibleMembers.length === 0) errors.push('At least one participant must be included.');

  if (policy.splitType === 'percentage') {
    const percentages = eligibleMembers.map((member) => policy.values[member] ?? 0);
    if (percentages.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      errors.push('Percentages must be between 0 and 100.');
    }
    const total = percentages.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.000001) {
      errors.push(`Percentages for included members must total 100% (currently ${total.toFixed(2)}%).`);
    }
  }

  if (policy.splitType === 'fixed') {
    const fixedMembers = eligibleMembers.filter((member) => hasValue(policy.values, member));
    const fixedAmounts = fixedMembers.map((member) => policy.values[member]);
    if (fixedAmounts.some((value) => !Number.isFinite(value) || value < 0)) {
      errors.push('Fixed amounts must be zero or greater.');
    }
    const fixedCents = fixedAmounts.reduce((sum, amount) => sum + toCents(amount), 0);
    const remainingCents = cost === undefined ? 0 : toCents(cost) - fixedCents;
    if (remainingCents < 0) errors.push('Fixed amounts cannot exceed the expense total.');
    if (remainingCents > 0 && fixedMembers.length === eligibleMembers.length) {
      errors.push('Leave at least one included member unassigned to split the remaining amount equally.');
    }
  }

  if (policy.splitType === 'weighted') {
    const weights = eligibleMembers.map((member) => policy.values[member] ?? 0);
    if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
      errors.push('Weights must be zero or greater.');
    }
    if (weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
      errors.push('At least one included member must have a weight greater than zero.');
    }
  }

  return errors;
};

export const calculateExpenseAllocation = (
  cost: number,
  members: string[],
  policy: ExpensePolicy,
): AllocationResult => {
  const errors = validateExpensePolicy(policy, members, cost);
  if (errors.length > 0) return { allocations: [], errors, warnings: [] };

  const eligibleMembers = members
    .filter((member) => !policy.excludedMembers.includes(member))
    .sort((a, b) => a.localeCompare(b));
  const rawShares = new Map<string, number>();
  const calculationSteps = new Map<string, string[]>();
  const totalCents = toCents(cost);

  if (policy.splitType === 'equal') {
    const share = cost / eligibleMembers.length;
    eligibleMembers.forEach((member) => {
      rawShares.set(member, share);
      calculationSteps.set(member, [`${cost.toFixed(2)} / ${eligibleMembers.length} included members`]);
    });
  } else if (policy.splitType === 'percentage') {
    eligibleMembers.forEach((member) => {
      const percentage = policy.values[member] ?? 0;
      rawShares.set(member, cost * percentage / 100);
      calculationSteps.set(member, [`${cost.toFixed(2)} x ${percentage}%`]);
    });
  } else if (policy.splitType === 'weighted') {
    const totalWeight = eligibleMembers.reduce((sum, member) => sum + (policy.values[member] ?? 0), 0);
    eligibleMembers.forEach((member) => {
      const weight = policy.values[member] ?? 0;
      rawShares.set(member, totalWeight === 0 ? 0 : cost * weight / totalWeight);
      calculationSteps.set(member, [`${cost.toFixed(2)} x ${weight} / ${totalWeight} total weight`]);
    });
  } else {
    const fixedMembers = eligibleMembers.filter((member) => hasValue(policy.values, member));
    const remainingMembers = eligibleMembers.filter((member) => !hasValue(policy.values, member));
    let fixedCents = 0;
    fixedMembers.forEach((member) => {
      const amount = toCents(policy.values[member]) / CENT;
      rawShares.set(member, amount);
      fixedCents += toCents(amount);
      calculationSteps.set(member, [`Fixed share: ${amount.toFixed(2)}`]);
    });
    const remainingAmount = (totalCents - fixedCents) / CENT;
    if (remainingMembers.length > 0) {
      const remainderShare = remainingAmount / remainingMembers.length;
      remainingMembers.forEach((member) => {
        rawShares.set(member, remainderShare);
        calculationSteps.set(member, [
          `${remainingAmount.toFixed(2)} remaining / ${remainingMembers.length} unassigned members`,
        ]);
      });
    }
  }

  const roundedShares = roundAllocations(rawShares, totalCents);
  const allocations = eligibleMembers.map((member) => {
    const rawAmount = rawShares.get(member) ?? 0;
    const amount = roundedShares.get(member) ?? 0;
    return {
      member,
      amount,
      rawAmount,
      roundingAdjustment: amount - rawAmount,
      steps: calculationSteps.get(member) ?? [],
    };
  });
  const hasRounding = allocations.some((allocation) => Math.abs(allocation.roundingAdjustment) >= 0.005);
  const warnings = hasRounding
    ? ['Rounding cents were assigned by largest remainder; see each member adjustment.']
    : [];

  return { allocations, warnings, errors: [] };
};

export const findPolicyConflicts = (
  policies: ExpensePolicy[],
): PolicyConflict[] => {
  const enabledPolicies = policies.filter((policy) => policy.enabled);
  const conflicts: PolicyConflict[] = [];

  for (let firstIndex = 0; firstIndex < enabledPolicies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < enabledPolicies.length; secondIndex += 1) {
      const firstPolicy = enabledPolicies[firstIndex];
      const secondPolicy = enabledPolicies[secondIndex];
      if (firstPolicy.priority !== secondPolicy.priority) continue;
      const overlappingCategories = firstPolicy.category === '*'
        ? [secondPolicy.category]
        : secondPolicy.category === '*'
          ? [firstPolicy.category]
          : firstPolicy.category === secondPolicy.category
            ? [firstPolicy.category]
            : [];
      if (overlappingCategories.length > 0) {
        conflicts.push({ firstPolicy, secondPolicy, overlappingCategories });
      }
    }
  }

  return conflicts;
};

export const selectExpensePolicy = (
  policies: ExpensePolicy[],
  category: string,
): { policy: ExpensePolicy | null; conflict: boolean } => {
  const matching = policies
    .filter((policy) => policy.enabled && (policy.category === '*' || policy.category === category))
    .sort((a, b) => b.priority - a.priority);
  if (matching.length > 1 && matching[0].priority === matching[1].priority) {
    return { policy: null, conflict: true };
  }
  return { policy: matching[0] ?? null, conflict: false };
};

export const inferExistingAllocation = (
  transaction: Transaction,
): { allocations: Map<string, number>; warnings: string[] } => {
  const balances = Object.entries(transaction.memberBalances);
  const creditors = balances.filter(([, amount]) => amount > 0.005);
  const debtors = balances.filter(([, amount]) => amount < -0.005);
  const allocations = new Map<string, number>();
  const warnings: string[] = [];

  if (creditors.length === 1) {
    debtors.forEach(([member, amount]) => allocations.set(member, Math.abs(amount)));
    const [payer, balance] = creditors[0];
    const payerShare = transaction.cost - balance;
    if (payerShare > 0.005) allocations.set(payer, payerShare);
    return { allocations, warnings };
  }

  debtors.forEach(([member, amount]) => allocations.set(member, Math.abs(amount)));
  warnings.push('Existing shares are inferred from net balances; multiple positive balances make this split ambiguous.');
  return { allocations, warnings };
};

const roundCurrency = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

/**
 * Recalculates net balances without mutating imported transactions. Positive
 * values are amounts paid in excess of the simulated share.
 */
export const calculateScenario = (
  transactions: Transaction[],
  members: string[],
  scenario: ScenarioPolicy,
  currency: string,
): ScenarioResult => {
  const balances = Object.fromEntries(members.map((member) => [member, 0]));
  const expenses = transactions.filter((transaction) =>
    !transaction.isTransfer && transaction.currency === currency && transaction.cost > 0,
  );
  const warnings: string[] = [];
  let totalExpense = 0;

  expenses.forEach((transaction) => {
    totalExpense += transaction.cost;
    const existing = inferExistingAllocation(transaction);
    const eligibleMembers = scenario.type === 'consumption'
      ? members.filter((member) => existing.allocations.has(member))
      : members;
    const participants = eligibleMembers.length > 0 ? eligibleMembers : members;
    const rawWeights = participants.map((member) => (
      scenario.type === 'equal' || scenario.type === 'consumption'
        ? 1
        : Math.max(0, scenario.weights[member] ?? 1)
    ));
    const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
      warnings.push(`No positive weights were provided for "${transaction.description || transaction.category}".`);
      return;
    }

    const payerContribution = Object.entries(transaction.memberBalances)
      .filter(([, amount]) => amount > 0)
      .reduce((sum, [, amount]) => sum + amount, 0);
    const shareTotal = transaction.cost;
    participants.forEach((member, index) => {
      const share = shareTotal * rawWeights[index] / totalWeight;
      balances[member] = (balances[member] ?? 0) + share;
    });
    if (payerContribution > 0) {
      Object.entries(transaction.memberBalances).forEach(([member, amount]) => {
        if (member in balances && amount > 0) balances[member] -= amount;
      });
    }
  });

  const roundedBalances = Object.fromEntries(
    Object.entries(balances).map(([member, balance]) => [member, roundCurrency(-balance)]),
  );
  const values = Object.values(roundedBalances);
  const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const deviation = values.length > 0
    ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
    : 0;

  return {
    balances: roundedBalances,
    totalExpense: roundCurrency(totalExpense),
    fairnessScore: roundCurrency(100 / (1 + deviation)),
    allocations: expenses.length,
    warnings: Array.from(new Set(warnings)),
  };
};
