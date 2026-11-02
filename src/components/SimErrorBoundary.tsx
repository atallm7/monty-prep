import { Component, ReactNode } from 'react';
export default class SimErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) return <div className="figure"><div className="figure-error">This simulation hit an error: {this.state.err.message}</div></div>;
    return this.props.children;
  }
}
