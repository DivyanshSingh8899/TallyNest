import { useMemo, useEffect, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useStore } from '../../store';

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const { themeMode } = useStore();

  const isDarkMode = themeMode === 'dark';

  // Update data-theme attribute on document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDarkMode ? 'dark' : 'light',
          primary: {
            main: '#1f7770',
            light: '#5ca9a0',
            dark: '#155852',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#d97745',
            light: '#e39b72',
            dark: '#a9542d',
          },
          error: {
            main: '#b8544d',
          },
          success: {
            main: '#3f8062',
          },
          background: {
            default: isDarkMode ? '#10201f' : '#f5f0e8',
            paper: isDarkMode ? '#1b3431' : '#fffdf9',
          },
          text: {
            primary: isDarkMode ? '#f8f3e9' : '#252522',
            secondary: isDarkMode ? '#b9c4bb' : '#746f65',
          },
        },
        typography: {
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          h1: {
            fontWeight: 700,
            letterSpacing: '-0.02em',
          },
          h2: {
            fontWeight: 600,
            letterSpacing: '-0.01em',
          },
          h3: {
            fontWeight: 600,
          },
          h4: {
            fontWeight: 600,
          },
          h5: {
            fontWeight: 500,
          },
          h6: {
            fontWeight: 500,
          },
          button: {
            textTransform: 'none',
            fontWeight: 500,
          },
        },
        shape: {
          borderRadius: 12,
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 8,
                padding: '10px 20px',
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(72, 190, 157, 0.3)',
                },
              },
              contained: {
                background: 'linear-gradient(135deg, #1f7770 0%, #155852 100%)',
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 16,
                boxShadow: isDarkMode
                  ? '0 4px 20px rgba(0, 0, 0, 0.3)'
                  : '0 4px 20px rgba(0, 0, 0, 0.08)',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 8,
              },
            },
          },
        },
      }),
    [isDarkMode]
  );

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};
