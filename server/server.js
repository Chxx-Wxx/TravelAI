const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "TravelAI server is running",
  });
});

app.post("/places/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        message: "검색어가 필요합니다.",
      });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        message: "Google Maps API key가 설정되지 않았습니다.",
      });
    }

    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "X-Goog-Api-Key":
            process.env.GOOGLE_MAPS_API_KEY,

          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location",
        },

        body: JSON.stringify({
          textQuery: query,
          languageCode: "ko",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return res.status(response.status).json({
        message: "Google Places 검색에 실패했습니다.",
        detail: data,
      });
    }

    const places =
      data.places?.map((place) => ({
        id: place.id,

        name:
          place.displayName?.text ??
          "이름 없음",

        address:
          place.formattedAddress ??
          "",

        latitude:
          place.location?.latitude,

        longitude:
          place.location?.longitude,
      })) ?? [];

    res.json({
      places,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "서버 오류가 발생했습니다.",
    });
  }
});

const port =
  process.env.PORT || 4000;

app.listen(port, () => {
  console.log(
    `TravelAI server running on port ${port}`
  );
});