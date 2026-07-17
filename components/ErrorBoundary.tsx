"use client";

import React from "react";

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("Caught by ErrorBoundary:", error);
  }

  resetData = () => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
      window.location.href = "/";
    }
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
            <h1 className="mb-2 text-lg font-bold text-red-600">Something went wrong</h1>
            <p className="mb-4 text-sm text-slate-500">
              The app hit an unexpected error, most likely from malformed data (e.g. an
              imported backup with an unexpected value). You can try reloading, or reset
              all local data if reloading doesn't help.
            </p>
            <p className="mb-4 rounded bg-slate-50 p-2 text-left text-xs text-slate-400">{this.state.message}</p>
            <div className="flex justify-center gap-3">
              <button onClick={this.reload} className="rounded bg-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-300">
                Reload
              </button>
              <button onClick={this.resetData} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Reset local data
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
