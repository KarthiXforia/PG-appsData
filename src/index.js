import express from "express";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

const CONFIG_PATH =
  "/Users/xforiauser/Desktop/playstore-apps/utils/apps-config.json";
const FAILED_APPS_PATH = "./failed_apps.json";

// Load apps configuration
async function loadAppsConfig() {
  try {
    const rawData = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error loading apps configuration:", error);
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

// Fetch app data from iTunes API with single attempt
async function fetchAppStoreData(appName) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      appName
    )}&entity=software&limit=1`;
    console.log(`Fetching data for ${appName}`);

    const response = await axios.get(url, { timeout: 5000 }); // 5 second timeout

    if (response.data.results.length === 0) {
      console.log(`No results found for ${appName}`);
      return { success: false, appName, reason: "No results found" };
    }

    const appData = response.data.results[0];
    return {
      success: true,
      data: {
        app_availability: {
          available_in: ["IN", "US"],
          package_name: appData.bundleId,
        },
        cat_key: appData.primaryGenreName.toUpperCase(),
        cat_keys: [appData.primaryGenreName.toUpperCase(), "APPLICATION"],
        category: appData.primaryGenreName,
        description: appData.description,
        ios_bundle_id: appData.bundleId,
        title: appData.trackName,
        domain_name: [appData.sellerUrl],
        website: appData.sellerUrl,
        developer: appData.sellerName,
        app_country: "US",
        icon: appData.artworkUrl512 || appData.artworkUrl100,
        icon_72: appData.artworkUrl100,
        market_status: "PUBLISHED",
        age_rating: appData.trackContentRating,
        price: appData.price,
        currency: appData.currency,
        size: appData.fileSizeBytes,
        release_date: appData.releaseDate,
        current_version: appData.version,
        minimum_os_version: appData.minimumOsVersion,
        search_term: appName,
      },
    };
  } catch (error) {
    return {
      success: false,
      appName,
      reason: error.message,
    };
  }
}

// Process apps with rate limiting
async function processBatch(apps) {
  const results = {
    successful: [],
    failed: [],
  };

  for (const appName of apps) {
    const result = await fetchAppStoreData(appName);
    if (result.success) {
      results.successful.push(result.data);
    } else {
      results.failed.push({
        appName: result.appName,
        reason: result.reason,
      });
    }
    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}

// API endpoint to fetch all apps
app.get("/fetch-all-apps", async (req, res) => {
  try {
    console.log("Loading apps configuration...");
    const config = await loadAppsConfig();
    const allResults = {
      successful: [],
      failed: [],
    };

    for (const [category, data] of Object.entries(config.categories)) {
      console.log(`Processing category: ${category}`);
      const results = await processBatch(data.apps);
      allResults.successful.push(...results.successful);
      allResults.failed.push(...results.failed);
    }

    // Save failed apps to a file
    await fs.writeFile(
      FAILED_APPS_PATH,
      JSON.stringify(allResults.failed, null, 2)
    );

    // Save successful results
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(process.cwd(), `app_data_${timestamp}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          success: true,
          total_apps: allResults.successful.length,
          apps: allResults.successful,
        },
        null,
        2
      )
    );

    res.json({
      success: true,
      total_successful: allResults.successful.length,
      total_failed: allResults.failed.length,
      successful_apps: allResults.successful,
      failed_apps: allResults.failed,
      output_file: outputPath,
      failed_apps_file: FAILED_APPS_PATH,
    });
  } catch (error) {
    console.error("Error in fetch-all-apps:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Error fetching apps",
    });
  }
});

const PORT = process.env.PORT || 7002;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Using config file: ${CONFIG_PATH}`);
});
