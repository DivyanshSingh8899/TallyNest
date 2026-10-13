import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { ExpensePolicy, ExpenseSplitType, Transaction } from '../../types';
import { getTranslation } from '../../i18n/translations';
import {
  calculateExpenseAllocation,
  findPolicyConflicts,
  inferExistingAllocation,
  selectExpensePolicy,
  validateExpensePolicy,
} from '../../utils/expensePolicy';
import { CounterfactualFairnessSimulator } from './CounterfactualFairnessSimulator';

const splitTypeLabel = (splitType: ExpenseSplitType, t: ReturnType<typeof getTranslation>) => ({
  equal: t.policies.equal,
  percentage: t.policies.percentage,
  fixed: t.policies.fixed,
  weighted: t.policies.weighted,
})[splitType];

const createPolicyDraft = (category = '*'): ExpensePolicy => ({
  id: crypto.randomUUID(),
  name: '',
  category,
  priority: 1,
  enabled: true,
  splitType: 'equal',
  excludedMembers: [],
  values: {},
});

const formatAmount = (amount: number, currency: string, language: string) =>
  new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount);

const expenseLabel = (transaction: Transaction, language: string) => {
  const date = new Date(transaction.date).toLocaleDateString(language);
  return `${date} · ${transaction.description || transaction.category} · ${formatAmount(transaction.cost, transaction.currency, language)}`;
};

