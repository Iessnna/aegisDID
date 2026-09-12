import React from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { clearIdentity } from '../lib/identityStorage';

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  private readonly childContent: React.ReactNode;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.childContent = props.children;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  handleReset = async () => {
    await clearIdentity();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.childContent;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071018] px-6 text-slate-100">
        <section className="aegis-panel w-full max-w-lg rounded-2xl p-6">
          <div className="flex items-center gap-3 text-rose-300"><TriangleAlert className="h-5 w-5" /><h1 className="aegis-display text-xl font-semibold">AegisDID hit an unexpected state</h1></div>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">Your encrypted local identity may be corrupted. Resetting it creates a fresh DID and keeps the server account untouched.</p>
          <div className="mt-5 flex items-center gap-3"><button onClick={this.handleReset} className="flex items-center gap-2 rounded-lg bg-[#b8ef78] px-3 py-2 text-xs font-bold text-[#071018]"><RotateCcw className="h-3.5 w-3.5" />Reset local identity</button><details className="text-xs text-slate-500"><summary className="cursor-pointer hover:text-slate-300">View error</summary><pre className="mt-2 max-w-full overflow-auto whitespace-pre-wrap text-[10px] text-rose-200">{this.state.error.stack || this.state.error.message}</pre></details></div>
        </section>
      </main>
    );
  }
}
