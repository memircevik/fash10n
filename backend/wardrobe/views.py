import base64
import json
import random
import time
import urllib.request
import urllib.error

from io import BytesIO

from PIL import Image

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.utils import timezone
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

# =============================================================
# SHARED ACCESSORY TYPE DETECTION
# =============================================================
#
# Used both when validating AI-generated outfits and when
# building the safe fallback outfit, so both paths agree on
# what counts as "the same type of accessory".
#
# If the ClothingItem model later gains a real structured
# accessory_type field (recommended), this function will
# prefer that value automatically and only fall back to
# description keyword-matching for older/legacy items.
# =============================================================

ACCESSORY_TYPE_KEYWORDS = {
    "watch": [
        "watch",
        "wristwatch",
        "wrist watch",
        "timepiece",
        "smartwatch",
    ],
    "sunglasses": [
        "sunglasses",
        "sun glasses",
    ],
    "eyewear": [
        "eyeglasses",
        "eyeglass",
        "spectacles",
    ],
    "bag": [
        "bag",
        "backpack",
        "handbag",
        "crossbody",
        "shoulder bag",
        "tote",
    ],
    "belt": [
        "belt",
    ],
    "hat": [
        "hat",
        "cap",
        "beanie",
    ],
    "scarf": [
        "scarf",
    ],
    "tie": [
        "tie",
        "necktie",
    ],
    "jewelry": [
        "necklace",
        "bracelet",
        "ring",
        "earring",
        "jewelry",
        "jewellery",
    ],
}


def get_accessory_type(item):
    """
    Returns a normalized accessory type string (e.g. "watch",
    "belt") or None if it cannot be determined.

    Prefers a structured `accessory_type` field on the model if
    present (forward-compatible with a future migration).
    Falls back to keyword matching on the stored description.
    """

    structured_type = getattr(item, "accessory_type", None)

    if structured_type:
        return structured_type

    description = (item.description or "").lower()

    for accessory_type, keywords in ACCESSORY_TYPE_KEYWORDS.items():
        if any(keyword in description for keyword in keywords):
            return accessory_type

    return None


# =============================================================
# FASHION COLOR PALETTE
# =============================================================
#
# The clothing-analysis step (get_main_color) stores each item's
# color as a raw averaged hex code, e.g. "#1E2B4A". That is fine
# for rendering a swatch in the UI, but a language model reasons
# far more reliably about a semantic name like "navy" than about
# a hex string. hex_to_color_name() maps a stored hex code to the
# closest name in this curated, clothing-relevant palette, purely
# for use inside AI prompts. The stored hex itself is untouched.
# =============================================================

FASHION_COLOR_PALETTE = {
    "black": (17, 17, 17),
    "white": (255, 255, 255),
    "off-white": (245, 245, 240),
    "charcoal grey": (54, 57, 61),
    "grey": (128, 128, 128),
    "light grey": (200, 200, 200),
    "silver": (196, 199, 202),
    "navy": (23, 35, 66),
    "denim blue": (68, 100, 140),
    "blue": (37, 99, 179),
    "sky blue": (135, 191, 224),
    "teal": (25, 121, 122),
    "turquoise": (64, 179, 173),
    "forest green": (34, 84, 46),
    "green": (63, 140, 66),
    "olive": (101, 106, 55),
    "sage green": (139, 154, 122),
    "khaki": (176, 160, 116),
    "mustard yellow": (198, 160, 46),
    "yellow": (232, 210, 65),
    "gold": (191, 155, 63),
    "beige": (211, 194, 162),
    "cream": (238, 227, 200),
    "tan": (196, 164, 122),
    "camel": (176, 137, 89),
    "brown": (94, 63, 42),
    "dark brown": (59, 38, 25),
    "burgundy": (98, 24, 34),
    "red": (191, 35, 41),
    "coral": (232, 122, 105),
    "pink": (232, 165, 188),
    "hot pink": (219, 60, 122),
    "purple": (100, 60, 130),
    "lavender": (188, 170, 214),
    "orange": (222, 112, 41),
}


def hex_to_color_name(hex_code):
    """
    Returns the nearest fashion-palette color name for a stored
    hex color, using a perceptually-weighted ("redmean") distance
    rather than plain RGB Euclidean distance so the match is closer
    to how the color actually reads to the eye.

    Falls back to "unknown" for missing/malformed input rather than
    raising, since this only feeds a prompt, not a hard validation.
    """

    if not isinstance(hex_code, str):
        return "unknown"

    hex_value = hex_code.strip().lstrip("#")

    if len(hex_value) != 6:
        return "unknown"

    try:
        red = int(hex_value[0:2], 16)
        green = int(hex_value[2:4], 16)
        blue = int(hex_value[4:6], 16)
    except ValueError:
        return "unknown"

    best_name = "unknown"
    best_distance = None

    for name, (
        palette_red,
        palette_green,
        palette_blue,
    ) in FASHION_COLOR_PALETTE.items():
        mean_red = (red + palette_red) / 2

        delta_red = red - palette_red
        delta_green = green - palette_green
        delta_blue = blue - palette_blue

        distance = (
            (2 + mean_red / 256) * (delta_red**2)
            + 4 * (delta_green**2)
            + (2 + (255 - mean_red) / 256) * (delta_blue**2)
        )

        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_name = name

    return best_name


