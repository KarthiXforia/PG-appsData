import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to clean website URL
function cleanWebsiteUrl(url) {
  if (!url) return "";
  // Remove /mobile from the URL
  const cleanUrl = url.replace("/mobile", "");
  // Remove trailing slashes
  return cleanUrl.replace(/\/+$/, "");
}

// Function to process and merge app data
function processAppData(appstoreData, playstoreData) {
  const mergedApps = [];
  const processedApps = new Set();

  // Process apps that exist in both stores
  appstoreData.apps.forEach((appstoreApp) => {
    const playstoreApp = playstoreData.apps.find(
      (pApp) => pApp.title.toLowerCase() === appstoreApp.title.toLowerCase()
    );

    if (playstoreApp) {
      const baseUrl = cleanWebsiteUrl(appstoreApp.website);
      const domainName = [
        baseUrl,
        baseUrl.split("/")[2] ? `https://${baseUrl.split("/")[2]}` : baseUrl,
      ].filter(Boolean);

      const mergedApp = {
        app_availability: {
          available_in: playstoreApp.app_availability.available_in || [
            "IN",
            "US",
          ],
          package_name:
            playstoreApp.package_name || playstoreApp.android_package_name,
        },
        cat_key: playstoreApp.cat_key,
        cat_keys: playstoreApp.cat_keys,
        category: appstoreApp.category,
        description: appstoreApp.description,
        android_package_name: playstoreApp.android_package_name,
        ios_bundle_id: appstoreApp.ios_bundle_id,
        title: appstoreApp.title,
        domain_name: domainName,
        website: baseUrl,
        developer: appstoreApp.developer,
        app_country: appstoreApp.app_country,
        icon: playstoreApp.icon,
        icon_72: playstoreApp.icon_72,
        market_status: appstoreApp.market_status,
      };

      // Only include properties that have values
      const cleanedApp = Object.fromEntries(
        Object.entries(mergedApp).filter(
          ([_, value]) => value !== null && value !== undefined
        )
      );

      mergedApps.push(cleanedApp);
      processedApps.add(appstoreApp.title.toLowerCase());
    }
  });

  return mergedApps;
}

// Create Express app
const app = express();
const PORT = 7003;

// Route to process data
app.get("/process", async (req, res) => {
  try {
    const basePath = "/Users/xforiauser/Desktop/playstore-apps/utils";

    // Read input files
    console.log("Reading App Store data...");
    const appstoreData = JSON.parse(
      fs.readFileSync(path.join(basePath, "appstore-result.json"), "utf8")
    );

    console.log("Reading Play Store data...");
    const playstoreData = JSON.parse(
      fs.readFileSync(path.join(basePath, "playstore-result.json"), "utf8")
    );

    // Process the data
    console.log("Processing and merging data...");
    const processedApps = processAppData(appstoreData, playstoreData);

    // Write the result to processed-result.json
    console.log("Writing processed results...");
    fs.writeFileSync(
      path.join(basePath, "processed-result.json"),
      JSON.stringify(processedApps, null, 2)
    );

    res.json({
      success: true,
      message: "Successfully processed and saved app data!",
      processed_apps_count: processedApps.length,
      skipped_apps_count:
        appstoreData.apps.length +
        playstoreData.apps.length -
        processedApps.length,
      output_location: path.join(basePath, "processed-result.json"),
    });
  } catch (error) {
    console.error("Error processing app data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details:
        "Check if both input JSON files exist and are properly formatted",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT}/process to process the app data`);
});
