import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowRightLeft, Check, Plus, RotateCcw, Sparkles, Trash2, UserRound } from 'lucide-react';
import { FileUpload } from '../transactions/FileUpload';
import { useStore } from '../../store';
import { generateSettlementPlan, type SettlementPlan, type UnavailableRoute } from '../../utils/debtSettlement';

const getCurrencyScale = (currency: string): number => {
  try {
    return 10 ** (new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2);
  } catch {
    return 100;
  }
};

const formatSettlementCurrency = (amount: number, currency: string, language: string): string => {
  try {
    return new Intl.NumberFormat(language === 'it' ? 'it-IT' : 'en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export const SmartDebtSettlementPage = () => {
  const { parsedData, language } = useStore();
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [maxTransferAmount, setMaxTransferAmount] = useState('');
  const [unavailableRoutes, setUnavailableRoutes] = useState<UnavailableRoute[]>([]);
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [routeError, setRouteError] = useState('');
  const [plan, setPlan] = useState<SettlementPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const currencies = parsedData?.currencies.length
    ? parsedData.currencies
    : parsedData ? [parsedData.currency] : [];
  const currency = currencies.includes(selectedCurrency)
    ? selectedCurrency
    : parsedData?.currency || 'EUR';
  const members = parsedData?.members ?? [];
  const balances = useMemo(() => Object.fromEntries(members.map((member) => [
    member.name,
    member.balancesByCurrency[currency]?.balance ?? 0,
  ])), [members, currency]);
  const currencyScale = getCurrencyScale(currency);
  const memberBalances = members.map((member) => ({
    name: member.name,
    balance: balances[member.name] ?? 0,
    minorBalance: Math.round((balances[member.name] ?? 0) * currencyScale),
  }));
  const totalToSettle = memberBalances
    .filter(({ minorBalance }) => minorBalance < 0)
    .reduce((total, member) => total - member.minorBalance, 0) / currencyScale;
  const amountFieldError = maxTransferAmount.trim() !== '' &&
    (!Number.isFinite(Number(maxTransferAmount)) || Number(maxTransferAmount) <= 0);

  const addUnavailableRoute = () => {
    setRouteError('');
    if (!routeFrom || !routeTo) {
      setRouteError('Choose both members to block a payment route.');
      return;
    }
    if (routeFrom === routeTo) {
      setRouteError('A member cannot be blocked from paying themselves.');
      return;
    }
    if (unavailableRoutes.some((route) => route.from === routeFrom && route.to === routeTo)) {
      setRouteError('That payment route is already blocked.');
      return;
    }
    setUnavailableRoutes((routes) => [...routes, { from: routeFrom, to: routeTo }]);
    setRouteFrom('');
    setRouteTo('');
    setPlan(null);
  };

  const resetConstraints = () => {
    setMaxTransferAmount('');
    setUnavailableRoutes([]);
    setRouteFrom('');
    setRouteTo('');
    setRouteError('');
    setPlan(null);
  };

  const generatePlan = async () => {
    setIsGenerating(true);
    setPlan(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      setPlan(generateSettlementPlan(balances, currency, {
        maxTransferAmount: maxTransferAmount.trim() === '' ? null : Number(maxTransferAmount),
        unavailableRoutes,
      }));
    } catch {
      setPlan({
        status: 'infeasible',
        transfers: [],
        totalTransferred: 0,
        remainingBalances: balances,
        allConstraintsSatisfied: false,
        minimumTransfers: 'not-applicable',
        exploredStates: 0,
        error: 'A valid settlement plan could not be calculated from this group data.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!parsedData) {
    return (
      <Box className="animate-fade-in">
        <Typography variant="h4" fontWeight={700} gutterBottom>Smart Debt Settlement</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Build a payment plan from your group’s imported balances.
        </Typography>
        <FileUpload />
      </Box>
    );
  }

  return (
    <Box className="animate-fade-in">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>Smart Debt Settlement</Typography>
          <Typography color="text.secondary">
            Plan member-to-member payments without changing your imported balances.
          </Typography>
        </Box>
        {currencies.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="settlement-currency-label">Currency</InputLabel>
            <Select
              labelId="settlement-currency-label"
              value={currency}
              label="Currency"
              onChange={(event) => {
                setSelectedCurrency(event.target.value);
                setPlan(null);
              }}
            >
              {currencies.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1}
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h6" fontWeight={650}>Group balance summary</Typography>
            <Typography variant="body2" color="text.secondary">Balances in {currency}</Typography>
          </Box>
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="caption" color="text.secondary">Total amount to settle</Typography>
            <Typography variant="h5" fontWeight={700}>
              {formatSettlementCurrency(totalToSettle, currency, language)}
            </Typography>
          </Box>
        </Stack>
        <Grid container spacing={1.5}>
          {memberBalances.map(({ name, balance, minorBalance }) => {
            const state = minorBalance > 0 ? 'Creditor' : minorBalance < 0 ? 'Debtor' : 'Settled';
            const color = minorBalance > 0 ? 'success' : minorBalance < 0 ? 'error' : 'default';
            return (
              <Grid key={name} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Paper variant="outlined" sx={{ p: 1.75, height: '100%', borderRadius: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                      <UserRound size={17} aria-hidden="true" />
                      <Typography fontWeight={600} noWrap>{name}</Typography>
                    </Stack>
                    <Chip size="small" color={color} variant={color === 'default' ? 'outlined' : 'filled'} label={state} />
                  </Stack>
                  <Typography
                    variant="h6"
                    fontWeight={650}
                    className={minorBalance > 0 ? 'credit-text' : minorBalance < 0 ? 'debt-text' : undefined}
                    sx={{ mt: 1 }}
                  >
                    {formatSettlementCurrency(Math.abs(balance), currency, language)}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
                      {minorBalance > 0 ? 'to receive' : minorBalance < 0 ? 'to pay' : 'balanced'}
                    </Typography>
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
          {memberBalances.length === 0 && (
            <Grid size={{ xs: 12 }}>
              <Alert severity="info">No members were found in this import.</Alert>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1}
          sx={{ mb: 2.5 }}
        >
          <Box>
            <Typography variant="h6" fontWeight={650}>Payment constraints</Typography>
            <Typography variant="body2" color="text.secondary">
              Routes are directional: blocking A → B still allows B → A.
            </Typography>
          </Box>
          <Button onClick={resetConstraints} startIcon={<RotateCcw size={16} />} color="inherit">
            Reset constraints
          </Button>
        </Stack>

        <Grid container spacing={2.5} alignItems="flex-start">
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label={`Maximum transfer amount (${currency})`}
              value={maxTransferAmount}
              onChange={(event) => {
                setMaxTransferAmount(event.target.value);
                setPlan(null);
              }}
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              error={amountFieldError}
              helperText={amountFieldError ? 'Enter a positive amount, or leave empty for no limit.' : 'Leave empty for no per-transaction limit.'}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Unavailable payment routes
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <FormControl size="small" fullWidth>
                <InputLabel id="route-from-label">Sender</InputLabel>
                <Select
                  labelId="route-from-label"
                  value={routeFrom}
                  label="Sender"
                  onChange={(event) => {
                    setRouteFrom(event.target.value);
                    if (event.target.value === routeTo) setRouteTo('');
                    setRouteError('');
                  }}
                >
                  <MenuItem value=""><em>Select member</em></MenuItem>
                  {members.map((member) => <MenuItem key={member.name} value={member.name}>{member.name}</MenuItem>)}
                </Select>
              </FormControl>
              <ArrowRightLeft size={18} aria-hidden="true" style={{ alignSelf: 'center', flexShrink: 0 }} />
              <FormControl size="small" fullWidth>
                <InputLabel id="route-to-label">Receiver</InputLabel>
                <Select
                  labelId="route-to-label"
                  value={routeTo}
                  label="Receiver"
                  onChange={(event) => {
                    setRouteTo(event.target.value);
                    setRouteError('');
                  }}
                >
                  <MenuItem value=""><em>Select member</em></MenuItem>
                  {members.filter((member) => member.name !== routeFrom)
                    .map((member) => <MenuItem key={member.name} value={member.name}>{member.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                onClick={addUnavailableRoute}
                startIcon={<Plus size={16} />}
                sx={{ flexShrink: 0, minHeight: 40 }}
                disabled={members.length < 2}
              >
                Block route
              </Button>
            </Stack>
            {routeError && <FormHelperText error>{routeError}</FormHelperText>}
            {unavailableRoutes.length > 0 && (
              <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                {unavailableRoutes.map((route, index) => (
                  <Stack key={`${route.from}-${route.to}-${index}`} direction="row" alignItems="center" spacing={0.75}>
                    <Chip
                      size="small"
                      variant="outlined"
                      color="error"
                      label={`${route.from} → ${route.to} unavailable`}
                    />
                    <IconButton
                      size="small"
                      aria-label={`Remove blocked route from ${route.from} to ${route.to}`}
                      title="Remove blocked route"
                      onClick={() => {
                        setUnavailableRoutes((routes) => routes.filter((_, routeIndex) => routeIndex !== index));
                        setPlan(null);
                      }}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
          </Grid>
        </Grid>

        <Divider sx={{ my: 2.5 }} />
        <Button
          variant="contained"
          size="large"
          onClick={generatePlan}
          disabled={isGenerating || amountFieldError}
          startIcon={isGenerating ? <CircularProgress size={18} color="inherit" /> : <Sparkles size={18} />}
        >
          {isGenerating ? 'Generating plan…' : plan ? 'Recalculate Plan' : 'Generate Settlement Plan'}
        </Button>
      </Paper>

      {plan && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1}
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography variant="h6" fontWeight={650}>Settlement plan</Typography>
              <Typography variant="body2" color="text.secondary">
                {plan.status === 'success' ? 'Generated from the current group balances and constraints.' : 'No complete valid plan was found for these constraints.'}
              </Typography>
            </Box>
            <Chip
              icon={plan.status === 'success' ? <Check size={16} /> : undefined}
              color={plan.status === 'success' ? 'success' : 'error'}
              label={plan.status === 'success' ? 'All constraints satisfied' : 'Infeasible'}
            />
          </Stack>

          {plan.status === 'infeasible' ? (
            <Alert severity="error">
              {plan.error || 'No valid complete settlement plan is available.'}
              <Box sx={{ mt: 1 }}>
                Remaining balances: {Object.entries(plan.remainingBalances)
                  .map(([name, amount]) => `${name}: ${formatSettlementCurrency(amount, currency, language)}`)
                  .join(' · ')}
              </Box>
            </Alert>
          ) : (
            <>
              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Transfers</Typography>
                    <Typography variant="h6" fontWeight={700}>{plan.transfers.length}</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Total transferred</Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {formatSettlementCurrency(plan.totalTransferred, currency, language)}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Unsettled balance</Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {formatSettlementCurrency(0, currency, language)}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Alert severity="success" sx={{ mb: 2 }}>
                This plan settles all balances. {plan.minimumTransfers === 'proven'
                  ? 'The transfer count is a proven minimum for this unconstrained plan.'
                  : 'Transfer count is a heuristic result; it is not guaranteed to be the global minimum.'}
              </Alert>

              {plan.transfers.length === 0 ? (
                <Alert severity="info">Everyone is already settled in {currency}.</Alert>
              ) : (
                <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                  <Table size="small" aria-label="Proposed settlement transfers">
                    <TableHead>
                      <TableRow>
                        <TableCell>Transaction</TableCell>
                        <TableCell>Sender</TableCell>
                        <TableCell>Receiver</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Payment route</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {plan.transfers.map((transfer, index) => (
                        <TableRow key={`${transfer.from}-${transfer.to}-${index}`}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{transfer.from}</TableCell>
                          <TableCell>{transfer.to}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {formatSettlementCurrency(transfer.amount, currency, language)}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" color="success" variant="outlined" label="Available" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 2 }}>
            <Check size={14} aria-hidden="true" />
            Plans are proposals only; no imported transaction or member balance is changed.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};
