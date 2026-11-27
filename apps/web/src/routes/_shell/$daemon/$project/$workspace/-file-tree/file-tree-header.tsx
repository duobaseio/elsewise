import { DockToolHeader } from '@elsewise/components/components/dock';
import type { IDockviewPanelHeaderProps } from 'dockview-react';

export function FileTreeHeader(props: Pick<IDockviewPanelHeaderProps, 'api'>) {
  return <DockToolHeader title={props.api.title} />;
}
