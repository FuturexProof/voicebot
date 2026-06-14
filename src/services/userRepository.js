const sql = require('mssql');

class UserRepository {
  constructor(connectionString) {
    if (!connectionString) {
      console.warn('[userRepository] Kein SQL Connection String');
      return;
    }
    this.pool = new sql.ConnectionPool(connectionString);
    this.ready = this.pool.connect().catch(err => {
      console.error('SQL-Verbindung fehlgeschlagen:', err.message);
      throw err;
    });
  }

  async insert(u) {
    await this.ready;
    const r = this.pool.request();
    r.input('FirstName',   sql.NVarChar(100), u.firstName);
    r.input('LastName',    sql.NVarChar(100), u.lastName);
    r.input('DateOfBirth', sql.Date,          new Date(u.dob));
    r.input('Email',       sql.NVarChar(254), u.email);
    r.input('Phone',       sql.NVarChar(30),  u.phone);
    r.input('Street',      sql.NVarChar(200), u.street);
    r.input('Zip',         sql.NVarChar(10),  u.zip);
    r.input('City',        sql.NVarChar(100), u.city);
    r.input('Country',     sql.NVarChar(60),  u.country);
    return r.query(`
      INSERT INTO Users
        (FirstName, LastName, DateOfBirth, Email, Phone, Street, Zip, City, Country)
      VALUES
        (@FirstName, @LastName, @DateOfBirth, @Email, @Phone, @Street, @Zip, @City, @Country)
    `);
  }

  async list({ search, limit = 100 } = {}) {
    await this.ready;
    const r = this.pool.request();
    let q = 'SELECT TOP (@limit) * FROM Users';
    r.input('limit', sql.Int, limit);
    if (search) {
      r.input('q', sql.NVarChar(100), `%${search}%`);
      q += ' WHERE LastName LIKE @q OR FirstName LIKE @q OR Email LIKE @q OR City LIKE @q';
    }
    q += ' ORDER BY CreatedAt DESC';
    const result = await r.query(q);
    return result.recordset;
  }
}

module.exports = { UserRepository };
