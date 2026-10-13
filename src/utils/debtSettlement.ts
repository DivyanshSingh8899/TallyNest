export interface UnavailableRoute {
  from: string;
  to: string;
}

export interface SettlementConstraints {
  maxTransferAmount: number | null;
  unavailableRoutes: UnavailableRoute[];
}

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

export interface SettlementPlan {
  status: 'success' | 'infeasible';
  transfers: SettlementTransfer[];
  totalTransferred: number;
  remainingBalances: Record<string, number>;
  allConstraintsSatisfied: boolean;
  minimumTransfers: 'proven' | 'heuristic' | 'not-applicable';
  exploredStates: number;
  error?: string;
}

interface TransferInMinorUnits {
  from: string;
  to: string;
  amount: number;
}

interface SearchResult {
  transfers: TransferInMinorUnits[] | null;
  exploredStates: number;
  exhausted: boolean;
}

const MAX_SEARCH_STATES = 20_000;

const getCurrencyScale = (currency: string): number => {
  const digits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return 10 ** (digits ?? 2);
};

const toMinorUnits = (amount: number, scale: number): number =>
  Math.round((amount + Number.EPSILON) * scale);

const fromMinorUnits = (amount: number, scale: number): number => amount / scale;

const buildInfeasiblePlan = (
  remainingBalances: Record<string, number>,
  error: string,
  exploredStates = 0,
): SettlementPlan => ({
  status: 'infeasible',
  transfers: [],
  totalTransferred: 0,
  remainingBalances,
  allConstraintsSatisfied: false,
  minimumTransfers: 'not-applicable',
  exploredStates,
  error,
});

const validateInput = (
  balances: Record<string, number>,
  currency: string,
  constraints: SettlementConstraints,
): { names: string[]; scale: number; cap: number | null; errors: string[] } => {
  const errors: string[] = [];
  let scale = 100;

  try {
    scale = getCurrencyScale(currency);
  } catch {
    errors.push(`"${currency}" is not a supported currency code.`);
  }

  const names = Object.keys(balances);
  if (names.length === 0) errors.push('Add at least one group member before generating a plan.');
  if (names.some((name) => name.trim() === '')) errors.push('Member names cannot be empty.');

  for (const [name, balance] of Object.entries(balances)) {
    if (!Number.isFinite(balance)) errors.push(`Balance for ${name} must be a finite number.`);
  }

  let cap: number | null = null;
  if (constraints.maxTransferAmount !== null) {
    if (!Number.isFinite(constraints.maxTransferAmount) || constraints.maxTransferAmount <= 0) {
      errors.push('Maximum transfer amount must be a positive number or left empty.');
    } else {
      cap = toMinorUnits(constraints.maxTransferAmount, scale);
      if (cap <= 0) errors.push('Maximum transfer amount is below the smallest supported currency unit.');
    }
  }

  if (!Array.isArray(constraints.unavailableRoutes)) {
    errors.push('Unavailable routes must be provided as a list.');
  } else {
    const routeKeys = new Set<string>();
    for (const route of constraints.unavailableRoutes) {
      if (!route || typeof route.from !== 'string' || typeof route.to !== 'string') {
        errors.push('Each unavailable route must include a sender and receiver.');
        continue;
      }
      if (!names.includes(route.from) || !names.includes(route.to)) {
        errors.push(`Route "${route.from} → ${route.to}" references a member not in this group.`);
        continue;
      }
      if (route.from === route.to) {
        errors.push('A member cannot have an unavailable route to themselves.');
        continue;
      }
      const key = `${route.from}\u0000${route.to}`;
      if (routeKeys.has(key)) errors.push(`Route "${route.from} → ${route.to}" is listed more than once.`);
      routeKeys.add(key);
    }
  }

  return { names, scale, cap, errors };
};

