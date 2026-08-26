export async function login(username, password) {
  const response = await fetch("http://127.0.0.1:8000/api/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();
  return data;
}

export async function register(username, email, password) {
  const response = await fetch("http://127.0.0.1:8000/api/accounts/register/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      email,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errors = [];

    if (data.username) {
      errors.push("Yanlış veya kullanılan bir kullanıcı adı girdiniz.");
    }

    if (data.email) {
      errors.push("Geçersiz veya kullanılan bir e-posta girdiniz.");
    }

    if (data.password) {
      errors.push("Şifre kısmı boş bırakılamaz.");
    }

    if (data.detail) {
      errors.push(data.detail);
    }

    throw new Error(errors.join("\n"));
  }

  return data;
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) {
    throw new Error("Refresh token bulunamadı.");
  }
  const response = await fetch("http://127.0.0.1:8000/api/token/refresh/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh: refreshToken,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    throw new Error("Oturum süresi doldu.");
  }
  localStorage.setItem("access_token", data.access);
  return data.access;
}
