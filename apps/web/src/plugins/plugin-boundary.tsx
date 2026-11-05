import { Component, type ReactNode } from 'react';

/**
 * Renders `children`, a plugin's component, or `fallback` once it throws, logging the error as `name`'s.
 */
export class PluginBoundary extends Component<
  { name: string; fallback?: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`${this.props.name} failed`, error);
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
