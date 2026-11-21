import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Último recurso: se uma tela quebrar durante a renderização, mostra uma saída em vez de deixar
 * a tela em branco. Os dados ficam no banco; recarregar o app não perde o progresso salvo.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sem envio para fora do aparelho (o app é offline); o registro fica no console do WebView.
    console.error('ScaleMonster: erro de tela', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot-error" role="alert" style={{ padding: 24, maxWidth: 560, margin: '48px auto' }}>
        <h1>Algo deu errado nesta tela</h1>
        <p>Seu progresso continua salvo. Tente voltar à tela anterior; se persistir, feche e abra o app.</p>
        <p style={{ opacity: 0.7, fontSize: 13 }}>{this.state.error.message}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={this.reset}>
            Tentar de novo
          </button>
          <button type="button" className="ghost" onClick={() => window.location.assign('/')}>
            Ir ao início
          </button>
        </div>
      </div>
    );
  }
}