const findMinimumTransferCandidate = (
  initial: number[],
  names: string[],
  unavailableRoutes: Set<string>,
  cap: number | null,
): SearchResult => {
  let exploredStates = 0;
  let exhausted = true;
  let best: TransferInMinorUnits[] | null = null;
  const shortestDepthByState = new Map<string, number>();

  const visit = (balances: number[], transfers: TransferInMinorUnits[]): void => {
    if (exploredStates >= MAX_SEARCH_STATES) {
      exhausted = false;
      return;
    }
    exploredStates++;

    if (balances.every((balance) => balance === 0)) {
      if (best === null || transfers.length < best.length) best = transfers;
      return;
    }
    if (best && transfers.length >= best.length) return;

    const stateKey = balances.join(',');
    const previousDepth = shortestDepthByState.get(stateKey);
    if (previousDepth !== undefined && previousDepth <= transfers.length) return;
    shortestDepthByState.set(stateKey, transfers.length);

    const debtors = balances
      .map((balance, index) => ({ balance, index }))
      .filter(({ balance }) => balance < 0);
    const creditors = balances
      .map((balance, index) => ({ balance, index }))
      .filter(({ balance }) => balance > 0);

    const choices = debtors.flatMap((debtor) => creditors
      .filter((creditor) => !unavailableRoutes.has(`${names[debtor.index]}\u0000${names[creditor.index]}`))
      .map((creditor) => ({
        debtor,
        creditor,
        amount: Math.min(-debtor.balance, creditor.balance, cap ?? Number.MAX_SAFE_INTEGER),
      })))
      .sort((left, right) => right.amount - left.amount);

    for (const choice of choices) {
      const nextBalances = [...balances];
      nextBalances[choice.debtor.index] += choice.amount;
      nextBalances[choice.creditor.index] -= choice.amount;
      visit(nextBalances, [...transfers, {
        from: names[choice.debtor.index],
        to: names[choice.creditor.index],
        amount: choice.amount,
      }]);
      if (!exhausted && exploredStates >= MAX_SEARCH_STATES) break;
    }
  };

  visit(initial, []);
  return { transfers: best, exploredStates, exhausted };
};

const findFeasibleTransfers = (
  initial: number[],
  names: string[],
  unavailableRoutes: Set<string>,
): TransferInMinorUnits[] | null => {
  const debtors = initial.map((balance, index) => ({ balance, index })).filter(({ balance }) => balance < 0);
  const creditors = initial.map((balance, index) => ({ balance, index })).filter(({ balance }) => balance > 0);
  const source = 0;
  const debtorOffset = 1;
  const creditorOffset = debtorOffset + debtors.length;
  const sink = creditorOffset + creditors.length;
  const size = sink + 1;
  const residual = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const adjacency = Array.from({ length: size }, () => [] as number[]);
  const totalOwed = debtors.reduce((sum, debtor) => sum - debtor.balance, 0);

  const addEdge = (from: number, to: number, capacity: number): void => {
    residual[from][to] += capacity;
    adjacency[from].push(to);
    adjacency[to].push(from);
  };

  debtors.forEach((debtor, index) => addEdge(source, debtorOffset + index, -debtor.balance));
  creditors.forEach((creditor, index) => addEdge(creditorOffset + index, sink, creditor.balance));
  debtors.forEach((debtor, debtorIndex) => {
    creditors.forEach((creditor, creditorIndex) => {
      if (!unavailableRoutes.has(`${names[debtor.index]}\u0000${names[creditor.index]}`)) {
        addEdge(debtorOffset + debtorIndex, creditorOffset + creditorIndex, totalOwed);
      }
    });
  });

  let maxFlow = 0;
  while (true) {
    const parent = Array<number>(size).fill(-1);
    parent[source] = source;
    const queue = [source];
    for (let cursor = 0; cursor < queue.length && parent[sink] === -1; cursor++) {
      const node = queue[cursor];
      for (const neighbor of adjacency[node]) {
        if (parent[neighbor] === -1 && residual[node][neighbor] > 0) {
          parent[neighbor] = node;
          queue.push(neighbor);
        }
      }
    }
    if (parent[sink] === -1) break;

    let pathCapacity = Number.MAX_SAFE_INTEGER;
    for (let node = sink; node !== source; node = parent[node]) {
      pathCapacity = Math.min(pathCapacity, residual[parent[node]][node]);
    }
    for (let node = sink; node !== source; node = parent[node]) {
      residual[parent[node]][node] -= pathCapacity;
      residual[node][parent[node]] += pathCapacity;
    }
    maxFlow += pathCapacity;
  }

  if (maxFlow !== totalOwed) return null;

  const transfers: TransferInMinorUnits[] = [];
  debtors.forEach((debtor, debtorIndex) => {
    creditors.forEach((creditor, creditorIndex) => {
      const fromNode = debtorOffset + debtorIndex;
      const toNode = creditorOffset + creditorIndex;
      const amount = residual[toNode][fromNode];
      if (amount > 0) {
        transfers.push({ from: names[debtor.index], to: names[creditor.index], amount });
      }
    });
  });
  return transfers;
};

const splitByCap = (
  transfers: TransferInMinorUnits[],
  cap: number | null,
): TransferInMinorUnits[] => {
  if (cap === null) return transfers;
  const splitTransfers: TransferInMinorUnits[] = [];
  for (const transfer of transfers) {
    let remaining = transfer.amount;
    while (remaining > 0) {
      const amount = Math.min(remaining, cap);
      splitTransfers.push({ ...transfer, amount });
      remaining -= amount;
    }
  }
  return splitTransfers;
};

