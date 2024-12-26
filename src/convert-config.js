import fs from "fs/promises";
import path from "path";

const SOURCE_PATH =
  "/Users/xforiauser/Desktop/playstore-apps/utils/apps-config.json";
const TARGET_PATH =
  "/Users/xforiauser/Desktop/playstore-apps/utils/apps-android-config.json";

async function convertConfig() {
  try {
    // Read source config
    const sourceData = await fs.readFile(SOURCE_PATH, "utf8");
    const sourceConfig = JSON.parse(sourceData);

    // Create new config structure
    const androidConfig = {
      categories: {},
    };

    // Convert each category
    for (const [category, data] of Object.entries(sourceConfig.categories)) {
      androidConfig.categories[category] = {
        id: category,
        apps: data.apps.map((appName) => ({
          name: capitalizeAppName(appName),
          search_term: generateSearchTerm(appName),
        })),
      };
    }

    // Write new config
    await fs.writeFile(TARGET_PATH, JSON.stringify(androidConfig, null, 2));

    console.log("Conversion completed successfully!");
    return androidConfig;
  } catch (error) {
    console.error("Error converting config:", error);
    throw error;
  }
}

// Helper function to capitalize app name
function capitalizeAppName(appName) {
  return appName
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper function to generate search term
function generateSearchTerm(appName) {
  // Special cases for common apps
  const specialCases = {
    instagram: "instagram app",
    facebook: "facebook app meta",
    "whatsapp messenger": "whatsapp messenger app",
    snapchat: "snapchat app",
    tiktok: "tiktok app bytedance",
    discord: "discord chat app",
    telegram: "telegram messenger app",
    messenger: "facebook messenger app",
    twitter: "twitter app",
    youtube: "youtube app google",
    netflix: "netflix app streaming",
    "disney plus": "disney+ app streaming",
    spotify: "spotify music app",
    "amazon prime video": "amazon prime video app",
    twitch: "twitch streaming app",
    pinterest: "pinterest app",
    reddit: "reddit official app",
    "google drive": "google drive app",
    "microsoft office": "microsoft office app",
    zoom: "zoom meetings app",
    "microsoft teams": "microsoft teams app",
  };

  // Return special case if it exists
  if (specialCases[appName.toLowerCase()]) {
    return specialCases[appName.toLowerCase()];
  }

  // For games
  if (appName.match(/game|games|puzzle|io$/i)) {
    return `${appName} game`;
  }

  // Default: add 'app' to the search term
  return `${appName} app`;
}

// Run the conversion
convertConfig()
  .then((newConfig) => {
    console.log("New configuration has been created successfully!");
  })
  .catch((error) => {
    console.error("Failed to convert configuration:", error);
  });
