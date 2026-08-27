const { Pool } = require("pg");

const databaseUrl =
  process.env.DATABASE_URL;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
    })
  : null;

pool?.on("error", (error) => {
  console.error(
    "PostgreSQL 연결 오류:",
    error
  );
});

module.exports = {
  hasDatabaseUrl: Boolean(databaseUrl),
  pool,
  query(text, params) {
    if (!pool) {
      throw new Error(
        "PostgreSQL query attempted without DATABASE_URL."
      );
    }

    return pool.query(text, params);
  },
};