class RemoveBackgroundView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        image = request.FILES.get("image")

        if not image:
            return Response(
                {"detail": "Fotoğraf bulunamadı."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from rembg import remove, new_session

            session = new_session("u2net")

            input_data = image.read()

            output_data = remove(input_data, session=session)

            return HttpResponse(output_data, content_type="image/png")

        except Exception as error:
            print("Background removal error:", error)

            return Response(
                {"detail": "Arka plan silinemedi."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ClothingItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        clothing_items = ClothingItem.objects.filter(user=request.user, is_active=True)

        serializer = ClothingItemSerializer(clothing_items, many=True)

        return Response(serializer.data)

    def get_content_bbox(self, image):
        """
        Görseldeki gerçek kıyafet alanını bulur.

        Öncelik alpha kanalındadır.
        Background removal yapılmış PNG'lerde
        gerçek kıyafet sınırlarını tespit eder.

        Alpha kullanılamıyorsa beyaz olmayan
        pikseller üzerinden fallback yapılır.
        """

        image = image.convert("RGBA")

        alpha = image.getchannel("A")

        bbox = alpha.getbbox()

        if bbox is not None:
            return bbox

        rgb = image.convert("RGB")

        pixels = rgb.load()

        width, height = rgb.size

        min_x = width
        min_y = height

        max_x = -1
        max_y = -1

        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]

                if r < 245 or g < 245 or b < 245:
                    min_x = min(min_x, x)

                    min_y = min(min_y, y)

                    max_x = max(max_x, x)

                    max_y = max(max_y, y)

        if max_x == -1:
            return None

        return (min_x, min_y, max_x + 1, max_y + 1)

    def get_category_slot(self, category):
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
            },
        )

    def prepare_clothing_image(self, image_file, category):
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

        image_file.seek(0)

        image = Image.open(image_file).convert("RGBA")

        bbox = self.get_content_bbox(image)

        if bbox is None:
            raise ValueError("Görselde kıyafet alanı bulunamadı.")

        left, top, right, bottom = bbox

        cropped = image.crop((left, top, right, bottom))

        content_width = cropped.width
        content_height = cropped.height

        if content_width <= 0 or content_height <= 0:
            raise ValueError("Kıyafet görselinin boyutu geçersiz.")

        slot = self.get_category_slot(category)

        slot_width = slot["width"]
        slot_height = slot["height"]

        width_scale = slot_width / content_width

        height_scale = slot_height / content_height

        scale = min(width_scale, height_scale)

        if scale <= 0:
            raise ValueError("Geçersiz ölçek hesaplandı.")

        new_width = max(1, round(content_width * scale))

        new_height = max(1, round(content_height * scale))

        resized = cropped.resize((new_width, new_height), Image.Resampling.LANCZOS)

        target_size = 800

        canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))

        x = (target_size - new_width) // 2

        y = (target_size - new_height) // 2

        canvas.alpha_composite(resized, (x, y))

        output = BytesIO()

        canvas.save(output, format="PNG", optimize=True)

        output.seek(0)

        original_name = getattr(image_file, "name", "clothing.png") or "clothing.png"

        base_name = original_name.rsplit(".", 1)[0]

        prepared_name = base_name + "_prepared.png"

        print(
            "IMAGE SLOT:",
            {
                "category": category,
                "original_width": content_width,
                "original_height": content_height,
                "slot_width": slot_width,
                "slot_height": slot_height,
                "new_width": new_width,
                "new_height": new_height,
                "scale": round(scale, 4),
            },
        )

        return ContentFile(output.getvalue(), name=prepared_name)

    def post(self, request):
        serializer = ClothingItemSerializer(data=request.data)

        if not serializer.is_valid():
            print("CLOTHING SERIALIZER ERROR:", serializer.errors)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        image = request.FILES.get("image")

        category = request.data.get("category")

        if not image:
            return Response(
                {"detail": "Fotoğraf bulunamadı."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Footwear ve accessory eski sistemdeki gibi
            # doğrudan kaydedilir.
            if category in {
                "footwear",
                "accessory",
            }:
                serializer.save(user=request.user, image=image)

            # Top, pants, shorts ve outerwear
            # yeni sabit UI slot sisteminden geçer.
            else:
                prepared_image = self.prepare_clothing_image(image, category)

                serializer.save(user=request.user, image=prepared_image)

            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as error:
            print("IMAGE PREPARATION ERROR:", error)

            return Response(
                {"detail": "Kıyafet görseli hazırlanamadı."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def delete(self, request, pk):
        try:
            clothing_item = ClothingItem.objects.get(id=pk, user=request.user)

        except ClothingItem.DoesNotExist:
            return Response(
                {"detail": "Kıyafet bulunamadı."}, status=status.HTTP_404_NOT_FOUND
            )

        clothing_item.is_active = False

        clothing_item.save(update_fields=["is_active"])

        return Response(status=status.HTTP_204_NO_CONTENT)


class OutfitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        outfits = (
            Outfit.objects.filter(user=request.user)
            .prefetch_related("items")
            .order_by("-created_at")
        )

        serializer = OutfitSerializer(outfits, many=True)

        return Response(serializer.data)

    def post(self, request):
        name = request.data.get("name")

        item_ids = request.data.get("items", [])

        if not name:
            return Response(
                {"detail": "Kombin adı gerekli."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {"detail": "En az bir kıyafet seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids, user=request.user, is_active=True
        )

        if clothing_items.count() != len(item_ids):
            return Response(
                {"detail": "Geçersiz kıyafet seçimi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        categories = set(clothing_items.values_list("category", flat=True))

        if "top" not in categories:
            return Response(
                {"detail": "Üst giyim seçmelisin."}, status=status.HTTP_400_BAD_REQUEST
            )

        has_bottom = "pants" in categories or "shorts" in categories

        if not has_bottom:
            return Response(
                {"detail": "Alt giyim seçmelisin."}, status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {"detail": "Ayakkabı seçmelisin."}, status=status.HTTP_400_BAD_REQUEST
            )

        if "pants" in categories and "shorts" in categories:
            return Response(
                {"detail": "Aynı kombin içinde hem pantolon hem şort kullanamazsın."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        outfit = Outfit.objects.create(user=request.user, name=name)

        outfit.items.set(clothing_items)

        serializer = OutfitSerializer(outfit)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def put(self, request, pk):
        try:
            outfit = Outfit.objects.get(id=pk, user=request.user)

        except Outfit.DoesNotExist:
            return Response(
                {"detail": "Kombin bulunamadı."}, status=status.HTTP_404_NOT_FOUND
            )

        name = request.data.get("name")

        item_ids = request.data.get("items", [])

        if not name:
            return Response(
                {"detail": "Kombin adı gerekli."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {"detail": "En az bir kıyafet seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids, user=request.user, is_active=True
        )

        if clothing_items.count() != len(item_ids):
            return Response(
                {"detail": "Geçersiz kıyafet seçimi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        categories = set(clothing_items.values_list("category", flat=True))

        if "top" not in categories:
            return Response(
                {"detail": "Üst giyim seçmelisin."}, status=status.HTTP_400_BAD_REQUEST
            )

        has_bottom = "pants" in categories or "shorts" in categories

        if not has_bottom:
            return Response(
                {"detail": "Alt giyim seçmelisin."}, status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {"detail": "Ayakkabı seçmelisin."}, status=status.HTTP_400_BAD_REQUEST
            )

        if "pants" in categories and "shorts" in categories:
            return Response(
                {"detail": "Aynı kombin içinde hem pantolon hem şort kullanamazsın."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        outfit.name = name

        outfit.save(update_fields=["name"])

        outfit.items.set(clothing_items)

        serializer = OutfitSerializer(outfit)

        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        try:
            outfit = Outfit.objects.get(id=pk, user=request.user)

        except Outfit.DoesNotExist:
            return Response(
                {"detail": "Kombin bulunamadı."}, status=status.HTTP_404_NOT_FOUND
            )

        outfit.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


def _cluster_item_colors(pixels, k=2, iterations=6, seed=42):
    """
    Very lightweight k-means over a list of (r, g, b) pixel tuples.
    Pure Python (no numpy/sklearn dependency) — fine at the pixel
    sample sizes used here (a few thousand points, k=2).

    Returns clusters sorted by size (largest first), each as
    {"rgb": (r, g, b), "share": fraction_of_pixels}.
    """

    if not pixels:
        return []

    rng = random.Random(seed)

    # Farthest-point initialization: start from a random pixel, then
    # repeatedly pick the pixel farthest from the centroids chosen so
    # far. This avoids the classic k-means failure mode where random
    # init picks two very similar starting colors and never discovers
    # a real second cluster (e.g. two near-black starting points on a
    # mostly-black item with a small red accent).
    centroids = [pixels[rng.randrange(len(pixels))]]

    candidate_pool = pixels if len(pixels) <= 500 else rng.sample(pixels, 500)

    for _ in range(k - 1):
        best_point = None
        best_distance = -1

        for point in candidate_pool:
            distance = min(
                (point[0] - c[0]) ** 2 + (point[1] - c[1]) ** 2 + (point[2] - c[2]) ** 2
                for c in centroids
            )

            if distance > best_distance:
                best_distance = distance
                best_point = point

        if best_point is not None:
            centroids.append(best_point)

    clusters = [[] for _ in centroids]

    for _ in range(iterations):
        clusters = [[] for _ in centroids]

        for point in pixels:
            best_index = 0
            best_distance = None

            for index, centroid in enumerate(centroids):
                distance = (
                    (point[0] - centroid[0]) ** 2
                    + (point[1] - centroid[1]) ** 2
                    + (point[2] - centroid[2]) ** 2
                )

                if best_distance is None or distance < best_distance:
                    best_distance = distance
                    best_index = index

            clusters[best_index].append(point)

        new_centroids = []

        for index, cluster in enumerate(clusters):
            if cluster:
                red = sum(point[0] for point in cluster) / len(cluster)
                green = sum(point[1] for point in cluster) / len(cluster)
                blue = sum(point[2] for point in cluster) / len(cluster)
                new_centroids.append((red, green, blue))
            else:
                new_centroids.append(centroids[index])

        centroids = new_centroids

    total_pixels = len(pixels)

    results = [
        {
            "rgb": centroids[index],
            "share": len(cluster) / total_pixels,
        }
        for index, cluster in enumerate(clusters)
        if cluster
    ]

    results.sort(key=lambda entry: entry["share"], reverse=True)

    return results


class AnalyzeClothingView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_item_colors(self, image_bytes):
        """
        Returns (primary_hex, secondary_hex_or_None).

        The previous implementation averaged every non-transparent,
        non-near-white pixel into a single mean color. That works for
        solid-color items but silently destroys information on
        multi-color ones: a mostly-black sneaker with red stripes
        averages down to a muddy dark tone that gets classified as
        "black", so the outfit-styling AI never even learns the red
        exists and can't avoid clashing it against the rest of the
        outfit.

        Instead, cluster the pixels into up to 2 dominant colors.
        primary_hex is always returned (same as before). A
        secondary_hex is only returned when the second cluster is a
        genuinely significant share of the item (not noise/shadow/
        anti-aliasing) AND perceptually distinct enough from the
        primary color to matter for outfit color-matching.
        """

        image = Image.open(BytesIO(image_bytes)).convert("RGBA")

        pixels = []

        for r, g, b, a in image.getdata():
            if a < 30:
                continue

            brightness = (r + g + b) / 3

            if brightness > 245:
                continue

            pixels.append((r, g, b))

        if not pixels:
            return "#808080", None

        # Clustering is O(iterations * n * k); keep the sample smaller
        # than the old plain-average sample_limit since this is more
        # expensive per pixel, while still being a representative draw.
        sample_limit = 4000

        if len(pixels) > sample_limit:
            step = len(pixels) // sample_limit

            pixels = pixels[::step]

        clusters = _cluster_item_colors(pixels, k=2)

        if not clusters:
            return "#808080", None

        def to_hex(rgb):
            red, green, blue = rgb

            return "#{:02X}{:02X}{:02X}".format(
                round(red),
                round(green),
                round(blue),
            )

        primary_hex = to_hex(clusters[0]["rgb"])

        secondary_hex = None

        if len(clusters) > 1:
            second_cluster = clusters[1]

            # Ignore small/noisy clusters (stitching shadows, JPEG
            # artifacts, background-removal edge fringing).
            significant_share = second_cluster["share"] >= 0.12

            if significant_share:
                primary_red, primary_green, primary_blue = clusters[0]["rgb"]

                second_red, second_green, second_blue = second_cluster["rgb"]

                # Squared perceptual-ish distance. ~4000 corresponds to
                # roughly a 45-55 per-channel average difference, i.e.
                # "different color", not just a lighting/shading
                # variation of the same color.
                distance = (
                    (primary_red - second_red) ** 2
                    + (primary_green - second_green) ** 2
                    + (primary_blue - second_blue) ** 2
                )

                if distance >= 4000:
                    secondary_hex = to_hex(second_cluster["rgb"])

        return primary_hex, secondary_hex

    def post(self, request):
        image = request.FILES.get("image")

        if not image:
            return Response(
                {"detail": "Fotoğraf bulunamadı."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            image_bytes = image.read()

            image_base64 = base64.b64encode(image_bytes).decode("utf-8")

            accessory_type_enum = list(ACCESSORY_TYPE_KEYWORDS.keys()) + ["other", None]

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
                            "accessory",
                        ],
                    },
                    "season": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["spring", "summer", "fall", "winter"],
                        },
                        "minItems": 1,
                        "maxItems": 4,
                        "uniqueItems": True,
                    },
                    "description": {"type": "string"},
                    # Only meaningful when category == "accessory".
                    # Structured type used later to prevent picking
                    # two accessories of the same kind (two watches,
                    # two belts, etc.) in the same outfit.
                    "accessory_type": {
                        "type": ["string", "null"],
                        "enum": accessory_type_enum,
                    },
                },
                "required": ["category", "season", "description", "accessory_type"],
            }

            prompt = """
Analyze this clothing item from the image.

Return ONLY JSON.

The response must contain:

1. category
2. season
3. description
4. accessory_type

CATEGORY:

category must be exactly one of:

top
pants
shorts
outerwear
footwear
accessory

pants:
Long pants such as jeans, chinos, trousers, cargo pants, joggers, etc.

shorts:
Short bottoms that end above the knees or around the upper/mid thigh and
leave a significant portion of the legs exposed.

IMPORTANT:
If the image clearly shows long pants, return "pants".
If the image clearly shows shorts, return "shorts".
Never return "bottom".

ACCESSORY_TYPE:

If category is "accessory", classify it into exactly one of:

watch
sunglasses
eyewear
bag
belt
hat
scarf
tie
jewelry
other

Choose "other" only if none of the above genuinely fit.

If category is NOT "accessory", accessory_type must be null.

DESCRIPTION:

The description is NOT a user-facing caption.

It is structured visual information that will later be given to another AI
to create outfit recommendations.

Write a concise but information-rich description of the item.

Describe details that are visibly present and useful for outfit styling.

When clearly visible, include:

- specific garment type
- cut or silhouette
- fit
- sleeve length or leg length
- neckline or collar
- hood
- pockets
- zipper, buttons, drawstrings, or other construction details
- material or fabric
- texture
- pattern or print
- logo or graphic when visually important
- important design details
- general style character
- proportions or distinctive shape

For bottoms, mention the specific type when visually clear:
jeans, chinos, cargo pants, trousers, dress pants, joggers, denim shorts,
cargo shorts, athletic shorts, etc.

For tops, distinguish specific types when visually clear:
t-shirt, polo, shirt, hoodie, crewneck sweatshirt, sweater, cardigan,
tank top, etc.

For footwear, mention useful characteristics such as:
sneaker, boot, loafer, sandal, low-top, high-top, chunky sole, slim sole,
lace-up, slip-on, etc.

For accessories, identify the specific type when visually clear:
watch, belt, bag, sunglasses, hat, scarf, jewelry, etc.

Do not guess details that cannot reasonably be inferred from the image.

Do not invent brand, material, fit, pattern, or construction details unless
they are clearly visible or strongly supported by the image.

Do not include the main color in the description.
Color is stored separately.

Keep the description to one concise sentence or two short sentences.

The description should help another AI understand what this item is,
how it looks, how it fits, and what kind of styling it supports.

SEASON:

Return every season in which the item is genuinely and typically appropriate.

Possible seasons:

spring
summer
fall
winter

Use these guidelines:

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

QUALITY RULE:

Prefer accurate and specific descriptions over long descriptions.

Do not return:
- color
- price
- brand unless clearly visible and relevant
- subjective opinions
- recommendations
- outfit combinations
- explanations outside the JSON

Return ONLY the JSON object.
"""

            payload = {
                "model": "gemma3:4b",
                "messages": [
                    {"role": "user", "content": prompt, "images": [image_base64]}
                ],
                "format": schema,
                "stream": False,
                "options": {"temperature": 0},
            }

            ollama_request = urllib.request.Request(
                "http://127.0.0.1:11434/api/chat",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            with urllib.request.urlopen(ollama_request, timeout=180) as response:

                response_data = json.loads(response.read().decode("utf-8"))

            content = response_data.get("message", {}).get("content", "")

            if not content:
                raise ValueError("AI boş cevap döndürdü.")

            result = json.loads(content)

            print("AI RESULT:", result)

            category = result.get("category")

            season = result.get("season")

            description = result.get("description")

            accessory_type = result.get("accessory_type")

            allowed_categories = {
                "top",
                "pants",
                "shorts",
                "outerwear",
                "footwear",
                "accessory",
            }

            allowed_seasons = {"spring", "summer", "fall", "winter"}

            allowed_accessory_types = set(ACCESSORY_TYPE_KEYWORDS.keys()) | {"other"}

            if category not in allowed_categories:
                raise ValueError("Geçersiz kategori.")

            if (
                not isinstance(season, list)
                or len(season) == 0
                or len(season) > 4
                or any(item not in allowed_seasons for item in season)
                or len(set(season)) != len(season)
            ):
                raise ValueError("Geçersiz mevsim.")

            if not isinstance(description, str) or not description.strip():
                raise ValueError("Geçersiz kıyafet açıklaması.")

            if category == "accessory":
                if accessory_type not in allowed_accessory_types:
                    raise ValueError("Geçersiz aksesuar tipi.")
            else:
                accessory_type = None

            color, secondary_color = self.get_item_colors(image_bytes)

            print("COLOR RESULT:", color, "SECONDARY:", secondary_color)

            return Response(
                {
                    "category": category,
                    "color": color,
                    "secondary_color": secondary_color or "",
                    "season": season,
                    "description": description,
                    "accessory_type": accessory_type,
                },
                status=status.HTTP_200_OK,
            )

        except json.JSONDecodeError as error:
            print("Clothing AI JSON error:", error)

            return Response(
                {"detail": "AI geçerli JSON döndürmedi."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        except Exception as error:
            print("Clothing AI analysis error:", error)

            return Response(
                {"detail": "Kıyafet AI tarafından analiz edilemedi."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class TodayOutfitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    MAX_AI_ATTEMPTS = 5

    def post(self, request):
        try:
            previous_outfit = request.data.get("previous_outfit")
            recent_outfits_raw = request.data.get("recent_outfits")

            latitude = request.data.get("latitude")
            longitude = request.data.get("longitude")

            if previous_outfit is not None and not isinstance(previous_outfit, dict):
                previous_outfit = None

            # =========================================================
            # RECENT OUTFIT HISTORY
            # =========================================================

            # The frontend sends every outfit generated during the current
            # refresh cycle (oldest first). Unlike the old implementation,
            # we do NOT trim this list to two entries: the purpose of this
            # history is to know which clothing items have already been
            # consumed in the current cycle.

            recent_outfits = []

            if isinstance(recent_outfits_raw, list):
                recent_outfits = [
                    entry for entry in recent_outfits_raw if isinstance(entry, dict)
                ]

            if not recent_outfits and previous_outfit:
                recent_outfits = [previous_outfit]

            # The most recent outfit is used for the structural refresh
            # validation below.
            previous_outfit = recent_outfits[-1] if recent_outfits else None

            # =========================================================
            # LOCATION VALIDATION
            # =========================================================

            # =========================================================
            # WEATHER - DAILY CACHE
            # =========================================================
            #
            # Weather is fetched once per user per local calendar day.
            # Every refresh on the same day reuses the same snapshot so
            # the weather filter stays stable during the outfit cycle.
            #
            # A new key is used automatically on the next calendar day.
            # =========================================================

            today_key = timezone.localdate().isoformat()

            weather_cache_key = f"today-weather:{request.user.id}:{today_key}"

            cached_weather = cache.get(weather_cache_key)

            if cached_weather:
                current_weather_for_ai = cached_weather

                print(
                    "WEATHER CACHE HIT:",
                    weather_cache_key,
                )

            else:
                weather_url = (
                    "https://api.open-meteo.com/v1/forecast"
                    f"?latitude={latitude}"
                    f"&longitude={longitude}"
                    "&current="
                    "temperature_2m,"
                    "apparent_temperature,"
                    "precipitation,"
                    "rain,"
                    "showers,"
                    "weather_code,"
                    "wind_speed_10m"
                    "&hourly=precipitation_probability"
                    "&timezone=auto"
                    "&forecast_days=1"
                )

                weather_request = urllib.request.Request(
                    weather_url,
                    method="GET",
                )

                with urllib.request.urlopen(
                    weather_request,
                    timeout=20,
                ) as weather_response:
                    weather_data = json.loads(weather_response.read().decode("utf-8"))

                current_weather = weather_data.get(
                    "current",
                    {},
                )

                hourly_weather = weather_data.get(
                    "hourly",
                    {},
                )

                precipitation_probability = hourly_weather.get(
                    "precipitation_probability",
                    [],
                )

                current_precipitation_probability = None

                if precipitation_probability:
                    current_precipitation_probability = precipitation_probability[0]

                weather_code = current_weather.get("weather_code")

                weather_conditions = {
                    0: "Clear sky",
                    1: "Mainly clear",
                    2: "Partly cloudy",
                    3: "Overcast",
                    45: "Fog",
                    48: "Depositing rime fog",
                    51: "Light drizzle",
                    53: "Moderate drizzle",
                    55: "Dense drizzle",
                    56: "Light freezing drizzle",
                    57: "Dense freezing drizzle",
                    61: "Slight rain",
                    63: "Moderate rain",
                    65: "Heavy rain",
                    66: "Light freezing rain",
                    67: "Heavy freezing rain",
                    71: "Slight snow",
                    73: "Moderate snow",
                    75: "Heavy snow",
                    77: "Snow grains",
                    80: "Slight rain showers",
                    81: "Moderate rain showers",
                    82: "Violent rain showers",
                    85: "Slight snow showers",
                    86: "Heavy snow showers",
                    95: "Thunderstorm",
                    96: "Thunderstorm with slight hail",
                    99: "Thunderstorm with heavy hail",
                }

                weather_condition = weather_conditions.get(
                    weather_code,
                    "Unknown",
                )

                current_weather_for_ai = {
                    "temperature_c": current_weather.get("temperature_2m"),
                    "feels_like_c": current_weather.get("apparent_temperature"),
                    "precipitation_mm": current_weather.get("precipitation"),
                    "rain_mm": current_weather.get("rain"),
                    "showers_mm": current_weather.get("showers"),
                    "weather_code": weather_code,
                    "condition": weather_condition,
                    "wind_speed_kmh": current_weather.get("wind_speed_10m"),
                    "precipitation_probability_percent": current_precipitation_probability,
                }

                cache.set(
                    weather_cache_key,
                    current_weather_for_ai,
                    timeout=60 * 60 * 24,
                )

                print(
                    "WEATHER CACHE MISS / SAVED:",
                    weather_cache_key,
                )

            print(
                "WEATHER DATA:",
                current_weather_for_ai,
            )

            # =========================================================
            # ACTIVE WARDROBE
            # =========================================================

            clothing_items = ClothingItem.objects.filter(
                user=request.user,
                is_active=True,
            )

            if not clothing_items.exists():
                return Response(
                    {"detail": "Gardırobunda yeterli kıyafet bulunmuyor."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # =========================================================
            # CATEGORY-SPECIFIC WARDROBE DATA
            # =========================================================

            tops = []
            bottoms = []
            outerwear = []
            footwear = []
            accessories = []

            for item in clothing_items:
                season = item.season

                if isinstance(season, str):
                    try:
                        parsed_season = json.loads(season)

                        if isinstance(parsed_season, list):
                            season = parsed_season
                        else:
                            season = [season]

                    except json.JSONDecodeError:
                        season = [season]

                item_data = {
                    "id": item.id,
                    "season": season,
                    "color_name": hex_to_color_name(item.color),
                    "description": item.description or "",
                }

                if item.secondary_color:
                    item_data["accent_color_name"] = hex_to_color_name(
                        item.secondary_color
                    )

                if item.category == "top":
                    tops.append(item_data)

                elif item.category in {
                    "pants",
                    "shorts",
                }:
                    item_data["type"] = item.category
                    bottoms.append(item_data)

                elif item.category == "outerwear":
                    outerwear.append(item_data)

                elif item.category == "footwear":
                    footwear.append(item_data)

                elif item.category == "accessory":
                    item_data["accessory_type"] = get_accessory_type(item)
                    accessories.append(item_data)

            # =========================================================
            # BASIC WARDROBE VALIDATION
            # =========================================================

            if not tops:
                return Response(
                    {"detail": "Gardırobunda üst giyim bulunmuyor."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not bottoms:
                return Response(
                    {"detail": "Gardırobunda alt giyim bulunmuyor."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not footwear:
                return Response(
                    {"detail": "Gardırobunda ayakkabı bulunmuyor."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # =========================================================
            # PREVIOUS OUTFIT
            # =========================================================

            previous_outfit_text = (
                json.dumps(
                    previous_outfit,
                    ensure_ascii=False,
                )
                if previous_outfit
                else "None"
            )

            # =========================================================
            # EXPLICIT CATEGORY ID LISTS
            # =========================================================

            top_ids = [item["id"] for item in tops]

            bottom_ids = [item["id"] for item in bottoms]

            outerwear_ids = [item["id"] for item in outerwear]

            footwear_ids = [item["id"] for item in footwear]

            accessory_ids = [item["id"] for item in accessories]

            # =========================================================
            # WEATHER FILTER + CYCLICAL CLOTHING CONSUMPTION
            # =========================================================

            def normalize_season_list(value):
                if isinstance(value, list):
                    return [
                        season
                        for season in value
                        if season
                        in {
                            "spring",
                            "summer",
                            "fall",
                            "winter",
                        }
                    ]

                return []

            temperature = current_weather_for_ai.get("temperature_c")

            feels_like = current_weather_for_ai.get("feels_like_c")

            if temperature is None:
                temperature = feels_like

            if feels_like is None:
                feels_like = temperature

            effective_temperature = min(
                temperature,
                feels_like,
            )

            def is_weather_compatible(item, category):
                seasons = set(normalize_season_list(item.get("season", [])))

                description = (item.get("description", "") or "").lower()

                item_type = item.get("type")

                heavy_top_words = {
                    "sweatshirt",
                    "hoodie",
                    "heavy sweater",
                    "thick sweater",
                    "wool sweater",
                    "fleece",
                    "fleece-lined",
                    "thick knit",
                    "chunky knit",
                    "puffer",
                    "down jacket",
                    "thermal",
                    "heavyweight",
                    "heavy-duty",
                }

                heavy_footwear_words = {
                    "winter boot",
                    "snow boot",
                    "insulated",
                    "fur-lined",
                    "heavy boot",
                    "winter footwear",
                    "timberland",
                }

                # -----------------------------------------------------
                # HOT WEATHER: 27C+
                # -----------------------------------------------------
                if effective_temperature >= 27:
                    if category == "top":
                        if seasons and not (
                            seasons
                            & {
                                "spring",
                                "summer",
                            }
                        ):
                            return False

                        if any(word in description for word in heavy_top_words):
                            return False

                    elif category == "bottom":
                        if item_type == "shorts":
                            return True

                        if seasons and not (
                            seasons
                            & {
                                "spring",
                                "summer",
                            }
                        ):
                            return False

                    elif category == "outerwear":
                        return False

                    elif category == "footwear":
                        if any(word in description for word in heavy_footwear_words):
                            return False

                        if seasons and not (
                            seasons
                            & {
                                "spring",
                                "summer",
                                "fall",
                            }
                        ):
                            return False

                    return True

                # -----------------------------------------------------
                # WARM WEATHER: 23C-27C
                # -----------------------------------------------------
                if effective_temperature >= 23:
                    if category == "top":
                        if seasons and not (
                            seasons
                            & {
                                "spring",
                                "summer",
                                "fall",
                            }
                        ):
                            return False

                        if any(word in description for word in heavy_top_words):
                            return False

                    elif category == "bottom":
                        if item_type == "shorts":
                            return True

                        if seasons and not (
                            seasons
                            & {
                                "spring",
                                "summer",
                                "fall",
                            }
                        ):
                            return False

                    elif category == "outerwear":
                        return False

                    elif category == "footwear":
                        if any(word in description for word in heavy_footwear_words):
                            return False

                        if seasons and not (
                            seasons
                            & {
                                "spring",
                                "summer",
                                "fall",
                            }
                        ):
                            return False

                    return True

                # -----------------------------------------------------
                # MILD WEATHER: 17C-23C
                # -----------------------------------------------------
                if effective_temperature >= 17:
                    if category == "top":
                        if seasons and seasons == {"winter"}:
                            return False

                        if any(word in description for word in heavy_top_words):
                            return False

                    elif category == "bottom":
                        if seasons and seasons == {"winter"}:
                            return False

                    elif category == "outerwear":
                        if seasons and seasons == {"winter"}:
                            return False

                    elif category == "footwear":
                        if seasons and seasons == {"winter"}:
                            return False

                        if any(word in description for word in heavy_footwear_words):
                            return False

                    return True

                # -----------------------------------------------------
                # COOL WEATHER: 10C-17C
                # -----------------------------------------------------
                if effective_temperature >= 10:
                    if category == "top":
                        if seasons and seasons == {"summer"}:
                            return False

                    elif category == "bottom":
                        if item_type == "shorts" and seasons and seasons == {"summer"}:
                            return False

                    return True

                # -----------------------------------------------------
                # COLD WEATHER: BELOW 10C
                # -----------------------------------------------------
                if category in {
                    "top",
                    "bottom",
                    "outerwear",
                    "footwear",
                }:
                    if seasons and not (
                        seasons
                        & {
                            "fall",
                            "winter",
                        }
                    ):
                        return False

                return True

            def weather_filter(items, category):
                compatible = [
                    item
                    for item in items
                    if is_weather_compatible(
                        item,
                        category,
                    )
                ]

                # Outerwear is optional. When is_weather_compatible()
                # returns False for every outerwear item (e.g. it's too
                # warm for any of them), an empty result is the CORRECT,
                # intentional outcome — not a filtering failure. Falling
                # back to the unfiltered list here (like we do for the
                # required categories below) would silently undo that
                # exclusion and let a jacket get suggested at 24°C.
                if category == "outerwear":
                    return compatible

                # For top/bottom/footwear at least one item is required,
                # so if sparse season metadata filtered out everything,
                # fall back to the unfiltered list rather than breaking
                # the whole outfit.
                return compatible or items

            # ---------------------------------------------------------
            # FIRST: WEATHER FILTER
            # ---------------------------------------------------------

            weather_tops = weather_filter(
                tops,
                "top",
            )

            weather_bottoms = weather_filter(
                bottoms,
                "bottom",
            )

            weather_outerwear = weather_filter(
                outerwear,
                "outerwear",
            )

            weather_footwear = weather_filter(
                footwear,
                "footwear",
            )

            weather_accessories = list(accessories)

            # ---------------------------------------------------------
            # SECOND: CONSUME USED CLOTHING FROM THE WEATHER-FILTERED
            # POOL
            # ---------------------------------------------------------

            used_top_ids = set()
            used_bottom_ids = set()
            used_outerwear_ids = set()
            used_footwear_ids = set()
            used_accessory_ids = set()

            for outfit in recent_outfits:
                if outfit.get("top_id") is not None:
                    used_top_ids.add(outfit.get("top_id"))

                if outfit.get("bottom_id") is not None:
                    used_bottom_ids.add(outfit.get("bottom_id"))

                if outfit.get("outerwear_id") is not None:
                    used_outerwear_ids.add(outfit.get("outerwear_id"))

                for accessory_id in (
                    outfit.get(
                        "accessory_ids",
                        [],
                    )
                    or []
                ):
                    used_accessory_ids.add(accessory_id)

                if outfit.get("footwear_id") is not None:
                    used_footwear_ids.add(outfit.get("footwear_id"))

            def remove_used(items, used_ids):
                return [item for item in items if item["id"] not in used_ids]

            available_tops = remove_used(
                weather_tops,
                used_top_ids,
            )

            available_bottoms = remove_used(
                weather_bottoms,
                used_bottom_ids,
            )

            available_outerwear = remove_used(
                weather_outerwear,
                used_outerwear_ids,
            )

            available_footwear = remove_used(
                weather_footwear,
                used_footwear_ids,
            )

            available_accessories = remove_used(
                weather_accessories,
                used_accessory_ids,
            )

            # ---------------------------------------------------------
            # THIRD: IF REQUIRED CATEGORY IS EXHAUSTED, RESET THE CYCLE
            # ---------------------------------------------------------

            cycle_reset = False

            required_pool_empty = (
                not available_tops or not available_bottoms or not available_footwear
            )

            if required_pool_empty:
                cycle_reset = bool(recent_outfits)

                available_tops = list(weather_tops)

                available_bottoms = list(weather_bottoms)

                available_footwear = list(weather_footwear)

                available_outerwear = list(weather_outerwear)

                available_accessories = list(weather_accessories)

                used_top_ids = set()
                used_bottom_ids = set()
                used_footwear_ids = set()
                used_outerwear_ids = set()
                used_accessory_ids = set()

            print(
                "RECENT OUTFITS:",
                recent_outfits,
            )

            print(
                "WEATHER FILTERED TOP IDS:",
                [item["id"] for item in weather_tops],
            )

            print(
                "WEATHER FILTERED BOTTOM IDS:",
                [item["id"] for item in weather_bottoms],
            )

            print(
                "WEATHER FILTERED FOOTWEAR IDS:",
                [item["id"] for item in weather_footwear],
            )

            print(
                "AVAILABLE TOP IDS FOR AI:",
                [item["id"] for item in available_tops],
            )

            print(
                "AVAILABLE BOTTOM IDS FOR AI:",
                [item["id"] for item in available_bottoms],
            )

            print(
                "AVAILABLE FOOTWEAR IDS FOR AI:",
                [item["id"] for item in available_footwear],
            )

            print(
                "CYCLE RESET:",
                cycle_reset,
            )

            tops_for_ai = available_tops
            bottoms_for_ai = available_bottoms
            outerwear_for_ai = available_outerwear
            footwear_for_ai = available_footwear
            accessories_for_ai = available_accessories

            # =========================================================
            # EXPLICIT CATEGORY ID LISTS
            # =========================================================

            top_ids_for_ai = [item["id"] for item in tops_for_ai]

            bottom_ids_for_ai = [item["id"] for item in bottoms_for_ai]

            outerwear_ids_for_ai = [item["id"] for item in outerwear_for_ai]

            footwear_ids_for_ai = [item["id"] for item in footwear_for_ai]

            accessory_ids = [item["id"] for item in accessories_for_ai]

            # =========================================================
            # AI RESPONSE SCHEMA
            # =========================================================

            # =========================================================
            #
            # Every ID field is constrained with an explicit enum of
            # the actual wardrobe IDs for that category (minus the
            # forced-diversity exclusions above). This makes it
            # structurally impossible for the model to return e.g. a
            # pants ID inside accessory_ids, instead of relying purely
            # on prompt instructions + after-the-fact validation.
            # =========================================================

            top_id_schema = {"type": "integer", "enum": top_ids_for_ai}

            bottom_id_schema = {"type": "integer", "enum": bottom_ids_for_ai}

            footwear_id_schema = {"type": "integer", "enum": footwear_ids_for_ai}

            if outerwear_ids_for_ai:
                outerwear_id_schema = {
                    "type": ["integer", "null"],
                    "enum": outerwear_ids_for_ai + [None],
                }
            else:
                # No outerwear in the wardrobe at all: only null is valid.
                outerwear_id_schema = {
                    "type": "null",
                    "enum": [None],
                }

            if accessory_ids:
                accessory_ids_schema = {
                    "type": "array",
                    "items": {"type": "integer", "enum": accessory_ids},
                    "uniqueItems": True,
                }
            else:
                # No accessories in the wardrobe: force an empty array.
                accessory_ids_schema = {
                    "type": "array",
                    "maxItems": 0,
                }

            schema = {
                "type": "object",
                "properties": {
                    "top_id": top_id_schema,
                    "bottom_id": bottom_id_schema,
                    "footwear_id": footwear_id_schema,
                    "outerwear_id": outerwear_id_schema,
                    "accessory_ids": accessory_ids_schema,
                    "reason": {
                        "type": "string",
                    },
                },
                "required": [
                    "top_id",
                    "bottom_id",
                    "footwear_id",
                    "outerwear_id",
                    "accessory_ids",
                    "reason",
                ],
            }

            # =========================================================
            # AI ATTEMPTS
            # =========================================================
            #
            # An overall wall-clock budget across ALL attempts combined
            # (not just a per-attempt timeout) so a run of slow/rejected
            # attempts can't add up to many minutes before falling back.

            OVERALL_TIME_BUDGET_SECONDS = 75

            PER_ATTEMPT_TIMEOUT_SECONDS = 40

            request_started_at = time.monotonic()

            last_validation_error = None

            # =========================================================
            # STRUCTURAL REPEAT-PREVENTION (ACROSS RETRIES)
            # =========================================================
            #
            # If an attempt is rejected specifically because it repeats
            # a top/bottom/footwear combination already used earlier in
            # this cycle (see the "FULL-CYCLE MAJOR-STRUCTURE REPEAT
            # CHECK" below), prose retry feedback alone is not reliable
            # enough to make a small local model change its answer — it
            # has been observed to return the exact same combination on
            # every subsequent attempt, burning the whole attempt/time
            # budget before falling back.
            #
            # To guarantee forward progress, once that specific failure
            # happens we structurally remove one field of the rejected
            # combination (top first, then bottom, then footwear — only
            # ever removing an ID when the category still has another
            # option left) from the next attempt's schema/enum. This
            # makes it impossible for the model to reproduce the exact
            # same rejected combination again, instead of just asking it
            # nicely not to.

            blocked_top_ids_this_request = set()
            blocked_bottom_ids_this_request = set()
            blocked_footwear_ids_this_request = set()

            for attempt in range(self.MAX_AI_ATTEMPTS):
                elapsed_seconds = time.monotonic() - request_started_at

                remaining_budget_seconds = OVERALL_TIME_BUDGET_SECONDS - elapsed_seconds

                if remaining_budget_seconds <= 5:
                    print(
                        "TODAY OUTFIT: time budget exhausted after "
                        f"{elapsed_seconds:.1f}s / {attempt} attempt(s), "
                        "falling back.",
                    )
                    break

                attempt_timeout_seconds = min(
                    PER_ATTEMPT_TIMEOUT_SECONDS,
                    remaining_budget_seconds,
                )

                attempt_started_at = time.monotonic()

                print(
                    f"TODAY OUTFIT ATTEMPT {attempt + 1}/{self.MAX_AI_ATTEMPTS} "
                    f"START (timeout={attempt_timeout_seconds:.0f}s, "
                    f"budget_remaining={remaining_budget_seconds:.0f}s)",
                )

                # =====================================================
                # PER-ATTEMPT EFFECTIVE POOLS
                # =====================================================
                #
                # On attempt 1 the blocked sets are empty, so these are
                # identical to the base pools computed above and nothing
                # changes. From attempt 2 onward, any ID blocked by the
                # repeat-prevention logic (below) is removed here. The
                # "or <base>" fallback guarantees we never accidentally
                # send an empty enum to the model.

                effective_tops_for_ai = [
                    item
                    for item in tops_for_ai
                    if item["id"] not in blocked_top_ids_this_request
                ] or tops_for_ai

                effective_bottoms_for_ai = [
                    item
                    for item in bottoms_for_ai
                    if item["id"] not in blocked_bottom_ids_this_request
                ] or bottoms_for_ai

                effective_footwear_for_ai = [
                    item
                    for item in footwear_for_ai
                    if item["id"] not in blocked_footwear_ids_this_request
                ] or footwear_for_ai

                effective_top_ids_for_ai = [
                    item["id"] for item in effective_tops_for_ai
                ]

                effective_bottom_ids_for_ai = [
                    item["id"] for item in effective_bottoms_for_ai
                ]

                effective_footwear_ids_for_ai = [
                    item["id"] for item in effective_footwear_for_ai
                ]

                if (
                    blocked_top_ids_this_request
                    or blocked_bottom_ids_this_request
                    or blocked_footwear_ids_this_request
                ):
                    print(
                        "TODAY OUTFIT REPEAT-BLOCKED IDS FOR THIS ATTEMPT:",
                        {
                            "top": sorted(blocked_top_ids_this_request),
                            "bottom": sorted(blocked_bottom_ids_this_request),
                            "footwear": sorted(blocked_footwear_ids_this_request),
                        },
                    )

                effective_schema = {
                    **schema,
                    "properties": {
                        **schema["properties"],
                        "top_id": {
                            "type": "integer",
                            "enum": effective_top_ids_for_ai,
                        },
                        "bottom_id": {
                            "type": "integer",
                            "enum": effective_bottom_ids_for_ai,
                        },
                        "footwear_id": {
                            "type": "integer",
                            "enum": effective_footwear_ids_for_ai,
                        },
                    },
                }

                retry_feedback = ""

                if last_validation_error:
                    blocked_ids_note = ""

                    if (
                        blocked_top_ids_this_request
                        or blocked_bottom_ids_this_request
                        or blocked_footwear_ids_this_request
                    ):
                        blocked_ids_note = f"""

Note: the specific top/bottom/footwear IDs from your rejected response
that caused this have already been removed from the TOP IDS / BOTTOM
IDS / FOOTWEAR IDS lists above, so you cannot select them again even
by accident.
"""

                    retry_feedback = f"""

IMPORTANT RETRY INSTRUCTION:

Your previous response was rejected by the backend.

Validation error:
{last_validation_error}

Generate a completely new valid response.

Do not repeat the invalid category assignment.
{blocked_ids_note}"""

                prompt = f"""
You are a professional personal stylist and outfit recommendation AI.

Create ONE complete, stylish, intentional outfit using ONLY the user's
wardrobe.

The wardrobe has already been classified by a separate clothing-analysis AI.
The category assignments are authoritative.

NEVER reinterpret an item's category.


CURRENT WEATHER:

{json.dumps(
    current_weather_for_ai,
    ensure_ascii=False
)}

The weather MUST directly affect clothing selection.

The provided "condition" value is the authoritative description of the
current weather. Do not reinterpret it or invent another condition.

Consider:

- temperature
- feels-like temperature
- precipitation
- rain
- showers
- precipitation probability
- wind
- condition

Weather is an important decision factor, but it must NOT become a simplistic
rule.

Do NOT use:
"warm = always shorts"

Do NOT use:
"cold = always jacket"

Consider the complete outfit.


WARDROBE CATEGORIES:

TOPS:
{json.dumps(effective_tops_for_ai, ensure_ascii=False)}

BOTTOMS:
{json.dumps(effective_bottoms_for_ai, ensure_ascii=False)}

OUTERWEAR:
{json.dumps(outerwear_for_ai, ensure_ascii=False)}

FOOTWEAR:
{json.dumps(effective_footwear_for_ai, ensure_ascii=False)}

ACCESSORIES:
{json.dumps(accessories_for_ai, ensure_ascii=False)}


EXPLICIT VALID ID LISTS:

TOP IDS:
{json.dumps(effective_top_ids_for_ai)}

BOTTOM IDS:
{json.dumps(effective_bottom_ids_for_ai)}

OUTERWEAR IDS:
{json.dumps(outerwear_ids_for_ai)}

FOOTWEAR IDS:
{json.dumps(effective_footwear_ids_for_ai)}

ACCESSORY IDS:
{json.dumps(accessory_ids)}


CRITICAL CATEGORY RULE:

The ID lists above are authoritative.

A TOP ID can ONLY be used as top_id.

A BOTTOM ID can ONLY be used as bottom_id.

An OUTERWEAR ID can ONLY be used as outerwear_id.

A FOOTWEAR ID can ONLY be used as footwear_id.

An ACCESSORY ID can ONLY appear inside accessory_ids.

NEVER use an ID from one category in another category.

For example:

If ID 62 appears in OUTERWEAR IDS, it MUST NOT be used as top_id.

If ID 74 appears in BOTTOM IDS, it MUST NOT be used as accessory_ids.

Do not infer category from the description when the ID lists already provide
the category.


OUTFIT STRUCTURE:

- exactly ONE top_id
- exactly ONE bottom_id
- exactly ONE footwear_id
- outerwear_id can be one OUTERWEAR ID or null
- accessory_ids can contain zero, one, or multiple ACCESSORY IDs


BOTTOMS:

BOTTOMS can contain both pants and shorts.

Both are valid.

At approximately 20°C–25°C, pants and shorts can both be appropriate.

Do NOT automatically choose shorts simply because the weather is warm.

Do NOT automatically choose pants simply because they are conservative.

Compare pants and shorts using:

- current weather
- season
- material
- garment characteristics
- top compatibility
- footwear compatibility
- overall style
- refresh variety

When both choices are genuinely appropriate, do not repeatedly select the same
bottom during refresh requests.


ACCESSORIES:

Accessories are important finishing and styling pieces.

When suitable accessories exist, actively consider them.

A simple outfit should often be improved with one or more suitable accessories.

Each accessory below already has an "accessory_type" field (e.g. "watch",
"belt", "bag"). Use it directly.

Multiple accessories are allowed when they are different and genuinely work
together.

Do NOT select multiple accessories that share the same accessory_type.

For example:

- never two accessories with accessory_type "watch"
- never two accessories with accessory_type "sunglasses"
- never two accessories with accessory_type "belt"
- never two accessories with accessory_type "bag"
- never two accessories with accessory_type "hat"
- never two accessories with accessory_type "scarf"

Do not use a non-accessory as an accessory under any circumstances.


OUTERWEAR:

Outerwear is optional.

Use it when it meaningfully improves:

- warmth
- layering
- silhouette
- style
- weather suitability

Do not use heavy outerwear in warm weather unless there is an unusually
strong and justified styling reason.


DESCRIPTION USAGE:

Use the saved item description to understand:

- garment type
- material
- fit
- silhouette
- sleeve or leg length
- construction
- texture
- pattern
- design details
- styling character

Do not invent details.


SEASON:

Respect the listed seasons for each item.

Weather suitability and season compatibility should both be considered.


COLOR:

Each item includes a "color_name" field (e.g. "navy", "olive", "burgundy",
"off-white"). Use it as the primary signal for color coordination.

Some items ALSO include an "accent_color_name" field. This means the item
has a second, visually significant color — e.g. red stripes on an
otherwise black sneaker, or a contrast-color logo/sole/trim. Treat
accent_color_name as a REAL color the item introduces into the outfit,
exactly like color_name — it counts toward the "one accent color" and
"no unrelated third color" rules below, and it must be checked for
clashes the same way the primary color is. Do not ignore it just because
it's the item's secondary color: a "black" sneaker with an
accent_color_name of "red" can still clash with the rest of the outfit
even though its color_name alone looks neutral.

Follow these rules:

- Treat black, white, off-white, grey, charcoal grey, light grey, silver,
  navy, denim blue, beige, cream, tan, camel, and brown as NEUTRALS.
  Neutrals combine safely with almost anything.

- A strong default is: mostly neutrals plus ONE non-neutral accent color
  (e.g. navy + off-white + one burgundy or mustard piece). An item's
  accent_color_name counts as part of this budget too.

- Do NOT combine more than two strong, highly saturated non-neutral colors
  in the same outfit — counting both color_name and any accent_color_name
  values. For example, red top + green pants + purple outerwear is a
  clash, not an outfit; so is a navy top + beige pants + sneakers whose
  accent_color_name is a saturated red that matches neither.

- Analogous colors (colors near each other, e.g. navy + sky blue + teal)
  read as intentional. A single accent color set against neutrals also
  reads as intentional.

- Complementary pairs (e.g. navy + mustard, burgundy + olive) can work as
  a deliberate contrast, but use at most one such pairing per outfit.

- Footwear and accessories should coordinate with the chosen neutrals or
  accent color, not introduce an unrelated third color — check their
  accent_color_name for this too, not just color_name.

- Do not make every item the same color.


REFRESH BEHAVIOR:

PREVIOUS OUTFIT:
{previous_outfit_text}

If PREVIOUS OUTFIT is "None":
create the best outfit for the current weather.

If PREVIOUS OUTFIT is provided:
this is a refresh request.

Note: if the previously-used top, footwear, or outerwear had a genuine
alternative available, it has already been removed from the TOPS,
FOOTWEAR, OUTERWEAR lists and their ID lists above so you are choosing
among the remaining options only. This is expected and not an error.

The purpose of refresh is to create a GENUINELY DIFFERENT outfit.

Do not make a tiny cosmetic change.

Changing only an accessory is NOT enough.

For example:

Previous:
t-shirt + pants + shoes + watch + sunglasses

Not meaningfully different:
t-shirt + pants + shoes + watch

Instead, prefer something like:

Previous:
t-shirt + pants + shoes + watch + sunglasses

New:
sweatshirt + shorts + shoes + watch + sunglasses

or:

Previous:
t-shirt + shorts + shoes + watch + sunglasses

New:
polo + pants + shoes + sunglasses

When good alternatives exist, change at least ONE meaningful part of the
main outfit structure:

- top
- bottom
- outerwear

Changing footwear may also contribute when another suitable footwear option
exists.

If only one footwear option exists, reuse it.

Do not sacrifice weather suitability, style, color harmony, season compatibility,
or practicality just to create variety.

If the wardrobe genuinely does not contain a good alternative, repetition is
allowed.

{retry_feedback}


VALIDITY:

- Use only IDs from the provided category lists.
- Never invent IDs.
- Never move an item between categories.
- top_id MUST be one of TOP IDS.
- bottom_id MUST be one of BOTTOM IDS.
- footwear_id MUST be one of FOOTWEAR IDS.
- outerwear_id MUST be one of OUTERWEAR IDS or null.
- every accessory_id MUST be one of ACCESSORY IDS.
- never select the same item twice.
- never select two accessories with the same accessory_type.

Return ONLY the JSON object.

Do not return markdown.
Do not return explanations outside the "reason" field.
"""

                print(
                    "TODAY OUTFIT PROMPT LENGTH (chars/approx tokens):",
                    len(prompt),
                    len(prompt) // 4,
                )

                payload = {
                    # This call is text-only (no image is sent), so it does
                    # not need a vision-capable model. gemma3:4b is kept for
                    # AnalyzeClothingView (image analysis) only; this step
                    # gets a stronger pure-text instruction model instead,
                    # since the actual bottleneck here is following a long,
                    # multi-constraint styling prompt reliably, not vision.
                    "model": "qwen2.5:7b-instruct",
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    "format": effective_schema,
                    "stream": False,
                    "options": {
                        # Lowered from 0.7: less randomness -> more
                        # consistent adherence to the weather/color/
                        # category rules above, while still leaving room
                        # for outfit variety on refresh requests.
                        "temperature": 0.5,
                        # The full wardrobe (all categories, with
                        # descriptions) plus the instruction block can
                        # easily exceed a small model's default context
                        # (often 2048-4096). If the prompt is silently
                        # truncated, the model loses part of the rules
                        # or part of the wardrobe data, which reads as
                        # random/inconsistent behavior. Request a
                        # generous context explicitly instead of relying
                        # on whatever default is loaded.
                        "num_ctx": 8192,
                    },
                }

                ollama_request = urllib.request.Request(
                    "http://127.0.0.1:11434/api/chat",
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )

                try:
                    with urllib.request.urlopen(
                        ollama_request,
                        timeout=attempt_timeout_seconds,
                    ) as response:
                        response_data = json.loads(response.read().decode("utf-8"))
                except (urllib.error.URLError, TimeoutError, OSError) as ollama_error:
                    print(
                        f"TODAY OUTFIT ATTEMPT {attempt + 1} TIMED OUT / "
                        f"FAILED after "
                        f"{time.monotonic() - attempt_started_at:.1f}s:",
                        repr(ollama_error),
                    )
                    last_validation_error = (
                        "AI servisine ulaşılamadı veya zaman aşımına uğradı."
                    )
                    continue

                print(
                    f"TODAY OUTFIT ATTEMPT {attempt + 1} RESPONDED in "
                    f"{time.monotonic() - attempt_started_at:.1f}s",
                )

                content = response_data.get("message", {}).get("content", "")

                if not content:
                    last_validation_error = "AI boş cevap döndürdü."
                    continue

                try:
                    result = json.loads(content)
                except json.JSONDecodeError:
                    last_validation_error = "AI geçerli JSON döndürmedi."
                    continue

                print(
                    "TODAY OUTFIT AI RESULT:",
                    result,
                )

                valid_items = {item.id: item for item in clothing_items}

                top_id = result.get("top_id")

                bottom_id = result.get("bottom_id")

                footwear_id = result.get("footwear_id")

                outerwear_id = result.get("outerwear_id")

                accessory_ids_result = result.get("accessory_ids", [])

                # =====================================================
                # RESPONSE TYPE VALIDATION
                # =====================================================

                if not isinstance(top_id, int):
                    last_validation_error = "top_id integer olmalı."
                    continue

                if not isinstance(bottom_id, int):
                    last_validation_error = "bottom_id integer olmalı."
                    continue

                if not isinstance(footwear_id, int):
                    last_validation_error = "footwear_id integer olmalı."
                    continue

                if outerwear_id is not None and not isinstance(outerwear_id, int):
                    last_validation_error = "outerwear_id integer veya null olmalı."
                    continue

                if not isinstance(accessory_ids_result, list):
                    last_validation_error = "accessory_ids liste olmalı."
                    continue

                if any(
                    not isinstance(accessory_id, int)
                    for accessory_id in accessory_ids_result
                ):
                    last_validation_error = (
                        "accessory_ids yalnızca integer ID içermeli."
                    )
                    continue

                # =====================================================
                # TOP VALIDATION
                # =====================================================

                top_item = valid_items.get(top_id)

                if not top_item:
                    last_validation_error = "top_id gardıropta bulunmuyor."
                    continue

                if top_item.category != "top":
                    last_validation_error = (
                        "top_id TOPS kategorisinde olmayan bir parça seçti."
                    )
                    continue

                # =====================================================
                # BOTTOM VALIDATION
                # =====================================================

                bottom_item = valid_items.get(bottom_id)

                if not bottom_item:
                    last_validation_error = "bottom_id gardıropta bulunmuyor."
                    continue

                if bottom_item.category not in {
                    "pants",
                    "shorts",
                }:
                    last_validation_error = (
                        "bottom_id BOTTOMS kategorisinde olmayan bir parça seçti."
                    )
                    continue

                # =====================================================
                # FOOTWEAR VALIDATION
                # =====================================================

                footwear_item = valid_items.get(footwear_id)

                if not footwear_item:
                    last_validation_error = "footwear_id gardıropta bulunmuyor."
                    continue

                if footwear_item.category != "footwear":
                    last_validation_error = (
                        "footwear_id FOOTWEAR kategorisinde olmayan bir parça seçti."
                    )
                    continue

                # =====================================================
                # OUTERWEAR VALIDATION
                # =====================================================

                outerwear_item = None

                if outerwear_id is not None:
                    outerwear_item = valid_items.get(outerwear_id)

                    if not outerwear_item:
                        last_validation_error = "outerwear_id gardıropta bulunmuyor."
                        continue

                    if outerwear_item.category != "outerwear":
                        last_validation_error = "outerwear_id OUTERWEAR kategorisinde olmayan bir parça seçti."
                        continue

                # =====================================================
                # ACCESSORY VALIDATION
                # =====================================================

                accessory_items = []
                invalid_accessory = False

                for accessory_id in accessory_ids_result:
                    accessory_item = valid_items.get(accessory_id)

                    if not accessory_item:
                        last_validation_error = (
                            f"Accessory ID {accessory_id} gardıropta bulunmuyor."
                        )
                        invalid_accessory = True
                        break

                    if accessory_item.category != "accessory":
                        last_validation_error = f"Accessory ID {accessory_id} accessory kategorisinde değil."
                        invalid_accessory = True
                        break

                    accessory_items.append(accessory_item)

                if invalid_accessory:
                    continue

                # =====================================================
                # DUPLICATE ITEM VALIDATION (structural slots only)
                # =====================================================
                #
                # top/bottom/footwear/outerwear must never collide with
                # each other or with any accessory — that's a genuine
                # category mix-up and is always rejected outright.
                #
                # Exact-duplicate accessory IDs (e.g. the same watch
                # listed twice) are deliberately NOT hard-rejected here.
                # A small local model that returns [63, 63] almost
                # always keeps returning the same mistake on retry
                # (seen in practice), burning the whole attempt budget
                # for something trivially fixable: the accessory-type
                # auto-repair right below already collapses repeated
                # IDs down to one occurrence, since the same ID is
                # always the same accessory_type.

                structural_ids = [
                    top_id,
                    bottom_id,
                    footwear_id,
                ]

                if outerwear_id is not None:
                    structural_ids.append(outerwear_id)

                if len(structural_ids) != len(set(structural_ids)):
                    last_validation_error = (
                        "AI aynı kıyafet parçasını birden fazla yerde kullandı."
                    )
                    continue

                if set(structural_ids) & set(accessory_ids_result):
                    last_validation_error = (
                        "AI bir parçayı hem ana kombinde hem aksesuar "
                        "olarak kullandı."
                    )
                    continue

                # =====================================================
                # DUPLICATE ACCESSORY TYPES (AUTO-REPAIR)
                # =====================================================
                #
                # Small local models frequently return the exact same
                # duplicate-type accessory set on every retry instead
                # of self-correcting from the validation feedback, which
                # burns all MAX_AI_ATTEMPTS and forces a fall to the
                # generic safe fallback (discarding an otherwise-good
                # top/bottom/footwear choice).
                #
                # Instead of retrying the whole generation, repair the
                # violation deterministically: keep the first accessory
                # of each type in the model's own preference order
                # (accessory_ids_result order) and drop the rest.

                seen_accessory_types = set()
                deduped_accessory_items = []
                deduped_accessory_ids = []

                for accessory_id, accessory_item in zip(
                    accessory_ids_result, accessory_items
                ):
                    accessory_type = get_accessory_type(accessory_item)

                    if accessory_type is not None:
                        if accessory_type in seen_accessory_types:
                            # Same type already kept (e.g. a second
                            # watch) — drop this one instead of
                            # rejecting the whole outfit.
                            continue

                        seen_accessory_types.add(accessory_type)

                    deduped_accessory_items.append(accessory_item)
                    deduped_accessory_ids.append(accessory_id)

                accessory_items = deduped_accessory_items
                accessory_ids_result = deduped_accessory_ids
                result["accessory_ids"] = deduped_accessory_ids

                # =====================================================
                # PREVIOUS OUTFIT COMPARISON
                # =====================================================

                is_same_as_previous = False
                is_only_accessory_change = False

                if previous_outfit:
                    previous_top_id = previous_outfit.get("top_id")

                    previous_bottom_id = previous_outfit.get("bottom_id")

                    previous_footwear_id = previous_outfit.get("footwear_id")

                    previous_outerwear_id = previous_outfit.get("outerwear_id")

                    previous_accessory_ids = previous_outfit.get("accessory_ids", [])

                    if not isinstance(previous_accessory_ids, list):
                        previous_accessory_ids = []

                    current_signature = (
                        top_id,
                        bottom_id,
                        footwear_id,
                        outerwear_id,
                        tuple(sorted(accessory_ids_result)),
                    )

                    previous_signature = (
                        previous_top_id,
                        previous_bottom_id,
                        previous_footwear_id,
                        previous_outerwear_id,
                        tuple(sorted(previous_accessory_ids)),
                    )

                    is_same_as_previous = current_signature == previous_signature

                    previous_bottom_item = valid_items.get(previous_bottom_id)

                    previous_bottom_type = (
                        previous_bottom_item.category
                        if (
                            previous_bottom_item
                            and previous_bottom_item.category
                            in {
                                "pants",
                                "shorts",
                            }
                        )
                        else None
                    )

                    current_major_signature = (
                        top_id,
                        bottom_id,
                        outerwear_id,
                        bottom_item.category,
                    )

                    previous_major_signature = (
                        previous_top_id,
                        previous_bottom_id,
                        previous_outerwear_id,
                        previous_bottom_type,
                    )

                    is_only_accessory_change = (
                        current_major_signature == previous_major_signature
                        and not is_same_as_previous
                    )

                    if is_same_as_previous or is_only_accessory_change:
                        if is_same_as_previous:
                            last_validation_error = (
                                "AI önceki kombinle tamamen aynı kombini " "oluşturdu."
                            )
                        else:
                            last_validation_error = (
                                "AI yalnızca aksesuarları değiştirdi. "
                                "Kombinin ana yapısını değiştirmelisin."
                            )

                        # Same structural fix as the full-cycle repeat
                        # check below: block a field of the rejected
                        # combo (if an alternative still exists) so the
                        # model can't just return the same structure
                        # again on the next attempt.
                        if len(tops_for_ai) - len(blocked_top_ids_this_request) > 1:
                            blocked_top_ids_this_request.add(top_id)
                        elif (
                            len(bottoms_for_ai) - len(blocked_bottom_ids_this_request)
                            > 1
                        ):
                            blocked_bottom_ids_this_request.add(bottom_id)
                        elif (
                            len(footwear_for_ai)
                            - len(blocked_footwear_ids_this_request)
                            > 1
                        ):
                            blocked_footwear_ids_this_request.add(footwear_id)

                        continue

                # =====================================================
                # FULL-CYCLE MAJOR-STRUCTURE REPEAT CHECK
                # =====================================================
                #
                # The check above only compares against the single
                # immediately-previous outfit. Right after a cycle
                # reset, every top/bottom/footwear ID becomes available
                # again, and a low-temperature local model tends to
                # gravitate back to the exact same "favorite" combo it
                # already produced earlier in this cycle (just with a
                # different accessory), even though it never repeats
                # the literal previous outfit. Guard against that by
                # rejecting a top/bottom/footwear combination that was
                # already used by ANY outfit in the current cycle.

                recent_major_signatures = {
                    (
                        outfit.get("top_id"),
                        outfit.get("bottom_id"),
                        outfit.get("footwear_id"),
                    )
                    for outfit in recent_outfits
                }

                current_major_only_signature = (top_id, bottom_id, footwear_id)

                if current_major_only_signature in recent_major_signatures:
                    last_validation_error = (
                        "AI bu döngüde daha önce kullanılmış bir "
                        "top/bottom/footwear kombinasyonunu tekrar oluşturdu."
                    )

                    # Don't just ask nicely — structurally rule this
                    # exact combination out for the next attempt so a
                    # model that ignores prose feedback can't just
                    # repeat it again. Block whichever field still
                    # leaves at least one alternative in its category,
                    # preferring top, then bottom, then footwear.
                    if len(tops_for_ai) - len(blocked_top_ids_this_request) > 1:
                        blocked_top_ids_this_request.add(top_id)
                    elif len(bottoms_for_ai) - len(blocked_bottom_ids_this_request) > 1:
                        blocked_bottom_ids_this_request.add(bottom_id)
                    elif (
                        len(footwear_for_ai) - len(blocked_footwear_ids_this_request)
                        > 1
                    ):
                        blocked_footwear_ids_this_request.add(footwear_id)

                    continue

                # =====================================================
                # VALID RESULT
                # =====================================================

                print(
                    "TODAY OUTFIT VALID RESULT:",
                    result,
                )

                if cycle_reset:
                    result["cycle_reset"] = True
                    result["message"] = (
                        "Bu hava koşullarında kullanılabilecek yeni kıyafet "
                        "kombinleri tükendi. Kombin döngüsü yeniden başlatıldı."
                    )

                return Response(
                    result,
                    status=status.HTTP_200_OK,
                )

            # =========================================================
            # SAFE FALLBACK
            # =========================================================
            #
            # AI, MAX_AI_ATTEMPTS deneme içinde geçerli bir kombin
            # üretemediyse endpoint 500 dönmemeli. Bu fallback yalnızca
            # geçerli kategorilerden ve tekrarsız aksesuar tiplerinden
            # oluşan güvenli bir kombin döndürür.
            # =========================================================

            def build_safe_fallback():
                # -----------------------------------------------------
                # FALLBACK MUST ALSO RESPECT REFRESH VARIETY
                # -----------------------------------------------------
                #
                # When a cycle has just been reset, do not immediately
                # return the exact same major outfit structure that was
                # shown immediately before the reset if another reasonable
                # combination exists.
                # -----------------------------------------------------

                previous_top_id = (
                    previous_outfit.get("top_id") if previous_outfit else None
                )

                previous_bottom_id = (
                    previous_outfit.get("bottom_id") if previous_outfit else None
                )

                previous_footwear_id = (
                    previous_outfit.get("footwear_id") if previous_outfit else None
                )

                previous_outerwear_id = (
                    previous_outfit.get("outerwear_id") if previous_outfit else None
                )

                fallback_top = None
                fallback_bottom = None
                fallback_footwear = None
                fallback_outerwear = None

                # Prefer a combination with at least one different major
                # clothing decision from the previous outfit.
                for top_candidate in tops_for_ai:
                    for bottom_candidate in bottoms_for_ai:
                        for footwear_candidate in footwear_for_ai:
                            candidate_major = (
                                top_candidate["id"],
                                bottom_candidate["id"],
                                footwear_candidate["id"],
                            )

                            previous_major = (
                                previous_top_id,
                                previous_bottom_id,
                                previous_footwear_id,
                            )

                            if (
                                not previous_outfit
                                or candidate_major != previous_major
                                or cycle_reset is False
                            ):
                                fallback_top = top_candidate
                                fallback_bottom = bottom_candidate
                                fallback_footwear = footwear_candidate
                                break

                        if fallback_top is not None:
                            break

                    if fallback_top is not None:
                        break

                # If every possible major combination is identical, use the
                # first valid weather-filtered combination as a last resort.
                if fallback_top is None:
                    fallback_top = tops_for_ai[0]
                    fallback_bottom = bottoms_for_ai[0]
                    fallback_footwear = footwear_for_ai[0]

                # Prefer a different outerwear state after a cycle reset.
                if outerwear_for_ai:
                    for outer_candidate in outerwear_for_ai:
                        if (
                            not previous_outfit
                            or outer_candidate["id"] != previous_outerwear_id
                            or (previous_outerwear_id is None and not cycle_reset)
                        ):
                            fallback_outerwear = outer_candidate
                            break

                seen_accessory_types = set()

                fallback_accessory_ids = []

                for accessory in accessories_for_ai:
                    accessory_item = None

                    for item in clothing_items:
                        if item.id == accessory["id"]:
                            accessory_item = item
                            break

                    if accessory_item is None:
                        continue

                    accessory_type = get_accessory_type(accessory_item)

                    if (
                        accessory_type is not None
                        and accessory_type in seen_accessory_types
                    ):
                        continue

                    if accessory_type is not None:
                        seen_accessory_types.add(accessory_type)

                    fallback_accessory_ids.append(accessory["id"])

                    if len(fallback_accessory_ids) == 2:
                        break

                return {
                    "top_id": fallback_top["id"],
                    "bottom_id": fallback_bottom["id"],
                    "footwear_id": fallback_footwear["id"],
                    "outerwear_id": (
                        fallback_outerwear["id"] if fallback_outerwear else None
                    ),
                    "accessory_ids": fallback_accessory_ids,
                    "reason": "AI geçerli bir kombin üretemedi; "
                    "hava koşullarına uygun geçerli parçalardan "
                    "güvenli bir kombin oluşturuldu.",
                }

            fallback_result = build_safe_fallback()

            print(
                "TODAY OUTFIT SAFE FALLBACK:",
                fallback_result,
            )

            if cycle_reset:
                fallback_result["cycle_reset"] = True
                fallback_result["message"] = (
                    "Bu hava koşullarında kullanılabilecek yeni kıyafet "
                    "kombinleri tükendi. Kombin döngüsü yeniden başlatıldı."
                )

            return Response(
                fallback_result,
                status=status.HTTP_200_OK,
            )

        except urllib.error.URLError as error:
            print("WEATHER OR AI NETWORK ERROR:", repr(error))

            return Response(
                {"detail": "Hava durumu veya AI servisine ulaşılamadı."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        except Exception as error:
            print("TODAY OUTFIT AI ERROR:", repr(error))

            return Response(
                {"detail": "Bugünün kombini AI tarafından oluşturulamadı."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
