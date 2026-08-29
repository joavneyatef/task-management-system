import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Shared MSW server for the jsdom (web) project. Lifecycle is wired in test/setup.web.ts. */
export const mswServer = setupServer(...handlers);
