import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../services/auth";
import logo from "../assets/logo.png";

function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};

    if (!username.trim()) {
      newErrors.username = "Kullanıcı adı zorunludur.";
    }

    if (!email.trim()) {
      newErrors.email = "E-posta adresi zorunludur.";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Geçerli bir e-posta adresi girin.";
    }

    if (!password.trim()) {
      newErrors.password = "Şifre zorunludur.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await register(username, email, password);

      navigate("/");
    } catch (error) {
      console.error("Register failed:", error);

      setErrors({
        general: error.message,
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

        <h1>Hesap oluştur</h1>
        <p className="auth-subtitle">
          Gardırobunu düzenlemeye başlamak için birkaç bilgi gerekiyor.
        </p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="username">Kullanıcı adı</label>

            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrors((prev) => ({
                  ...prev,
                  username: "",
                }));
              }}
              disabled={isSubmitting}
            />

            {errors.username && (
              <p className="auth-field-error">{errors.username}</p>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="email">E-posta</label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((prev) => ({
                  ...prev,
                  email: "",
                }));
              }}
              disabled={isSubmitting}
            />

            {errors.email && <p className="auth-field-error">{errors.email}</p>}
          </div>

          <div className="auth-field">
            <label htmlFor="password">Şifre</label>

            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((prev) => ({
                  ...prev,
                  password: "",
                }));
              }}
              disabled={isSubmitting}
            />

            {errors.password && (
              <p className="auth-field-error">{errors.password}</p>
            )}
          </div>

          {errors.general && <p className="form-error">{errors.general}</p>}

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Kayıt olunuyor..." : "Kayıt Ol"}
          </button>
        </form>

        <p className="auth-switch">
          Zaten hesabın var mı? <a href="/">Giriş yap</a>
        </p>
      </div>
    </main>
  );
}

export default Register;
