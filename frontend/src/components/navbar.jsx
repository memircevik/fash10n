import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import profileIcon from "../assets/profil.png";
import logo from "../assets/logo.png";

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-brand">
          <img src={logo} alt="Fash10n" />
          <span>Fash10n</span>
        </div>

        <div className="navbar-links">
          <NavLink
            to="/home"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {" "}
            Anasayfa{" "}
          </NavLink>
        </div>

        <div className="navbar-links">
          <NavLink
            to="/wardrobe"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {" "}
            Gardırobum{" "}
          </NavLink>
        </div>

        <div className="navbar-links">
          <NavLink
            to="/explore"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {" "}
            Keşfet{" "}
          </NavLink>
        </div>

        <div className="navbar-links">
          <NavLink
            to="/outfits"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {" "}
            Kombinler{" "}
          </NavLink>
        </div>
      </div>

      <div className="navbar-profile">
        <button
          className="profile-button"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <img src={profileIcon} alt="Profil" />
        </button>

        {menuOpen && (
          <div className="profile-menu">
            <button type="button" disabled title="Yakında">
              Ayarlar
            </button>

            <Link
              to="/"
              className="exit-button"
              onClick={() => {
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
              }}
            >
              Çıkış Yap
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
