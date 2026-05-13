const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function basicAuth(req, res, next) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'change-me';
  const expected = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
  if (req.headers.authorization !== expected) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.send(401, 'Unauthorized');
    return;
  }
  next();
}

module.exports = function(server, userRepo) {
  // Sync Handler — DARF next haben
  server.get('/admin', basicAuth, (req, res, next) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname, 'dashboard.html')));
    return next();
  });

  // Async Handler — DARF KEIN next haben (Restify 11+ Regel)
  server.get('/admin/api/users', basicAuth, async (req, res) => {
    try {
      const users = await userRepo.list({ search: req.query.q });
      res.send(users);
    } catch (e) {
      res.send(500, { error: e.message });
    }
  });

  server.get('/admin/api/export.json', basicAuth, async (req, res) => {
    try {
      const users = await userRepo.list({ limit: 10000 });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=users.json');
      res.end(JSON.stringify(users, null, 2));
    } catch (e) {
      res.send(500, { error: e.message });
    }
  });

  server.get('/admin/api/export.csv', basicAuth, async (req, res) => {
    try {
      const users = await userRepo.list({ limit: 10000 });
      const header = 'Id;FirstName;LastName;Email;City;CreatedAt\n';
      const rows = users.map(u =>
        [u.Id, u.FirstName, u.LastName, u.Email, u.City, u.CreatedAt].join(';')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
      res.end(header + rows);
    } catch (e) {
      res.send(500, { error: e.message });
    }
  });

  server.get('/admin/api/stats.pdf', basicAuth, async (req, res) => {
    try {
      const users = await userRepo.list({ limit: 10000 });
      res.setHeader('Content-Type', 'application/pdf');
      const doc = new PDFDocument();
      doc.pipe(res);
      doc.fontSize(20).text('Benutzerstatistik', { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(`Anzahl Accounts: ${users.length}`);
      doc.moveDown();
      const byCity = users.reduce((acc, u) =>
        (acc[u.City] = (acc[u.City] || 0) + 1, acc), {}
      );
      doc.text('Verteilung nach Stadt:');
      Object.entries(byCity).sort((a,b) => b[1]-a[1]).forEach(([c, n]) =>
        doc.text(`  ${c}: ${n}`)
      );
      doc.end();
    } catch (e) {
      res.send(500, { error: e.message });
    }
  });
};