const verifyTransfers = (
  balances: number[],
  names: string[],
  transfers: TransferInMinorUnits[],
  unavailableRoutes: Set<string>,
  cap: number | null,
): boolean => {
  const remaining = [...balances];
  const indexByName = new Map(names.map((name, index) => [name, index]));
  for (const transfer of transfers) {
    const from = indexByName.get(transfer.from);
    const to = indexByName.get(transfer.to);
    if (from === undefined || to === undefined || from === to || transfer.amount <= 0) return false;
    if (unavailableRoutes.has(`${transfer.from}\u0000${transfer.to}`)) return false;
    if (cap !== null && transfer.amount > cap) return false;
    remaining[from] += transfer.amount;
    remaining[to] -= transfer.amount;
  }
  return remaining.every((balance) => balance === 0);
};

export const generateSettlementPlan = (
  balances: Record<string, number>,
  currency: string,
  constraints: SettlementConstraints,
): SettlementPlan => {
  if (!balances || typeof balances !== 'object' || Array.isArray(balances)) {
    return buildInfeasiblePlan({}, 'Balances must be provided as a member-to-amount object.');
  }
  const safeConstraints = constraints && typeof constraints === 'object'
    ? constraints
    : { maxTransferAmount: Number.NaN, unavailableRoutes: [] };
  const { names, scale, cap, errors } = validateInput(balances, currency, safeConstraints);
  const normalizedBalances = Object.fromEntries(names.map((name) => [
    name,
    Number.isFinite(balances[name]) ? fromMinorUnits(toMinorUnits(balances[name], scale), scale) : balances[name],
  ]));
  if (errors.length > 0) return buildInfeasiblePlan(normalizedBalances, errors.join(' '));

  const minorBalances = names.map((name) => toMinorUnits(balances[name], scale));
  if (minorBalances.some((balance) => !Number.isSafeInteger(balance))) {
    return buildInfeasiblePlan(normalizedBalances, 'Balances exceed the supported numeric range.');
  }
  const netBalance = minorBalances.reduce((sum, balance) => sum + balance, 0);
  if (!Number.isSafeInteger(netBalance)) {
    return buildInfeasiblePlan(normalizedBalances, 'Balances exceed the supported numeric range.');
  }
  if (netBalance !== 0) {
    return buildInfeasiblePlan(normalizedBalances, 'Group balances do not net to zero at this currency’s precision.');
  }

  const unavailableRoutes = new Set(safeConstraints.unavailableRoutes.map((route) => `${route.from}\u0000${route.to}`));
  const totalOwed = minorBalances.reduce((sum, balance) => sum + Math.max(0, -balance), 0);
  if (!Number.isSafeInteger(totalOwed)) {
    return buildInfeasiblePlan(normalizedBalances, 'Balances exceed the supported numeric range.');
  }
  if (totalOwed === 0) {
    return {
      status: 'success',
      transfers: [],
      totalTransferred: 0,
      remainingBalances: normalizedBalances,
      allConstraintsSatisfied: true,
      minimumTransfers: 'proven',
      exploredStates: 0,
    };
  }

  const search = findMinimumTransferCandidate(minorBalances, names, unavailableRoutes, cap);
  let minorTransfers = search.transfers;
  let minimumTransfers: SettlementPlan['minimumTransfers'] = 'heuristic';
  const unconstrained = cap === null && unavailableRoutes.size === 0;
  if (unconstrained && search.exhausted && minorTransfers !== null) minimumTransfers = 'proven';

  if (minorTransfers === null) {
    const feasibleTransfers = findFeasibleTransfers(minorBalances, names, unavailableRoutes);
    if (feasibleTransfers === null) {
      return buildInfeasiblePlan(
        normalizedBalances,
        'No valid payment routes can move enough money from every debtor to the creditors.',
        search.exploredStates,
      );
    }
    minorTransfers = splitByCap(feasibleTransfers, cap);
    minimumTransfers = 'heuristic';
  }

  if (!verifyTransfers(minorBalances, names, minorTransfers, unavailableRoutes, cap)) {
    return buildInfeasiblePlan(normalizedBalances, 'The generated candidate failed settlement validation.', search.exploredStates);
  }

  const transfers = minorTransfers.map((transfer) => ({
    ...transfer,
    amount: fromMinorUnits(transfer.amount, scale),
  }));
  return {
    status: 'success',
    transfers,
    totalTransferred: fromMinorUnits(totalOwed, scale),
    remainingBalances: Object.fromEntries(names.map((name) => [name, 0])),
    allConstraintsSatisfied: true,
    minimumTransfers,
    exploredStates: search.exploredStates,
  };
};
