import "./App.css";
import {BrowserRouter as Router, Routes, Route} from "react-router-dom";
import Login from "./pages/Login";
import Navbar from "./components/navbar";
import Wardrobe from "./pages/Wardrobe";
import Register from "./pages/Register";

function Home() {
    
    return (
        <>
            <Navbar />
                <main className="home-page ">
                <h1>Fash10n Homepage</h1>
                </main>
        </>
    );      
}

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/home" element={<Home />} />
                <Route path="/wardrobe" element={<Wardrobe />} />
                <Route path= "/register" element= {<Register />}/>
            </Routes>
        </Router>
    );
} 

export default App;