import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../services/auth";

function Register() {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [errors, setErrors] = useState({});

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

    try {
        await register(username, email, password);

        console.log("Kayıt başarılı");
        navigate("/");
    } catch (error) {
        console.error("Register failed:", error);

        setErrors({
            general: error.message,
        });
    }
};

    return (
        <main className="login-page">
            <div className="login-container">
                <h1>Fash10n</h1>

                <form
                    onSubmit={handleSubmit}
                    className="login-form"
                    noValidate
                >
                    <div className="form-row">
                        <label htmlFor="username">
                            Kullanıcı adı:
                        </label>

                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value);
                                setErrors((prev) => ({
                                    ...prev,
                                    username: "",
                                }));
                            }}
                        />
                    </div>

                    {errors.username && (
                        <p className="form-error">
                            {errors.username}
                        </p>
                    )}

                    <div className="form-row">
                        <label htmlFor="email">
                            E-posta:
                        </label>

                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setErrors((prev) => ({
                                    ...prev,
                                    email: "",
                                }));
                            }}
                        />
                    </div>

                    {errors.email && (
                        <p className="form-error">
                            {errors.email}
                        </p>
                    )}

                    <div className="form-row">
                        <label htmlFor="password">
                            Şifre:
                        </label>

                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setErrors((prev) => ({
                                    ...prev,
                                    password: "",
                                }));
                            }}
                        />
                    </div>

                    {errors.password && (
                        <p className="form-error">
                            {errors.password}
                        </p>
                    )}

                    {errors.general && (
                        <p className="form-error">
                            {errors.general}
                        </p>
                    )}

                    <button type="submit">
                        Kayıt Ol
                    </button>
                </form>

                <p className="register-text">
                    Zaten hesabın var mı?{" "}
                    <a href="/">
                        Giriş yap.
                    </a>
                </p>
            </div>
        </main>
    );
}

export default Register;