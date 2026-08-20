
export  async function getClothingItems() {
    const accessToken = localStorage.getItem("access_token");
    const response = await fetch(
        "http://127.0.0.1:8000/api/wardrobe/clothing-items/",
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`
            },
        }
    );
    return response.json();
}