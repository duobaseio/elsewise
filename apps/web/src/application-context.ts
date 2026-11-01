import { createContext, useContext } from 'react';
import type { ApplicationManager } from '@/application-manager';

// Separate from the manager, whose commands import the modules that read this context.
export const ApplicationManagerContext = createContext<ApplicationManager | null>(null);

export function useApplicationManager(): ApplicationManager {
  const application = useContext(ApplicationManagerContext);
  if (application === null) {
    throw new Error('Missing ApplicationManagerContext');
  }

  return application;
}
