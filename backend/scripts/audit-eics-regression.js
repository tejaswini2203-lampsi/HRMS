const http = require('http');

function get(path, token) {
  return new Promise((resolve) => {
    http.get({ hostname: 'localhost', port: 3000, path, headers: token ? { Authorization: 'Bearer ' + token } : {} }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
  });
}

async function main() {
  const loginRes = await new Promise(resolve => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
    req.write(JSON.stringify({ username: 'admin@eicscomp.com', password: 'eics@4321' }));
    req.end();
  });
  const token = loginRes.accessToken;
  console.log('Login token acquired:', !!token);

  const endpoints = [
    '/employees',
    '/departments',
    '/leaves',
    '/passports/alerts',
    '/passports/1',
    '/vehicle-allocations/1',
    '/flight-tickets/1',
    '/notifications',
    '/compliance/cases',
    '/work-queue/tasks',
    '/documents',
    '/letters'
  ];

  for (const ep of endpoints) {
    const res = await get(ep, token);
    const count = Array.isArray(res.data) ? res.data.length : (typeof res.data === 'object' ? Object.keys(res.data).length : 'text');
    console.log(`Endpoint ${ep.padEnd(25)} -> Status: ${res.status}, Count: ${count}`);
  }
}
main().catch(console.error);
