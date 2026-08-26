import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Navbar from "../components/navbar";

import { getClothingItems, addOutfit, getOutfits } from "../services/wardrobe";

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
    accessory: null,
  });

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

  const [todayOutfitIndex, setTodayOutfitIndex] = useState(0);

  /* =========================
     BUGÜNÜN TARİH ANAHTARI
  ========================= */

  const todayKey = useMemo(() => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }, []);

  /* =========================
     GARDIROP
     
     Bugünün kombinini oluşturmak
     için sayfa açılır açılmaz
     gardırobu çekiyoruz.
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

      bottom: clothingItems.filter((item) => item.category === "bottom"),

      outerwear: clothingItems.filter((item) => item.category === "outerwear"),

      footwear: clothingItems.filter((item) => item.category === "footwear"),

      accessory: clothingItems.filter((item) => item.category === "accessory"),
    };
  }, [clothingItems]);

  /* =========================
     BASİT HASH
     
     Aynı tarih + aynı index
     aynı kombini üretir.
  ========================= */

  const createSeed = (text) => {
    let hash = 0;

    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);

      hash |= 0;
    }

    return Math.abs(hash);
  };

  /* =========================
     BUGÜNÜN KOMBİNİNİ OLUŞTUR
  ========================= */

  const generateTodayOutfit = (index = 0) => {
    const { top, bottom, footwear, outerwear, accessory } = categoryItems;

    /*
     * Temel kombin için gerekenler
     * yoksa kombin üretemeyiz.
     */

    if (!top.length || !bottom.length || !footwear.length) {
      setTodayOutfit(null);

      return;
    }

    const seedBase = `${todayKey}-${index}`;

    const topSeed = createSeed(seedBase + "-top");

    const bottomSeed = createSeed(seedBase + "-bottom");

    const footwearSeed = createSeed(seedBase + "-footwear");

    const outerSeed = createSeed(seedBase + "-outer");

    const accessorySeed = createSeed(seedBase + "-accessory");

    const selectedTop = top[topSeed % top.length];

    const selectedBottom = bottom[bottomSeed % bottom.length];

    const selectedFootwear = footwear[footwearSeed % footwear.length];

    /*
     * Dış giyim yaklaşık %50 ihtimalle
     * eklensin.
     */

    let selectedOuterwear = null;

    if (outerwear.length && outerSeed % 2 === 0) {
      selectedOuterwear = outerwear[outerSeed % outerwear.length];
    }

    /*
     * Aksesuar yaklaşık %50 ihtimalle
     * eklensin.
     */

    let selectedAccessory = null;

    if (accessory.length && accessorySeed % 2 === 0) {
      selectedAccessory = accessory[accessorySeed % accessory.length];
    }

    setTodayOutfit({
      top: selectedTop,
      bottom: selectedBottom,
      outerwear: selectedOuterwear,
      footwear: selectedFootwear,
      accessory: selectedAccessory,
    });
  };

  /* =========================
     GARDIROP GELİNCE BUGÜNÜN
     KOMBİNİNİ OLUŞTUR
  ========================= */

  useEffect(() => {
    if (
      !categoryItems.top.length ||
      !categoryItems.bottom.length ||
      !categoryItems.footwear.length
    ) {
      setTodayOutfit(null);

      return;
    }

    /*
     * Aynı gün için ilk öneri.
     */

    generateTodayOutfit(todayOutfitIndex);
  }, [
    categoryItems.top.length,
    categoryItems.bottom.length,
    categoryItems.footwear.length,
    categoryItems.outerwear.length,
    categoryItems.accessory.length,
    todayKey,
    todayOutfitIndex,
  ]);

  /* =========================
     BUGÜNÜN KOMBİNİNİ YENİLE
  ========================= */

  const regenerateTodayOutfit = () => {
    setTodayOutfitIndex((current) => current + 1);
  };

  /* =========================
     YENİ KOMBİN CAROUSEL
  ========================= */

  const moveCarousel = (category, direction) => {
    const items = categoryItems[category];

    if (!items.length) {
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
     CAROUSEL RENDER
  ========================= */

  const renderCarousel = (category, title) => {
    const selectedItem = selectedItems[category];

    const items = categoryItems[category];

    return (
      <div className="outfit-carousel">
        <h3>{title}</h3>

        <button
          type="button"
          className="carousel-arrow"
          disabled={items.length === 0}
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
              {items.length === 0 ? "Bu kategoride kıyafet yok." : "Parça yok"}
            </div>
          )}
        </div>

        <button
          type="button"
          className="carousel-arrow"
          disabled={items.length === 0}
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
      accessory: null,
    });

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

    const itemIds = Object.values(selectedItems)
      .filter(Boolean)
      .map((item) => item.id);

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
        accessory: null,
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
     BUGÜNÜN KOMBİN PREVIEW
  ========================= */

  const renderTodayOutfitPiece = (item, category) => {
    if (!item) {
      return null;
    }

    return (
      <img
        src={"http://127.0.0.1:8000" + item.image}
        alt={category}
        className={"today-outfit-" + category}
      />
    );
  };

  return (
    <>
      <Navbar />

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

                  {renderTodayOutfitPiece(todayOutfit.accessory, "accessory")}
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
                {/* 3. kombin */}

                {recentOutfits[2] && (
                  <div
                    className="outfit-stack-card outfit-back"
                    onClick={(event) =>
                      openRecentOutfit(event, recentOutfits[2])
                    }
                  >
                    <div className="home-outfit-preview">
                      {recentOutfits[2].items?.map((item) => (
                        <img
                          key={item.id}
                          src={"http://127.0.0.1:8000" + item.image}
                          alt={item.category}
                          className={"home-outfit-" + item.category}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. kombin */}

                {recentOutfits[1] && (
                  <div
                    className="outfit-stack-card outfit-middle"
                    onClick={(event) =>
                      openRecentOutfit(event, recentOutfits[1])
                    }
                  >
                    <div className="home-outfit-preview">
                      {recentOutfits[1].items?.map((item) => (
                        <img
                          key={item.id}
                          src={"http://127.0.0.1:8000" + item.image}
                          alt={item.category}
                          className={"home-outfit-" + item.category}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* En yeni */}

                {recentOutfits[0] && (
                  <div
                    className="outfit-stack-card outfit-front"
                    onClick={(event) =>
                      openRecentOutfit(event, recentOutfits[0])
                    }
                  >
                    <div className="home-outfit-preview">
                      {recentOutfits[0].items?.map((item) => (
                        <img
                          key={item.id}
                          src={"http://127.0.0.1:8000" + item.image}
                          alt={item.category}
                          className={"home-outfit-" + item.category}
                        />
                      ))}
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
                {Object.values(selectedItems).every((item) => item === null) ? (
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
                        alt="Alt Giyim"
                        className="selected-outfit-item bottom-preview"
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

                    {selectedItems.accessory && (
                      <img
                        src={
                          "http://127.0.0.1:8000" +
                          selectedItems.accessory.image
                        }
                        alt="Aksesuar"
                        className="selected-outfit-item accessory-preview"
                      />
                    )}
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

                {renderTodayOutfitPiece(todayOutfit.accessory, "accessory")}
              </div>
            </div>

            <div className="today-outfit-actions">
              <button
                type="button"
                className="today-outfit-refresh"
                onClick={regenerateTodayOutfit}
              >
                Yenile
              </button>

              <button
                type="button"
                className="today-outfit-close-button"
                onClick={() => setTodayOutfitOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Home;
