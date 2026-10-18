import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ColorPalette } from '../styles/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#090b10',
            color: '#f8fafc',
            fontFamily: "'JetBrains Mono', -apple-system, monospace",
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '680px',
              width: '100%',
              backgroundColor: '#14171f',
              border: `1px solid ${ColorPalette.accentRed}44`,
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: ColorPalette.accentRed,
                }}
              />
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: ColorPalette.accentRed }}>
                Application Encountered an Error
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              {this.state.error?.message || 'An unexpected runtime error occurred.'}
            </p>
            {this.state.error?.stack && (
              <pre
                style={{
                  backgroundColor: '#090b10',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#e6e8ed',
                  overflow: 'auto',
                  maxHeight: '220px',
                  border: '1px solid #2e303b',
                  margin: 0,
                }}
              >
                {this.state.error.stack}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  backgroundColor: 'var(--theme-primary, #38bdf8)',
                  color: '#090b10',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                Reload Application
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.clear();
                    window.location.reload();
                  } catch {}
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: '1px solid #333640',
                }}
              >
                Reset App Data & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
