import base64
import json
import urllib.request

from io import BytesIO

from PIL import Image

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
                {"detail": "Foto─şraf bulunamad─▒."},
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
                {"detail": "Arka plan silinemedi."},
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

    def post(self, request):
        serializer = ClothingItemSerializer(
            data=request.data
        )

        if serializer.is_valid():
            serializer.save(
                user=request.user
            )

            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED
            )

        print(
            "CLOTHING SERIALIZER ERROR:",
            serializer.errors
        )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )

    def delete(self, request, pk):
        try:
            clothing_item = ClothingItem.objects.get(
                id=pk,
                user=request.user
            )

        except ClothingItem.DoesNotExist:
            return Response(
                {"detail": "K─▒yafet bulunamad─▒."},
                status=status.HTTP_404_NOT_FOUND
            )

        clothing_item.is_active = False

        clothing_item.save(
            update_fields=["is_active"]
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
        name = request.data.get("name")
        item_ids = request.data.get(
            "items",
            []
        )

        if not name:
            return Response(
                {
                    "detail":
                        "Kombin ad─▒ gerekli."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {
                    "detail":
                        "En az bir k─▒yafet se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids,
            user=request.user,
            is_active=True
        )

        if clothing_items.count() != len(item_ids):
            return Response(
                {
                    "detail":
                        "Ge├ğersiz k─▒yafet se├ğimi."
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
                        "├£st giyim se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if "bottom" not in categories:
            return Response(
                {
                    "detail":
                        "Alt giyim se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {
                    "detail":
                        "Ayakkab─▒ se├ğmelisin."
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
                        "Kombin bulunamad─▒."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        name = request.data.get("name")
        item_ids = request.data.get(
            "items",
            []
        )

        if not name:
            return Response(
                {
                    "detail":
                        "Kombin ad─▒ gerekli."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {
                    "detail":
                        "En az bir k─▒yafet se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids,
            user=request.user,
            is_active=True
        )

        if clothing_items.count() != len(item_ids):
            return Response(
                {
                    "detail":
                        "Ge├ğersiz k─▒yafet se├ğimi."
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
                        "├£st giyim se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if "bottom" not in categories:
            return Response(
                {
                    "detail":
                        "Alt giyim se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {
                    "detail":
                        "Ayakkab─▒ se├ğmelisin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        outfit.name = name

        outfit.save(
            update_fields=["name"]
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
                        "Kombin bulunamad─▒."
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

    def get_main_color(self, image_bytes):
        image = Image.open(
            BytesIO(image_bytes)
        ).convert("RGBA")

        pixels = []

        for r, g, b, a in image.getdata():
            if a < 30:
                continue

            brightness = (r + g + b) / 3

            if brightness > 245:
                continue

            pixels.append(
                (r, g, b)
            )

        if not pixels:
            return "#808080"

        sample_limit = 20000

        if len(pixels) > sample_limit:
            step = len(pixels) // sample_limit
            pixels = pixels[::step]

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

        return "#{:02X}{:02X}{:02X}".format(
            round(red),
            round(green),
            round(blue)
        )

    def post(self, request):
        image = request.FILES.get("image")

        if not image:
            return Response(
                {
                    "detail":
                        "Foto─şraf bulunamad─▒."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            image_bytes = image.read()

            image_base64 = base64.b64encode(
                image_bytes
            ).decode("utf-8")

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
bottom
outerwear
footwear
accessory

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

Do not return color.

Do not return style.

Do not return explanation.

Do not return markdown.

Return only the JSON object.
"""

            payload = {
                "model": "gemma3:4b",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [
                            image_base64
                        ]
                    }
                ],
                "format": schema,
                "stream": False,
                "options": {
                    "temperature": 0
                }
            }

            ollama_request = urllib.request.Request(
                "http://127.0.0.1:11434/api/chat",
                data=json.dumps(
                    payload
                ).encode("utf-8"),
                headers={
                    "Content-Type":
                        "application/json"
                },
                method="POST"
            )

            with urllib.request.urlopen(
                ollama_request,
                timeout=180
            ) as response:
                response_data = json.loads(
                    response.read().decode("utf-8")
                )

            content = (
                response_data
                .get("message", {})
                .get("content", "")
            )

            if not content:
                raise ValueError(
                    "AI bo┼ş cevap d├Ând├╝rd├╝."
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

            allowed_categories = {
                "top",
                "bottom",
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

            if category not in allowed_categories:
                raise ValueError(
                    "Ge├ğersiz kategori."
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
                    "Ge├ğersiz mevsim."
                )

            color = self.get_main_color(
                image_bytes
            )

            print(
                "COLOR RESULT:",
                color
            )

            return Response(
                {
                    "category": category,
                    "color": color,
                    "season": season
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
                        "AI ge├ğerli JSON d├Ând├╝rmedi."
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
                        "K─▒yafet AI taraf─▒ndan analiz edilemedi."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
