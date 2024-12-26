import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import pg from "pg";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const app = express();
const PORT = 7004;

// Category mapping
const CATEGORY_MAPPING = {
  SOCIAL: "social",
  ENTERTAINMENT: "entertainment",
  GAMES: "games",
  MUSIC: "music",
  DATING: "dating",
};

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Drop existing enum type if exists
    await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_category') THEN 
          DROP TYPE app_category CASCADE;
        END IF;
      END $$;
    `);

    // Create app_category enum with lowercase values
    await client.query(`
      CREATE TYPE app_category AS ENUM (
        'social',
        'entertainment',
        'games',
        'music',
        'dating'
      );
    `);

    // Create available_app table
    await client.query(`
      CREATE TABLE IF NOT EXISTS available_app (
        id SERIAL PRIMARY KEY,
        name TEXT,
        category app_category NOT NULL,
        android_package_name TEXT DEFAULT NULL,
        ios_bundle_id TEXT DEFAULT NULL,
        developer_name TEXT,
        icon VARCHAR,
        domain_name TEXT[] DEFAULT '{}'::text[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_ios_bundle_id_android_package_name 
          UNIQUE (ios_bundle_id, android_package_name)
      );

      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_available_app_timestamp ON available_app;
      
      CREATE TRIGGER update_available_app_timestamp
        BEFORE UPDATE ON available_app
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  } finally {
    client.release();
  }
}

function normalizeCategory(category) {
  const upperCategory = category?.toUpperCase();
  if (!upperCategory || !CATEGORY_MAPPING[upperCategory]) {
    throw new Error(`Invalid category: ${category}`);
  }
  return CATEGORY_MAPPING[upperCategory];
}

function normalizeApp(app) {
  return {
    name: app.title,
    category: normalizeCategory(app.cat_key),
    android_package_name: app.android_package_name || null,
    ios_bundle_id: app.ios_bundle_id || null,
    developer_name: app.developer,
    icon: app.icon,
    domain_name: Array.isArray(app.domain_name) ? app.domain_name : [],
  };
}

async function upsertApp(client, app) {
  const normalizedApp = normalizeApp(app);

  const query = `
    INSERT INTO available_app (
      name,
      category,
      android_package_name,
      ios_bundle_id,
      developer_name,
      icon,
      domain_name
    ) VALUES ($1, $2::app_category, $3, $4, $5, $6, $7)
    ON CONFLICT (ios_bundle_id, android_package_name)
    DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      developer_name = EXCLUDED.developer_name,
      icon = EXCLUDED.icon,
      domain_name = EXCLUDED.domain_name,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;

  const values = [
    normalizedApp.name,
    normalizedApp.category,
    normalizedApp.android_package_name,
    normalizedApp.ios_bundle_id,
    normalizedApp.developer_name,
    normalizedApp.icon,
    normalizedApp.domain_name,
  ];

  try {
    const result = await client.query(query, values);
    return result.rows[0].id;
  } catch (error) {
    console.error(`Error upserting app ${app.title}:`, error);
    throw error;
  }
}

async function processAppsInBatches(client, apps, batchSize = 10) {
  const results = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, Math.min(i + batchSize, apps.length));

    await client.query("BEGIN");

    try {
      for (const app of batch) {
        await upsertApp(client, app);
        results.successful++;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Batch starting at index ${i} failed:`, error);

      batch.forEach((app) => {
        results.failed++;
        results.errors.push({
          app: app.title,
          error: error.message,
        });
      });
    }
  }

  return results;
}

app.get("/upload-to-db", async (req, res) => {
  const client = await pool.connect();
  try {
    await initializeDatabase();

    const processedData = JSON.parse(
      fs.readFileSync(
        "/Users/xforiauser/Desktop/playstore-apps/utils/processed-result.json",
        "utf8"
      )
    );

    const results = await processAppsInBatches(client, processedData);

    res.json({
      success: true,
      message: "Data uploaded to database successfully",
      stats: {
        total_processed: processedData.length,
        successful: results.successful,
        failed: results.failed,
      },
      errors: results.errors,
    });
  } catch (error) {
    console.error("Error uploading to database:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Error uploading to database",
    });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Visit http://localhost:${PORT}/upload-to-db to upload data to database`
  );
});
