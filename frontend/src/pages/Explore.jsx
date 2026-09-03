import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/navbar";
import { getClothingItems, addOutfit } from "../services/wardrobe";
import outIcon from "../assets/outerwear.png";
import accIcon from "../assets/acc.png";

const IMAGE_BASE_URL = "http://127.0.0.1:8000";

const styleOptions = [
  { key: "daily", label: "Günlük", note: "Rahat ve dengeli" },
  { key: "sporty", label: "Spor", note: "Dinamik ve enerjik" },
  { key: "smart", label: "Şık", note: "Temiz ve rafine" },
  { key: "street", label: "Sokak", note: "Daha cesur ve modern" },
  { key: "minimal", label: "Minimal", note: "Sade ve güçlü" },
  { key: "bold", label: "Cesur", note: "Dikkat çekici seçimler" },
];

const colorOptions = [
  { key: "free", label: "Serbest" },
  { key: "light", label: "Açık tonlar" },
  { key: "dark", label: "Koyu tonlar" },
  { key: "contrast", label: "Kontrast" },
];

const accessoryOptions = [
  { key: "free", label: "Serbest" },
  { key: "light", label: "Az" },
  { key: "strong", label: "Belirgin" },
];

const outerwearOptions = [
  { key: "free", label: "Serbest" },
  { key: "use", label: "Kullan" },
  { key: "skip", label: "Kullanma" },
];

function normalizeItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

