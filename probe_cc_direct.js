// One-off: check which CodeChef user handles actually resolve (HEAD probes)
const http = require('http');
(async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const hosts = ['codechef.com', 'www.codechef.com'];
  const users = ['luckyoo7173941', 'anushree_mishra15', 'anmolvats001', 'aryan_2417'];
  for (const u of users) {
    for (const host of hosts) {
      for (const trailing of [true, false]) {
        const path = '/users/' + u + (trailing ? '/' : '');
        const options = { hostname: host, path, method: 'HEAD', timeout: 15000, headers: { 'User-Agent': UA } };
        try {
          const req = http.request(options, (res) => {
            console.log(u, '@', host, '=', res.statusCode, res.headers.location || '(no loc)');
          });
          req.on('error', () => {});
          req.end();
        } catch (e) {}
      }
    }
  }
})();

