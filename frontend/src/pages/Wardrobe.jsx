import {useEffect, useState} from "react";    
import {getClothingItems} from "../services/wardrobe";

function Wardrobe() {
const [clothingItems, setClothingItems] = useState([]);
    useEffect(() => {
    getClothingItems()
        .then((data) => {
            setClothingItems(data);
        });
}, []);

    return (
        <div className="clothing-grid"> 
        <div className="add-clothing-card"> 
            <span>+</span>
        </div>
            {clothingItems.map((item) => 
            (
            <div key={item.id} className="clothing-card">
                <img 
            src = {`http://127.0.0.1:8000${item.image}`}
            alt="" 
            />
        </div>
        ))}
        </div>
    );
}

export default Wardrobe;