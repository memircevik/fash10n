import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Navbar from "../components/navbar";

import {
  getClothingItems,
  addOutfit,
  getOutfits,
  generateTodayOutfit,
} from "../services/wardrobe";

function Home() {
  const navigate = useNavigate();

  /* =========================
     YENİ KOMBİN POPUP
  ========================= */

  const [showOutfitModal, setShowOutfitModal] = useState(false);

  const [clothingItems, setClothingItems] = useState([]);

  const [selectedItems, setSelectedItems] = useState({
    top: null,
    bottom: null,
    outerwear: null,
    footwear: null,
    accessory: [],
  });

  const [accessoryPage, setAccessoryPage] = useState(0);

  const accessoryPageSize = 4;

  const [outfitName, setOutfitName] = useState("");

  const [outfitError, setOutfitError] = useState("");

  const [isSavingOutfit, setIsSavingOutfit] = useState(false);

  /* =========================
     SON EKLENENLER
  ========================= */

  const [recentOutfits, setRecentOutfits] = useState([]);

  /* =========================
     BUGÜNÜN KOMBİNİ
  ========================= */

  const [todayOutfit, setTodayOutfit] = useState(null);

  const [todayOutfitOpen, setTodayOutfitOpen] = useState(false);

  const [isLoadingTodayOutfit, setIsLoadingTodayOutfit] = useState(false);

  const [showSaveTodayOutfitModal, setShowSaveTodayOutfitModal] =
    useState(false);
  const [todayOutfitName, setTodayOutfitName] = useState("");
  const [todayOutfitSaveError, setTodayOutfitSaveError] = useState("");
  const [isSavingTodayOutfit, setIsSavingTodayOutfit] = useState(false);

  // Rolling history of the last couple of generated outfits (oldest
  // first), sent to the backend so refresh can rule out more than just
  // the single last choice and actually rotate through the wardrobe
  // instead of ping-ponging between two looks.
  const [todayOutfitHistory, setTodayOutfitHistory] = useState([]);

  // Shown briefly whenever the backend reports that every distinct
  // outfit it could build from the current weather-appropriate wardrobe
  // has already been used this cycle, and it is starting over (so some
  // pieces may repeat from here on).
  const [cycleResetNotice, setCycleResetNotice] = useState(false);

  /* =========================
     GARDIROP
  ========================= */

  useEffect(() => {
    let mounted = true;

    getClothingItems()
      .then((data) => {
        if (!mounted) {
          return;
        }

        const items = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];

        setClothingItems(items);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        console.error("Gardırop alınamadı:", error);

        setClothingItems([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  /* =========================
     SON EKLENENLERİ GETİR
  ========================= */

  useEffect(() => {
    let mounted = true;

    getOutfits()
      .then((data) => {
        if (!mounted) {
          return;
        }

        const outfits = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];

        const sortedOutfits = [...outfits]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 3);

        setRecentOutfits(sortedOutfits);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        console.error("Son eklenen kombinler alınamadı:", error);

        setRecentOutfits([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  /* =========================
     KATEGORİLER
  ========================= */

  const categoryItems = useMemo(() => {
    return {
      top: clothingItems.filter((item) => item.category === "top"),

      bottom: clothingItems.filter(
        (item) => item.category === "pants" || item.category === "shorts",
      ),

      outerwear: clothingItems.filter((item) => item.category === "outerwear"),

      footwear: clothingItems.filter((item) => item.category === "footwear"),

      accessory: clothingItems.filter((item) => item.category === "accessory"),
    };
  }, [clothingItems]);

  /* =========================
     BUGÜNÜN KOMBİNİNİ YÜKLE
  ========================= */

  const loadTodayOutfit = async (previousOutfit = null, recentOutfits = []) => {
    if (!clothingItems.length) {
      setTodayOutfit(null);

      return;
    }

    try {
      setIsLoadingTodayOutfit(true);

      if (!navigator.geolocation) {
        throw new Error("Tarayıcın konum bilgisini desteklemiyor.");
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });

      const latitude = position.coords.latitude;

      const longitude = position.coords.longitude;

      console.log("TODAY OUTFIT LOCATION:", {
        latitude,
        longitude,
      });

      console.log("PREVIOUS OUTFIT SENT:", previousOutfit);
      console.log("RECENT OUTFITS SENT:", recentOutfits);

      const data = await generateTodayOutfit(
        latitude,
        longitude,
        previousOutfit,
        recentOutfits,
      );

      console.log("TODAY OUTFIT RESPONSE:", data);

      const top = clothingItems.find((item) => item.id === data.top_id);

      const bottom = clothingItems.find((item) => item.id === data.bottom_id);

      const footwear = clothingItems.find(
        (item) => item.id === data.footwear_id,
      );

      const outerwear = data.outerwear_id
        ? clothingItems.find((item) => item.id === data.outerwear_id) || null
        : null;

      const accessories = Array.isArray(data.accessory_ids)
        ? data.accessory_ids
            .map((id) => clothingItems.find((item) => item.id === id))
            .filter(Boolean)
        : [];

      setTodayOutfit({
        top: top || null,
        bottom: bottom || null,
        footwear: footwear || null,
        outerwear,
        accessories,
      });

      const generatedOutfitSignature = {
        top_id: data.top_id ?? null,
        bottom_id: data.bottom_id ?? null,
        footwear_id: data.footwear_id ?? null,
        outerwear_id: data.outerwear_id ?? null,
        accessory_ids: Array.isArray(data.accessory_ids)
          ? data.accessory_ids
          : [],
      };

      setTodayOutfitHistory((previousHistory) => {
        if (data.cycle_reset) {
          return [generatedOutfitSignature];
        }

        return [...previousHistory, generatedOutfitSignature];
      });

      // The backend only sets cycle_reset once it has genuinely used up
      // every distinct top/bottom/footwear combination it could build
      // for today's weather and had to start the rotation over — let
      // the user know instead of silently repeating pieces.
      if (data.cycle_reset) {
        setCycleResetNotice(true);
      }
    } catch (error) {
      console.error("Today outfit error:", error);

      setTodayOutfit(null);
    } finally {
      setIsLoadingTodayOutfit(false);
    }
  };

  /* =========================
     GARDIROP GELİNCE BUGÜNÜN
     KOMBİNİNİ OLUŞTUR
  ========================= */

  useEffect(() => {
    if (!clothingItems.length) {
      setTodayOutfit(null);

      return;
    }

    loadTodayOutfit();
  }, [clothingItems]);

  /* =========================
     DÖNGÜ SIFIRLANDI BİLDİRİMİ
  ========================= */

  /* =========================
     BUGÜNÜN KOMBİNİNİ YENİLE
  ========================= */

  const regenerateTodayOutfit = () => {
    setCycleResetNotice(false);

    if (!todayOutfit) {
      loadTodayOutfit();

      return;
    }

    const previousOutfit = {
      top_id: todayOutfit.top?.id ?? null,

      bottom_id: todayOutfit.bottom?.id ?? null,

      footwear_id: todayOutfit.footwear?.id ?? null,

      outerwear_id: todayOutfit.outerwear?.id ?? null,

      accessory_ids: Array.isArray(todayOutfit.accessories)
        ? todayOutfit.accessories.map((item) => item.id)
        : [],
    };

    console.log("REGENERATING FROM:", previousOutfit);
    console.log("REGENERATING WITH HISTORY:", todayOutfitHistory);

    loadTodayOutfit(previousOutfit, todayOutfitHistory);
  };

  /* =========================
     YENİ KOMBİN CAROUSEL
  ========================= */

  const moveCarousel = (category, direction) => {
    const items = categoryItems[category];

    if (!items?.length) {
      return;
    }

    const canBeNull = category === "outerwear" || category === "accessory";

    setSelectedItems((current) => {
      const currentItem = current[category];

      if (currentItem === null) {
        return {
          ...current,
          [category]: direction === 1 ? items[0] : items[items.length - 1],
        };
      }

      const currentIndex = items.findIndex(
        (item) => item.id === currentItem.id,
      );

      let newIndex = currentIndex + direction;

      if (newIndex < 0) {
        if (canBeNull) {
          return {
            ...current,
            [category]: null,
          };
        }

        newIndex = items.length - 1;
      }

      if (newIndex >= items.length) {
        if (canBeNull) {
          return {
            ...current,
            [category]: null,
          };
        }

        newIndex = 0;
      }

      return {
        ...current,
        [category]: items[newIndex],
      };
    });
  };

  /* =========================
     AKSESUAR SEÇ
  ========================= */

  const toggleAccessory = (item) => {
    setSelectedItems((current) => {
      const alreadySelected = current.accessory.some(
        (selected) => selected.id === item.id,
      );

      if (alreadySelected) {
        return {
          ...current,

          accessory: current.accessory.filter(
            (selected) => selected.id !== item.id,
          ),
        };
      }

      return {
        ...current,

        accessory: [...current.accessory, item],
      };
    });
  };

  const accessoryPageCount = Math.ceil(
    categoryItems.accessory.length / accessoryPageSize,
  );

  const visibleAccessories = categoryItems.accessory.slice(
    accessoryPage * accessoryPageSize,
    accessoryPage * accessoryPageSize + accessoryPageSize,
  );

  /* =========================
     CAROUSEL RENDER
  ========================= */

  const renderCarousel = (category, title) => {
    if (category === "accessory") {
      return (
        <div className="outfit-carousel accessory-carousel">
          <h3>{title}</h3>

          <div className="accessory-selection">
            <button
              type="button"
              className="accessory-carousel-arrow"
              disabled={accessoryPage <= 0}
              onClick={(event) => {
                event.stopPropagation();

                setAccessoryPage((current) => Math.max(current - 1, 0));
              }}
            >
              ‹
            </button>

            <div className="accessory-selection-grid">
              {visibleAccessories.length === 0 ? (
                <div className="carousel-placeholder">
                  Bu kategoride kıyafet yok.
                </div>
              ) : (
                visibleAccessories.map((item) => {
                  const isSelected = selectedItems.accessory.some(
                    (selected) => selected.id === item.id,
                  );

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={
                        "accessory-selection-item" +
                        (isSelected ? " selected" : "")
                      }
                      onClick={(event) => {
                        event.stopPropagation();

                        toggleAccessory(item);
                      }}
                    >
                      <img
                        src={"http://127.0.0.1:8000" + item.image}
                        alt="Aksesuar"
                      />

                      {isSelected && (
                        <span className="accessory-selection-check">✓</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className="accessory-carousel-arrow"
              disabled={accessoryPage >= accessoryPageCount - 1}
              onClick={(event) => {
                event.stopPropagation();

                setAccessoryPage((current) =>
                  Math.min(current + 1, accessoryPageCount - 1),
                );
              }}
            >
              ›
            </button>
          </div>

          <div className="accessory-selection-count">
            {selectedItems.accessory.length > 0
              ? `${selectedItems.accessory.length} aksesuar seçildi`
              : "Aksesuar seçebilirsin"}
          </div>

          {accessoryPageCount > 1 && (
            <div className="accessory-page-indicator">
              {accessoryPage + 1} / {accessoryPageCount}
            </div>
          )}
        </div>
      );
    }

    const selectedItem = selectedItems[category];

    const items = categoryItems[category];

    return (
      <div className="outfit-carousel">
        <h3>{title}</h3>

        <button
          type="button"
          className="carousel-arrow"
          disabled={!items || items.length === 0}
          onClick={(event) => {
            event.stopPropagation();

            moveCarousel(category, -1);
          }}
        >
          ‹
        </button>

        <div className="carousel-item">
          {selectedItem ? (
            <img
              src={"http://127.0.0.1:8000" + selectedItem.image}
              alt={title}
              className={
                "carousel-clothing-image carousel-clothing-" + category
              }
            />
          ) : (
            <div className="carousel-placeholder">
              {!items || items.length === 0
                ? "Bu kategoride kıyafet yok."
                : "Parça yok"}
            </div>
          )}
        </div>

        <button
          type="button"
          className="carousel-arrow"
          disabled={!items || items.length === 0}
          onClick={(event) => {
            event.stopPropagation();

            moveCarousel(category, 1);
          }}
        >
          ›
        </button>
      </div>
    );
  };

  /* =========================
     YENİ KOMBİN POPUP AÇ
  ========================= */

  const openOutfitModal = () => {
    setSelectedItems({
      top: null,
      bottom: null,
      outerwear: null,
      footwear: null,
      accessory: [],
    });

    setAccessoryPage(0);

    setOutfitName("");
    setOutfitError("");
    setIsSavingOutfit(false);

    setShowOutfitModal(true);
  };

  /* =========================
     YENİ KOMBİN POPUP KAPAT
  ========================= */

  const closeOutfitModal = () => {
    if (isSavingOutfit) {
      return;
    }

    setShowOutfitModal(false);

    setOutfitName("");
    setOutfitError("");
  };

  /* =========================
     KOMBİN KAYDET
  ========================= */

  const handleSaveOutfit = async () => {
    if (!outfitName.trim()) {
      setOutfitError("Kombin adı yazmalısın.");

      return;
    }

    if (!selectedItems.top) {
      setOutfitError("Üst giyim seçmelisin.");

      return;
    }

    if (!selectedItems.bottom) {
      setOutfitError("Alt giyim seçmelisin.");

      return;
    }

    if (!selectedItems.footwear) {
      setOutfitError("Ayakkabı seçmelisin.");

      return;
    }

    const itemIds = [
      selectedItems.top?.id,
      selectedItems.bottom?.id,
      selectedItems.outerwear?.id,
      selectedItems.footwear?.id,
      ...selectedItems.accessory.map((item) => item.id),
    ].filter(Boolean);

    try {
      setIsSavingOutfit(true);

      setOutfitError("");

      const savedOutfit = await addOutfit(outfitName.trim(), itemIds);

      setRecentOutfits((current) => [savedOutfit, ...current].slice(0, 3));

      setShowOutfitModal(false);

      setSelectedItems({
        top: null,
        bottom: null,
        outerwear: null,
        footwear: null,
        accessory: [],
      });

      setOutfitName("");
      setOutfitError("");
    } catch (error) {
      console.error("Outfit save error:", error);

      setOutfitError(error.message || "Kombin kaydedilemedi.");
    } finally {
      setIsSavingOutfit(false);
    }
  };

  /* =========================
     SON EKLENEN KOMBİNE GİT
  ========================= */

  const renderRecentOutfitItems = (items) => {
    let accessoryIndex = 0;

    return items?.map((item) => {
      const accessoryClass =
        item.category === "accessory"
          ? ` home-outfit-accessory-${accessoryIndex++}`
          : "";

      return (
        <img
          key={item.id}
          src={"http://127.0.0.1:8000" + item.image}
          alt={item.category}
          className={"home-outfit-" + item.category + accessoryClass}
        />
      );
    });
  };

  const openRecentOutfit = (event, outfit) => {
    event.stopPropagation();

    if (!outfit?.id) {
      return;
    }

    navigate("/outfits", {
      state: {
        openOutfitId: outfit.id,
      },
    });
  };

  /* =========================
     BUGÜNÜN KOMBİNİNİ KAYDET
  ========================= */

  const openSaveTodayOutfitModal = () => {
    if (!todayOutfit) {
      return;
    }

    setTodayOutfitName("");
    setTodayOutfitSaveError("");
    setIsSavingTodayOutfit(false);
    setShowSaveTodayOutfitModal(true);
  };

  const closeSaveTodayOutfitModal = () => {
    if (isSavingTodayOutfit) {
      return;
    }

    setShowSaveTodayOutfitModal(false);
    setTodayOutfitName("");
    setTodayOutfitSaveError("");
  };

  const handleSaveTodayOutfit = async () => {
    const trimmedName = todayOutfitName.trim();

    if (!trimmedName) {
      setTodayOutfitSaveError("Kombin adı yazmalısın.");
      return;
    }

    if (!todayOutfit) {
      setTodayOutfitSaveError("Kaydedilecek kombin bulunamadı.");
      return;
    }

    const itemIds = [
      todayOutfit.top?.id,
      todayOutfit.bottom?.id,
      todayOutfit.outerwear?.id,
      todayOutfit.footwear?.id,
      ...(Array.isArray(todayOutfit.accessories)
        ? todayOutfit.accessories.map((item) => item.id)
        : []),
    ].filter(Boolean);

    if (itemIds.length === 0) {
      setTodayOutfitSaveError("Kombinde kaydedilecek parça bulunamadı.");
      return;
    }

    try {
      setIsSavingTodayOutfit(true);
      setTodayOutfitSaveError("");

      const savedOutfit = await addOutfit(trimmedName, itemIds);

      setRecentOutfits((current) => [savedOutfit, ...current].slice(0, 3));

      setShowSaveTodayOutfitModal(false);
      setTodayOutfitName("");
      setTodayOutfitSaveError("");
    } catch (error) {
      console.error("Today outfit save error:", error);
      setTodayOutfitSaveError(error.message || "Kombin kaydedilemedi.");
    } finally {
      setIsSavingTodayOutfit(false);
    }
  };

  /* =========================
     BUGÜNÜN KOMBİN PARÇASI
  ========================= */

  const renderTodayOutfitPiece = (item, category) => {
    if (!item) {
      return null;
    }

    let className = "today-outfit-" + category;

    if (category === "bottom") {
      if (item.category === "shorts") {
        className = "today-outfit-bottom-short";
      } else if (item.category === "pants") {
        className = "today-outfit-bottom";
      }
    }

    return (
      <img
        src={"http://127.0.0.1:8000" + item.image}
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

  /* =========================
     BUGÜNÜN AKSESUARLARI
  ========================= */

  const renderTodayAccessories = () => {
    if (Array.isArray(todayOutfit?.accessories)) {
      return todayOutfit.accessories.map((item, index) => (
        <img
          key={item.id ?? `accessory-${index}`}
          src={"http://127.0.0.1:8000" + item.image}
          alt="Aksesuar"
          className="today-outfit-accessory"
          style={{
            top: 200 + index * 62,
          }}
        />
      ));
    }

    if (todayOutfit?.accessory) {
      return renderTodayOutfitPiece(todayOutfit.accessory, "accessory");
    }

    return null;
  };

  return (
    <>
      <Navbar />

      {cycleResetNotice && (
        <div className="cycle-reset-toast" role="status">
          <span>
            Bu hava için oluşturabileceğimiz tüm farklı kombinler denendi —
            kombinler şimdi baştan tekrar kullanılmaya başlanacak.
          </span>

          <button
            type="button"
            className="cycle-reset-toast-close"
            onClick={() => setCycleResetNotice(false)}
            aria-label="Bildirimi kapat"
          >
            ×
          </button>
        </div>
      )}

      <main className="home-page">
        <section className="home-cards">
          {/* =========================
              1. YENİ GÖRÜNÜŞ
          ========================= */}

          <div className="home-card" onClick={openOutfitModal}>
            <div className="home-card-image create-outfit-card">
              <span>+</span>
            </div>

            <h2>Yeni bir görünüş oluştur</h2>

            <p>Gardırobundaki parçalarla yeni bir kombin oluştur.</p>
          </div>

          {/* =========================
              2. BUGÜNÜN KOMBİNİ
          ========================= */}

          <div
            className="home-card"
            onClick={() => {
              if (todayOutfit) {
                setTodayOutfitOpen(true);
              }
            }}
          >
            <div className="home-card-image today-outfit-card">
              {todayOutfit ? (
                <div className="today-outfit-preview">
                  {renderTodayOutfitPiece(todayOutfit.outerwear, "outerwear")}

                  {renderTodayOutfitPiece(todayOutfit.top, "top")}

                  {renderTodayOutfitPiece(todayOutfit.bottom, "bottom")}

                  {renderTodayOutfitPiece(todayOutfit.footwear, "footwear")}

                  {renderTodayAccessories()}
                </div>
              ) : isLoadingTodayOutfit ? (
                <div className="today-outfit-empty">
                  Bugünün kombini hazırlanıyor...
                </div>
              ) : (
                <div className="today-outfit-empty">
                  Bugünün kombini hazırlanıyor...
                </div>
              )}
            </div>

            <h2>Bugünün Kombini</h2>

            <p>Bugün için gardırobundan sana bir kombin seçtik.</p>
          </div>

          {/* =========================
              3. SON EKLENENLER
          ========================= */}

          <div className="home-card">
            <div className="home-card-image recent-outfit-card">
              <div className="outfit-stacks">
                {recentOutfits[2] && (
                  <div
                    className="outfit-stack-card outfit-back"
                    onClick={(event) =>
                      openRecentOutfit(event, recentOutfits[2])
                    }
                  >
                    <div className="home-outfit-preview">
                      {renderRecentOutfitItems(recentOutfits[2].items)}
                    </div>
                  </div>
                )}

                {recentOutfits[1] && (
                  <div
                    className="outfit-stack-card outfit-middle"
                    onClick={(event) =>
                      openRecentOutfit(event, recentOutfits[1])
                    }
                  >
                    <div className="home-outfit-preview">
                      {renderRecentOutfitItems(recentOutfits[1].items)}
                    </div>
                  </div>
                )}

                {recentOutfits[0] && (
                  <div
                    className="outfit-stack-card outfit-front"
                    onClick={(event) =>
                      openRecentOutfit(event, recentOutfits[0])
                    }
                  >
                    <div className="home-outfit-preview">
                      {renderRecentOutfitItems(recentOutfits[0].items)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <h2>Son Eklenenler</h2>

            <p>Son eserlerine tekrar bir bakış at.</p>
          </div>
        </section>
      </main>

      {/* =========================
          YENİ KOMBİN POPUP
      ========================= */}

      {showOutfitModal && (
        <div className="outfit-modal-overlay" onClick={closeOutfitModal}>
          <div
            className="outfit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="outfit-modal-close"
              type="button"
              onClick={closeOutfitModal}
              disabled={isSavingOutfit}
            >
              ×
            </button>

            <div className="outfit-carousel-grid">
              {renderCarousel("top", "Üst Giyim")}

              {renderCarousel("bottom", "Alt Giyim")}

              {renderCarousel("outerwear", "Dış Giyim")}

              {renderCarousel("footwear", "Ayakkabı")}

              {renderCarousel("accessory", "Aksesuar")}
            </div>

            <div className="outfit-preview">
              <h3>Kombin</h3>

              <div className="outfit-preview-area">
                {!selectedItems.top &&
                !selectedItems.bottom &&
                !selectedItems.outerwear &&
                !selectedItems.footwear &&
                selectedItems.accessory.length === 0 ? (
                  <p className="outfit-preview-empty">Henüz parça seçmedin.</p>
                ) : (
                  <div className="selected-outfit-items">
                    {selectedItems.top && (
                      <img
                        src={"http://127.0.0.1:8000" + selectedItems.top.image}
                        alt="Üst Giyim"
                        className="selected-outfit-item top-preview"
                      />
                    )}

                    {selectedItems.outerwear && (
                      <img
                        src={
                          "http://127.0.0.1:8000" +
                          selectedItems.outerwear.image
                        }
                        alt="Dış Giyim"
                        className="selected-outfit-item outerwear-preview"
                      />
                    )}

                    {selectedItems.bottom && (
                      <img
                        src={
                          "http://127.0.0.1:8000" + selectedItems.bottom.image
                        }
                        alt={
                          selectedItems.bottom.category === "shorts"
                            ? "Şort"
                            : "Pantolon"
                        }
                        className={
                          selectedItems.bottom.category === "shorts"
                            ? "selected-outfit-item shorts-preview"
                            : "selected-outfit-item bottom-preview"
                        }
                      />
                    )}

                    {selectedItems.footwear && (
                      <img
                        src={
                          "http://127.0.0.1:8000" + selectedItems.footwear.image
                        }
                        alt="Ayakkabı"
                        className="selected-outfit-item footwear-preview"
                      />
                    )}

                    {selectedItems.accessory.map((item, index) => (
                      <img
                        key={item.id}
                        src={"http://127.0.0.1:8000" + item.image}
                        alt="Aksesuar"
                        className={
                          "selected-outfit-item accessory-preview " +
                          `accessory-preview-${index}`
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="outfit-name-section">
              <label htmlFor="outfit-name">Kombin adı</label>

              <input
                id="outfit-name"
                type="text"
                value={outfitName}
                onChange={(event) => {
                  setOutfitName(event.target.value);

                  setOutfitError("");
                }}
                placeholder="Örn. Günlük kombin"
                disabled={isSavingOutfit}
              />
            </div>

            {outfitError && <p className="form-error">{outfitError}</p>}

            <div className="outfit-modal-actions">
              <button
                type="button"
                onClick={closeOutfitModal}
                disabled={isSavingOutfit}
              >
                İptal
              </button>

              <button
                type="button"
                onClick={handleSaveOutfit}
                disabled={isSavingOutfit}
              >
                {isSavingOutfit ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================
          BUGÜNÜN KOMBİNİ POPUP
      ========================= */}

      {todayOutfitOpen && todayOutfit && (
        <div
          className="today-outfit-modal-overlay"
          onClick={() => setTodayOutfitOpen(false)}
        >
          <div
            className="today-outfit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="today-outfit-modal-close"
              onClick={() => setTodayOutfitOpen(false)}
            >
              ×
            </button>

            <div className="today-outfit-modal-header">
              <h2>Bugünün Kombini</h2>

              <p>Bugün için sana bunu seçtik.</p>
            </div>

            <div className="today-outfit-modal-preview">
              <div className="today-outfit-preview large">
                {renderTodayOutfitPiece(todayOutfit.outerwear, "outerwear")}

                {renderTodayOutfitPiece(todayOutfit.top, "top")}

                {renderTodayOutfitPiece(todayOutfit.bottom, "bottom")}

                {renderTodayOutfitPiece(todayOutfit.footwear, "footwear")}

                {renderTodayAccessories()}
              </div>
            </div>

            <div className="today-outfit-actions">
              <button
                type="button"
                className="today-outfit-refresh"
                onClick={regenerateTodayOutfit}
                disabled={isLoadingTodayOutfit || isSavingTodayOutfit}
              >
                {isLoadingTodayOutfit ? "Hazırlanıyor..." : "Yenile"}
              </button>

              <button
                type="button"
                className="today-outfit-save-button"
                onClick={openSaveTodayOutfitModal}
                disabled={isLoadingTodayOutfit || isSavingTodayOutfit}
              >
                Kombinlerime Ekle
              </button>

              <button
                type="button"
                className="today-outfit-close-button"
                onClick={() => setTodayOutfitOpen(false)}
                disabled={isSavingTodayOutfit}
              >
                Kapat
              </button>
            </div>

            {todayOutfitSaveError && (
              <p className="today-outfit-save-error" role="alert">
                {todayOutfitSaveError}
              </p>
            )}
          </div>
        </div>
      )}

      {showSaveTodayOutfitModal && (
        <div
          className="today-outfit-save-overlay"
          onClick={closeSaveTodayOutfitModal}
        >
          <div
            className="today-outfit-save-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="today-outfit-save-close"
              onClick={closeSaveTodayOutfitModal}
              disabled={isSavingTodayOutfit}
            >
              ×
            </button>

            <h3>Kombine bir isim ver</h3>

            <input
              type="text"
              value={todayOutfitName}
              onChange={(event) => {
                setTodayOutfitName(event.target.value);
                setTodayOutfitSaveError("");
              }}
              placeholder="Örn. Günlük kombin"
              disabled={isSavingTodayOutfit}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSaveTodayOutfit();
                }
              }}
            />

            {todayOutfitSaveError && (
              <p className="today-outfit-save-error" role="alert">
                {todayOutfitSaveError}
              </p>
            )}

            <div className="today-outfit-save-actions">
              <button
                type="button"
                className="today-outfit-save-cancel"
                onClick={closeSaveTodayOutfitModal}
                disabled={isSavingTodayOutfit}
              >
                İptal
              </button>

              <button
                type="button"
                className="today-outfit-save-confirm"
                onClick={handleSaveTodayOutfit}
                disabled={isSavingTodayOutfit}
              >
                {isSavingTodayOutfit ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Home;
