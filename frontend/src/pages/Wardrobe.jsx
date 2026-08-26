import { useEffect, useRef, useState } from "react";
import {
  getClothingItems,
  addClothingItems,
  removeClothingItem,
  removeBackground,
  analyzeClothing,
} from "../services/wardrobe";

import Navbar from "../components/navbar";

import summerIcon from "../assets/summer.png";
import topIcon from "../assets/top.png";
import winterIcon from "../assets/winter.png";
import fallIcon from "../assets/fall.png";
import springIcon from "../assets/spring.png";
import bottomIcon from "../assets/bottom.png";
import outIcon from "../assets/outerwear.png";
import shoIcon from "../assets/shoe.png";
import accIcon from "../assets/acc.png";
import removeIcon from "../assets/trashcan.png";

import springfallIcon from "../assets/springfall.png";
import springsummerIcon from "../assets/springsummer.png";
import springwinterIcon from "../assets/winterspring.png";
import summerfallIcon from "../assets/summerfall.png";
import summerwinterIcon from "../assets/wintersummer.png";
import fallwinterIcon from "../assets/winterfall.png";

import springsummerfallIcon from "../assets/summerspringfall.png";
import springsummerwinterIcon from "../assets/summerspringwinter.png";
import springfallwinterIcon from "../assets/winterfallspring.png";
import summerfallwinterIcon from "../assets/summerfallwinter.png";

import fourSeasonsIcon from "../assets/fourseasons.png";

