// PostgreSQL connection for Lambda. Credentials come from Secrets Manager (RDS-managed secret).
import pg from "pg";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

let pool;

export async function getPool() {
  if (pool) return pool;
  const sm = new SecretsManagerClient({});
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
  const { username, password } = JSON.parse(secret.SecretString);
  pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "seatsignal",
    user: username,
    password,
    max: 2,
    ssl: { rejectUnauthorized: true },
  });
  return pool;
}

export async function tx(fn) {
  const client = await (await getPool()).connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
