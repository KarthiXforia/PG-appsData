import express from "express";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

const APPS_CONFIG_PATH =
  "/Users/Xforia-User/Documents/PG-appsData/utils/apps.json";
const FAILED_APPS_PATH = "./failed_playstore_apps.json";
const RESULT_PATH =
  "/Users/Xforia-User/Documents/PG-appsData/utils/playstore-result.json";

async function loadAppsConfig() {
  try {
    console.log(`Reading config from: ${APPS_CONFIG_PATH}`);
    const rawData = await fs.readFile(APPS_CONFIG_PATH, "utf8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error loading apps configuration:", error);
    throw error;
  }
}

async function fetchPlayStoreData(appInfo, category) {
  try {
    console.log(`Fetching data for ${appInfo.name} in category ${category}`);
    const searchResponse = await axios.get(
      `https://play.google.com/store/search?q=${encodeURIComponent(
        appInfo.name
      )}&c=apps`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      }
    );

    const packageNameMatch = searchResponse.data.match(
      /\/store\/apps\/details\?id=([^"&]+)/
    );
    if (!packageNameMatch) {
      console.log(`No package name found for ${appInfo.name}`);
      return {
        success: false,
        appName: appInfo.name,
        reason: "Package name not found",
      };
    }

    const packageName = packageNameMatch[1];
    console.log(`Found package name: ${packageName} for ${appInfo.name}`);

    const appDetailsResponse = await axios.get(
      `https://play.google.com/store/apps/details?id=${packageName}&hl=en`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      }
    );

    // Extract website URL from the app details page
    const websitePattern = /<a[^>]+href="([^"]+)"[^>]*>Developer website<\/a>/i;
    const websiteMatch = appDetailsResponse.data.match(websitePattern);
    const websiteUrl = websiteMatch
      ? websiteMatch[1]
      : `https://play.google.com/store/apps/details?id=${packageName}`;

    // Extract all relevant domains
    const domains = new Set();

    // Add Play Store domain
    domains.add(`https://play.google.com/store/apps/details?id=${packageName}`);

    // Add developer website if found
    if (websiteMatch && websiteMatch[1]) {
      try {
        const url = new URL(websiteMatch[1]);
        domains.add(url.origin);
      } catch (e) {
        console.log(
          `Invalid URL found for ${appInfo.name}: ${websiteMatch[1]}`
        );
      }
    }

    const iconMatches = appDetailsResponse.data.match(
      /https:\/\/play-lh\.googleusercontent\.com\/[^"'\s]+/g
    );
    const iconUrl =
      iconMatches && iconMatches.length > 0 ? iconMatches[0].split("=")[0] : "";
    const icon72Url = iconUrl ? `${iconUrl}=s72-rw` : "";

    const developerMatch = appDetailsResponse.data.match(
      /href="\/store\/apps\/developer\?id=[^"]+">([^<]+)<\/a>/
    );
    const developer = developerMatch ? developerMatch[1].trim() : "";

    const descriptionMatch = appDetailsResponse.data.match(
      /<meta name="description" content="([^"]+)"/
    );
    const description = descriptionMatch ? descriptionMatch[1].trim() : "";

    // Extract category using multiple patterns
    let playStoreCategory = "";
    const htmlContent = appDetailsResponse.data;

    // Pattern 1: Direct category mention
    const categoryPattern1 = />([^<]+)<\/a>\s*in\s*<a[^>]+>([^<]+)<\/a>/;
    const match1 = htmlContent.match(categoryPattern1);
    if (match1 && match1[2]) {
      playStoreCategory = match1[2].trim();
    }

    // Pattern 2: Category in breadcrumb
    if (!playStoreCategory) {
      const categoryPattern2 = /breadcrumb\">[^<]*<a[^>]+>([^<]+)<\/a>/;
      const match2 = htmlContent.match(categoryPattern2);
      if (match2) {
        playStoreCategory = match2[1].trim();
      }
    }

    // Pattern 3: Category in meta tags
    if (!playStoreCategory) {
      const categoryPattern3 =
        /<meta\s+itemprop="applicationCategory"\s+content="([^"]+)"/;
      const match3 = htmlContent.match(categoryPattern3);
      if (match3) {
        playStoreCategory = match3[1].trim();
      }
    }

    const finalCategory = playStoreCategory || category;
    console.log(
      `Extracted category: ${
        playStoreCategory || "Not found"
      }, Using: ${finalCategory}`
    );

    return {
      success: true,
      data: {
        app_availability: {
          available_in: ["IN", "US"],
          package_name: packageName,
        },
        cat_key: finalCategory.toUpperCase(),
        cat_keys: [finalCategory.toUpperCase(), "APPLICATION"],
        category: finalCategory,
        description: description || "",
        android_package_name: packageName,
        ios_bundle_id: null,
        title: appInfo.name,
        domain_name: Array.from(domains),
        website: websiteUrl,
        developer: developer || "",
        app_country: "US",
        icon: iconUrl,
        icon_72: icon72Url,
        market_status: "PUBLISHED",
        store: "playstore",
        search_name: appInfo.name,
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

async function processBatch(apps, category, batchSize = 5) {
  const results = {
    successful: [],
    failed: [],
  };

  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, i + batchSize);
    console.log(
      `Processing batch ${i / batchSize + 1}, apps ${i + 1} to ${Math.min(
        i + batchSize,
        apps.length
      )}`
    );

    for (const app of batch) {
      console.log(`Processing: ${app.name}`);
      const result = await fetchPlayStoreData(app, category);

      if (result.success) {
        results.successful.push(result.data);
      } else {
        results.failed.push({
          appName: result.appName,
          reason: result.reason,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return results;
}

app.get("/fetch-playstore-apps", async (req, res) => {
  try {
    console.log("Loading apps configuration...");
    const config = await loadAppsConfig();
    const allResults = {
      successful: [],
      failed: [],
    };

    for (const [category, data] of Object.entries(config.categories)) {
      console.log(`Processing category: ${category}`);
      const results = await processBatch(data.apps, category);
      allResults.successful.push(...results.successful);
      allResults.failed.push(...results.failed);
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
    console.log(`Results saved to: ${RESULT_PATH}`);

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
    console.error("Error in fetch-playstore-apps:", error);
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
  console.log(`Using config file: ${APPS_CONFIG_PATH}`);
});
