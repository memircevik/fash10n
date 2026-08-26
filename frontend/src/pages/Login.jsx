import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/auth";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log("submit çalıştı");

    try {
      const data = await login(username, password);

      console.log("API response:", data);

      if (data.access) {
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);

        console.log("login başarılı");
        navigate("/home");
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <main className="login-page">
      <div className="login-container">
        <h1>Fash10n</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-row">
            <label htmlFor="username">Kullanıcı adı:</label>

            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label htmlFor="password">Şifre:</label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit">Giriş Yap</button>
        </form>

        <p className="register-text">
          Henüz bir hesabın yok mu? <a href="/register">Hesap oluştur.</a>
        </p>
      </div>
    </main>
  );
}

export default Login;
