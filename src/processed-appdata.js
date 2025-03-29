import express from "express";
import { promises as fs } from "fs"; // Using fs.promises
import path from "path";

const app = express();
const PORT = 7003;
const basePath = "/Users/Xforia-User/Documents/PG-appsData/utils";

// Function to check if a file exists
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// Function to clean website URL
function cleanWebsiteUrl(url) {
  if (!url) return "";
  return url.replace("/mobile", "").replace(/\/+$/, "");
}

// Function to process data
function processAppData(appstoreData, playstoreData) {
  const mergedApps = [];
  const processedApps = new Set();

  appstoreData.apps.forEach((appstoreApp) => {
    const playstoreApp = playstoreData.apps.find(
      (pApp) =>
        pApp.title.toLowerCase().replace(/\s+/g, "") ===
        appstoreApp.title.toLowerCase().replace(/\s+/g, "")
    );

    if (!playstoreApp) {
      console.log(`⚠️ No match found for: ${appstoreApp.title}`);
      return;
    }

    console.log(`✅ Matching App: ${appstoreApp.title} → ${playstoreApp.title}`);

    const baseUrl = cleanWebsiteUrl(appstoreApp.website);
    const domainName = [
      baseUrl,
      baseUrl.split("/")[2] ? `https://${baseUrl.split("/")[2]}` : baseUrl,
    ].filter(Boolean);

    const mergedApp = {
      app_availability: playstoreApp.app_availability,
      cat_key: playstoreApp.cat_key,
      category: appstoreApp.category,
      description: appstoreApp.description,
      android_package_name: playstoreApp.android_package_name,
      ios_bundle_id: appstoreApp.ios_bundle_id,
      title: appstoreApp.title,
      domain_name: domainName,
      website: baseUrl,
      developer: appstoreApp.developer,
      icon: playstoreApp.icon,
      isPopular: true,
    };

    // Clean up undefined/null fields
    const cleanedApp = Object.fromEntries(
      Object.entries(mergedApp).filter(([_, value]) => value != null)
    );

    mergedApps.push(cleanedApp);
    processedApps.add(appstoreApp.title.toLowerCase());
  });

  return mergedApps;
}

// Route to process data
app.get("/process", async (req, res) => {
  try {
    const filesToCheck = ["appstore-result.json", "playstore-result.json"];
    for (const file of filesToCheck) {
      const filePath = path.join(basePath, file);
      if (!(await fileExists(filePath))) {
        console.error(`❌ ERROR: Missing file ${filePath}`);
        return res.status(500).json({ success: false, message: `Missing file: ${file}` });
      }
    }

    console.log("✅ Reading App Store & Play Store data...");
    const appstoreData = JSON.parse(await fs.readFile(path.join(basePath, "appstore-result.json"), "utf8"));
    const playstoreData = JSON.parse(await fs.readFile(path.join(basePath, "playstore-result.json"), "utf8"));

    console.log(`🔹 App Store total apps: ${appstoreData.apps.length}`);
    console.log(`🔹 Play Store total apps: ${playstoreData.apps.length}`);

    // Process data
    const processedApps = processAppData(appstoreData, playstoreData);

    console.log(`✅ Processed Apps Count: ${processedApps.length}`);

    // Debugging skipped apps
    const processedTitles = new Set(processedApps.map((app) => app.title.toLowerCase()));
    const skippedApps = appstoreData.apps.filter(
      (app) => !processedTitles.has(app.title.toLowerCase())
    );

    console.log(`⚠️ Skipped Apps Count: ${skippedApps.length}`);
    skippedApps.forEach((app) => console.log(`⚠️ Skipped: ${app.title}`));

    // Save processed data
    await fs.writeFile(
      path.join(basePath, "processed-result.json"),
      JSON.stringify(processedApps, null, 2)
    );

    res.json({
      success: true,
      message: "Successfully processed and saved app data!",
      processed_apps_count: processedApps.length,
      skipped_apps_count: skippedApps.length,
      output_location: path.join(basePath, "processed-result.json"),
    });
  } catch (error) {
    console.error("❌ ERROR: Processing failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Check if input files exist and are properly formatted",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`➡️  Visit http://localhost:${PORT}/process to process the app data`);
});
