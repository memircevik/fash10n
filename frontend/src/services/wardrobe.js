import { refreshAccessToken } from "./auth";

export async function getClothingItems() {
  let accessToken = localStorage.getItem("access_token");

  let response = await fetch(
    "http://127.0.0.1:8000/api/wardrobe/clothing-items/",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      "http://127.0.0.1:8000/api/wardrobe/clothing-items/",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Kıyafetler alınamadı.");
  }

  return data;
}

export async function addClothingItems(image, category, season, color) {
  let accessToken = localStorage.getItem("access_token");

  const formData = new FormData();

  formData.append("image", image);
  formData.append("category", category);
  formData.append("season", season);
  formData.append("color", color);

  let response = await fetch(
    "http://127.0.0.1:8000/api/wardrobe/clothing-items/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      "http://127.0.0.1:8000/api/wardrobe/clothing-items/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      },
    );
  }

  const data = await response.json();

  if (!response.ok) {
    console.error("ADD CLOTHING BACKEND ERROR:", data);

    const errorMessage =
      data.detail ||
      data.season?.[0] ||
      data.category?.[0] ||
      data.color?.[0] ||
      data.image?.[0] ||
      "Kıyafet eklenemedi.";

    throw new Error(errorMessage);
  }

  return data;
}

export async function removeBackground(image) {
  let accessToken = localStorage.getItem("access_token");

  const formData = new FormData();

  formData.append("image", image);

  let response = await fetch(
    "http://127.0.0.1:8000/api/wardrobe/remove-background/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      "http://127.0.0.1:8000/api/wardrobe/remove-background/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      },
    );
  }

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      // Response JSON değilse boş bırak
    }

    throw new Error(data.detail || "Arka plan silinemedi.");
  }

  return await response.blob();
}

export async function removeClothingItem(id) {
  let accessToken = localStorage.getItem("access_token");

  let response = await fetch(
    `http://127.0.0.1:8000/api/wardrobe/clothing-items/${id}/`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      `http://127.0.0.1:8000/api/wardrobe/clothing-items/${id}/`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      // 204 gibi body'siz cevaplarda buraya gelir
    }

    throw new Error(data.detail || "Kıyafet kaldırılamadı.");
  }
}

export async function addOutfit(name, items) {
  let accessToken = localStorage.getItem("access_token");

  let response = await fetch("http://127.0.0.1:8000/api/wardrobe/outfits/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      items,
    }),
  });

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch("http://127.0.0.1:8000/api/wardrobe/outfits/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        items,
      }),
    });
  }

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const data = await response.json();

      throw new Error(data.detail || "Kombin kaydedilemedi.");
    }

    const text = await response.text();

    console.error("Backend HTML/error response:", text);

    throw new Error(`Sunucu hata verdi. HTTP ${response.status}`);
  }

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    console.error("Beklenmeyen backend cevabı:", text);

    throw new Error("Backend JSON yerine farklı bir cevap döndürdü.");
  }

  return await response.json();
}

export async function getOutfits() {
  let accessToken = localStorage.getItem("access_token");

  let response = await fetch("http://127.0.0.1:8000/api/wardrobe/outfits/", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch("http://127.0.0.1:8000/api/wardrobe/outfits/", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Kombinler alınamadı.");
  }

  return data;
}

export async function removeOutfit(id) {
  let accessToken = localStorage.getItem("access_token");

  let response = await fetch(
    `http://127.0.0.1:8000/api/wardrobe/outfits/${id}/`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      `http://127.0.0.1:8000/api/wardrobe/outfits/${id}/`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      // 204 veya boş response
    }

    throw new Error(data.detail || "Kombin silinemedi.");
  }

  return true;
}

export async function updateOutfit(id, name, items) {
  let accessToken = localStorage.getItem("access_token");

  let response = await fetch(
    `http://127.0.0.1:8000/api/wardrobe/outfits/${id}/`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        items,
      }),
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      `http://127.0.0.1:8000/api/wardrobe/outfits/${id}/`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          items,
        }),
      },
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Kombin güncellenemedi.");
  }

  return data;
}

export async function analyzeClothing(imageFile) {
  let accessToken = localStorage.getItem("access_token");

  const formData = new FormData();

  formData.append("image", imageFile);

  let response = await fetch(
    "http://127.0.0.1:8000/api/wardrobe/analyze-clothing/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken();

    response = await fetch(
      "http://127.0.0.1:8000/api/wardrobe/analyze-clothing/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      },
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Kıyafet analiz edilemedi.");
  }

  return data;
}
