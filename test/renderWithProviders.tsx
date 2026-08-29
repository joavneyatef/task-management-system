import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { LanguageProvider } from '../src/context/LanguageContext';

/**
 * Renders a component tree wrapped in the app's real context providers.
 * Add providers here as components start needing them (theme, etc.).
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: LanguageProvider, ...options }),
  };
}

export * from '@testing-library/react';
export { userEvent };
