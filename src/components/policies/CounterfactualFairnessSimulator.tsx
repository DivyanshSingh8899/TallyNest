import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
import { Calculator } from 'lucide-react';
import type { Transaction } from '../../types';
import { getTranslation } from '../../i18n/translations';
import { calculateScenario, type ScenarioPolicyType } from '../../utils/expensePolicy';

interface Props {
  transactions: Transaction[];
  members: string[];
  currency: string;
  language: string;
}

const policyTypes: ScenarioPolicyType[] = ['equal', 'consumption', 'roomSize', 'weighted'];

export const CounterfactualFairnessSimulator = ({ transactions, members, currency, language }: Props) => {
  const t = getTranslation(language === 'it' ? 'it' : 'en');
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [selectedPolicy, setSelectedPolicy] = useState<ScenarioPolicyType>('equal');
  const expenses = useMemo(
    () => transactions.filter((transaction) => !transaction.isTransfer && transaction.currency === currency),
    [transactions, currency],
  );
  const results = useMemo(() => Object.fromEntries(
    policyTypes.map((type) => [
      type,
      calculateScenario(expenses, members, { type, weights }, currency),
    ]),
  ), [expenses, members, weights, currency]);
  const selectedResult = results[selectedPolicy];
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(language === 'it' ? 'it-IT' : 'en-US', { style: 'currency', currency }).format(amount);
  const updateWeight = (member: string, value: string) => {
    setWeights((current) => ({ ...current, [member]: value === '' ? 0 : Math.max(0, Number(value)) }));
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>{t.policies.simulatorTitle}</Typography>
          <Typography variant="body2" color="text.secondary">{t.policies.simulatorSubtitle}</Typography>
        </Box>
        <Chip icon={<Calculator size={16} />} label={`${expenses.length} ${t.policies.simulatorExpenses}`} />
      </Stack>
      {members.length === 0 || expenses.length === 0 ? (
        <Alert severity="info">{t.policies.simulatorNoData}</Alert>
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 2 }}>
            <Select
              size="small"
              value={selectedPolicy}
              onChange={(event) => setSelectedPolicy(event.target.value as ScenarioPolicyType)}
              sx={{ minWidth: 220 }}
            >
              {policyTypes.map((type) => <MenuItem key={type} value={type}>{t.policies[type]}</MenuItem>)}
            </Select>
            {(selectedPolicy === 'roomSize' || selectedPolicy === 'weighted') && (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {t.policies.simulatorWeightsHint}
              </Typography>
            )}
          </Stack>
          {(selectedPolicy === 'roomSize' || selectedPolicy === 'weighted') && (
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {members.map((member) => (
                <TextField
                  key={member}
                  label={member}
                  type="number"
                  size="small"
                  value={weights[member] ?? ''}
                  onChange={(event) => updateWeight(member, event.target.value)}
                  inputProps={{ min: 0, step: 0.1 }}
                  sx={{ width: 130 }}
                />
              ))}
            </Stack>
          )}
          {selectedResult.warnings.map((warning) => <Alert severity="warning" key={warning}>{warning}</Alert>)}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mb: 2 }}>
            {policyTypes.map((type) => (
              <Button
                key={type}
                variant={selectedPolicy === type ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setSelectedPolicy(type)}
              >
                {t.policies[type]} · {results[type].fairnessScore.toFixed(1)}
              </Button>
            ))}
          </Stack>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="caption" color="text.secondary">{t.policies.simulatorFairnessHint}</Typography>
          <Box sx={{ overflowX: 'auto', mt: 1 }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t.policies.member}</TableCell>
                {policyTypes.map((type) => <TableCell align="right" key={type}>{t.policies[type]}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member}>
                    <TableCell>{member}</TableCell>
                    {policyTypes.map((type) => (
                      <TableCell align="right" key={type}>
                        {formatAmount(results[type].balances[member] ?? 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t.policies.simulatorSelected}: <strong>{t.policies[selectedPolicy]}</strong> · {t.policies.simulatorFairness}: {selectedResult.fairnessScore.toFixed(1)}
          </Typography>
        </>
      )}
    </Paper>
  );
};
