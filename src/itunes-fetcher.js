import express from "express";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

const APPS_CONFIG_PATH =
  "/Users/Xforia-User/Documents/PG-appsData/utils/apps.json";
const FAILED_APPS_PATH = "./failed_itunes_apps.json";
const RESULT_PATH =
  "/Users/Xforia-User/Documents/PG-appsData/utils/appstore-result.json";

// Create axios instance with better headers and configuration
const itunesApi = axios.create({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",
  },
});

// Constants for rate limiting and retries
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds

async function loadAppsConfig() {
  try {
    const rawData = await fs.readFile(APPS_CONFIG_PATH, "utf8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error loading apps configuration:", error);
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

async function fetchAppStoreDataWithRetry(appInfo, retryCount = 0) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      appInfo.search_terms.itunes
    )}&entity=software&limit=1&country=US`;

    console.log(
      `Fetching iTunes data for ${appInfo.display_name} (Attempt ${
        retryCount + 1
      })`
    );

    const response = await itunesApi.get(url);

    if (response.data.results.length === 0) {
      console.log(`No results found for ${appInfo.display_name}`);
      return {
        success: false,
        appName: appInfo.display_name,
        reason: "No results found",
      };
    }

    const appData = response.data.results[0];
    return {
      success: true,
      data: {
        app_availability: {
          available_in: ["IN", "US", "UK"],
          package_name: appData.bundleId,
        },
        cat_key: appData.primaryGenreName.toUpperCase(),
        cat_keys: [appData.primaryGenreName.toUpperCase(), "APPLICATION"],
        category: appData.primaryGenreName,
        description: appData.description,
        ios_bundle_id: appData.bundleId,
        android_package_name: null,
        title: appInfo.display_name,
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
        store: "itunes",
        original_search: appInfo.search_terms.itunes,
        isPopular: true
      },
    };
  } catch (error) {
    if (error.response?.status === 403 && retryCount < MAX_RETRIES) {
      console.log(
        `Rate limited for ${appInfo.display_name}, waiting before retry...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY * (retryCount + 1))
      );
      return fetchAppStoreDataWithRetry(appInfo, retryCount + 1);
    }

    return {
      success: false,
      appName: appInfo.display_name,
      reason:
        error.response?.status === 403
          ? `Rate limited after ${MAX_RETRIES} retries`
          : error.message,
    };
  }
}

async function processBatch(apps) {
  const results = {
    successful: [],
    failed: [],
  };

  for (const appInfo of apps) {
    const result = await fetchAppStoreDataWithRetry(appInfo);
    if (result.success) {
      results.successful.push(result.data);
    } else {
      results.failed.push({
        appName: result.appName,
        reason: result.reason,
      });
    }
    // Wait between requests
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
  }

  return results;
}

app.get("/fetch-itunes-apps", async (req, res) => {
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

      // Add delay between categories
      if (Object.keys(config.categories).length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    const resultObject = {
      timestamp: new Date().toISOString(),
      success: true,
      total_apps: allResults.successful.length,
      total_failed: allResults.failed.length,
      apps: allResults.successful,
      failed_apps: allResults.failed,
    };

    const dir = path.dirname(RESULT_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(RESULT_PATH, JSON.stringify(resultObject, null, 2));
    await fs.writeFile(
      FAILED_APPS_PATH,
      JSON.stringify(allResults.failed, null, 2)
    );

    res.json({
      success: true,
      total_successful: allResults.successful.length,
      total_failed: allResults.failed.length,
      results_location: RESULT_PATH,
      failed_apps_location: FAILED_APPS_PATH,
    });
  } catch (error) {
    console.error("Error in fetch-itunes-apps:", error);
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
  console.log(`Using config file: ${APPS_CONFIG_PATH}`);
});
