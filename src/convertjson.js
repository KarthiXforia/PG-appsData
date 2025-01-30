import fs from "fs";  // Use the regular fs module for streams
import csv from "csv-parser";
import express from "express";
import path from "path";

const INPUT_FILE_PATH = "/Users/Xforia-User/Downloads/five - Sheet1.csv";
const OUTPUT_FILE_PATH = "output.json";
const PORT = 7005;
const BATCH_SIZE = 100;

const app = express();
app.use(express.json());

async function processCSV(filePath) {
  try {
    console.log(`Reading CSV file from: ${filePath}`);
    const results = [];
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)  // Using regular fs module for streams
        .pipe(csv())
        .on("data", (row) => {
          try {
            const jsonData = {
              app_availability: {
                available_in: row.available_in ? row.available_in.split(",") : [],
                package_name: row.android_package_name || "",
              },
              cat_key: row.cat_key || "",
              cat_keys: row.cat_keys ? row.cat_keys.split(",") : [],
              category: row.category || "",
              description: row.description || "",
              android_package_name: row.android_package_name || "",
              ios_bundle_id: row.ios_bundle_id || "",
              title: row.title || "",
              domain_name: row.domain_name ? row.domain_name.split(",") : [],
              website: row.website || "",
              developer: row.developer || "",
              app_country: row.app_country || "",
              icon: row.icon || "",
              icon_72: row.icon_72 || "",
              market_status: row.market_status || "",
            };

            results.push(jsonData);
          } catch (error) {
            console.error("Error processing row:", row, error);
          }
        })
        .on("end", async () => {
          try {
            await fs.promises.writeFile(OUTPUT_FILE_PATH, JSON.stringify(results, null, 2));
            console.log(`JSON file has been created: ${OUTPUT_FILE_PATH}`);
            resolve();
          } catch (err) {
            console.error("Error writing JSON file:", err);
            reject(err);
          }
        })
        .on("error", reject);
    });
  } catch (error) {
    console.error("Error processing CSV file:", error);
  }
}

app.get("/apps", async (req, res) => {
  try {
    console.log("Fetching JSON data...");
    const data = await fs.promises.readFile(OUTPUT_FILE_PATH, "utf8");
    res.json(JSON.parse(data));
  } catch (error) {
    console.error("Error reading JSON file:", error);
    res.status(500).json({ error: "Failed to read JSON file" });
  }
});

app.get("/process-csv", async (req, res) => {
  try {
    await processCSV(INPUT_FILE_PATH);
    res.json({ success: true, message: "CSV processing started." });
  } catch (error) {
    res.status(500).json({ success: false, message: "CSV processing failed.", error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT}/apps to get app data`);
  console.log(`Visit http://localhost:${PORT}/process-csv to start CSV processing`);
});
