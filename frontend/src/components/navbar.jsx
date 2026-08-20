import { useState } from "react";
import { Link } from "react-router-dom";
import profileIcon from "../assets/profil.png";

function Navbar() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <nav className="navbar">

            <div className="navbar-left">
                <div className="navbar-brand">
                    Fash10n
                </div>

                <div className="navbar-links">
                    <Link to="/home">Home</Link>
                    <Link to="/wardrobe">Gardırobum</Link>
                    <Link to="/explore">Keşfet</Link>
                    <Link to="/outfits">Kombinlerim</Link>
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
                     <button>Ayarlar</button>

                  <Link to="/" className="exit-button">
                 Çıkış Yap
                   </Link>
                   </div>
                )}
            </div>

        </nav>
    );
}

export default Navbar;