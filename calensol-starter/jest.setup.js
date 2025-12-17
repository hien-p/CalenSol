import '@testing-library/jest-dom';

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL = 'https://api.devnet.solana.com';
process.env.NEXT_PUBLIC_LAZORKIT_PORTAL_URL = 'https://portal.lazor.sh';
process.env.NEXT_PUBLIC_LAZORKIT_PAYMASTER_URL = 'https://lazorkit-paymaster.onrender.com';
process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';
process.env.CRON_SECRET = 'test-cron-secret';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window.navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
