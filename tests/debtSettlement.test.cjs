const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'debtSettlement.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const settlementModule = new Module(sourcePath, module);
settlementModule.filename = sourcePath;
settlementModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
settlementModule._compile(compiled, sourcePath);
const { generateSettlementPlan } = settlementModule.exports;

const noConstraints = { maxTransferAmount: null, unavailableRoutes: [] };

const assertSettledAndValid = (plan, balances, constraints, currency = 'EUR') => {
  assert.equal(plan.status, 'success');
  assert.equal(plan.allConstraintsSatisfied, true);
  assert.ok(Object.values(plan.remainingBalances).every((balance) => balance === 0));

  const scale = 10 ** new Intl.NumberFormat('en', {
    style: 'currency', currency,
  }).resolvedOptions().maximumFractionDigits;
  const net = { ...balances };
  for (const transfer of plan.transfers) {
    assert.ok(transfer.amount > 0);
    if (constraints.maxTransferAmount !== null) {
      assert.ok(transfer.amount <= constraints.maxTransferAmount);
    }
    assert.ok(!constraints.unavailableRoutes.some((route) => route.from === transfer.from && route.to === transfer.to));
    net[transfer.from] += transfer.amount;
    net[transfer.to] -= transfer.amount;
  }
  assert.ok(Object.values(net).every((balance) => Math.round(balance * scale) === 0));
  assert.equal(Math.round(plan.totalTransferred * scale), Math.round(
    Object.values(balances).filter((balance) => balance < 0).reduce((sum, balance) => sum - balance, 0) * scale,
  ));
};

test('settles a straightforward two-member debt with a proven minimum', () => {
  const balances = { Alice: 25, Bob: -25 };
  const plan = generateSettlementPlan(balances, 'EUR', noConstraints);
  assert.deepEqual(plan.transfers, [{ from: 'Bob', to: 'Alice', amount: 25 }]);
  assert.equal(plan.minimumTransfers, 'proven');
  assertSettledAndValid(plan, balances, noConstraints);
});

test('settles multiple debtors and creditors and conserves each balance', () => {
  const balances = { Alice: 40, Bob: 35, Cara: -50, Dan: -25 };
  const plan = generateSettlementPlan(balances, 'EUR', noConstraints);
  assertSettledAndValid(plan, balances, noConstraints);
  assert.equal(plan.totalTransferred, 75);
});

test('splits transfers at the configured maximum amount', () => {
  const balances = { Alice: 12, Bob: -12 };
  const constraints = { maxTransferAmount: 5, unavailableRoutes: [] };
  const plan = generateSettlementPlan(balances, 'EUR', constraints);
  assertSettledAndValid(plan, balances, constraints);
  assert.deepEqual(plan.transfers.map((transfer) => transfer.amount), [5, 5, 2]);
});

test('avoids unavailable routes when another valid route exists', () => {
  const balances = { Alice: 8, Bob: 4, Cara: -4, Dan: -8 };
  const constraints = { maxTransferAmount: null, unavailableRoutes: [{ from: 'Cara', to: 'Alice' }] };
  const plan = generateSettlementPlan(balances, 'EUR', constraints);
  assertSettledAndValid(plan, balances, constraints);
  assert.ok(plan.transfers.every((transfer) => !(transfer.from === 'Cara' && transfer.to === 'Alice')));
});

test('returns an infeasible result when all routes to a creditor are blocked', () => {
  const balances = { Alice: 10, Bob: -10 };
  const constraints = { maxTransferAmount: null, unavailableRoutes: [{ from: 'Bob', to: 'Alice' }] };
  const plan = generateSettlementPlan(balances, 'EUR', constraints);
  assert.equal(plan.status, 'infeasible');
  assert.match(plan.error, /No valid payment routes/);
  assert.equal(plan.transfers.length, 0);
});

test('supports multiple transfers on the same route under a low cap', () => {
  const balances = { Creditor: 1.01, Debtor: -1.01 };
  const constraints = { maxTransferAmount: 0.4, unavailableRoutes: [] };
  const plan = generateSettlementPlan(balances, 'EUR', constraints);
  assertSettledAndValid(plan, balances, constraints);
  assert.deepEqual(plan.transfers.map((transfer) => transfer.amount), [0.4, 0.4, 0.21]);
});

test('zero balances generate an empty, valid plan', () => {
  const balances = { Alice: 0, Bob: 0 };
  const plan = generateSettlementPlan(balances, 'EUR', noConstraints);
  assert.equal(plan.status, 'success');
  assert.equal(plan.transfers.length, 0);
  assertSettledAndValid(plan, balances, noConstraints);
});

test('rejects invalid caps, unknown routes, duplicate routes, and malformed balances', () => {
  assert.match(generateSettlementPlan({ Alice: 1, Bob: -1 }, 'EUR', {
    maxTransferAmount: -1, unavailableRoutes: [],
  }).error, /positive number/);

  assert.match(generateSettlementPlan({ Alice: 1, Bob: -1 }, 'EUR', {
    maxTransferAmount: null, unavailableRoutes: [{ from: 'Missing', to: 'Alice' }],
  }).error, /not in this group/);

  assert.match(generateSettlementPlan({ Alice: 1, Bob: -1 }, 'EUR', {
    maxTransferAmount: null,
    unavailableRoutes: [{ from: 'Bob', to: 'Alice' }, { from: 'Bob', to: 'Alice' }],
  }).error, /more than once/);

  assert.match(generateSettlementPlan({ Alice: Number.NaN, Bob: -1 }, 'EUR', noConstraints).error, /finite number/);
  assert.match(generateSettlementPlan({}, 'EUR', noConstraints).error, /at least one/);
});

test('rounds binary floating-point noise to the currency precision', () => {
  const balances = { Alice: 0.1 + 0.2, Bob: -0.3 };
  const plan = generateSettlementPlan(balances, 'EUR', noConstraints);
  assert.equal(plan.status, 'success');
  assert.deepEqual(plan.transfers, [{ from: 'Bob', to: 'Alice', amount: 0.3 }]);
  assertSettledAndValid(plan, balances, noConstraints);
});

test('uses zero-decimal currency precision for JPY', () => {
  const balances = { Alice: 101, Bob: -101 };
  const constraints = { maxTransferAmount: 50, unavailableRoutes: [] };
  const plan = generateSettlementPlan(balances, 'JPY', constraints);
  assertSettledAndValid(plan, balances, constraints, 'JPY');
  assert.deepEqual(plan.transfers.map((transfer) => transfer.amount), [50, 50, 1]);
});

test('rejects groups whose currency-rounded balances do not conserve to zero', () => {
  const plan = generateSettlementPlan({ Alice: 10, Bob: -9.99 }, 'EUR', noConstraints);
  assert.equal(plan.status, 'infeasible');
  assert.match(plan.error, /do not net to zero/);
});

test('returns validation errors instead of throwing for malformed constraints or currency', () => {
  const malformedConstraints = generateSettlementPlan({ Alice: 1, Bob: -1 }, 'EUR', null);
  assert.equal(malformedConstraints.status, 'infeasible');
  assert.match(malformedConstraints.error, /positive number/);

  const unsupportedCurrency = generateSettlementPlan({ Alice: 1, Bob: -1 }, 'NOT-A-CURRENCY', noConstraints);
  assert.equal(unsupportedCurrency.status, 'infeasible');
  assert.match(unsupportedCurrency.error, /not a supported currency code/);

  const malformedBalances = generateSettlementPlan(null, 'EUR', noConstraints);
  assert.equal(malformedBalances.status, 'infeasible');
  assert.match(malformedBalances.error, /member-to-amount object/);
});
