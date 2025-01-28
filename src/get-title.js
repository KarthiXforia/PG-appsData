import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const PORT = 7004;

// Route to get list of app titles
app.get("/title", (req, res) => {
  try {
    const basePath = "/Users/Xforia-User/Documents/PG-appsData/utils";
    const appsListFilePath = path.join(basePath, "AppsList.json");

    // Check if AppsList.json exists
    if (!fs.existsSync(appsListFilePath)) {
      return res.status(404).json({
        success: false,
        message: "AppsList.json file not found.",
      });
    }

    // Read AppsList.json
    const appsData = JSON.parse(fs.readFileSync(appsListFilePath, "utf8"));

    // Extract titles
    const titles = appsData.map((app) => app.title);
    const cat_key = appsData.map((app) => app.cat_key)
    const android_package_name = appsData.map((app)=>app.android_package_name)
    const ios_bundle_id = appsData.map((app)=>app.ios_bundle_id)
    const icon = appsData.map((app)=>app.icon)
    const icon_72 = appsData.map((app)=>app.icon_72)
    const website= appsData.map((app)=>app.website)
    const domain_name= appsData.map((app)=>app.domain_name)
    

    res.json({
      success: true,
      count: titles.length,
      titles    });
  } catch (error) {
    console.error("Error fetching titles:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT}/title to get app titles`);
});
