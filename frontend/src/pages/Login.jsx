import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/auth";
import logo from "../assets/logo.png";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    setErrors({});
    setIsSubmitting(true);

    try {
      const data = await login(username, password);

      if (data.access) {
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);

        navigate("/home");
        return;
      }

      setErrors({
        general: "Kullanıcı adı veya şifre hatalı.",
      });
    } catch (error) {
      console.error("Login failed:", error);

      setErrors({
        general: "Sunucuya bağlanılamadı. Lütfen tekrar deneyin.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={logo} alt="Fash10n" />
          <span>Fash10n</span>
        </div>

        <h1>Hoş geldin</h1>
        <p className="auth-subtitle">Devam etmek için hesabına giriş yap.</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="username">Kullanıcı adı</label>

            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Şifre</label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {errors.general && <p className="form-error">{errors.general}</p>}

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        <p className="auth-switch">
          Henüz bir hesabın yok mu? <a href="/register">Hesap oluştur</a>
        </p>
      </div>
    </main>
  );
}

export default Login;
