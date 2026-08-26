import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Navbar from "./components/navbar";
import Wardrobe from "./pages/Wardrobe";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Outfits from "./pages/Outfits";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/wardrobe" element={<Wardrobe />} />
        <Route path="/register" element={<Register />} />
        <Route path="/outfits" element={<Outfits />} />
      </Routes>
    </Router>
  );
}

export default App;
