import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useStore } from '../../store';
import { getTranslation } from '../../i18n/translations';
import type { Transaction } from '../../types';

interface CorrelationCoefficientChartProps {
  transactions: Transaction[];
}

const pearsonCorrelation = (left: number[], right: number[]) => {
  if (left.length < 2 || left.length !== right.length) return 0;

  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  left.forEach((value, index) => {
    const leftDelta = value - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  });

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 0 : numerator / denominator;
};

const correlationColor = (value: number) => {
  const strength = Math.abs(value);
  if (value >= 0) {
    return `rgba(72, 190, 157, ${0.16 + strength * 0.72})`;
  }
  return `rgba(255, 101, 47, ${0.16 + strength * 0.72})`;
};

export const CorrelationCoefficientChart: React.FC<CorrelationCoefficientChartProps> = ({
  transactions,
}) => {
  const { language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);

  const { members, matrix } = useMemo(() => {
    const expenseTransactions = transactions.filter((transaction) => !transaction.isTransfer);
    const memberNames = Array.from(
      new Set(expenseTransactions.flatMap((transaction) => Object.keys(transaction.memberBalances)))
    );

    const values = new Map<string, number[]>();
    memberNames.forEach((member) => values.set(member, []));
    expenseTransactions.forEach((transaction) => {
      memberNames.forEach((member) => values.get(member)!.push(transaction.memberBalances[member] || 0));
    });

    const coefficients = memberNames.map((rowMember) =>
      memberNames.map((columnMember) => pearsonCorrelation(values.get(rowMember)!, values.get(columnMember)!))
    );

    return { members: memberNames, matrix: coefficients };
  }, [transactions]);

  if (members.length < 2) {
    return <Typography color="text.secondary">{t.analytics.noDataAvailable}</Typography>;
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t.analytics.correlationDesc}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `minmax(90px, 0.8fr) repeat(${members.length}, minmax(58px, 1fr))`,
            minWidth: Math.max(360, members.length * 66 + 90),
            gap: 0.5,
          }}
        >
          <Box />
          {members.map((member) => (
            <Typography key={member} variant="caption" fontWeight={600} textAlign="center" noWrap>
              {member}
            </Typography>
          ))}
          {members.map((rowMember, rowIndex) => (
            <React.Fragment key={rowMember}>
              <Typography variant="caption" fontWeight={600} sx={{ alignSelf: 'center' }} noWrap>
                {rowMember}
              </Typography>
              {members.map((columnMember, columnIndex) => {
                const value = matrix[rowIndex][columnIndex];
                return (
                  <Box
                    key={`${rowMember}-${columnMember}`}
                    title={`${rowMember} / ${columnMember}: ${value.toFixed(2)}`}
                    sx={{
                      minHeight: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 1,
                      bgcolor: correlationColor(value),
                      color: Math.abs(value) > 0.58 ? '#fff' : 'text.primary',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {value.toFixed(2)}
                  </Box>
                );
              })}
            </React.Fragment>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 2, color: 'text.secondary', fontSize: '0.75rem' }}>
        <span style={{ color: '#48be9d' }}>+ {t.analytics.positiveCorrelation}</span>
        <span style={{ color: '#ff652f' }}>- {t.analytics.negativeCorrelation}</span>
        <span>{t.analytics.correlationRange}</span>
      </Box>
    </Box>
  );
};