// 0 (koyu) ile 1 (açık) arasında bir parlaklık değeri döner. Hex rengi
// çözemezse nötr bir orta değer varsayar.
function hexLuminance(hex) {
  if (typeof hex !== "string") {
    return 0.5;
  }

  let value = hex.trim().replace("#", "");

  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (value.length !== 6 || Number.isNaN(Number(`0x${value}`))) {
    return 0.5;
  }

  const r = parseInt(value.substring(0, 2), 16) / 255;
  const g = parseInt(value.substring(2, 4), 16) / 255;
  const b = parseInt(value.substring(4, 6), 16) / 255;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pickRandom(pool) {
  if (!pool || pool.length === 0) {
    return null;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

// Basit .includes() yerine kelime sınırlı eşleşme kullanır. Örn. "suit"
// kelimesi "suitable" içinde, "hat" kelimesi "that"/"what" içinde yanlış
// pozitif vermesin diye — gerçek verilerle test ederken böyle bir yanlış
// eşleşme (bir grafik baskılı polo "suitable" yüzünden "smart" çıkmıştı)
// yakalandı.
function descriptionHasKeyword(description, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(description);
}

// Backend'deki (wardrobe/views.py) ACCESSORY_TYPE_KEYWORDS ile aynı liste.
// İki tarafın "aynı tip" kararı tutarlı olsun diye burada birebir tutuluyor.
const ACCESSORY_TYPE_KEYWORDS = {
  watch: ["watch", "wristwatch", "wrist watch", "timepiece", "smartwatch"],
  sunglasses: ["sunglasses", "sun glasses"],
  eyewear: ["eyeglasses", "eyeglass", "spectacles"],
  bag: ["bag", "backpack", "handbag", "crossbody", "shoulder bag", "tote"],
  belt: ["belt"],
  hat: ["hat", "cap", "beanie"],
  scarf: ["scarf"],
  tie: ["tie", "necktie"],
  jewelry: ["necklace", "bracelet", "ring", "earring", "jewelry", "jewellery"],
};

// Backend'deki get_accessory_type() ile aynı öncelik sırası: önce
// structured accessory_type alanı, yoksa description'daki anahtar
// kelimeler, o da yoksa null.
function getAccessoryType(item) {
  if (item?.accessory_type) {
    return item.accessory_type;
  }

  const description = (item?.description || "").toLowerCase();

  for (const [type, keywords] of Object.entries(ACCESSORY_TYPE_KEYWORDS)) {
    if (
      keywords.some((keyword) => descriptionHasKeyword(description, keyword))
    ) {
      return type;
    }
  }

  return null;
}

// pickRandomUnique gibi rastgele seçer, ama aynı accessory_type'tan
// (örn. iki saat) birden fazla parça seçmez. Tipi belirlenemeyen (null)
// parçalar da kendi aralarında tek bir grup sayılır — backend'deki
// dedup'la aynı mantık, iki "tipi bilinmiyor" aksesuarın birlikte
// seçilmesini de engeller.
function pickRandomUniqueAccessories(pool, count) {
  const remaining = [...(pool || [])];
  const picked = [];
  const seenTypes = new Set();

  while (remaining.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * remaining.length);
    const [candidate] = remaining.splice(index, 1);
    const type = getAccessoryType(candidate);

    if (seenTypes.has(type)) {
      continue;
    }

    seenTypes.add(type);
    picked.push(candidate);
  }

  return picked;
}

function filterByColorMood(pool, mood) {
  if (mood === "light") {
    const light = pool.filter((item) => hexLuminance(item.color) > 0.55);
    return light.length > 0 ? light : pool;
  }

  if (mood === "dark") {
    const dark = pool.filter((item) => hexLuminance(item.color) < 0.45);
    return dark.length > 0 ? dark : pool;
  }

  return pool;
}

// "Kontrast" modunda üst ve alt parça arasında en yüksek parlaklık farkını
// bulmaya çalışır; birkaç rastgele kombinasyon dener ve en iyisini seçer.
function pickContrastPair(topsPool, bottomsPool) {
  if (topsPool.length === 0 || bottomsPool.length === 0) {
    return { top: pickRandom(topsPool), bottom: pickRandom(bottomsPool) };
  }

  let best = null;
  let bestDiff = -1;
  const attempts = Math.min(12, topsPool.length * bottomsPool.length * 2);

  for (let i = 0; i < attempts; i += 1) {
    const top = topsPool[Math.floor(Math.random() * topsPool.length)];
    const bottom = bottomsPool[Math.floor(Math.random() * bottomsPool.length)];
    const diff = Math.abs(hexLuminance(top.color) - hexLuminance(bottom.color));

    if (diff > bestDiff) {
      bestDiff = diff;
      best = { top, bottom };
    }
  }

  return best;
}

// =============================================================
// STİL ÇIKARIMI (description tabanlı, tamamen frontend)
// =============================================================
//
// ClothingItem modelinde ayrı bir "style" alanı yok, ama her parça
// için zaten AI tarafından üretilmiş zengin bir İngilizce `description`
// var (bkz. backend AnalyzeClothingView). Bu kelime listeleri o
// description'ı okuyup her parçayı 5 stilden birine (ya da hiçbirine)
// yerleştirmeye çalışır. Kaba bir sezgisel yöntem — mükemmel değil,
// ama en azından "Tarz" seçicisi artık gerçekten bir şey filtreliyor.
const STYLE_KEYWORDS = {
  sporty: [
    "jogger",
    "joggers",
    "hoodie",
    "sweatshirt",
    "sweatpant",
    "sweatpants",
    "track",
    "athletic",
    "activewear",
    "windbreaker",
    "performance",
    "mesh",
    "running",
    "training",
    "racing",
    "trainer",
    "sneaker",
  ],
  smart: [
    "blazer",
    "suit",
    "dress shirt",
    "dress pants",
    "trousers",
    "oxford",
    "loafer",
    "tailored",
    "button-up",
    "button-down",
    "chino",
    "formal",
    "collared",
    "dress shoe",
    "pleated",
    "business",
    "sophisticated",
  ],
  street: [
    "cargo",
    "oversized",
    "baggy",
    "bomber",
    "denim jacket",
    "graphic",
    "logo",
    "streetwear",
    "utility",
    "workwear",
    "distressed",
    "ripped",
    "chunky sole",
    "boot",
    "sneaker",
  ],
  minimal: [
    "minimalist",
    "clean lines",
    "solid color",
    "plain",
    "understated",
    "simple",
    "no print",
    "monochrome",
    "basic",
  ],
  bold: [
    "bright",
    "vibrant",
    "colorful",
    "pattern",
    "print",
    "statement",
    "bold",
    "eye-catching",
    "graphic print",
  ],
};

// Bir parçanın description'ında hangi stilin anahtar kelimeleri daha
// çok geçiyorsa o stile ait sayılır. Hiçbiri geçmiyorsa null döner —
// yani "nötr", her stille eşleşebilir (parçayı kaybetmemek için).
function classifyItemStyle(item) {
  const description = (item?.description || "").toLowerCase();

  if (!description) {
    return null;
  }

  let bestBucket = null;
  let bestScore = 0;

  for (const [bucket, keywords] of Object.entries(STYLE_KEYWORDS)) {
    const score = keywords.reduce(
      (count, keyword) =>
        count + (descriptionHasKeyword(description, keyword) ? 1 : 0),
      0,
    );

    if (score > bestScore) {
      bestScore = score;
      bestBucket = bucket;
    }
  }

  return bestBucket;
}

// Seçilen "Tarz"a göre havuzu daraltır. Eşleşen parça yoksa (ör.
// gardıropta hiç "smart" etiketlenen bir şey yoksa) tüm havuza geri
// döner — üretim asla kırılmaz, sadece o durumda stil filtresi
// etkisiz kalır.
function filterByStyle(pool, styleKey) {
  if (styleKey === "daily") {
    // Günlük/rahat: belirgin şekilde "şık" (resmi) ya da "cesur"
    // (aşırı iddialı) olarak sınıflanan parçaları eleyip geri kalan
    // her şeyi (spor/sokak/minimal/nötr) uygun sayar.
    const casual = pool.filter((item) => {
      const bucket = classifyItemStyle(item);
      return bucket !== "smart" && bucket !== "bold";
    });

    return casual.length > 0 ? casual : pool;
  }

  const matched = pool.filter((item) => {
    const bucket = classifyItemStyle(item);
    return bucket === styleKey || bucket === null;
  });

  return matched.length > 0 ? matched : pool;
}

function Explore() {
  const [style, setStyle] = useState("daily");
  const [colorMood, setColorMood] = useState("free");
  const [accessories, setAccessories] = useState("free");
  const [outerwear, setOuterwear] = useState("free");

  const [wardrobeItems, setWardrobeItems] = useState([]);
  const [wardrobeLoading, setWardrobeLoading] = useState(true);
  const [wardrobeError, setWardrobeError] = useState("");

  const [outfit, setOutfit] = useState(null);
  const [outfitName, setOutfitName] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getClothingItems()
      .then((data) => {
        if (cancelled) return;
        setWardrobeItems(normalizeItems(data));
        setWardrobeError("");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Explore wardrobe error:", error);
        setWardrobeItems([]);
        setWardrobeError(
          error.message || "Gardırobun yüklenemedi. Giriş yaptığından emin ol.",
        );
      })
      .finally(() => {
        if (!cancelled) setWardrobeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStyle = useMemo(
    () => styleOptions.find((item) => item.key === style),
    [style],
  );

  const pools = useMemo(() => {
    const tops = wardrobeItems.filter((item) => item.category === "top");
    const bottoms = wardrobeItems.filter(
      (item) => item.category === "pants" || item.category === "shorts",
    );
    const footwear = wardrobeItems.filter(
      (item) => item.category === "footwear",
    );
    const outerwearPool = wardrobeItems.filter(
      (item) => item.category === "outerwear",
    );
    const accessoryPool = wardrobeItems.filter(
      (item) => item.category === "accessory",
    );

    return { tops, bottoms, footwear, outerwearPool, accessoryPool };
  }, [wardrobeItems]);

  const hasCoreItems =
    pools.tops.length > 0 ||
    pools.bottoms.length > 0 ||
    pools.footwear.length > 0;

  const canGenerate = !wardrobeLoading && !wardrobeError && hasCoreItems;

  const buildOutfit = (
    styleKey,
    colorMoodKey,
    accessoriesKey,
    outerwearKey,
  ) => {
    const { tops, bottoms, footwear, outerwearPool, accessoryPool } = pools;

    // Önce "Tarz" filtresi uygulanır (ör. "Şık" seçiliyse smart/nötr
    // parçalara daralt), sonra o daralmış havuz içinde renk moduna
    // göre seçim yapılır. Böylece stil ve renk tercihleri birlikte
    // çalışır, birbirini ezmez.
    const styledTops = filterByStyle(tops, styleKey);
    const styledBottoms = filterByStyle(bottoms, styleKey);
    const styledFootwear = filterByStyle(footwear, styleKey);
    const styledOuterwear = filterByStyle(outerwearPool, styleKey);

    let topItem;
    let bottomItem;

    if (colorMoodKey === "contrast") {
      const pair = pickContrastPair(styledTops, styledBottoms);
      topItem = pair.top;
      bottomItem = pair.bottom;
    } else {
      topItem = pickRandom(filterByColorMood(styledTops, colorMoodKey));
      bottomItem = pickRandom(filterByColorMood(styledBottoms, colorMoodKey));
    }

    // Ayakkabı artık hem stil hem renk moduna dahil — eskiden tamamen
    // rastgele seçiliyordu ve "Açık tonlar" seçsen bile koyu bir
    // ayakkabı gelebiliyordu.
    const footwearItem = pickRandom(
      filterByColorMood(styledFootwear, colorMoodKey),
    );

    let outerwearItem = null;
    if (outerwearKey === "use") {
      outerwearItem = pickRandom(
        filterByColorMood(styledOuterwear, colorMoodKey),
      );
    } else if (outerwearKey === "free") {
      outerwearItem =
        Math.random() < 0.5
          ? pickRandom(filterByColorMood(styledOuterwear, colorMoodKey))
          : null;
    }

    const accessoryTarget =
      accessoriesKey === "strong"
        ? 2
        : accessoriesKey === "light"
          ? 1
          : Math.random() < 0.35
            ? 1
            : 0;
    const accessoryItems = pickRandomUniqueAccessories(
      accessoryPool,
      accessoryTarget,
    );

    const ids = [
      topItem?.id,
      bottomItem?.id,
      outerwearItem?.id,
      footwearItem?.id,
      ...accessoryItems.map((item) => item.id),
    ].filter(Boolean);

    return {
      styleKey,
      top: topItem,
      bottom: bottomItem,
      outerwear: outerwearItem,
      footwear: footwearItem,
      accessories: accessoryItems,
      ids,
    };
  };

  const handleGenerate = () => {
    if (!canGenerate) return;

    const nextOutfit = buildOutfit(style, colorMood, accessories, outerwear);
    setOutfit(nextOutfit);
    setSaveState("idle");
    setSaveError("");

    const styleLabel = styleOptions.find((item) => item.key === style)?.label;
    setOutfitName(`${styleLabel} kombin`);
  };

  const handleSurprise = () => {
    if (!canGenerate) return;

    const randomStyle = pickRandom(styleOptions).key;
    const randomColorMood = pickRandom(colorOptions).key;
    const randomAccessories = pickRandom(accessoryOptions).key;
    const randomOuterwear = pickRandom(outerwearOptions).key;

    setStyle(randomStyle);
    setColorMood(randomColorMood);
    setAccessories(randomAccessories);
    setOuterwear(randomOuterwear);

    const nextOutfit = buildOutfit(
      randomStyle,
      randomColorMood,
      randomAccessories,
      randomOuterwear,
    );
    setOutfit(nextOutfit);
    setSaveState("idle");
    setSaveError("");

    const styleLabel = styleOptions.find(
      (item) => item.key === randomStyle,
    )?.label;
    setOutfitName(`${styleLabel} kombin`);
  };

  const handleSaveOutfit = async () => {
    if (!outfit || outfit.ids.length === 0) return;

    const name = outfitName.trim() || `${selectedStyle?.label} kombin`;

    try {
      setSaveState("saving");
      setSaveError("");

      await addOutfit(name, outfit.ids);

      setSaveState("saved");
    } catch (error) {
      console.error("Kombin kaydetme hatası:", error);
      setSaveState("error");
      setSaveError(error.message || "Kombin kaydedilemedi.");
    }
  };

  const renderPiece = (item, category) => {
    if (!item) return null;

    let className = `explore-outfit-${category}`;

    if (category === "bottom" && item.category === "shorts") {
      className = "explore-outfit-bottom-short";
    }

    return (
      <img
        key={category}
        src={`${IMAGE_BASE_URL}${item.image}`}
        alt={
          item.category === "shorts"
            ? "Şort"
            : item.category === "pants"
              ? "Pantolon"
              : category
        }
        className={className}
      />
    );
  };

  const renderAccessories = (accessories) => {
    if (!accessories || accessories.length === 0) return null;

    return accessories.map((item, index) => (
      <img
        key={item.id ?? `accessory-${index}`}
        src={`${IMAGE_BASE_URL}${item.image}`}
        alt="Aksesuar"
        className="explore-outfit-accessory"
        style={{ top: `${36 + index * 18}%` }}
      />
    ));
  };

  return (
    <div className="auto-outfit-page">
      <Navbar />

      <main className="auto-outfit-shell">
        <header className="auto-outfit-header">
          <div className="auto-outfit-heading-copy">
            <h1>Otomatik Kombin Oluştur</h1>
            <p>
              Gardırobundaki parçaları hava durumundan bağımsız olarak tarzına
              göre bir araya getir.
            </p>
          </div>

          <button
            type="button"
            className="auto-outfit-surprise"
            onClick={handleSurprise}
            disabled={!canGenerate}
          >
            <span className="auto-outfit-surprise-icon">✦</span>
            Beni şaşırt
          </button>
        </header>

        <section className="auto-outfit-layout">
          <aside className="auto-outfit-controls">
            <div className="auto-outfit-section">
              <div className="auto-outfit-section-heading">
                <span>01</span>
                <div className="auto-outfit-section-heading-copy">
                  <h2>Tarzını belirle</h2>
                  <p>Bugün nasıl görünmek istiyorsun?</p>
                </div>
              </div>

              <div className="style-grid">
                {styleOptions.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={
                      style === option.key
                        ? "style-choice selected"
                        : "style-choice"
                    }
                    onClick={() => setStyle(option.key)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="auto-outfit-section">
              <div className="auto-outfit-section-heading">
                <span>02</span>
                <div className="auto-outfit-section-heading-copy">
                  <h2>Renk havası</h2>
                  <p>Renk seçiminde ne kadar yönlendirelim?</p>
                </div>
              </div>

              <div className="pill-row">
                {colorOptions.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={
                      colorMood === option.key
                        ? "choice-pill selected"
                        : "choice-pill"
                    }
                    onClick={() => setColorMood(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="auto-outfit-section">
              <div className="auto-outfit-section-heading">
                <span>03</span>
                <div className="auto-outfit-section-heading-copy">
                  <h2>Detaylar</h2>
                  <p>Son dokunuşları belirle.</p>
                </div>
              </div>

              <div className="detail-control">
                <div className="detail-control-copy">
                  <span
                    className="detail-icon-badge"
                    style={{ backgroundImage: `url(${accIcon})` }}
                  />
                  <div className="detail-control-copy-text">
                    <strong>Aksesuar</strong>
                    <span>Görünümün ne kadar öne çıksın?</span>
                  </div>
                </div>
                <div className="pill-row compact">
                  {accessoryOptions.map((option) => (
                    <button
                      type="button"
                      key={option.key}
                      className={
                        accessories === option.key
                          ? "choice-pill selected"
                          : "choice-pill"
                      }
                      onClick={() => setAccessories(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="detail-control">
                <div className="detail-control-copy">
                  <span
                    className="detail-icon-badge"
                    style={{ backgroundImage: `url(${outIcon})` }}
                  />
                  <div className="detail-control-copy-text">
                    <strong>Dış giyim</strong>
                    <span>Katman kullanımı nasıl olsun?</span>
                  </div>
                </div>
                <div className="pill-row compact">
                  {outerwearOptions.map((option) => (
                    <button
                      type="button"
                      key={option.key}
                      className={
                        outerwear === option.key
                          ? "choice-pill selected"
                          : "choice-pill"
                      }
                      onClick={() => setOuterwear(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="auto-outfit-generate"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <span>{outfit ? "Kombini Yenile" : "Kombin Oluştur"}</span>
              <span>→</span>
            </button>

            {!wardrobeLoading && !wardrobeError && !hasCoreItems && (
              <p className="auto-outfit-inline-hint">
                Kombin oluşturmak için önce{" "}
                <Link to="/wardrobe">gardırobuna birkaç parça ekle</Link>.
              </p>
            )}
          </aside>

          <section className="auto-outfit-result">
            <div className="result-topline">
              <div className="result-topline-copy">
                <span>ÖNİZLEME</span>
                <h2>{outfit ? selectedStyle?.label : "Kombin stüdyosu"}</h2>
              </div>
            </div>

            <div className="auto-outfit-preview">
              {wardrobeLoading ? (
                <div className="auto-outfit-empty">
                  <div className="empty-mark">✦</div>
                  <h3>Gardırobun yükleniyor...</h3>
                </div>
              ) : wardrobeError ? (
                <div className="auto-outfit-empty">
                  <div className="empty-mark">!</div>
                  <h3>Gardırobun yüklenemedi</h3>
                  <p>{wardrobeError}</p>
                </div>
              ) : !hasCoreItems ? (
                <div className="auto-outfit-empty">
                  <div className="empty-mark">✦</div>
                  <h3>Henüz kombin oluşturacak kıyafetin yok.</h3>
                  <p>
                    Önce gardırobuna birkaç parça ekle, sonra tarzını seçip
                    kombin oluşturabilirsin.
                  </p>
                  <Link to="/wardrobe" className="auto-outfit-empty-cta">
                    Gardırobuna git
                  </Link>
                </div>
              ) : outfit ? (
                <div className="studio-preview-inner">
                  <div className="explore-outfit-stage">
                    {renderPiece(outfit.outerwear, "outerwear")}
                    {renderPiece(outfit.top, "top")}
                    {renderPiece(outfit.bottom, "bottom")}
                    {renderPiece(outfit.footwear, "footwear")}
                    {renderAccessories(outfit.accessories)}
                  </div>
                </div>
              ) : (
                <div className="auto-outfit-empty">
                  <div className="empty-mark">✦</div>
                  <h3>Tarzını seç, kombinini keşfet.</h3>
                  <p>
                    Sol taraftaki tercihleri belirledikten sonra burada
                    oluşturduğun kombini göreceksin.
                  </p>
                </div>
              )}
            </div>

            {outfit && (
              <div className="auto-outfit-result-footer">
                <input
                  type="text"
                  className="auto-outfit-name-input"
                  value={outfitName}
                  onChange={(event) => {
                    setOutfitName(event.target.value);
                    if (saveState !== "idle") {
                      setSaveState("idle");
                      setSaveError("");
                    }
                  }}
                  placeholder="Kombin adı"
                  aria-label="Kombin adı"
                />

                <div className="result-actions-column">
                  <div className="result-actions">
                    <button
                      type="button"
                      className="result-secondary"
                      onClick={handleSaveOutfit}
                      disabled={
                        saveState === "saving" || outfit.ids.length === 0
                      }
                    >
                      {saveState === "saving"
                        ? "Kaydediliyor..."
                        : saveState === "saved"
                          ? "Eklendi ✓"
                          : "Kombinlerime Ekle"}
                    </button>
                    <button
                      type="button"
                      className="result-primary"
                      onClick={handleGenerate}
                    >
                      Yeni Kombin
                    </button>
                  </div>

                  {saveState === "error" && (
                    <p className="auto-outfit-save-error">{saveError}</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

export default Explore;
