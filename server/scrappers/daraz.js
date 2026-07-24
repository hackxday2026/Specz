const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeDarazProduct(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const $ = cheerio.load(data);

    const title = $(".pdp-mod-product-badge-title").text().trim() ||
                  $("h1").first().text().trim();

    const priceText = $(".pdp-price_type_normal").first().text().trim() ||
                      $('[class*="pdp-price"]').first().text().trim();

    const price = parseInt(priceText.replace(/[^\d]/g, ""), 10) || 0;

    return {
      title,
      price,
      source: "Daraz",
      url,
    };
  } catch (err) {
    console.error("Daraz scraper error:", err.message);
    return null;
  }
}

module.exports = scrapeDarazProduct;
