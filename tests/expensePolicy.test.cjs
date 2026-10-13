const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'expensePolicy.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const policyModule = new Module(sourcePath, module);
policyModule.filename = sourcePath;
policyModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
policyModule._compile(compiled, sourcePath);
const {
  calculateExpenseAllocation,
  findPolicyConflicts,
  inferExistingAllocation,
  selectExpensePolicy,
  validateExpensePolicy,
  calculateScenario,
} = policyModule.exports;

const members = ['Alice', 'Bob', 'Cara'];
const makePolicy = (overrides = {}) => ({
  id: 'policy-1',
  name: 'Shared costs',
  category: 'Food',
  priority: 1,
  enabled: true,
  splitType: 'equal',
  excludedMembers: [],
  values: {},
  ...overrides,
});

test('equal split distributes cents exactly and explains rounding', () => {
  const result = calculateExpenseAllocation(10, members, makePolicy());
  assert.deepEqual(result.errors, []);
  assert.equal(result.allocations.reduce((sum, share) => sum + share.amount, 0), 10);
  assert.deepEqual(result.allocations.map((share) => share.amount), [3.34, 3.33, 3.33]);
  assert.ok(result.allocations.every((share) => share.steps.length === 1));
  assert.ok(result.warnings.some((warning) => warning.includes('Rounding cents')));
});

test('percentage split supports exclusions and checks only included members', () => {
  const policy = makePolicy({
    splitType: 'percentage',
    excludedMembers: ['Cara'],
    values: { Alice: 25, Bob: 75, Cara: 500 },
  });
  const result = calculateExpenseAllocation(80, members, policy);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.allocations.map(({ member, amount }) => [member, amount]), [
    ['Alice', 20],
    ['Bob', 60],
  ]);
  assert.deepEqual(validateExpensePolicy({ ...policy, values: { Alice: 20, Bob: 70 } }, members), [
    'Percentages for included members must total 100% (currently 90.00%).',
  ]);
});

test('fixed split divides the unassigned remainder equally', () => {
  const result = calculateExpenseAllocation(100, members, makePolicy({
    splitType: 'fixed',
    values: { Alice: 40 },
  }));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.allocations.map(({ member, amount }) => [member, amount]), [
    ['Alice', 40],
    ['Bob', 30],
    ['Cara', 30],
  ]);
});

test('fixed split rejects over-allocation and an unallocated remainder', () => {
  const overAllocated = calculateExpenseAllocation(50, members, makePolicy({
    splitType: 'fixed',
    values: { Alice: 30, Bob: 30 },
  }));
  assert.ok(overAllocated.errors.some((error) => error.includes('cannot exceed')));

  const remainder = calculateExpenseAllocation(50, members, makePolicy({
    splitType: 'fixed',
    values: { Alice: 10, Bob: 10, Cara: 10 },
  }));
  assert.ok(remainder.errors.some((error) => error.includes('Leave at least one')));
});

test('weighted split follows ratios and rejects zero total weight', () => {
  const result = calculateExpenseAllocation(90, members, makePolicy({
    splitType: 'weighted',
    values: { Alice: 1, Bob: 2, Cara: 3 },
  }));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.allocations.map((share) => share.amount), [15, 30, 45]);

  const invalid = validateExpensePolicy(makePolicy({
    splitType: 'weighted',
    values: { Alice: 0, Bob: 0, Cara: 0 },
  }), members);
  assert.ok(invalid.includes('At least one included member must have a weight greater than zero.'));
});

test('equal-priority matching policies conflict and higher priority wins', () => {
  const specific = makePolicy({ id: 'specific', category: 'Food', priority: 2 });
  const broad = makePolicy({ id: 'broad', category: '*', priority: 1 });
  assert.deepEqual(findPolicyConflicts([specific, broad]), []);
  assert.equal(selectExpensePolicy([specific, broad], 'Food').policy.id, 'specific');

  const tied = { ...specific, id: 'tied', priority: 1 };
  assert.equal(findPolicyConflicts([broad, tied]).length, 1);
  assert.deepEqual(selectExpensePolicy([broad, tied], 'Food'), { policy: null, conflict: true });
});

test('existing inferred shares include the single payer share and flag ambiguity', () => {
  const transaction = {
    cost: 100,
    memberBalances: { Alice: 70, Bob: -40, Cara: -30 },
  };
  const inferred = inferExistingAllocation(transaction);
  assert.deepEqual(Array.from(inferred.allocations), [['Bob', 40], ['Cara', 30], ['Alice', 30]]);
  assert.deepEqual(inferred.warnings, []);

  const ambiguous = inferExistingAllocation({
    ...transaction,
    memberBalances: { Alice: 60, Bob: 40, Cara: -100 },
  });
  assert.ok(ambiguous.warnings.some((warning) => warning.includes('ambiguous')));
});

test('counterfactual scenarios preserve totals and change balances by policy', () => {
  const transactions = [{
    id: 'expense-1',
    date: new Date('2026-01-01'),
    description: 'Rent',
    category: 'Rent',
    cost: 90,
    currency: 'EUR',
    memberBalances: { Alice: 90, Bob: -45, Cara: -45 },
    isTransfer: false,
  }];
  const equal = calculateScenario(transactions, members, { type: 'equal', weights: {} }, 'EUR');
  const weighted = calculateScenario(
    transactions,
    members,
    { type: 'weighted', weights: { Alice: 1, Bob: 2, Cara: 3 } },
    'EUR',
  );
  assert.equal(equal.totalExpense, 90);
  assert.equal(equal.allocations, 1);
  assert.deepEqual(equal.balances, { Alice: 60, Bob: -30, Cara: -30 });
  assert.deepEqual(weighted.balances, { Alice: 75, Bob: -30, Cara: -45 });
  assert.equal(equal.warnings.length, 0);
});
