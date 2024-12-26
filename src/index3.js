import express from "express";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

const ANDROID_CONFIG_PATH =
  "/Users/xforiauser/Desktop/playstore-apps/utils/apps-android-config.json";
const FAILED_APPS_PATH = "./failed_android_apps.json";

// Load apps configuration
async function loadAppsConfig() {
  try {
    console.log(`Reading config from: ${ANDROID_CONFIG_PATH}`);
    const rawData = await fs.readFile(ANDROID_CONFIG_PATH, "utf8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error loading apps configuration:", error);
    console.error("Full error details:", {
      message: error.message,
      code: error.code,
      path: ANDROID_CONFIG_PATH,
    });
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

// Fetch app data from Play Store using search
async function fetchPlayStoreData(appInfo) {
  try {
    // First get the app package name through a direct search
    const searchResponse = await axios.get(
      `https://play.google.com/store/search?q=${encodeURIComponent(
        appInfo.search_term
      )}&c=apps`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    const packageNameMatch = searchResponse.data.match(
      /\/store\/apps\/details\?id=([^"&]+)/
    );
    if (!packageNameMatch) {
      return {
        success: false,
        appName: appInfo.name,
        reason: "Package name not found",
      };
    }

    const packageName = packageNameMatch[1];

    // Now fetch the app details page
    const appDetailsResponse = await axios.get(
      `https://play.google.com/store/apps/details?id=${packageName}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    // Extract icon URL
    const iconMatches = appDetailsResponse.data.match(
      /https:\/\/play-lh\.googleusercontent\.com\/[^"'\s]+/g
    );
    let iconUrl = "";
    let icon72Url = "";

    if (iconMatches && iconMatches.length > 0) {
      iconUrl = iconMatches[0].split("=")[0];
      icon72Url = `${iconUrl}=s72-rw`;
    }

    // Backup icon extraction
    if (!iconUrl) {
      const altIconMatch = appDetailsResponse.data.match(
        /src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/
      );
      if (altIconMatch) {
        iconUrl = altIconMatch[1].split("=")[0];
        icon72Url = `${iconUrl}=s72-rw`;
      }
    }

    // Extract developer name
    const developerMatch = appDetailsResponse.data.match(
      /href="\/store\/apps\/developer\?id=[^"]+">([^<]+)<\/a>/
    );
    const developer = developerMatch ? developerMatch[1] : "";

    // Extract description
    const descriptionMatch = appDetailsResponse.data.match(
      /<meta name="description" content="([^"]+)"/
    );
    const description = descriptionMatch ? descriptionMatch[1] : "";

    return {
      success: true,
      data: {
        app_availability: {
          available_in: ["IN", "US"],
          package_name: packageName,
        },
        cat_key: "APPLICATION",
        cat_keys: ["APPLICATION"],
        category: appInfo.category || "APPLICATION",
        description: description,
        android_package_name: packageName,
        ios_bundle_id: null,
        title: appInfo.name,
        domain_name: [
          `https://play.google.com/store/apps/details?id=${packageName}`,
        ],
        website: `https://play.google.com/store/apps/details?id=${packageName}`,
        developer: developer,
        app_country: "US",
        icon: iconUrl,
        icon_72: icon72Url,
        market_status: "PUBLISHED",
      },
    };
  } catch (error) {
    console.error(`Error fetching ${appInfo.name}:`, error.message);
    return {
      success: false,
      appName: appInfo.name,
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

  for (const appInfo of apps) {
    console.log(`Processing: ${appInfo.name}`);
    const result = await fetchPlayStoreData(appInfo);

    if (result.success) {
      results.successful.push(result.data);
    } else {
      results.failed.push({
        appName: result.appName,
        reason: result.reason,
      });
    }

    // Add delay between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

// API endpoint to fetch all apps
app.get("/fetch-android-apps", async (req, res) => {
  try {
    console.log("Loading Android apps configuration...");
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

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(
      process.cwd(),
      `playstore_data_${timestamp}.json`
    );

    await Promise.all([
      fs.writeFile(
        FAILED_APPS_PATH,
        JSON.stringify(allResults.failed, null, 2)
      ),
      fs.writeFile(
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
      ),
    ]);

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
    console.error("Error in fetch-android-apps:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Error fetching apps",
    });
  }
});

const PORT = process.env.PORT || 7001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Using Android config file: ${ANDROID_CONFIG_PATH}`);
});
