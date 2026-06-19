import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, LogOut } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    this.setState({ errorInfo });
    
    // Store last error for debugging
    try {
      localStorage.setItem("lastError", JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      // Ignore storage errors
    }

    // If the error seems auth-related, auto-redirect to login
    const errorMsg = error.message?.toLowerCase() || "";
    const isAuthRelated = 
      errorMsg.includes("session") ||
      errorMsg.includes("jwt") ||
      errorMsg.includes("unauthorized") ||
      errorMsg.includes("not authenticated") ||
      errorMsg.includes("auth") ||
      errorMsg.includes("token");
    
    if (isAuthRelated) {
      console.warn("[ErrorBoundary] Auth-related error detected, redirecting to login");
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
    }
  }

  handleReload = () => {
    // Reset error state first, then reload
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleLogout = () => {
    // Clear all auth-related storage to ensure clean state
    try {
      localStorage.removeItem("activeCompanyId");
      // Clear supabase auth tokens
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      // Ignore
    }
    window.location.href = "/auth";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-destructive/10">
                <AlertTriangle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                Algo correu mal
              </h1>
              <p className="text-muted-foreground">
                Ocorreu um erro inesperado. Por favor, tenta recarregar a página.
              </p>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="text-left p-4 bg-muted rounded-lg overflow-auto max-h-48">
                <p className="text-sm font-mono text-destructive">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Recarregar página
              </Button>
              <Button variant="outline" onClick={this.handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Voltar ao login
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
