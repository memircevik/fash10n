import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/navbar";
import {
  getOutfits,
  getClothingItems,
  removeOutfit,
  updateOutfit,
} from "../services/wardrobe";
import removeIcon from "../assets/trashcan.png";

function Outfits() {
  const location = useLocation();
  const navigate = useNavigate();

  const [outfits, setOutfits] = useState([]);
  const [clothingItems, setClothingItems] = useState([]);

  const [loading, setLoading] = useState(true);

  const [deletingOutfitId, setDeletingOutfitId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const [selectedOutfit, setSelectedOutfit] = useState(null);

  const [editingOutfit, setEditingOutfit] = useState(null);

  const [editSelectedItems, setEditSelectedItems] = useState({
    top: null,
    bottom: null,
    outerwear: null,
    footwear: null,
    accessory: null,
  });

  const [editOutfitName, setEditOutfitName] = useState("");
  const [editError, setEditError] = useState("");
  const [isUpdatingOutfit, setIsUpdatingOutfit] = useState(false);

  /* =========================
     KOMBİNLERİ GETİR
  ========================= */

  useEffect(() => {
    let cancelled = false;

    const loadOutfits = async () => {
      try {
        setLoading(true);

        const data = await getOutfits();

        if (cancelled) {
          return;
        }

        const loadedOutfits = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];

        setOutfits(loadedOutfits);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("Kombinler alınamadı:", error);
        setOutfits([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadOutfits();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================
     HOME'DAN GELEN KOMBİNİ
     OTOMATİK AÇ
  ========================= */

  useEffect(() => {
    if (loading) {
      return;
    }

    const openOutfitId = location.state?.openOutfitId;

    if (openOutfitId === undefined || openOutfitId === null) {
      return;
    }

    const outfitToOpen = outfits.find(
      (outfit) => String(outfit.id) === String(openOutfitId),
    );

    if (outfitToOpen) {
      setSelectedOutfit(outfitToOpen);
    }

    navigate("/outfits", {
      replace: true,
      state: null,
    });
  }, [loading, outfits, location.state, navigate]);

  /* =========================
     KATEGORİLER
  ========================= */

  const categoryItems = {
    top: clothingItems.filter((item) => item.category === "top"),

    bottom: clothingItems.filter((item) => item.category === "bottom"),

    outerwear: clothingItems.filter((item) => item.category === "outerwear"),

    footwear: clothingItems.filter((item) => item.category === "footwear"),

    accessory: clothingItems.filter((item) => item.category === "accessory"),
  };

  /* =========================
     DÜZENLEME POPUP'I AÇ
  ========================= */

  const handleOpenEdit = async (outfit) => {
    try {
      setEditError("");

      const data = await getClothingItems();

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];

      setClothingItems(items);

      const selected = {
        top: null,
        bottom: null,
        outerwear: null,
        footwear: null,
        accessory: null,
      };

      (outfit.items || []).forEach((item) => {
        selected[item.category] =
          items.find((clothingItem) => clothingItem.id === item.id) || item;
      });

      setEditSelectedItems(selected);
      setEditOutfitName(outfit.name || "");

      setSelectedOutfit(null);
      setEditingOutfit(outfit);
    } catch (error) {
      console.error("Düzenleme için gardırop alınamadı:", error);

      setEditError("Kıyafetler alınamadı.");
    }
  };

  /* =========================
     DÜZENLEME POPUP'I KAPAT
  ========================= */

  const handleCloseEdit = () => {
    if (isUpdatingOutfit) {
      return;
    }

    setEditingOutfit(null);
    setEditError("");
    setEditOutfitName("");

    setEditSelectedItems({
      top: null,
      bottom: null,
      outerwear: null,
      footwear: null,
      accessory: null,
    });
  };

  /* =========================
     DÜZENLEME CAROUSEL
  ========================= */

  const moveEditCarousel = (category, direction) => {
    const items = categoryItems[category];

    if (!items.length) {
      return;
    }

    const canBeNull = category === "outerwear" || category === "accessory";

    setEditSelectedItems((current) => {
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
     DÜZENLEME CAROUSEL RENDER
  ========================= */

  const renderEditCarousel = (category, title) => {
    const selectedItem = editSelectedItems[category];
    const items = categoryItems[category];

    return (
      <div className="outfit-carousel">
        <h3>{title}</h3>

        <button
          type="button"
          className="carousel-arrow"
          disabled={items.length === 0}
          onClick={() => {
            moveEditCarousel(category, -1);
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
          onClick={() => {
            moveEditCarousel(category, 1);
          }}
        >
          ›
        </button>
      </div>
    );
  };

  /* =========================
     KOMBİN GÜNCELLE
  ========================= */

  const handleUpdateOutfit = async () => {
    if (!editOutfitName.trim()) {
      setEditError("Kombin adı yazmalısın.");
      return;
    }

    if (!editSelectedItems.top) {
      setEditError("Üst giyim seçmelisin.");
      return;
    }

    if (!editSelectedItems.bottom) {
      setEditError("Alt giyim seçmelisin.");
      return;
    }

    if (!editSelectedItems.footwear) {
      setEditError("Ayakkabı seçmelisin.");
      return;
    }

    const itemIds = Object.values(editSelectedItems)
      .filter(Boolean)
      .map((item) => item.id);

    try {
      setIsUpdatingOutfit(true);
      setEditError("");

      const updatedOutfit = await updateOutfit(
        editingOutfit.id,
        editOutfitName.trim(),
        itemIds,
      );

      setOutfits((current) =>
        current.map((outfit) =>
          outfit.id === updatedOutfit.id ? updatedOutfit : outfit,
        ),
      );

      handleCloseEdit();
    } catch (error) {
      console.error("Kombin güncelleme hatası:", error);

      setEditError(error.message || "Kombin güncellenemedi.");
    } finally {
      setIsUpdatingOutfit(false);
    }
  };

  /* =========================
     KOMBİN SİL
  ========================= */

  const handleDeleteOutfit = async (id) => {
    const confirmed = window.confirm(
      "Bu kombini silmek istediğine emin misin?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingOutfitId(id);
      setDeleteError("");

      await removeOutfit(id);

      setOutfits((current) => current.filter((outfit) => outfit.id !== id));

      if (selectedOutfit && selectedOutfit.id === id) {
        setSelectedOutfit(null);
      }

      if (editingOutfit && editingOutfit.id === id) {
        setEditingOutfit(null);
      }
    } catch (error) {
      console.error("Kombin silme hatası:", error);

      setDeleteError(error.message || "Kombin silinemedi.");
    } finally {
      setDeletingOutfitId(null);
    }
  };

  return (
    <>
      <Navbar />

      <main className="outfits-page">
        <div className="outfits-header">
          <h1>Kombinler</h1>
        </div>

        {deleteError && <p className="form-error">{deleteError}</p>}

        {loading ? (
          <p
            style={{
              textAlign: "center",
            }}
          >
            Kombinler yükleniyor...
          </p>
        ) : outfits.length === 0 ? (
          <p
            style={{
              textAlign: "center",
            }}
          >
            Henüz kombin oluşturmadın.
          </p>
        ) : (
          <div className="outfits-grid">
            {outfits.map((outfit) => (
              <div
                key={outfit.id}
                className="outfit-card"
                onClick={() => {
                  setSelectedOutfit(outfit);
                }}
              >
                <div className="outfit-image">
                  <button
                    type="button"
                    className="delete-outfit-button"
                    disabled={deletingOutfitId === outfit.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteOutfit(outfit.id);
                    }}
                  >
                    <img src={removeIcon} alt="Kombini sil" />
                  </button>

                  <div className="saved-outfit-preview">
                    {(outfit.items || []).map((item) => (
                      <img
                        key={item.id}
                        src={"http://127.0.0.1:8000" + item.image}
                        alt={item.category}
                        className={"saved-outfit-" + item.category}
                      />
                    ))}
                  </div>
                </div>

                <div className="outfit-info">
                  <h2>{outfit.name}</h2>

                  <p>
                    {new Date(outfit.created_at).toLocaleDateString("tr-TR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* =========================
          DETAY POPUP
      ========================= */}

      {selectedOutfit && (
        <div
          className="outfit-detail-overlay"
          onClick={() => {
            setSelectedOutfit(null);
          }}
        >
          <div
            className="outfit-detail-modal"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <button
              type="button"
              className="outfit-detail-close"
              onClick={() => {
                setSelectedOutfit(null);
              }}
            >
              ×
            </button>

            <div className="outfit-detail-header">
              <h2>{selectedOutfit.name}</h2>

              <p>
                {new Date(selectedOutfit.created_at).toLocaleDateString(
                  "tr-TR",
                )}
              </p>
            </div>

            <div className="outfit-detail-image">
              <div className="saved-outfit-detail-preview">
                {(selectedOutfit.items || []).map((item) => (
                  <img
                    key={item.id}
                    src={"http://127.0.0.1:8000" + item.image}
                    alt={item.category}
                    className={"saved-outfit-detail-" + item.category}
                  />
                ))}
              </div>
            </div>

            <div className="outfit-detail-actions">
              <button
                type="button"
                className="outfit-detail-edit"
                onClick={() => {
                  handleOpenEdit(selectedOutfit);
                }}
              >
                Düzenle
              </button>

              <button
                type="button"
                className="outfit-detail-done"
                onClick={() => {
                  setSelectedOutfit(null);
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================
          DÜZENLE POPUP
      ========================= */}

      {editingOutfit && (
        <div className="outfit-modal-overlay" onClick={handleCloseEdit}>
          <div
            className="outfit-modal"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <button
              className="outfit-modal-close"
              type="button"
              onClick={handleCloseEdit}
              disabled={isUpdatingOutfit}
            >
              ×
            </button>

            <div className="outfit-carousel-grid">
              {renderEditCarousel("top", "Üst Giyim")}

              {renderEditCarousel("bottom", "Alt Giyim")}

              {renderEditCarousel("outerwear", "Dış Giyim")}

              {renderEditCarousel("footwear", "Ayakkabı")}

              {renderEditCarousel("accessory", "Aksesuar")}
            </div>

            <div className="outfit-preview">
              <h3>Kombin</h3>

              <div className="outfit-preview-area">
                <div className="selected-outfit-items">
                  {editSelectedItems.top && (
                    <img
                      src={
                        "http://127.0.0.1:8000" + editSelectedItems.top.image
                      }
                      alt="Üst Giyim"
                      className="selected-outfit-item top-preview"
                    />
                  )}

                  {editSelectedItems.outerwear && (
                    <img
                      src={
                        "http://127.0.0.1:8000" +
                        editSelectedItems.outerwear.image
                      }
                      alt="Dış Giyim"
                      className="selected-outfit-item outerwear-preview"
                    />
                  )}

                  {editSelectedItems.bottom && (
                    <img
                      src={
                        "http://127.0.0.1:8000" + editSelectedItems.bottom.image
                      }
                      alt="Alt Giyim"
                      className="selected-outfit-item bottom-preview"
                    />
                  )}

                  {editSelectedItems.footwear && (
                    <img
                      src={
                        "http://127.0.0.1:8000" +
                        editSelectedItems.footwear.image
                      }
                      alt="Ayakkabı"
                      className="selected-outfit-item footwear-preview"
                    />
                  )}

                  {editSelectedItems.accessory && (
                    <img
                      src={
                        "http://127.0.0.1:8000" +
                        editSelectedItems.accessory.image
                      }
                      alt="Aksesuar"
                      className="selected-outfit-item accessory-preview"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="outfit-name-section">
              <label htmlFor="edit-outfit-name">Kombin adı</label>

              <input
                id="edit-outfit-name"
                type="text"
                value={editOutfitName}
                onChange={(event) => {
                  setEditOutfitName(event.target.value);
                  setEditError("");
                }}
                disabled={isUpdatingOutfit}
              />
            </div>

            {editError && <p className="form-error">{editError}</p>}

            <div className="outfit-modal-actions">
              <button
                type="button"
                onClick={handleCloseEdit}
                disabled={isUpdatingOutfit}
              >
                İptal
              </button>

              <button
                type="button"
                onClick={handleUpdateOutfit}
                disabled={isUpdatingOutfit}
              >
                {isUpdatingOutfit ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Outfits;
