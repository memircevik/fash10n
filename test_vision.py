import base64
import json
import sys
import urllib.request


MODEL = "gemma3:4b"
OLLAMA_URL = "http://localhost:11434/api/chat"


def main():
    if len(sys.argv) != 2:
        print(
            'Kullanim: python test_vision.py "C:\\path\\to\\image.jpg"'
        )
        sys.exit(1)

    image_path = sys.argv[1]

    try:
        with open(image_path, "rb") as image_file:
            image_base64 = base64.b64encode(
                image_file.read()
            ).decode("utf-8")
    except FileNotFoundError:
        print("Fotoğraf bulunamadı:")
        print(image_path)
        sys.exit(1)

    schema = {
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "enum": [
                    "top",
                    "bottom",
                    "outerwear",
                    "footwear",
                    "accessory",
                ],
            },
            "color": {
                "type": "string",
            },
            "season": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "spring",
                        "summer",
                        "fall",
                        "winter",
                    ],
                },
            },
            "style": {
                "type": "string",
            },
        },
        "required": [
            "category",
            "color",
            "season",
            "style",
        ],
    }

    prompt = """
Analyze this clothing item.

Identify the clothing category, main color (define it by it's hex code),
suitable seasons, and a short style description.

Rules:

category must be exactly one of:
top, bottom, outerwear, footwear, accessory

season may contain one or more of:
spring, summer, fall, winter

Return only the requested JSON object.
Do not describe the image outside the JSON.
"""

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [image_base64],
            }
        ],
        "format": schema,
        "stream": False,
        "options": {
            "temperature": 0,
        },
    }

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    print("AI çalışıyor... Fotoğraf analiz ediliyor.\n")

    try:
        with urllib.request.urlopen(
            request,
            timeout=180,
        ) as response:
            response_data = json.loads(
                response.read().decode("utf-8")
            )
    except Exception as error:
        print("Ollama isteği başarısız:")
        print(error)
        sys.exit(1)

    content = (
        response_data
        .get("message", {})
        .get("content", "")
    )

    print("Ham cevap:")
    print(content)

    print("\nJSON olarak:")
    try:
        result = json.loads(content)
        print(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False,
            )
        )
    except json.JSONDecodeError:
        print("Model JSON döndürmedi.")


if __name__ == "__main__":
    main()