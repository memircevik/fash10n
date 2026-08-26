from .models import ClothingItem, Outfit
from .serializers import (
    ClothingItemSerializer,
    OutfitSerializer,
)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser

from django.http import HttpResponse


class RemoveBackgroundView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        image = request.FILES.get("image")

        if not image:
            return Response(
                {"detail": "Fotoğraf bulunamadı."},
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
            print("Background removal error:", error)

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

        return Response(serializer.data)

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
                {"detail": "Kıyafet bulunamadı."},
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
            .filter(user=request.user)
            .prefetch_related("items")
            .order_by("-created_at")
        )

        serializer = OutfitSerializer(
            outfits,
            many=True
        )

        return Response(serializer.data)

    def post(self, request):
        name = request.data.get("name")
        item_ids = request.data.get("items", [])

        if not name:
            return Response(
                {"detail": "Kombin adı gerekli."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {"detail": "En az bir kıyafet seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids,
            user=request.user,
            is_active=True
        )

        if clothing_items.count() != len(item_ids):
            return Response(
                {"detail": "Geçersiz kıyafet seçimi."},
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
                {"detail": "Üst giyim seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if "bottom" not in categories:
            return Response(
                {"detail": "Alt giyim seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {"detail": "Ayakkabı seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        outfit = Outfit.objects.create(
            user=request.user,
            name=name
        )

        outfit.items.set(clothing_items)

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
                {"detail": "Kombin bulunamadı."},
                status=status.HTTP_404_NOT_FOUND
            )

        name = request.data.get("name")
        item_ids = request.data.get("items", [])

        if not name:
            return Response(
                {"detail": "Kombin adı gerekli."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not item_ids:
            return Response(
                {"detail": "En az bir kıyafet seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        clothing_items = ClothingItem.objects.filter(
            id__in=item_ids,
            user=request.user,
            is_active=True
        )

        if clothing_items.count() != len(item_ids):
            return Response(
                {"detail": "Geçersiz kıyafet seçimi."},
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
                {"detail": "Üst giyim seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if "bottom" not in categories:
            return Response(
                {"detail": "Alt giyim seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if "footwear" not in categories:
            return Response(
                {"detail": "Ayakkabı seçmelisin."},
                status=status.HTTP_400_BAD_REQUEST
            )

        outfit.name = name
        outfit.save(update_fields=["name"])

        outfit.items.set(clothing_items)

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
                {"detail": "Kombin bulunamadı."},
                status=status.HTTP_404_NOT_FOUND
            )

        outfit.delete()

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )