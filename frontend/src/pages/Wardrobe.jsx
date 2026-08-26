import { useEffect, useRef, useState } from "react";
import {
  getClothingItems,
  addClothingItems,
  removeClothingItem,
  removeBackground,
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
  const [season, setSeason] = useState("summer");
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

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setSelectedFile(file);
    setUploadError("");
    setIsRemovingBackground(true);

    try {
      const blob = await removeBackground(file);

      const processed = new File([blob], "clothing.png", {
        type: "image/png",
      });

      setProcessedFile(processed);

      const preview = URL.createObjectURL(blob);

      setPreviewUrl(preview);
      setShowUpload(true);
    } catch (error) {
      console.error("Background removal error:", error);

      setUploadError(error.message || "Fotoğrafın arka planı silinemedi.");

      // Arka plan silinemezse orijinal fotoğrafı göster
      setProcessedFile(file);

      const fallbackPreview = URL.createObjectURL(file);

      setPreviewUrl(fallbackPreview);
      setShowUpload(true);
    } finally {
      setIsRemovingBackground(false);

      event.target.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Lütfen bir fotoğraf seçin.");
      return;
    }
    try {
      setUploadError("");

      await addClothingItems(processedFile, category, season, color);

      const updatedItems = await getClothingItems();
      setClothingItems(updatedItems);

      setShowUpload(false);
      setSelectedFile(null);
      setPreviewUrl("");
      setUploadError("");
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(error.message || "Kıyafet eklenemedi.");
    }
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
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              className={
                activeCategory === category.key
                  ? "category-button active"
                  : "category-button"
              }
              onClick={() => setActiveCategory(category.key)}
            >
              {category.label}
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
                <div className="meta-item">
                  <img
                    className="meta-icon"
                    src={
                      item.season === "summer"
                        ? summerIcon
                        : item.season === "spring"
                          ? springIcon
                          : item.season === "fall"
                            ? fallIcon
                            : winterIcon
                    }
                    alt=""
                  />
                </div>

                <div className="meta-item">
                  <img
                    className="meta-icon"
                    src={
                      item.category === "top"
                        ? topIcon
                        : item.category === "bottom"
                          ? bottomIcon
                          : item.category === "outerwear"
                            ? outIcon
                            : item.category === "footwear"
                              ? shoIcon
                              : accIcon
                    }
                    alt=""
                  />
                </div>

                <div className="meta-item">
                  <span
                    className="color-dot"
                    style={{
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <button
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
                    onChange={(e) => setCategory(e.target.value)}
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

                  <select
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                  >
                    <option value="spring">İlkbahar</option>

                    <option value="summer">Yaz</option>

                    <option value="fall">Sonbahar</option>

                    <option value="winter">Kış</option>
                  </select>
                </div>

                <div className="upload-field">
                  <label>Renk</label>

                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>

                {uploadError && <p className="form-error">{uploadError}</p>}

                <div className="upload-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUpload(false);
                      setSelectedFile(null);
                      setPreviewUrl("");
                      setUploadError("");
                    }}
                  >
                    İptal
                  </button>

                  <button type="button" onClick={handleUpload}>
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
