import base64
import json
import urllib.request

from io import BytesIO

from PIL import Image

from django.core.files.base import ContentFile
from django.http import HttpResponse

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser

from .models import ClothingItem, Outfit
from .serializers import (
    ClothingItemSerializer,
    OutfitSerializer,
)


class RemoveBackgroundView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        image = request.FILES.get("image")

        if not image:
            return Response(
                {
                    "detail":
                        "Fotoğraf bulunamadı."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from rembg import remove, new_session

            session = new_session("u2net")

            input_data = image.read()

            output_data = remove(
                input_data,
                session=session
            )

            return HttpResponse(
                output_data,
                content_type="image/png"
            )

        except Exception as error:
            print(
                "Background removal error:",
                error
            )

            return Response(
                {
                    "detail":
                        "Arka plan silinemedi."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ClothingItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        clothing_items = ClothingItem.objects.filter(
            user=request.user,
            is_active=True
        )

        serializer = ClothingItemSerializer(
            clothing_items,
            many=True
        )

        return Response(
            serializer.data
        )

    def get_content_bbox(self, image):
        """
        Görseldeki gerçek kıyafet alanını bulur.

        Öncelik alpha kanalındadır.
        Background removal yapılmış PNG'lerde
        gerçek kıyafet sınırlarını tespit eder.

        Alpha kullanılamıyorsa beyaz olmayan
        pikseller üzerinden fallback yapılır.
        """

        image = image.convert(
            "RGBA"
        )

        alpha = image.getchannel(
            "A"
        )

        bbox = alpha.getbbox()

        if bbox is not None:
            return bbox

        rgb = image.convert(
            "RGB"
        )

        pixels = rgb.load()

        width, height = rgb.size

        min_x = width
        min_y = height

        max_x = -1
        max_y = -1

        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]

                if (
                    r < 245
                    or g < 245
                    or b < 245
                ):
                    min_x = min(
                        min_x,
                        x
                    )

                    min_y = min(
                        min_y,
                        y
                    )

                    max_x = max(
                        max_x,
                        x
                    )

                    max_y = max(
                        max_y,
                        y
                    )

        if max_x == -1:
            return None

        return (
            min_x,
            min_y,
            max_x + 1,
            max_y + 1
        )

    def get_category_slot(
        self,
        category
    ):
        """
        UI'da normalize edilecek kategoriler
        için sabit render slotları.

        Footwear ve accessory burada yoktur;
        onlar eski sistemdeki gibi doğrudan
        kaydedilir.
        """

        slots = {
            "top": {
                "width": 500,
                "height": 500,
            },

            "pants": {
                "width": 500,
                "height": 650,
            },

            "shorts": {
                "width": 500,
                "height": 380,
            },

            "outerwear": {
                "width": 520,
                "height": 560,
            },
        }

        return slots.get(
            category,
            {
                "width": 400,
                "height": 400,
            }
        )

    def prepare_clothing_image(
        self,
        image_file,
        category
    ):
        """
        Top, pants, shorts ve outerwear
        görsellerini sabit kategori slotuna
        göre hazırlar.

        Footwear ve accessory bu fonksiyona
        gönderilmez.

        Aspect ratio korunur.
        Küçük görseller büyütülebilir.
        Büyük görseller küçültülebilir.
        """

        image_file.seek(
            0
        )

        image = Image.open(
            image_file
        ).convert(
            "RGBA"
        )

        bbox = self.get_content_bbox(
            image
        )

        if bbox is None:
            raise ValueError(
                "Görselde kıyafet alanı bulunamadı."
            )

        left, top, right, bottom = bbox

        cropped = image.crop(
            (
                left,
                top,
                right,
                bottom
            )
        )

        content_width = cropped.width
        content_height = cropped.height

        if (
            content_width <= 0
            or content_height <= 0
        ):
            raise ValueError(
                "Kıyafet görselinin boyutu geçersiz."
            )

        slot = self.get_category_slot(
            category
        )

        slot_width = slot["width"]
        slot_height = slot["height"]

        width_scale = (
            slot_width /
            content_width
        )

        height_scale = (
            slot_height /
            content_height
        )

        scale = min(
            width_scale,
            height_scale
        )

        if scale <= 0:
            raise ValueError(
                "Geçersiz ölçek hesaplandı."
            )

        new_width = max(
            1,
            round(
                content_width *
                scale
            )
        )

        new_height = max(
            1,
            round(
                content_height *
                scale
            )
        )

        resized = cropped.resize(
            (
                new_width,
                new_height
            ),
            Image.Resampling.LANCZOS
        )

        target_size = 800

        canvas = Image.new(
            "RGBA",
            (
                target_size,
                target_size
            ),
            (
                0,
                0,
                0,
                0
            )
        )

        x = (
            target_size -
            new_width
        ) // 2

        y = (
            target_size -
            new_height
        ) // 2

        canvas.alpha_composite(
            resized,
            (
                x,
                y
            )
        )

        output = BytesIO()

        canvas.save(
            output,
            format="PNG",
            optimize=True
        )

        output.seek(
            0
        )

        original_name = (
            getattr(
                image_file,
                "name",
                "clothing.png"
            )
            or "clothing.png"
        )

        base_name = (
            original_name.rsplit(
                ".",
                1
            )[0]
        )

        prepared_name = (
            base_name +
            "_prepared.png"
        )

        print(
            "IMAGE SLOT:",
            {
                "category":
                    category,

                "original_width":
                    content_width,

                "original_height":
                    content_height,

                "slot_width":
                    slot_width,

                "slot_height":
                    slot_height,

                "new_width":
                    new_width,

                "new_height":
                    new_height,

                "scale":
                    round(
                        scale,
                        4
                    ),
            }
        )

        return ContentFile(
            output.getvalue(),
            name=prepared_name
        )

    def post(self, request):
        serializer = ClothingItemSerializer(
            data=request.data
        )

        if not serializer.is_valid():
            print(
                "CLOTHING SERIALIZER ERROR:",
                serializer.errors
            )

            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        image = request.FILES.get(
            "image"
        )

        category = request.data.get(
            "category"
        )

        if not image:
            return Response(
                {
                    "detail":
                        "Fotoğraf bulunamadı."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Footwear ve accessory eski sistemdeki gibi
            # doğrudan kaydedilir.
            if category in {
                "footwear",
                "accessory",
            }:
                serializer.save(
                    user=request.user,
                    image=image
                )

            # Top, pants, shorts ve outerwear
            # yeni sabit UI slot sisteminden geçer.
            else:
                prepared_image = (
                    self.prepare_clothing_image(
                        image,
                        category
                    )
                )

                serializer.save(
                    user=request.user,
                    image=prepared_image
                )

            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED
            )

        except Exception as error:
            print(
                "IMAGE PREPARATION ERROR:",
                error
            )

            return Response(
                {
                    "detail":
                        "Kıyafet görseli hazırlanamadı."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def delete(self, request, pk):
        try:
            clothing_item = ClothingItem.objects.get(
                id=pk,
                user=request.user
            )

        except ClothingItem.DoesNotExist:
            return Response(
                {
                    "detail":
                        "Kıyafet bulunamadı."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        clothing_item.is_active = False

        clothing_item.save(
            update_fields=[
                "is_active"
            ]
        )

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )


class OutfitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        outfits = (
            Outfit.objects
            .filter(
                user=request.user
            )
            .prefetch_related("items")
            .order_by("-created_at")
        )

        serializer = OutfitSerializer(
            outfits,
            many=True
        )

        return Response(
            serializer.data
        )

    def post(self, request):
        name = request.data.get(
            "name"
        )

        item_ids = request.data.get(
            "items",
            []
        )

        if not name:
            return Response(
                {
                    "detail":
                        "Kombin adı gerekli."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {
                    "detail":
                        "En az bir kıyafet seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids,
            user=request.user,
            is_active=True
        )

        if (
            clothing_items.count()
            != len(item_ids)
        ):
            return Response(
                {
                    "detail":
                        "Geçersiz kıyafet seçimi."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        categories = set(
            clothing_items.values_list(
                "category",
                flat=True
            )
        )

        if "top" not in categories:
            return Response(
                {
                    "detail":
                        "Üst giyim seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        has_bottom = (
            "pants" in categories
            or "shorts" in categories
        )

        if not has_bottom:
            return Response(
                {
                    "detail":
                        "Alt giyim seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {
                    "detail":
                        "Ayakkabı seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if (
            "pants" in categories
            and
            "shorts" in categories
        ):
            return Response(
                {
                    "detail":
                        "Aynı kombin içinde hem pantolon hem şort kullanamazsın."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        outfit = Outfit.objects.create(
            user=request.user,
            name=name
        )

        outfit.items.set(
            clothing_items
        )

        serializer = OutfitSerializer(
            outfit
        )

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED
        )

    def put(self, request, pk):
        try:
            outfit = Outfit.objects.get(
                id=pk,
                user=request.user
            )

        except Outfit.DoesNotExist:
            return Response(
                {
                    "detail":
                        "Kombin bulunamadı."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        name = request.data.get(
            "name"
        )

        item_ids = request.data.get(
            "items",
            []
        )

        if not name:
            return Response(
                {
                    "detail":
                        "Kombin adı gerekli."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {
                    "detail":
                        "En az bir kıyafet seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids,
            user=request.user,
            is_active=True
        )

        if (
            clothing_items.count()
            != len(item_ids)
        ):
            return Response(
                {
                    "detail":
                        "Geçersiz kıyafet seçimi."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        categories = set(
            clothing_items.values_list(
                "category",
                flat=True
            )
        )

        if "top" not in categories:
            return Response(
                {
                    "detail":
                        "Üst giyim seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        has_bottom = (
            "pants" in categories
            or "shorts" in categories
        )

        if not has_bottom:
            return Response(
                {
                    "detail":
                        "Alt giyim seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {
                    "detail":
                        "Ayakkabı seçmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if (
            "pants" in categories
            and
            "shorts" in categories
        ):
            return Response(
                {
                    "detail":
                        "Aynı kombin içinde hem pantolon hem şort kullanamazsın."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        outfit.name = name

        outfit.save(
            update_fields=[
                "name"
            ]
        )

        outfit.items.set(
            clothing_items
        )

        serializer = OutfitSerializer(
            outfit
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK
        )

    def delete(self, request, pk):
        try:
            outfit = Outfit.objects.get(
                id=pk,
                user=request.user
            )

        except Outfit.DoesNotExist:
            return Response(
                {
                    "detail":
                        "Kombin bulunamadı."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        outfit.delete()

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )


class AnalyzeClothingView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_main_color(
        self,
        image_bytes
    ):
        image = Image.open(
            BytesIO(image_bytes)
        ).convert(
            "RGBA"
        )

        pixels = []

        for r, g, b, a in image.getdata():
            if a < 30:
                continue

            brightness = (
                r + g + b
            ) / 3

            if brightness > 245:
                continue

            pixels.append(
                (r, g, b)
            )

        if not pixels:
            return "#808080"

        sample_limit = 20000

        if (
            len(pixels)
            > sample_limit
        ):
            step = (
                len(pixels)
                // sample_limit
            )

            pixels = (
                pixels[::step]
            )

        red = (
            sum(
                pixel[0]
                for pixel in pixels
            )
            / len(pixels)
        )

        green = (
            sum(
                pixel[1]
                for pixel in pixels
            )
            / len(pixels)
        )

        blue = (
            sum(
                pixel[2]
                for pixel in pixels
            )
            / len(pixels)
        )

        return (
            "#{:02X}{:02X}{:02X}"
            .format(
                round(red),
                round(green),
                round(blue)
            )
        )

    def post(self, request):
        image = request.FILES.get(
            "image"
        )

        if not image:
            return Response(
                {
                    "detail":
                        "Fotoğraf bulunamadı."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            image_bytes = image.read()

            image_base64 = (
                base64.b64encode(
                    image_bytes
                ).decode(
                    "utf-8"
                )
            )

            schema = {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": [
                            "top",
                            "pants",
                            "shorts",
                            "outerwear",
                            "footwear",
                            "accessory"
                        ]
                    },

                    "season": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": [
                                "spring",
                                "summer",
                                "fall",
                                "winter"
                            ]
                        },
                        "minItems": 1,
                        "maxItems": 4,
                        "uniqueItems": True
                    },

                    "description": {
                        "type":"string"
                    }
                },
                    

                "required": [
                    "category",
                    "season"
                ]
            }

            prompt = """
Analyze this clothing item.

Return ONLY JSON.

category must be exactly one of:

top
pants
shorts
outerwear
footwear
accessory

pants:
Long pants, jeans, dress pants, chinos, joggers, etc.

shorts:
Shorts; short bottoms that leave a significant portion of the leg exposed.

IMPORTANT:
If the image clearly shows shorts, return exactly "shorts".
If the image clearly shows long pants, return exactly "pants".
Never return "bottom".
There is no category called "bottom".

Use the following visual distinction carefully:

pants:
The garment extends substantially down the legs.

shorts:
The garment ends above the knees or around the upper/mid thigh area and leaves a significant part of the legs exposed.

season must be an array.

Choose every season in which the item is genuinely and typically appropriate.

Possible seasons:

spring
summer
fall
winter

Use the following guidelines:

spring:
lightweight or transitional clothing suitable for mild weather

summer:
warm weather, lightweight, breathable, short-sleeve or summer clothing

fall:
cooler weather, medium-weight clothing, layering pieces

winter:
cold weather, heavy, insulating, or clearly winter-oriented clothing

Important:

Do not include spring by default.

Do not include winter unless the item is genuinely suitable for cold weather.

Do not include a season only because layering could make the item wearable.

Do not select most seasons unless the item is genuinely versatile.

When uncertain, choose fewer seasons.

Examples:

short-sleeve t-shirt:
["spring", "summer"]

light polo shirt:
["spring", "summer"]

hoodie:
["spring", "fall", "winter"]

heavy winter coat:
["fall", "winter"]

shorts:
["spring", "summer"]

sandals:
["spring", "summer"]

watch:
["spring", "summer", "fall", "winter"]

description must be a concise but informative description of the clothing item.

Describe what the item visibly is and the details that are useful for future outfit recommendations.

Mention, when reasonably visible:
- exact clothing type
- sleeve or leg length
- collar or neckline
- hood if present
- pockets if clearly visible
- buttons, zipper, drawstrings, or other important construction details
- pattern or texture
- apparent material or fabric
- fit or silhouette
- overall style

Do not guess details that cannot reasonably be inferred from the image.

Do not include the color because color is stored separately.

Write the description as one natural sentence or two short sentences.

Examples:

"Bordo, uzun kollu, 'awdoawdo' desenli, kapüşonlu sweatshirt; kalın kumaşlı ve rahat kesimli."

"Bej, düz kesimli chino pantolon; orta ağırlıkta dokulu kumaş ve klasik cepli tasarım."

"Siyah spor ayakkabı; düşük bilekli, bağcıklı ve kalın tabanlı."

"Metal kadranlı analog saat; yuvarlak kasalı ve klasik tasarımlı."

Do not return color.

Do not return style.

Do not return explanation.

Do not return markdown.

Return only the JSON object.
"""

            payload = {
                "model":
                    "gemma3:4b",

                "messages": [
                    {
                        "role":
                            "user",

                        "content":
                            prompt,

                        "images": [
                            image_base64
                        ]
                    }
                ],

                "format":
                    schema,

                "stream":
                    False,

                "options": {
                    "temperature":
                        0
                }
            }

            ollama_request = (
                urllib.request.Request(
                    "http://127.0.0.1:11434/api/chat",

                    data=json.dumps(
                        payload
                    ).encode(
                        "utf-8"
                    ),

                    headers={
                        "Content-Type":
                            "application/json"
                    },

                    method="POST"
                )
            )

            with urllib.request.urlopen(
                ollama_request,
                timeout=180
            ) as response:

                response_data = json.loads(
                    response.read().decode(
                        "utf-8"
                    )
                )

            content = (
                response_data
                .get(
                    "message",
                    {}
                )
                .get(
                    "content",
                    ""
                )
            )

            if not content:
                raise ValueError(
                    "AI boş cevap döndürdü."
                )

            result = json.loads(
                content
            )

            print(
                "AI RESULT:",
                result
            )

            category = result.get(
                "category"
            )

            season = result.get(
                "season"
            )

            description = result.get(
                "description"
            )

            allowed_categories = {
                "top",
                "pants",
                "shorts",
                "outerwear",
                "footwear",
                "accessory"
            }

            allowed_seasons = {
                "spring",
                "summer",
                "fall",
                "winter"
            }

            if (
                category
                not in allowed_categories
            ):
                raise ValueError(
                    "Geçersiz kategori."
                )

            if (
                not isinstance(
                    season,
                    list
                )
                or len(season) == 0
                or len(season) > 4
                or any(
                    item
                    not in allowed_seasons
                    for item in season
                )
                or len(set(season))
                != len(season)
            ):
                raise ValueError(
                    "Geçersiz mevsim."
                )

            if (
                not isinstance(description, str)
                or not description.strip()
            ):
                raise ValueError(
                    "Geçersiz kıyafet açıklaması."
                )

            color = (
                self.get_main_color(
                    image_bytes
                )
            )

            print(
                "COLOR RESULT:",
                color
            )

            return Response(
    {
        "category": category,
        "color": color,
        "season": season,
        "description": description
    },
    status=status.HTTP_200_OK
)

        except json.JSONDecodeError as error:
            print(
                "Clothing AI JSON error:",
                error
            )

            return Response(
                {
                    "detail":
                        "AI geçerli JSON döndürmedi."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        except Exception as error:
            print(
                "Clothing AI analysis error:",
                error
            )

            return Response(
                {
                    "detail":
                        "Kıyafet AI tarafından analiz edilemedi."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )