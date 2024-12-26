import { google } from "googleapis";
import axios from "axios";
import express from "express";

const app = express();
app.use(express.json());

// Google Play API setup
const auth = new google.auth.GoogleAuth({
  keyFile: "./google-credentials.json",
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});

const CUSTOM_SEARCH_API_KEY = "AIzaSyDImMieDRlm_5DS03tRrLnlwc8RGinrges";
const SEARCH_ENGINE_ID = "8424657bdcf624bca";

// Categories for both stores
const categories = {
  play_store: [
    // "GAME",
    "SOCIAL",
    "ENTERTAINMENT",
    // "PRODUCTIVITY",
    // "EDUCATION",
    // "BUSINESS",
    // "FINANCE",
    // "LIFESTYLE",
    // "HEALTH_AND_FITNESS",
  ],
  app_store: [
    // "6014", // Games
    "6005", // Social Networking
    "6016", // Entertainment
    // "6007", // Productivity
    // "6017", // Education
    // "6000", // Business
    // "6015", // Finance
    // "6012", // Lifestyle
    // "6013", // Health & Fitness
  ],
};

// Fetch Play Store apps by category
async function fetchPlayStoreApps() {
  try {
    let allApps = [];

    for (const category of categories.play_store) {
      try {
        // Search for apps using Custom Search API
        const searchResponse = await google.customsearch("v1").cse.list({
          auth: CUSTOM_SEARCH_API_KEY,
          cx: SEARCH_ENGINE_ID,
          q: `site:play.google.com/store/apps/details category:${category}`,
          num: 2,
        });

        if (searchResponse.data.items) {
          for (const item of searchResponse.data.items) {
            try {
              const packageName = item.link.match(/id=([^&]+)/)?.[1];
              if (packageName) {
                // Extract data from search result
                const appData = {
                  bundle_id: "",
                  app_availability: {
                    available_in: ["IN", "US"],
                    package_name: packageName,
                  },
                  cat_key: category,
                  cat_keys: [category, "APPLICATION"],
                  category: category,
                  description: item.snippet || "",
                  package_name: packageName,
                  title: item.title || "",
                  website: item.link || "",
                  developer: item.pagemap?.person?.[0]?.name || "",
                  app_country: "US",
                  icon: item.pagemap?.cse_image?.[0]?.src || "",
                  icon_72: item.pagemap?.cse_thumbnail?.[0]?.src || "",
                  market_status: "PUBLISHED",
                  store_type: "play_store",
                };

                allApps.push(appData);
              }
            } catch (error) {
              console.error(
                `Error processing app data for ${packageName}:`,
                error.message
              );
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching category ${category}:`, error.message);
      }
    }
    return allApps;
  } catch (error) {
    console.error("Error fetching Play Store apps:", error);
    throw error;
  }
}

// Fetch App Store apps by category
async function fetchAppStoreApps() {
  let allApps = [];

  try {
    for (const genreId of categories.app_store) {
      // Fetch different types of app lists
      const types = [
        "topfreeapplications",
        "toppaidapplications",
        "topgrossingapplications",
        "newapplications",
      ];

      for (const type of types) {
        try {
          // First get app list from RSS
          const response = await axios.get(
            `https://itunes.apple.com/us/rss/${type}/limit=2/genre=${genreId}/json`
          );

          const apps = response.data.feed.entry;

          // Get detailed info for each app
          for (const app of apps) {
            try {
              const appId = app.id.attributes["im:id"];
              const detailResponse = await axios.get(
                `https://itunes.apple.com/lookup?id=${appId}`
              );

              if (detailResponse.data.results.length > 0) {
                const appDetail = detailResponse.data.results[0];
                allApps.push({
                  bundle_id: appDetail.bundleId,
                  app_availability: {
                    available_in: ["IN", "US"],
                    package_name: appDetail.bundleId,
                  },
                  cat_key: appDetail.primaryGenreName.toUpperCase(),
                  cat_keys: [
                    appDetail.primaryGenreName.toUpperCase(),
                    "APPLICATION",
                  ],
                  category: appDetail.primaryGenreName,
                  description: appDetail.description,
                  title: appDetail.trackName,
                  website: appDetail.sellerUrl,
                  developer: appDetail.sellerName,
                  app_country: "US",
                  icon: appDetail.artworkUrl512,
                  icon_72: appDetail.artworkUrl100,
                  market_status: "PUBLISHED",
                  store_type: "app_store",
                });
              }
            } catch (error) {
              console.error(`Error fetching app details:`, error);
            }
          }
        } catch (error) {
          console.error(`Error fetching ${type} for genre ${genreId}:`, error);
        }
      }
    }
    return allApps;
  } catch (error) {
    console.error("Error fetching App Store apps:", error);
    throw error;
  }
}

// API endpoint to fetch all apps
app.get("/fetch-all-apps", async (req, res) => {
  try {
    const [playStoreApps, appStoreApps] = await Promise.all([
      fetchPlayStoreApps(),
      fetchAppStoreApps(),
    ]);

    res.json({
      play_store: playStoreApps,
      app_store: appStoreApps,
      total_apps: playStoreApps.length + appStoreApps.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      message: "Error fetching apps",
    });
  }
});

app.listen(7001, () => console.log("Server is running on port 7001"));
