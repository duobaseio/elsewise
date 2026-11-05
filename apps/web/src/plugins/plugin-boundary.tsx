import { Component, isValidElement, type ReactNode } from 'react';

interface State {
  failed: boolean;
  type: unknown;
}

/**
 * Renders `children`, a plugin's component, or `fallback` once it throws, logging the error as `name`'s. It renders
 * `children` again once given another component, e.g. a fixed one the plugin added under the same id.
 */
export class PluginBoundary extends Component<{ name: string; fallback?: ReactNode; children: ReactNode }, State> {
  override state: State = { failed: false, type: undefined };

  static getDerivedStateFromProps(props: { children: ReactNode }, state: State): Partial<State> | null {
    const type = isValidElement(props.children) ? props.children.type : undefined;
    return type === state.type ? null : { failed: false, type };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`${this.props.name} failed`, error);
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
