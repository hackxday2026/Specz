// ✅ SAFE IMPORTS
try {
  importScripts(
    "./utils/ai.js",
    "./utils/matcher.js",
    "./utils/storage.js"
  );
} catch (e) {
  console.error("importScripts failed:", e);
}

console.log("Specz Worker Running");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PRODUCT_DATA") {
    handleProduct(msg.payload, msg.forceRefresh)
      .then(sendResponse)
      .catch(err => {
        console.error("handleProduct crash:", err);
        sendResponse(fallback(msg.payload));
      });

    return true;
  }
});

async function handleProduct(product, forceRefresh = false) {
  try {
    if (!product?.title) {
      throw new Error("Invalid product input");
    }

    const cacheKey = `specz_v4_${product.title}`;

    //Cache
    if (!forceRefresh) {
      const cached = await getStorage(cacheKey);
      if (cached) return cached;
    }

    //AI structuring
    const structured = await normalizeTitleSafe(product.title);
    structured.rawTitle = product.title;

    //Fetch data
    const competitors = await fetchCompetitors(product);

    const normalizedCompetitors = (competitors || []).map(item => ({
      title: item.title || "",
      price: Number(item.price) || 0,
      source: item.source || item.store || "Competitor",
      url: item.url || "#"
    }));

    //Match
    const matches = matchProducts(structured, normalizedCompetitors);

    //Cheapest
    const cheapest = (matches.length > 0 ? getCheapest(matches) : null) || {
      title: product.title,
      price: product.price,
      source: "Current Page",
      url: product.url || "#"
    };

    //Savings
    const originalPrice = Number(product.price) || 0;
    const cheapestPrice = Number(cheapest.price) || originalPrice;
    const savings = calcSavings(originalPrice, cheapestPrice);

    //AI analysis
    const [valueAnalysis, review] = await Promise.allSettled([
      analyzeValueSafe(product, cheapest),
      generateReviewSafe(structured)
    ]);

    const safeValueAnalysis =
      valueAnalysis.status === "fulfilled" && valueAnalysis.value
        ? valueAnalysis.value
        : "Analysis unavailable";

    const safeReview =
      review.status === "fulfilled" && review.value
        ? review.value
        : "Review unavailable";

    const result = {
      product,
      structured,
      matches,
      cheapest,
      savings,
      valueAnalysis: safeValueAnalysis,
      review: safeReview
    };

    //Cache storage
    setStorage(cacheKey, result).catch(() => {});

    return result;

  } catch (err) {
    console.error("Worker Error:", err);
    return fallback(product);
  }
}

//Scraper aAPI + Mock JSON fallback

async function fetchCompetitors(product) {
  try {
    const results = await Promise.allSettled([
      fetchLiveScrape(product),
      fetchMock()
    ]);

    const liveItems = results[0].status === "fulfilled" && Array.isArray(results[0].value) ? results[0].value : [];
    const mockItems = results[1].status === "fulfilled" && Array.isArray(results[1].value) ? results[1].value : [];

    // Merge live scraped products with fallback mock data, avoiding duplicate URLs/Titles
    const combined = [...liveItems];
    const seenUrls = new Set(liveItems.map(i => i.url).filter(u => u && u !== "#"));
    const seenTitles = new Set(liveItems.map(i => (i.title || "").toLowerCase().trim()));

    for (const item of mockItems) {
      const url = item.url || "#";
      const titleKey = (item.title || "").toLowerCase().trim();
      if ((url !== "#" && seenUrls.has(url)) || (titleKey && seenTitles.has(titleKey))) {
        continue;
      }
      combined.push(item);
    }

    return combined.length > 0 ? combined : mockItems;
  } catch (e) {
    console.error("❌ fetchCompetitors failed:", e);
    return await fetchMock();
  }
}

async function fetchLiveScrape(product) {
  try {
    if (!product || !product.title) return [];
    const res = await fetch("http://localhost:3000/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentProduct: product })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.products) ? data.products : [];
  } catch (e) {
    console.log("ℹ️ Backend server offline or scrape error, falling back to mock JSON");
    return [];
  }
}

async function fetchMock() {
  try {
    const res = await fetch(chrome.runtime.getURL("data/mockData.json"));
    return await res.json();
  } catch (e) {
    console.error("❌ Mock fetch failed:", e);
    return [];
  }
}

//Helpers
function getCheapest(list) {
  if (!list || !list.length) return null;

  return list.reduce((min, item) =>
    (Number(item.price) || 0) < (Number(min.price) || 0) ? item : min
  );
}

function calcSavings(original, newPrice) {
  if (!original || !newPrice || original <= newPrice) return 0;

  return Math.round(((original - newPrice) / original) * 100);
}

function fallback(product) {
  const p = product || { title: "Unknown Laptop", price: 0, url: "#" };
  return {
    product: p,
    structured: { brand: "Laptop", model: p.title || "Product" },
    matches: [],
    cheapest: { ...p, source: "Current Page" },
    savings: 0,
    valueAnalysis: "No comparison data available for this product.",
    review: "Open a laptop page on Daraz, ITTI, Hukut, Oliz, or Evo Store to analyze deals."
  };
}