export const ExpensePolicyPage = () => {
  const {
    parsedData,
    language,
    expensePolicies,
    expensePolicyAudit,
    saveExpensePolicy,
    deleteExpensePolicy,
  } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);
  const [draft, setDraft] = useState<ExpensePolicy | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState('');

  const members = useMemo(
    () => parsedData?.members.map((member) => member.name) ?? [],
    [parsedData],
  );
  const expenses = useMemo(
    () => parsedData?.transactions.filter((transaction) => !transaction.isTransfer) ?? [],
    [parsedData],
  );
  const categories = useMemo(
    () => Array.from(new Set(expenses.map((transaction) => transaction.category))).sort(),
    [expenses],
  );
  const selectedTransaction = expenses.find((transaction) => transaction.id === selectedTransactionId)
    ?? expenses[0];
  const conflicts = useMemo(
    () => findPolicyConflicts(expensePolicies),
    [expensePolicies],
  );
  const previewPolicies = draft
    ? [...expensePolicies.filter((policy) => policy.id !== draft.id), draft]
    : expensePolicies;
  const selectedRule = selectedTransaction
    ? selectExpensePolicy(previewPolicies, selectedTransaction.category)
    : { policy: null, conflict: false };
  const existing = selectedTransaction ? inferExistingAllocation(selectedTransaction) : null;
  const proposed = selectedTransaction && selectedRule.policy
    ? calculateExpenseAllocation(selectedTransaction.cost, members, selectedRule.policy)
    : null;
  const validationErrors = draft ? validateExpensePolicy(draft, members) : [];
  const languageCode = language === 'it' ? 'it-IT' : 'en-US';

  const startNewPolicy = () => setDraft(createPolicyDraft(selectedTransaction?.category ?? '*'));
  const startEditPolicy = (policy: ExpensePolicy) => setDraft({
    ...policy,
    excludedMembers: [...policy.excludedMembers],
    values: { ...policy.values },
  });
  const updateDraft = (changes: Partial<ExpensePolicy>) => {
    setDraft((current) => current ? { ...current, ...changes } : current);
  };
  const updateMemberValue = (member: string, rawValue: string) => {
    setDraft((current) => {
      if (!current) return current;
      const values = { ...current.values };
      if (rawValue.trim() === '') delete values[member];
      else values[member] = Number(rawValue);
      return { ...current, values };
    });
  };
  const toggleExcludedMember = (member: string) => {
    if (!draft) return;
    const excluded = new Set(draft.excludedMembers);
    if (excluded.has(member)) excluded.delete(member);
    else excluded.add(member);
    updateDraft({ excludedMembers: Array.from(excluded) });
  };
  const handleSavePolicy = () => {
    if (!draft || validateExpensePolicy(draft, members).length > 0) return;
    saveExpensePolicy(draft);
    setDraft(null);
  };
  const handleDeletePolicy = (policy: ExpensePolicy) => {
    if (window.confirm(`${t.policies.delete} "${policy.name}"?`)) {
      deleteExpensePolicy(policy.id);
      if (draft?.id === policy.id) setDraft(null);
    }
  };

  const currentTotal = existing
    ? Array.from(existing.allocations.values()).reduce((sum, amount) => sum + amount, 0)
    : 0;
  const currentWarnings = existing ? [...existing.warnings] : [];
  if (selectedTransaction && Math.abs(currentTotal - selectedTransaction.cost) > 0.01) {
    currentWarnings.push(
      `Inferred current shares total ${formatAmount(currentTotal, selectedTransaction.currency, languageCode)}; expense total is ${formatAmount(selectedTransaction.cost, selectedTransaction.currency, languageCode)}.`,
    );
  }
  const displayWarnings = [
    ...currentWarnings,
    ...(proposed?.warnings ?? []),
    ...(selectedRule.policy?.excludedMembers.length
      ? [`${t.policies.excluded}: ${selectedRule.policy.excludedMembers.join(', ')}`]
      : []),
  ];
  const proposedByMember = new Map((proposed?.allocations ?? []).map((allocation) => [allocation.member, allocation]));
  const comparisonMembers = Array.from(new Set([
    ...Array.from(existing?.allocations.keys() ?? []),
    ...proposedByMember.keys(),
  ])).sort((a, b) => a.localeCompare(b));

  return (
    <Box className="animate-fade-in">
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>{t.policies.title}</Typography>
          <Typography color="text.secondary">{t.policies.subtitle}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={startNewPolicy}>
          {t.policies.newPolicy}
        </Button>
      </Stack>

      {conflicts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography fontWeight={700}>{t.policies.conflicts}: {conflicts.length}</Typography>
          {t.policies.conflictHint}
          {conflicts.map(({ firstPolicy, secondPolicy, overlappingCategories }) => (
            <Typography variant="body2" key={`${firstPolicy.id}-${secondPolicy.id}`}>
              {firstPolicy.name} / {secondPolicy.name} · {overlappingCategories.join(', ')}
            </Typography>
          ))}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(300px, 0.85fr) minmax(0, 1.6fr)' }, gap: 3 }}>
        <Stack spacing={2}>
          {draft && (
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                {expensePolicies.some((policy) => policy.id === draft.id) ? t.policies.editPolicy : t.policies.newPolicy}
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label={t.policies.policyName}
                  size="small"
                  fullWidth
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel>{t.policies.category}</InputLabel>
                  <Select
                    value={draft.category}
                    label={t.policies.category}
                    onChange={(event) => updateDraft({ category: event.target.value })}
                  >
                    <MenuItem value="*">{t.policies.allCategories}</MenuItem>
                    {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                    {draft.category !== '*' && !categories.includes(draft.category) && (
                      <MenuItem value={draft.category}>{draft.category}</MenuItem>
                    )}
                  </Select>
                </FormControl>
                <TextField
                  label={t.policies.priority}
                  type="number"
                  size="small"
                  inputProps={{ min: 1, step: 1 }}
                  value={draft.priority}
                  onChange={(event) => updateDraft({ priority: Number(event.target.value) })}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel>{t.policies.splitType}</InputLabel>
                  <Select
                    value={draft.splitType}
                    label={t.policies.splitType}
                    onChange={(event) => updateDraft({ splitType: event.target.value as ExpenseSplitType, values: {} })}
                  >
                    {(['equal', 'percentage', 'fixed', 'weighted'] as const).map((splitType) => (
                      <MenuItem key={splitType} value={splitType}>{splitTypeLabel(splitType, t)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Checkbox checked={draft.enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} />}
                  label={t.policies.enabled}
                />

                {draft.splitType !== 'equal' && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>{t.policies.memberValues}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.policies.memberValuesHint}</Typography>
                    {members.length === 0
                      ? <Alert severity="info" sx={{ mt: 1 }}>{t.policies.noMembers}</Alert>
                      : members.map((member) => (
                        <TextField
                          key={member}
                          label={member}
                          type="number"
                          size="small"
                          fullWidth
                          sx={{ mt: 1 }}
                          inputProps={{ min: 0, step: draft.splitType === 'percentage' ? 0.01 : 0.01 }}
                          InputProps={{
                            endAdornment: draft.splitType === 'percentage' ? '%' : undefined,
                          }}
                          value={draft.values[member] ?? ''}
                          onChange={(event) => updateMemberValue(member, event.target.value)}
                        />
                      ))}
                  </Box>
                )}

                {members.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>{t.policies.excludedMembers}</Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                      {members.map((member) => (
                        <FormControlLabel
                          key={member}
                          control={(
                            <Checkbox
                              size="small"
                              checked={draft.excludedMembers.includes(member)}
                              onChange={() => toggleExcludedMember(member)}
                            />
                          )}
                          label={member}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                {validationErrors.length > 0 && (
                  <Alert severity="error">
                    <Typography fontWeight={700}>{t.policies.errors}</Typography>
                    {validationErrors.map((error) => <Typography variant="body2" key={error}>{error}</Typography>)}
                  </Alert>
                )}
                <Stack direction="row" gap={1}>
                  <Button variant="contained" onClick={handleSavePolicy} disabled={validationErrors.length > 0}>
                    {t.policies.save}
                  </Button>
                  <Button onClick={() => setDraft(null)}>{t.policies.cancel}</Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t.policies.title}</Typography>
            {expensePolicies.length === 0 ? (
              <Typography color="text.secondary">{t.policies.noPolicies}</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {[...expensePolicies].sort((a, b) => b.priority - a.priority).map((policy) => {
                  const hasConflict = conflicts.some(({ firstPolicy, secondPolicy }) =>
                    firstPolicy.id === policy.id || secondPolicy.id === policy.id,
                  );
                  return (
                    <Box key={policy.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{policy.name}</Typography>
                        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                          <Chip size="small" label={`${policy.category === '*' ? t.policies.allCategories : policy.category} · P${policy.priority}`} />
                          <Chip size="small" label={splitTypeLabel(policy.splitType, t)} />
                          <Chip size="small" color={policy.enabled ? 'success' : 'default'} label={policy.enabled ? t.policies.active : t.policies.inactive} />
                          {hasConflict && <Chip size="small" color="warning" label={t.policies.conflict} />}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0}>
                        <IconButton aria-label={`${t.policies.edit} ${policy.name}`} size="small" onClick={() => startEditPolicy(policy)}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton aria-label={`${t.policies.delete} ${policy.name}`} size="small" color="error" onClick={() => handleDeletePolicy(policy)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Stack>

        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>{t.policies.preview}</Typography>
                {selectedTransaction && (
                  <Typography variant="body2" color="text.secondary">
                    {selectedTransaction.category} · {selectedTransaction.description}
                  </Typography>
                )}
              </Box>
              {expenses.length > 0 && (
                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 } }}>
                  <InputLabel>{t.policies.selectExpense}</InputLabel>
                  <Select
                    value={selectedTransaction?.id ?? ''}
                    label={t.policies.selectExpense}
                    onChange={(event) => setSelectedTransactionId(event.target.value)}
                  >
                    {expenses.map((transaction) => (
                      <MenuItem key={transaction.id} value={transaction.id}>
                        {expenseLabel(transaction, languageCode)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Stack>
            {!selectedTransaction ? (
              <Alert severity="info">{t.policies.noExpenses}</Alert>
            ) : (
              <>
                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Chip label={`${formatAmount(selectedTransaction.cost, selectedTransaction.currency, languageCode)} · ${selectedTransaction.currency}`} />
                  {selectedRule.policy && (
                    <Chip
                      color="primary"
                      label={`${t.policies.choosePolicy}: ${selectedRule.policy.name} · P${selectedRule.policy.priority}`}
                    />
                  )}
                </Stack>
                {selectedRule.conflict && <Alert severity="error" sx={{ mb: 2 }}>{t.policies.ambiguousRule}</Alert>}
                {!selectedRule.conflict && !selectedRule.policy && <Alert severity="info" sx={{ mb: 2 }}>{t.policies.noRule}</Alert>}
                {proposed?.errors.map((error) => <Alert severity="error" sx={{ mb: 1 }} key={error}>{error}</Alert>)}
                {displayWarnings.map((warning) => <Alert severity="warning" sx={{ mb: 1 }} key={warning}>{warning}</Alert>)}

                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t.policies.member}</TableCell>
                        <TableCell align="right">{t.policies.existing}</TableCell>
                        <TableCell align="right">{t.policies.proposed}</TableCell>
                        <TableCell align="right">Δ</TableCell>
                        <TableCell>{t.policies.calculation}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparisonMembers.map((member) => {
                        const currentShare = existing?.allocations.get(member) ?? 0;
                        const proposedShare = proposedByMember.get(member);
                        return (
                          <TableRow key={member}>
                            <TableCell>{member}</TableCell>
                            <TableCell align="right">{formatAmount(currentShare, selectedTransaction.currency, languageCode)}</TableCell>
                            <TableCell align="right">
                              {proposedShare
                                ? formatAmount(proposedShare.amount, selectedTransaction.currency, languageCode)
                                : '—'}
                            </TableCell>
                            <TableCell align="right">
                              {proposedShare
                                ? formatAmount(proposedShare.amount - currentShare, selectedTransaction.currency, languageCode)
                                : '—'}
                            </TableCell>
                            <TableCell sx={{ minWidth: 190 }}>
                              {proposedShare ? (
                                <Stack spacing={0.25}>
                                  {proposedShare.steps.map((step) => <Typography variant="caption" key={step}>{step}</Typography>)}
                                  {Math.abs(proposedShare.roundingAdjustment) >= 0.005 && (
                                    <Typography variant="caption" color="warning.main">
                                      {t.policies.adjustment}: {formatAmount(proposedShare.roundingAdjustment, selectedTransaction.currency, languageCode)}
                                    </Typography>
                                  )}
                                </Stack>
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              </>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t.policies.audit}</Typography>
            {expensePolicyAudit.length === 0 ? (
              <Typography color="text.secondary">{t.policies.auditEmpty}</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1}>
                {expensePolicyAudit.slice(0, 20).map((entry) => (
                  <Box key={entry.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{entry.summary}</Typography>
                      <Typography variant="caption" color="text.secondary">{entry.policyName} · {entry.action}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(entry.timestamp).toLocaleString(languageCode)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      </Box>
      <Box sx={{ mt: 3 }}>
        <CounterfactualFairnessSimulator
          transactions={expenses}
          members={members}
          currency={parsedData?.currency ?? 'EUR'}
          language={language}
        />
      </Box>
    </Box>
  );
};
