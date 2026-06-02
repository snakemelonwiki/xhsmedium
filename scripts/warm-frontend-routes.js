const http = require('node:http');

const baseUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3002';
const routes = [
  '/operation',
  '/operation/leads',
  '/operation/posts/new',
  '/operation/leads/new',
  '/operation/posts',
  '/operation/gallery',
  '/operation/rankings',
  '/operation/dashboard',
  '/operation/collaboration',
  '/operation/leads/source-pending',
  '/operation/imports',
  '/operation/messages',
  '/sales/leads',
  '/sales/followups',
  '/sales/collaboration',
  '/sales/passive-leads',
  '/sales/orders',
  '/sales/messages',
  '/academic',
  '/academic/orders',
  '/academic/abnormal',
  '/academic/messages',
  '/admin',
  '/admin/leads',
  '/admin/employees',
  '/admin/orders',
  '/admin/accounts',
  '/admin/analytics',
  '/admin/messages',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(pathname) {
  return new Promise((resolve) => {
    const requestUrl = new URL(pathname, baseUrl);
    const req = http.get(requestUrl, (response) => {
      response.resume();
      response.on('end', () => resolve({
        pathname,
        statusCode: response.statusCode || 0,
      }));
    });

    req.setTimeout(30_000, () => req.destroy(new Error('request timeout')));
    req.on('error', (error) => resolve({ pathname, error }));
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await request('/login');
    if (!result.error && result.statusCode < 500) return true;
    await sleep(500);
  }
  return false;
}

async function warmRoutes() {
  console.log('[warmup] Waiting for the local frontend...');
  if (!(await waitUntilReady())) {
    console.log('[warmup] Frontend was not ready in time. Skipping route warmup.');
    return;
  }

  console.log('[warmup] Compiling menu routes in the background...');
  for (let index = 0; index < routes.length; index += 3) {
    const batch = routes.slice(index, index + 3);
    const results = await Promise.all(batch.map(request));
    const failedRoutes = results.filter((result) => result.error || result.statusCode >= 500);
    if (failedRoutes.length) {
      console.log(`[warmup] Skipped: ${failedRoutes.map((result) => result.pathname).join(', ')}`);
    }
  }
  console.log('[warmup] Menu routes are ready.');
}

warmRoutes().catch((error) => {
  console.log(`[warmup] Skipped because warmup failed: ${error.message}`);
});