function Wardrobe() {
  const [clothingItems, setClothingItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");

  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const [processedFile, setProcessedFile] = useState(null);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);

  const [category, setCategory] = useState("top");
  const [season, setSeason] = useState(["summer"]);
  const [color, setColor] = useState("#000000");

  const [uploadError, setUploadError] = useState("");

  const categories = [
    { key: "all", label: "Tümü" },
    { key: "top", label: "Üst Giyim" },
    { key: "bottom", label: "Alt Giyim" },
    { key: "outerwear", label: "Dış Giyim" },
    { key: "footwear", label: "Ayakkabı" },
    { key: "accessory", label: "Aksesuarlar" },
  ];

  useEffect(() => {
    setActiveCategory("all");

    getClothingItems()
      .then((data) => {
        console.log("WARDROBE DATA:", data);

        if (Array.isArray(data)) {
          setClothingItems(data);
        } else if (Array.isArray(data.results)) {
          setClothingItems(data.results);
        } else {
          console.error("Beklenmeyen API verisi:", data);
          setClothingItems([]);
        }
      })
      .catch((error) => {
        console.error("Wardrobe error:", error);
        setClothingItems([]);
      });
  }, []);

  const filteredItems =
    activeCategory === "all"
      ? clothingItems
      : clothingItems.filter((item) => item.category === activeCategory);

  const handleRemoveClothing = async (id) => {
    const confirmed = window.confirm(
      "Bu kıyafeti gardıroptan kaldırmak istediğine emin misin?",
    );

    if (!confirmed) {
      return;
    }

    try {
      await removeClothingItem(id);

      setClothingItems((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Remove clothing error:", error);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const normalizeSeasons = (value) => {
    const validSeasons = ["spring", "summer", "fall", "winter"];

    if (Array.isArray(value)) {
      const normalized = value.filter((item) => validSeasons.includes(item));

      return normalized.length > 0 ? normalized : ["summer"];
    }

    if (typeof value === "string" && validSeasons.includes(value)) {
      return [value];
    }

    return ["summer"];
  };

  const getSeasonIcon = (value) => {
    const seasons = normalizeSeasons(value);

    const ordered = ["spring", "summer", "fall", "winter"].filter(
      (seasonName) => seasons.includes(seasonName),
    );

    const key = ordered.join("");

    const icons = {
      spring: springIcon,
      summer: summerIcon,
      fall: fallIcon,
      winter: winterIcon,

      springsummer: springsummerIcon,
      springfall: springfallIcon,
      springwinter: springwinterIcon,
      summerfall: summerfallIcon,
      summerwinter: summerwinterIcon,
      fallwinter: fallwinterIcon,

      springsummerfall: springsummerfallIcon,
      springsummerwinter: springsummerwinterIcon,
      springfallwinter: springfallwinterIcon,
      summerfallwinter: summerfallwinterIcon,

      springsummerfallwinter: fourSeasonsIcon,
    };

    return icons[key] || fourSeasonsIcon;
  };

  const getCategoryIcon = (value) => {
    if (value === "top") {
      return topIcon;
    }

    if (value === "bottom") {
      return bottomIcon;
    }

    if (value === "outerwear") {
      return outIcon;
    }

    if (value === "footwear") {
      return shoIcon;
    }

    return accIcon;
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setSelectedFile(file);
    setProcessedFile(null);
    setPreviewUrl("");
    setUploadError("");

    setCategory("top");
    setSeason(["summer"]);
    setColor("#000000");

    setIsRemovingBackground(true);

    try {
      const blob = await removeBackground(file);

      const processed = new File([blob], "clothing.png", {
        type: "image/png",
      });

      setProcessedFile(processed);

      const analysis = await analyzeClothing(processed);

      console.log("AI clothing analysis:", analysis);

      if (analysis.category) {
        setCategory(analysis.category);
      }

      if (analysis.color) {
        setColor(analysis.color);
      }

      if (analysis.season) {
        setSeason(normalizeSeasons(analysis.season));
      }

      const preview = URL.createObjectURL(blob);

      setPreviewUrl(preview);
      setShowUpload(true);
    } catch (error) {
      console.error("Background removal error:", error);

      setProcessedFile(file);

      const fallbackPreview = URL.createObjectURL(file);

      setPreviewUrl(fallbackPreview);
      setShowUpload(true);

      try {
        const analysis = await analyzeClothing(file);

        console.log("AI clothing analysis:", analysis);

        if (analysis.category) {
          setCategory(analysis.category);
        }

        if (analysis.color) {
          setColor(analysis.color);
        }

        if (analysis.season) {
          setSeason(normalizeSeasons(analysis.season));
        }

        setUploadError("");
      } catch (analysisError) {
        console.error("Clothing AI analysis error:", analysisError);

        setUploadError(
          analysisError.message ||
            error.message ||
            "Fotoğraf analiz edilemedi.",
        );
      }
    } finally {
      setIsRemovingBackground(false);
      event.target.value = "";
    }
  };

  const toggleSeason = (seasonKey) => {
    setSeason((current) => {
      if (current.includes(seasonKey)) {
        if (current.length === 1) {
          return current;
        }

        return current.filter((item) => item !== seasonKey);
      }

      return [...current, seasonKey];
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Lütfen bir fotoğraf seçin.");
      return;
    }

    if (!processedFile) {
      setUploadError("Fotoğraf hazırlanamadı.");
      return;
    }

    if (!Array.isArray(season) || season.length === 0) {
      setUploadError("En az bir mevsim seçmelisin.");
      return;
    }

    try {
      setUploadError("");

      await addClothingItems(processedFile, category, season, color);

      const updatedItems = await getClothingItems();

      if (Array.isArray(updatedItems)) {
        setClothingItems(updatedItems);
      } else if (Array.isArray(updatedItems.results)) {
        setClothingItems(updatedItems.results);
      }

      setShowUpload(false);
      setSelectedFile(null);
      setProcessedFile(null);
      setPreviewUrl("");
      setUploadError("");

      setCategory("top");
      setSeason(["summer"]);
      setColor("#000000");
    } catch (error) {
      console.error("Upload error:", error);

      setUploadError(error.message || "Kıyafet eklenemedi.");
    }
  };

  const closeUpload = () => {
    if (isRemovingBackground) {
      return;
    }

    setShowUpload(false);
    setSelectedFile(null);
    setProcessedFile(null);
    setPreviewUrl("");
    setUploadError("");

    setCategory("top");
    setSeason(["summer"]);
    setColor("#000000");
  };

  return (
    <div>
      {isRemovingBackground && (
        <div className="background-removal-overlay">
          <div className="background-removal-loader">
            <div className="background-removal-spinner"></div>
            <p>Kıyafetin hazırlanıyor...</p>
            <span>Arka plan kaldırılıyor...</span>
          </div>
        </div>
      )}

      <Navbar />

      <main className="wardrobe-page">
        <div className="wardrobe-categories">
          {categories.map((categoryItem) => (
            <button
              key={categoryItem.key}
              type="button"
              className={
                activeCategory === categoryItem.key
                  ? "category-button active"
                  : "category-button"
              }
              onClick={() => setActiveCategory(categoryItem.key)}
            >
              {categoryItem.label}
            </button>
          ))}
        </div>

        <div className="wardrobe-grid">
          {activeCategory === "all" && (
            <div className="add-clothing-card" onClick={openFilePicker}>
              <span>+</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          {filteredItems.map((item) => (
            <div key={item.id} className="clothing-card">
              <div className="clothing-image">
                <img
                  className={`clothing-item-image clothing-item-${item.category}`}
                  src={`http://127.0.0.1:8000${item.image}`}
                  alt={item.category}
                />
              </div>

              <div className="clothing-meta">
                <div
                  className="meta-item"
                  title={normalizeSeasons(item.season).join(", ")}
                >
                  <img
                    className="meta-icon season-meta-icon"
                    src={getSeasonIcon(item.season)}
                    alt=""
                  />
                </div>

                <div className="meta-item" title={item.category}>
                  <img
                    className="meta-icon"
                    src={getCategoryIcon(item.category)}
                    alt=""
                  />
                </div>

                <div className="meta-item" title={item.color}>
                  <span
                    className="color-dot"
                    style={{
                      backgroundColor: item.color,
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="remove-clothing-button"
                  onClick={() => handleRemoveClothing(item.id)}
                >
                  <img src={removeIcon} alt="Gardıroptan kaldır" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {showUpload && (
          <div className="upload-overlay">
            <div className="upload-modal">
              <div className="upload-preview">
                {isRemovingBackground ? (
                  <div className="background-removal-loading">
                    Arka plan kaldırılıyor...
                  </div>
                ) : (
                  previewUrl && <img src={previewUrl} alt="Seçilen kıyafet" />
                )}
              </div>

              <div className="upload-details">
                <h2>Kıyafet Özellikleri</h2>

                <div className="upload-field">
                  <label>Kategori</label>

                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="top">Üst Giyim</option>
                    <option value="bottom">Alt Giyim</option>
                    <option value="outerwear">Dış Giyim</option>
                    <option value="footwear">Ayakkabı</option>
                    <option value="accessory">Aksesuar</option>
                  </select>
                </div>

                <div className="upload-field">
                  <label>Mevsim</label>

                  <div className="season-options">
                    {[
                      ["spring", "İlkbahar"],
                      ["summer", "Yaz"],
                      ["fall", "Sonbahar"],
                      ["winter", "Kış"],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className={
                          season.includes(key)
                            ? "season-option selected"
                            : "season-option"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={season.includes(key)}
                          onChange={() => toggleSeason(key)}
                        />

                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  <small className="season-help">
                    Birden fazla mevsim seçebilirsin.
                  </small>
                </div>

                <div className="upload-field">
                  <label>Renk</label>

                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                </div>

                {uploadError && <p className="form-error">{uploadError}</p>}

                <div className="upload-actions">
                  <button
                    type="button"
                    onClick={closeUpload}
                    disabled={isRemovingBackground}
                  >
                    İptal
                  </button>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={isRemovingBackground}
                  >
                    Onayla
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Wardrobe;
